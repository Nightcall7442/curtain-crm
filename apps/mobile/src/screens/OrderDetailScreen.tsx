import {
  formatMoney,
  formatPhone,
  ORDER_STAGE_FEE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  OrderType,
  parseMoney,
  Role,
  ROLE_LABELS,
  stageFeesOfOrderType,
  TransitionKind,
  type OrderStatus,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderManagement } from '../components/OrderManagement';
import { Icon } from '../components/Icon';
import { OrderPhotoUpload } from '../components/OrderPhotoUpload';
import { Stepper } from '../components/Stepper';
import { VoiceCommentPlayer, VoiceRecorderButton } from '../components/VoiceComment';
import { useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography, opacity } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Карточка заказа.
 *
 * Кнопки действий приходят с сервера (`orders.availableTransitions`):
 * приложение не решает само, что доступно этой роли на этом этапе, и не
 * дублирует правила перехода. Обязательность причины тоже приходит оттуда.
 */
export function OrderDetailScreen({
  route,
}: RootStackScreenProps<'OrderDetail'>): ReactElement {
  const { orderId } = route.params;
  const { t } = useLocale();

  const utils = trpc.useUtils();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const isManager = useIsManagement();

  const order = trpc.orders.byId.useQuery({ id: orderId });
  const transitions = trpc.orders.availableTransitions.useQuery({ id: orderId });
  const comments = trpc.orderComments.listByOrder.useQuery({ orderId });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.orders.availableTransitions.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
    ]);
  };

  const changeStatus = trpc.orders.changeStatus.useMutation({
    onSuccess: async () => {
      // Переход состоялся — лёгкое подтверждение вибрацией.
      notifySuccess();
      setPendingStatus(null);
      setReason('');
      await refresh();
    },
    onError: () => {
      notifyError();
    },
  });

  /** Запуск перехода: с причиной — через форму, без — сразу. */
  const startTransition = (toStatus: OrderStatus, requiresComment: boolean): void => {
    setSheetOpen(false);
    if (requiresComment) {
      setPendingStatus(toStatus);
      setReason('');
      return;
    }
    changeStatus.mutate({ id: orderId, toStatus });
  };

  const addComment = trpc.orderComments.add.useMutation({
    onSuccess: async () => {
      setComment('');
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
  });

  if (order.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (order.isError || order.data === undefined) {
    return (
      <View style={styles.loading}>
        <Empty
          message={order.error?.message ?? 'Заказ не найден'}
          hint="Возможно, вы больше не участвуете в этом заказе"
        />
      </View>
    );
  }

  const data = order.data;

  /*
    Расценки, которые видно этому сотруднику: скрытые пришли с сервера как
    `null` — решает API, а не экран. У готовых штор из четырёх этапов
    применима только установка.

    Нули отсеиваются: у незаполненного этапа стоит ноль, и строка
    «За пошив: 0 сум» читается исполнителем как «мне за это не заплатят»,
    хотя означает «сумму ещё не внесли».
  */
  const stageFeeValue: Readonly<Record<string, string | null>> = {
    measurement: data.measurementFee,
    sewing: data.sewingFee,
    qc: data.qcFee,
    installation: data.installationFee,
  };

  const visibleStageFees = stageFeesOfOrderType(data.orderType)
    .map((stage) => [stage, stageFeeValue[stage] ?? null] as const)
    .filter(
      (entry): entry is readonly [(typeof entry)[0], string] =>
        entry[1] !== null && Number.parseFloat(entry[1]) > 0,
    );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.orderNumber}>
            {data.orderNumber ?? `#${data.id.toString()}`}
          </Text>
          <Pill text={t(ORDER_STATUS_LABELS, data.status)} tone="info" />
        </View>

        {/*
          Готовые шторы помечаются явно: у такого заказа нет ни замера, ни
          пошива, и продавец, открывший карточку, должен видеть это сразу —
          иначе он ждёт от неё этапов, которых у неё не будет. Пошив метки
          не получает: это обычный случай, а не особенность.
        */}
        {data.orderType === OrderType.READY_MADE && (
          <View style={styles.typeRow}>
            <Pill text={t(ORDER_TYPE_LABELS, data.orderType)} tone="positive" />
          </View>
        )}

        <Text style={styles.client}>{data.clientName}</Text>

        <Pressable
          onPress={() => {
            void Linking.openURL(`tel:${data.clientPhone}`);
          }}
          style={({ pressed }) => [styles.callButton, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel={`Позвонить клиенту ${data.clientName}`}
        >
          <Icon name="call" size={14} color={colors.accentStrong} />
          <Text style={styles.callText}>{formatPhone(data.clientPhone)}</Text>
        </Pressable>

        <View style={styles.details}>
          <Row
            label="Срок"
            value={
              data.deadline === null
                ? '—'
                : new Date(data.deadline).toLocaleDateString('ru-RU')
            }
          />
          <Row label="Стоимость" value={formatMoney(parseMoney(data.workPrice))} />
          <Row label="Предоплата" value={formatMoney(parseMoney(data.deposit))} />
          <Row
            label="Остаток"
            value={
              data.remainingPayment === null
                ? '—'
                : formatMoney(parseMoney(data.remainingPayment))
            }
          />
          <Row label="Филиал" value={data.branch.name} />
        </View>

        {/*
          Расценки по этапам. Сервер вернул `null` вместо тех, что этому
          сотруднику видеть не положено: швея увидит здесь одну строку —
          свою, — а продавец и руководство все.

          Ничего не выводим, если видимых нет: пустой заголовок «Расценки» у
          исполнителя, которому сумму ещё не проставили, читается как «мне не
          заплатят».
        */}
        {visibleStageFees.length > 0 && (
          <View style={styles.details}>
            {visibleStageFees.map(([stage, value]) => (
              <Row
                key={stage}
                label={t(ORDER_STAGE_FEE_LABELS, stage)}
                value={formatMoney(parseMoney(value))}
              />
            ))}
          </View>
        )}

        {data.installAddress !== null && (
          <Text style={styles.address}>{`📍 ${data.installAddress}`}</Text>
        )}
      </Card>

      {/* --- Этапы конвейера --------------------------------------------- */}
      <Card>
        <Stepper status={data.status} />
      </Card>

      {/* --- Действия ---------------------------------------------------- */}
      <Card>
        <CardTitle title="Действия" icon="priority" />

        {transitions.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : transitions.data === undefined || transitions.data.length === 0 ? (
          <Empty
            message="Действий сейчас нет"
            hint="Либо заказ закрыт, либо этот этап ведёт другой сотрудник"
          />
        ) : (
          /*
            Главное действие — крупной сплошной кнопкой, остальное — в шторке.
            По макету «Хвоя UI»: чаще всего нужен следующий шаг конвейера, и
            он не должен делить внимание с откатом и отменой; те доступны
            за «Все действия…» поверх контекста, без ухода с экрана.
          */
          <View style={styles.actions}>
            {(() => {
              const list = transitions.data;
              const primary = list.find((entry) => entry.kind === TransitionKind.FORWARD) ?? list[0];
              if (primary === undefined) return null;

              return (
                <>
                  <Pressable
                    disabled={changeStatus.isPending}
                    onPress={() => {
                      startTransition(primary.to, primary.requiresComment);
                    }}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      primary.kind === TransitionKind.FORWARD ? null : styles.primaryActionMuted,
                      pressed ? styles.pressed : null,
                      changeStatus.isPending ? styles.disabled : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.primaryActionText}>{primary.label}</Text>
                  </Pressable>

                  {list.length > 1 && (
                    <Pressable
                      onPress={() => {
                        setSheetOpen(true);
                      }}
                      style={({ pressed }) => [styles.moreAction, pressed ? styles.pressed : null]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.moreActionText}>
                        {`Все действия (${list.length.toString()})`}
                      </Text>
                    </Pressable>
                  )}
                </>
              );
            })()}
          </View>
        )}

        {pendingStatus !== null && (
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonTitle}>
              {`Переход в «${t(ORDER_STATUS_LABELS, pendingStatus)}» требует причины`}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Опишите причину"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              style={styles.reasonInput}
            />
            <View style={styles.reasonButtons}>
              <Pressable
                disabled={reason.trim().length < 3 || changeStatus.isPending}
                onPress={() => {
                  changeStatus.mutate({
                    id: orderId,
                    toStatus: pendingStatus,
                    comment: reason.trim(),
                  });
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  reason.trim().length < 3 ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.confirmText}>Подтвердить</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPendingStatus(null);
                }}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelText}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        )}

        {changeStatus.error !== null && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{changeStatus.error.message}</Text>
          </View>
        )}
      </Card>

      {/* --- Позиции ------------------------------------------------------ */}
      <Card>
        <CardTitle title="Позиции заказа" icon="window" />
        {data.items.length === 0 ? (
          <Empty message="Позиций нет" />
        ) : (
          data.items.map((item, index) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>
                {`${(index + 1).toString()}. ${item.model ?? 'Без модели'}`}
              </Text>
              {item.widthCm !== null && item.heightCm !== null && (
                <Text style={styles.itemDetail}>
                  {`Размер: ${trimNumber(item.widthCm)} × ${trimNumber(item.heightCm)} см`}
                  {item.areaM2 === null ? '' : ` · ${trimNumber(item.areaM2, 2)} м²`}
                </Text>
              )}
              {item.materials.length > 0 && (
                <Text style={styles.itemDetail}>{`Материалы: ${item.materials.join(', ')}`}</Text>
              )}
              {item.color !== null && (
                <Text style={styles.itemDetail}>{`Цвет: ${item.color}`}</Text>
              )}
              {item.cornice !== null && (
                <Text style={styles.itemDetail}>{`Карниз: ${item.cornice}`}</Text>
              )}
              {item.comment !== null && <Text style={styles.itemComment}>{item.comment}</Text>}
            </View>
          ))
        )}
      </Card>

      {/* --- Фотофиксация --------------------------------------------------- */}
      <OrderPhotoUpload orderId={orderId} orderStatus={data.status} />

      {/* --- Исполнители --------------------------------------------------- */}
      <Card>
        <CardTitle title="Исполнители" icon="people" />
        <Row label={t(ROLE_LABELS, Role.MASTER)} value={data.master?.fullName ?? 'не назначен'} />
        <Row label={t(ROLE_LABELS, Role.SEWER)} value={data.sewer?.fullName ?? 'не назначена'} />
        <Row label={t(ROLE_LABELS, Role.QC)} value={data.qc?.fullName ?? 'не назначен'} />
        <Row
          label={t(ROLE_LABELS, Role.INSTALLER)}
          value={data.installer?.fullName ?? 'не назначен'}
        />
      </Card>

      {/*
        Управление заказом — только руководству.

        Стоит после «Исполнителей» и перед комментариями: сначала админ
        видит, кто на заказе и что с ним, и только потом меняет назначение,
        цену и расценки. Обратный порядок звал бы править не глядя.
      */}
      {isManager && (
        <OrderManagement
          orderId={orderId}
          orderType={data.orderType}
          workPrice={data.workPrice}
          deposit={data.deposit}
          fees={{
            measurementFee: data.measurementFee,
            sewingFee: data.sewingFee,
            qcFee: data.qcFee,
            installationFee: data.installationFee,
          }}
          assignees={{
            [Role.MASTER]: data.master,
            [Role.SEWER]: data.sewer,
            [Role.QC]: data.qc,
            [Role.INSTALLER]: data.installer,
          }}
        />
      )}

      {/* --- Комментарии ---------------------------------------------------- */}
      <Card>
        <CardTitle title="Комментарии" icon="comment" />

        <View style={styles.commentForm}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Написать участникам заказа"
            placeholderTextColor={colors.textMuted}
            style={styles.commentInput}
            multiline
          />
          <Pressable
            disabled={comment.trim().length === 0 || addComment.isPending}
            onPress={() => {
              addComment.mutate({ orderId, body: comment.trim() });
            }}
            style={({ pressed }) => [
              styles.sendButton,
              comment.trim().length === 0 ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Отправить комментарий"
          >
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>

        <VoiceRecorderButton orderId={orderId} />

        {comments.data === undefined || comments.data.length === 0 ? (
          <Empty message="Комментариев пока нет" />
        ) : (
          comments.data.map((entry) => (
            <View key={entry.id} style={styles.comment}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{entry.authorName}</Text>
                <Text style={styles.commentTime}>
                  {new Date(entry.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {entry.isVoice ? (
                <>
                  <VoiceCommentPlayer
                    url={entry.voiceUrl}
                    durationSeconds={entry.voiceDurationSeconds}
                  />
                  {/* Расшифровка, если она когда-нибудь появится: поле в схеме
                      есть, распознавания речи в этой версии нет. */}
                  {entry.body !== null && <Text style={styles.commentBody}>{entry.body}</Text>}
                </>
              ) : (
                <Text style={styles.commentBody}>{entry.body ?? ''}</Text>
              )}
            </View>
          ))
        )}
      </Card>

      {/* --- Шторка со всеми действиями ----------------------------------- */}
      <BottomSheet
        visible={sheetOpen}
        title="Действия по заказу"
        onClose={() => {
          setSheetOpen(false);
        }}
      >
        {(transitions.data ?? []).map((transition) => {
          const look =
            transition.kind === TransitionKind.FORWARD
              ? { icon: 'forward' as const, bg: colors.accentSoft, fg: colors.accent }
              : transition.kind === TransitionKind.CANCEL
                ? { icon: 'cancelled' as const, bg: colors.dangerSoft, fg: colors.danger }
                : { icon: 'rolledBack' as const, bg: colors.warningSoft, fg: colors.warning };

          return (
            <Pressable
              key={transition.to}
              disabled={changeStatus.isPending}
              onPress={() => {
                startTransition(transition.to, transition.requiresComment);
              }}
              style={({ pressed }) => [styles.sheetRow, pressed ? styles.sheetRowPressed : null]}
              accessibilityRole="button"
            >
              <View style={[styles.sheetIcon, { backgroundColor: look.bg }]}>
                <Icon name={look.icon} size={17} color={look.fg} />
              </View>
              <View style={styles.sheetTextWrap}>
                <Text style={[styles.sheetLabel, { color: look.fg }]}>{transition.label}</Text>
                {transition.requiresComment && (
                  <Text style={styles.sheetHint}>Попросим указать причину</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </BottomSheet>
    </ScrollView>
  );
}

/**
 * Число из колонки `numeric` без хвостовых нулей.
 *
 * Drizzle отдаёт такие колонки строками ровно с той точностью, что указана
 * в схеме: ширина приходит как `"150.0"`, а площадь — как `"3.9000"`, и на
 * экране это выглядело «Размер: 150.0 × 260.0 см · 3.9000 м²». Четыре знака
 * после запятой в площади — ложная точность: столько её никто не мерил.
 */
function trimNumber(value: string, maxFractionDigits = 1): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(parsed);
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  client: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  callButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  callText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  details: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  address: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryAction: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  /**
   * Когда вперёд идти некуда (доступны только откат или отмена), главная
   * кнопка красится хвоей шапки, а не зелёным действия: «назад» не должно
   * выглядеть как «дальше».
   */
  primaryActionMuted: {
    backgroundColor: colors.header,
  },
  primaryActionText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  moreAction: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreActionText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  sheetRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sheetLabel: {
    ...typography.headline,
  },
  sheetHint: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: 1,
  },
  reasonBlock: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  reasonTitle: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  reasonInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reasonButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  confirmButton: {
    minHeight: 44,
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    minHeight: 44,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  error: {
    marginTop: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTitle: {
    ...typography.value,
  },
  itemDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemComment: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  commentForm: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    maxHeight: 96,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sendText: {
    color: colors.onAccent,
    fontSize: 17,
  },
  comment: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  commentBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});

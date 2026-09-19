import {
  formatIsoDate,
  formatMoney,
  formatPhone,
  ORDER_ITEM_KIND_LABELS,
  ORDER_STAGE_FEE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_PHASE,
  ORDER_TYPE_LABELS,
  type OrderStatus,
  OrderStatus as OrderStatusValue,
  OrderType,
  parseMoney,
  Role,
  ROLE_LABELS,
  stageFeesOfOrderType,
  TransitionKind,
} from '@curtain-crm/shared';
import { BlurView } from 'expo-blur';
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
import { OrderPayments } from '../components/OrderPayments';
import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderManagement } from '../components/OrderManagement';
import { OrderCommentsCard } from '../components/order/OrderCommentsCard';
import { OrderCorniceCard } from '../components/order/OrderCorniceCard';
import { OrderItemsCard } from '../components/order/OrderItemsCard';
import { OrderPackList } from '../components/OrderPackList';
import { Field, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { OrderPhotoUpload } from '../components/OrderPhotoUpload';
import { Stepper } from '../components/Stepper';
import { useAuth, useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography, opacity, fonts } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Карточка заказа.
 *
 * Кнопки действий приходят с сервера (`orders.availableTransitions`):
 * приложение не решает само, что доступно этой роли на этом этапе, и не
 * дублирует правила перехода. Обязательность причины тоже приходит оттуда.
 */
export function OrderDetailScreen({ route }: RootStackScreenProps<'OrderDetail'>): ReactElement {
  const { orderId } = route.params;
  const { t, m } = useLocale();

  const utils = trpc.useUtils();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  /** Ценники позиций для «Готово — на склад»; `null` — форма закрыта. */
  const [pricing, setPricing] = useState<Record<number, string> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /*
    Расценки закрыты, пока их не откроют глазом.

    Заказ смотрят в цехе и при клиенте, через плечо, и «за установку 200 000»
    на виду — это чужая зарплата, прочитанная посторонним. Прячем показ, а не
    данные: что человеку видеть можно, решил сервер (`maskStageFees`), и
    открытый глаз ничего сверх этого не покажет.
  */
  const [feesShown, setFeesShown] = useState(false);

  const isManager = useIsManagement();
  const { user } = useAuth();

  const order = trpc.orders.byId.useQuery({ id: orderId });
  const transitions = trpc.orders.availableTransitions.useQuery({ id: orderId });

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
      setPricing(null);
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
    // Пошив на склад закрывается с ценниками: после контроля админ ставит
    // цену, и только с ней штора ложится на полку.
    if (order.data?.orderType === OrderType.STOCK && toStatus === OrderStatusValue.COMPLETED) {
      setPricing(Object.fromEntries(order.data.items.map((item) => [item.id, ''])));
      return;
    }
    changeStatus.mutate({ id: orderId, toStatus });
  };
  const priceOf = (value: string | undefined): number => {
    const parsed = Number.parseFloat((value ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

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
          message={order.error?.message ?? m('order.notFound')}
          hint={m('order.notFoundHint')}
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
    cutting: data.cuttingFee,
    sewing: data.sewingFee,
    qc: data.qcFee,
    cornice: data.corniceFee,
    installation: data.installationFee,
  };

  /*
    Руководителю показываем и нулевые строки, исполнителю — нет.

    У незаполненного этапа стоит ноль, и «За пошив: 0 сум» читается швеёй как
    «мне за это не заплатят», хотя означает «сумму ещё не внесли». А вот
    директору нужен именно полный список: пропущенная строка — это забытая
    расценка, и заметить её можно только там, где она должна была быть.
  */
  const visibleStageFees = stageFeesOfOrderType(data.orderType)
    .map((stage) => [stage, stageFeeValue[stage] ?? null] as const)
    .filter(
      (entry): entry is readonly [(typeof entry)[0], string] =>
        entry[1] !== null && (isManager || Number.parseFloat(entry[1]) > 0),
    );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.orderNumber}>{data.orderNumber ?? `#${data.id.toString()}`}</Text>
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
          accessibilityLabel={m('order.callClient', { name: data.clientName })}
        >
          <Icon name="call" size={14} color={colors.accentStrong} />
          <Text style={styles.callText}>{formatPhone(data.clientPhone)}</Text>
        </Pressable>

        <View style={styles.details}>
          <Row label={m('order.deadline')} value={formatIsoDate(data.deadline)} />
          {/* Суммы приходят `null` тем, кому их не показывают, — цеху. */}
          {data.workPrice !== null && data.paidAmount !== null && (
            <>
              <Row label={m('order.price')} value={formatMoney(parseMoney(data.workPrice))} />
              <Row label={m('order.paid')} value={formatMoney(parseMoney(data.paidAmount))} />
              <Row
                label={m('order.remaining')}
                value={
                  data.remainingPayment === null
                    ? '—'
                    : formatMoney(parseMoney(data.remainingPayment))
                }
              />
            </>
          )}
          <Row label={m('order.branch')} value={data.branch.name} />
        </View>
        {data.workPrice !== null && (
          <OrderPayments
            orderId={orderId}
            remaining={data.remainingPayment}
            canAccept={
              isManager || data.creator?.id === user?.id || data.installer?.id === user?.id
            }
          />
        )}

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
            <Pressable
              onPress={() => {
                setFeesShown((shown) => !shown);
              }}
              accessibilityRole="button"
              accessibilityLabel={feesShown ? m('order.hideFees') : m('order.showFees')}
              hitSlop={8}
              style={styles.feesHeader}
            >
              <Text style={styles.feesTitle}>{m('order.stageFees')}</Text>
              <Icon name={feesShown ? 'eyeOff' : 'eye'} size={18} color={colors.textSecondary} />
            </Pressable>

            <View>
              {visibleStageFees.map(([stage, value]) => (
                <Row
                  key={stage}
                  label={t(ORDER_STAGE_FEE_LABELS, stage)}
                  value={
                    Number.parseFloat(value) > 0
                      ? formatMoney(parseMoney(value))
                      : m('order.feeNotSet')
                  }
                />
              ))}

              {/*
                Заслонка поверх сумм, а не `display: none`: строки остаются на
                месте, и карточка не прыгает при каждом нажатии глаза.
                Полупрозрачный слой под размытием обязателен — на Android до
                12-й версии `expo-blur` почти не размывает, и без него суммы
                читались бы сквозь «скрытие».
              */}
              {!feesShown && (
                <BlurView
                  intensity={24}
                  tint="light"
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.feesVeil]}
                />
              )}
            </View>
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
        <CardTitle title={m('order.actions')} icon="priority" />

        {transitions.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : transitions.data === undefined || transitions.data.length === 0 ? (
          <Empty message={m('order.noActions')} hint={m('order.noActionsHint')} />
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
              const primary =
                list.find((entry) => entry.kind === TransitionKind.FORWARD) ?? list[0];
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
                        {m('order.allActions', { n: list.length })}
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
              {m('order.reasonRequired', { status: t(ORDER_STATUS_LABELS, pendingStatus) })}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={m('order.reasonPlaceholder')}
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
                <Text style={styles.confirmText}>{m('common.confirm')}</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPendingStatus(null);
                }}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelText}>{m('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {pricing !== null && (
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonTitle}>{m('order.stockPrices')}</Text>
            {data.items.map((item, index) => (
              <Field
                key={item.id}
                label={`${(index + 1).toString()}. ${item.model ?? m('order.noModel')} · ${t(ORDER_ITEM_KIND_LABELS, item.kind)} · ${item.widthCm ?? '?'}×${item.heightCm ?? '?'}`}
                required
              >
                <MoneyInput
                  value={pricing[item.id] ?? ''}
                  onChangeText={(value) => {
                    setPricing({ ...pricing, [item.id]: value });
                  }}
                  placeholder="0"
                />
              </Field>
            ))}
            <View style={styles.reasonButtons}>
              <Pressable
                disabled={
                  changeStatus.isPending ||
                  data.items.some((item) => priceOf(pricing[item.id]) <= 0)
                }
                onPress={() => {
                  changeStatus.mutate({
                    id: orderId,
                    toStatus: OrderStatusValue.COMPLETED,
                    stockPrices: data.items.map((item) => ({
                      itemId: item.id,
                      price: priceOf(pricing[item.id]),
                    })),
                  });
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  data.items.some((item) => priceOf(pricing[item.id]) <= 0)
                    ? styles.disabled
                    : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.confirmText}>{m('common.confirm')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPricing(null);
                }}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelText}>{m('common.cancel')}</Text>
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
      <OrderItemsCard orderId={orderId} items={data.items} isManager={isManager} />

      {/*
        --- Сбор на выезд -----------------------------------------------------

        Только на этапе установки: до него собирать нечего — шторы ещё шьют.
      */}
      {ORDER_STATUS_PHASE[data.status] === 'installation' && <OrderPackList orderId={data.id} />}

      {/* --- Карниз ---------------------------------------------------------- */}
      <OrderCorniceCard order={data} />

      {/* --- Фотофиксация --------------------------------------------------- */}
      <OrderPhotoUpload orderId={orderId} orderStatus={data.status} />

      {/* --- Исполнители --------------------------------------------------- */}
      <Card>
        <CardTitle title={m('order.executors')} icon="people" />
        <Row
          label={t(ROLE_LABELS, Role.MASTER)}
          value={data.master?.fullName ?? m('order.notAssignedM')}
        />
        <Row
          label={t(ROLE_LABELS, Role.SEWER)}
          value={data.sewer?.fullName ?? m('order.notAssignedF')}
        />
        <Row label={t(ROLE_LABELS, Role.QC)} value={data.qc?.fullName ?? m('order.notAssignedM')} />
        <Row
          label={t(ROLE_LABELS, Role.INSTALLER)}
          value={data.installer?.fullName ?? m('order.notAssignedM')}
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
          workPrice={data.workPrice ?? '0'}
          paidAmount={data.paidAmount ?? '0'}
          fees={{
            measurementFee: data.measurementFee,
            cuttingFee: data.cuttingFee,
            sewingFee: data.sewingFee,
            qcFee: data.qcFee,
            corniceFee: data.corniceFee,
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
      <OrderCommentsCard orderId={orderId} />

      {/* --- Шторка со всеми действиями ----------------------------------- */}
      <BottomSheet
        visible={sheetOpen}
        title={m('order.orderActions')}
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
                  <Text style={styles.sheetHint}>{m('order.willAskReason')}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </BottomSheet>
    </ScrollView>
  );
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
    fontFamily: fonts.extrabold,
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
  feesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  feesTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  feesVeil: {
    borderRadius: radius.sm,
    backgroundColor: 'rgba(246, 248, 246, 0.72)',
    overflow: 'hidden',
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
    fontFamily: fonts.medium,
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
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.medium,
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
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});

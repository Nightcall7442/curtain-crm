import {
  CORNICE_ROTATION_LABELS,
  CORNICE_STATUS_LABELS,
  CorniceStatus,
  formatMaterial,
  formatMoney,
  formatPhone,
  ORDER_STAGE_FEE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_PHASE,
  ORDER_TYPE_LABELS,
  OrderType,
  parseMoney,
  Role,
  ROLE_LABELS,
  stageFeesOfOrderType,
  TransitionKind,
  type OrderStatus,
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
import { ItemMeters } from '../components/ItemMeters';
import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderManagement } from '../components/OrderManagement';
import { OrderPackList } from '../components/OrderPackList';
import { Icon } from '../components/Icon';
import { OrderPhotoUpload } from '../components/OrderPhotoUpload';
import { Stepper } from '../components/Stepper';
import { VoiceCommentPlayer, VoiceRecorderButton } from '../components/VoiceComment';
import { useAuth, useIsManagement } from '../hooks/useAuth';
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
  const { t, m } = useLocale();

  const utils = trpc.useUtils();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
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
  const isCorniceInstaller = (user?.roles ?? []).includes(Role.CORNICE_INSTALLER);

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

  /*
    Карниз — своя пара мутаций, мимо `changeStatus`: он идёт параллельно
    цепочке статусов, и статус заказа при этом не меняется. Обе обновляют
    и карточку, и очередь карнизчиков — иначе взятая работа осталась бы
    висеть в списке свободных до перезахода на экран.
  */
  const corniceMutationOptions = {
    onSuccess: async () => {
      notifySuccess();
      await Promise.all([
        utils.orders.byId.invalidate({ id: orderId }),
        utils.orders.corniceQueue.invalidate(),
      ]);
    },
    onError: () => {
      notifyError();
    },
  };

  const takeCornice = trpc.orders.takeCornice.useMutation(corniceMutationOptions);
  const finishCornice = trpc.orders.finishCornice.useMutation(corniceMutationOptions);

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
          accessibilityLabel={m('order.callClient', { name: data.clientName })}
        >
          <Icon name="call" size={14} color={colors.accentStrong} />
          <Text style={styles.callText}>{formatPhone(data.clientPhone)}</Text>
        </Pressable>

        <View style={styles.details}>
          <Row
            label={m('order.deadline')}
            value={
              data.deadline === null
                ? '—'
                : new Date(data.deadline).toLocaleDateString('ru-RU')
            }
          />
          {/* Суммы приходят `null` тем, кому их не показывают, — цеху. */}
          {data.workPrice !== null && data.deposit !== null && (
            <>
              <Row label={m('order.price')} value={formatMoney(parseMoney(data.workPrice))} />
              <Row label={m('order.deposit')} value={formatMoney(parseMoney(data.deposit))} />
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
              <Icon
                name={feesShown ? 'eyeOff' : 'eye'}
                size={18}
                color={colors.textSecondary}
              />
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
          <Empty
            message={m('order.noActions')}
            hint={m('order.noActionsHint')}
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

        {changeStatus.error !== null && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{changeStatus.error.message}</Text>
          </View>
        )}
      </Card>

      {/* --- Позиции ------------------------------------------------------ */}
      <Card>
        <CardTitle title={m('order.items')} icon="window" />
        {data.items.length === 0 ? (
          <Empty message={m('order.noItems')} />
        ) : (
          data.items.map((item, index) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>
                {`${(index + 1).toString()}. ${item.model ?? m('order.noModel')}`}
                {item.readyMadeCode === null ? '' : ` · ${item.readyMadeCode}`}
              </Text>
              {item.widthCm !== null && item.heightCm !== null && (
                <Text style={styles.itemDetail}>
                  {m('order.size', { w: trimNumber(item.widthCm), h: trimNumber(item.heightCm) })}
                  {item.areaM2 === null ? '' : m('order.area', { a: trimNumber(item.areaM2, 2) })}
                </Text>
              )}
              {item.materials.length > 0 && (
                <Text style={styles.itemDetail}>{m('order.materials', { list: item.materials.join(', ') })}</Text>
              )}
              {item.color !== null && (
                <Text style={styles.itemDetail}>{m('order.color', { color: item.color })}</Text>
              )}
              {/*
                Коды тканей и фурнитуры — то, по чему в цехе и работают:
                раскройщик берёт по ним рулон, а установщик — карниз. Без
                них карточка заказа на телефоне остаётся описанием, по
                которому нельзя ничего сделать.
              */}
              {item.portieres.map((portiere, index) => (
                <Text key={`${portiere.code}-${index.toString()}`} style={styles.itemDetail}>
                  {m('order.portiere', { v: formatMaterial(portiere) })}
                </Text>
              ))}
              {item.tulle !== null && (
                <Text style={styles.itemDetail}>{m('order.tulle', { v: formatMaterial(item.tulle) })}</Text>
              )}
              {item.protection !== null && (
                <Text style={styles.itemDetail}>{m('order.protection', { v: formatMaterial(item.protection) })}</Text>
              )}
              {item.cornice !== null && (
                <Text style={styles.itemDetail}>{m('order.cornice', { v: formatMaterial(item.cornice) })}</Text>
              )}
              {item.corniceRotation !== null && (
                <Text style={styles.itemDetail}>
                  {m('order.rotation', { v: t(CORNICE_ROTATION_LABELS, item.corniceRotation) })}
                </Text>
              )}
              {item.plastic !== null && (
                <Text style={styles.itemDetail}>{m('order.plastic', { v: formatMaterial(item.plastic) })}</Text>
              )}
              {item.pipe !== null && (
                <Text style={styles.itemDetail}>{m('order.pipe', { v: formatMaterial(item.pipe) })}</Text>
              )}
              {item.comment !== null && <Text style={styles.itemComment}>{item.comment}</Text>}

              {/*
                Метраж проставляет руководство: продавец у клиента дома его
                не считает, а «на глазок» всплывает потом в раскрое.
              */}
              {isManager && <ItemMeters orderId={data.id} item={item} />}
            </View>
          ))
        )}
      </Card>

      {/*
        --- Сбор на выезд -----------------------------------------------------

        Только на этапе установки: до него собирать нечего — шторы ещё шьют.
      */}
      {ORDER_STATUS_PHASE[data.status] === 'installation' && <OrderPackList orderId={data.id} />}

      {/* --- Карниз ---------------------------------------------------------- */}
      {data.corniceStatus !== CorniceStatus.NOT_REQUIRED && (
        <Card>
          <CardTitle title={m('order.corniceTitle')} icon="window" />

          <Row label={m('order.corniceState')} value={t(CORNICE_STATUS_LABELS, data.corniceStatus)} />
          {data.corniceInstaller !== null && (
            <Row label={m('order.corniceBy')} value={data.corniceInstaller.fullName} />
          )}
          {data.corniceDoneAt !== null && (
            <Row label={m('order.corniceDone')} value={new Date(data.corniceDoneAt).toLocaleString('ru-RU')} />
          )}

          {/*
            Кнопки видит только карнизчик и только по своей работе: взять
            свободный карниз или закрыть уже взятый им. Остальным карточка
            остаётся справкой — кто ставит и когда сделал.
          */}
          {isCorniceInstaller && data.corniceStatus === CorniceStatus.PENDING && (
            <Pressable
              disabled={takeCornice.isPending}
              onPress={() => {
                takeCornice.mutate({ id: orderId });
              }}
              style={({ pressed }) => [
                styles.primaryAction,
                styles.corniceAction,
                pressed ? styles.pressed : null,
                takeCornice.isPending ? styles.disabled : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryActionText}>{m('order.takeCornice')}</Text>
            </Pressable>
          )}

          {isCorniceInstaller &&
            data.corniceStatus === CorniceStatus.IN_PROGRESS &&
            data.corniceInstaller?.id === user?.id && (
              <>
                <Pressable
                  disabled={finishCornice.isPending}
                  onPress={() => {
                    finishCornice.mutate({ id: orderId });
                  }}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    styles.corniceAction,
                    pressed ? styles.pressed : null,
                    finishCornice.isPending ? styles.disabled : null,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryActionText}>{m('order.finishCornice')}</Text>
                </Pressable>
                <Text style={styles.corniceHint}>{m('order.corniceHint')}</Text>
              </>
            )}
        </Card>
      )}

      {/* --- Фотофиксация --------------------------------------------------- */}
      <OrderPhotoUpload orderId={orderId} orderStatus={data.status} />

      {/* --- Исполнители --------------------------------------------------- */}
      <Card>
        <CardTitle title={m('order.executors')} icon="people" />
        <Row label={t(ROLE_LABELS, Role.MASTER)} value={data.master?.fullName ?? m('order.notAssignedM')} />
        <Row label={t(ROLE_LABELS, Role.SEWER)} value={data.sewer?.fullName ?? m('order.notAssignedF')} />
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
          deposit={data.deposit ?? '0'}
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
      <Card>
        <CardTitle title={m('order.comments')} icon="comment" />

        <View style={styles.commentForm}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={m('order.commentPlaceholder')}
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
            accessibilityLabel={m('order.sendComment')}
          >
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>

        <VoiceRecorderButton orderId={orderId} />

        {comments.data === undefined || comments.data.length === 0 ? (
          <Empty message={m('order.noComments')} />
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
  corniceAction: {
    marginTop: spacing.md,
  },
  corniceHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
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

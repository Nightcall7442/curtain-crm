import {
  AWAITING_PAYMENT_LABEL,
  EXECUTOR_NOT_ASSIGNED_LABEL,
  formatInstallSlot,
  formatIsoDateShort,
  formatMoneyShort,
  isActiveStatus,
  isOverdueDate,
  ORDER_STATUS_LABELS,
  OrderStatus,
  parseMoney,
  Priority,
  PRIORITY_LABELS,
  type OrderStatus as OrderStatusName,
  type Priority as PriorityName,
} from '@curtain-crm/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';
import { useLocale } from '../hooks/useLocale';
import { cardShadow, colors, radius, spacing, typography, fonts } from '../theme';

import { Pill } from './Card';
import { PressableScale } from './PressableScale';
import { SwipeableRow } from './SwipeableRow';

/** Статусы, в которых карточка показывает время установки вместо срока. */
const INSTALLATION_STAGE: readonly OrderStatusName[] = [
  OrderStatus.INSTALLATION_ASSIGNED,
  OrderStatus.INSTALLATION_IN_PROGRESS,
];

/**
 * Заказ в списке — карточка из утверждённого макета «Хвоя UI».
 *
 * Слева — полоса приоритета (терракота у критического, янтарь у срочного),
 * статус — чипом, сумма — компактно («13,8 млн сум») и сверхжирно. Просрочка
 * подсвечивается терракотой И подписывается словом: в цехе экран смотрят
 * под углом и при ярком свете, где на один цвет полагаться нельзя.
 *
 * Свайпы — ускорители, а не единственный путь: вправо — позвонить клиенту
 * (телефон есть и в карточке заказа), влево — открыть заказ (то же, что тап).
 * Оба действия ничего не решают сами: переходы статусов остаются за
 * кнопками карточки, которые сервер выдаёт по `availableTransitions`.
 */
export function OrderCard({
  orderNumber,
  clientName,
  clientPhone,
  status,
  priority,
  deadline,
  workPrice,
  remaining,
  installationAt = null,
  executor,
  awaitingPayment = false,
  onPress,
}: {
  readonly orderNumber: string;
  readonly clientName: string;
  /** Не передан — свайп «позвонить» выключен. */
  readonly clientPhone?: string;
  readonly status: OrderStatusName;
  readonly priority: PriorityName;
  readonly deadline: string | null;
  /** `null` — сумму этому сотруднику не показывают. */
  readonly workPrice: string | null;
  /** Остаток по заказу: `0` — оплачен целиком. Не передан — не показывается. */
  readonly remaining?: string | null;
  /** Время установки: у назначенной установки оно важнее срока. */
  readonly installationAt?: Date | null;
  /**
   * Кто сейчас ведёт этап: `name: null` — этап ждёт человека («не назначен»);
   * `null` или не передан — у статуса исполнителя нет, строки не будет.
   */
  readonly executor?: { readonly name: string | null } | null;
  /** Установка сделана, остаток не получен — пометка «Ждёт оплаты». */
  readonly awaitingPayment?: boolean;
  readonly onPress: () => void;
}): ReactElement {
  const { t, m, locale } = useLocale();
  const isOverdue =
    deadline !== null && isActiveStatus(status) && isOverdueDate(deadline);

  const deadlineLabel =
    deadline === null ? m('orderCard.noDeadline') : m('orderCard.until', { date: formatIsoDateShort(deadline) });
  // Установщику на выезде важнее не срок, а когда его ждёт клиент.
  const slot =
    installationAt !== null && INSTALLATION_STAGE.includes(status) ? formatInstallSlot(installationAt) : null;

  const card = (
    <View style={styles.card}>
      {priority !== Priority.NORMAL && (
        <View
          style={[
            styles.stripe,
            { backgroundColor: priority === Priority.CRITICAL ? colors.danger : colors.warning },
          ]}
          accessibilityLabel={m('orderCard.priority', { p: t(PRIORITY_LABELS, priority) })}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.number} numberOfLines={1}>
          {orderNumber}
        </Text>
        <View style={styles.badges}>
          <Pill
            text={t(ORDER_STATUS_LABELS, status)}
            tone={statusTone(status, isOverdue)}
          />
          {awaitingPayment && <Pill text={AWAITING_PAYMENT_LABEL[locale]} tone="warning" />}
          {/* Кто сейчас ведёт заказ — сразу под статусом, как просил заказчик. */}
          {executor != null &&
            (executor.name === null ? (
              <Text style={styles.executorNone} numberOfLines={1}>
                {EXECUTOR_NOT_ASSIGNED_LABEL[locale]}
              </Text>
            ) : (
              <Text style={styles.executor} numberOfLines={1}>
                {executor.name}
              </Text>
            ))}
        </View>
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {clientName}
      </Text>

      <View style={styles.footer}>
        {slot === null ? (
          <Text style={[styles.deadline, isOverdue ? styles.overdue : null]} numberOfLines={1}>
            {isOverdue ? m('orderCard.overdue', { date: formatIsoDateShort(deadline) }) : deadlineLabel}
          </Text>
        ) : (
          <Text style={[styles.deadline, styles.slot]} numberOfLines={1}>
            {m('install.at', { date: slot.date, time: slot.time })}
          </Text>
        )}
        {workPrice !== null && (
          <View style={styles.money}>
            <Text style={styles.price}>{formatMoneyShort(parseMoney(workPrice))}</Text>
            {/* Продавцу важно с первого взгляда: взяли деньги или нет. */}
            {remaining != null &&
              (parseMoney(remaining) > 0 ? (
                <Text style={styles.unpaid}>
                  {m('orderCard.remaining', { sum: formatMoneyShort(parseMoney(remaining)) })}
                </Text>
              ) : (
                <Text style={styles.paid}>{m('orderCard.paid')}</Text>
              ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.cardWrapper}>
      <SwipeableRow
        left={
          clientPhone === undefined
            ? undefined
            : {
                icon: 'call',
                label: m('orderCard.call'),
                color: colors.accentBright,
                onTrigger: () => {
                  void Linking.openURL(`tel:${clientPhone}`);
                },
              }
        }
        right={{
          icon: 'forward',
          label: m('orderCard.open'),
          color: colors.header,
          onTrigger: onPress,
        }}
      >
        <PressableScale
          onPress={onPress}
          accessibilityLabel={m('orderCard.a11y', { n: orderNumber, client: clientName, status: t(ORDER_STATUS_LABELS, status) })}
        >
          {card}
        </PressableScale>
      </SwipeableRow>
    </View>
  );
}

/**
 * Статусы, в которых заказ СТОИТ и ждёт чьего-то решения, — им янтарный чип.
 * Работа в движении — зелёный, брак — терракота, закрытые — нейтральный.
 */
const WAITING_STATUSES: ReadonlySet<OrderStatusName> = new Set<OrderStatusName>([
  OrderStatus.NEW,
  OrderStatus.PENDING_ADMIN_REVIEW,
  OrderStatus.REJECTED_TO_CEO,
  OrderStatus.PENDING_SEWING_ASSIGNMENT,
  OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
]);

/**
 * Тон чипа по положению заказа на конвейере.
 *
 * Просрочка перекрашивает чип в терракоту независимо от статуса — она важнее.
 */
function statusTone(
  status: OrderStatusName,
  isOverdue: boolean,
): 'positive' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (isOverdue || status === OrderStatus.QC_FAILED) return 'danger';
  if (!isActiveStatus(status)) return 'neutral';
  if (WAITING_STATUSES.has(status)) return 'warning';

  return 'positive';
}

const styles = StyleSheet.create({
  // Внешняя обёртка держит отступ между карточками, внутренняя — саму
  // карточку. Разделены потому, что масштабируется при нажатии ВНУТРЕННЯЯ:
  // если сжимать вместе с отступом, соседние карточки дёргаются.
  cardWrapper: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...cardShadow,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badges: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 1,
  },
  executor: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
    maxWidth: 180,
  },
  executorNone: {
    ...typography.caption,
    color: colors.textMuted,
  },
  number: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 0,
  },
  client: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  deadline: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
    flexShrink: 1,
  },
  slot: {
    color: colors.accentStrong,
    fontWeight: '600',
  },
  overdue: {
    color: colors.danger,
    fontWeight: '700',
  },
  money: {
    alignItems: 'flex-end',
  },
  unpaid: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    fontWeight: '600',
    color: colors.warning,
  },
  paid: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    fontWeight: '600',
    color: colors.positive,
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

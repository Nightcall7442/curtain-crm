import {
  formatIsoDateShort,
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
import { formatMoneyShort } from '../lib/moneyShort';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Pill } from './Card';
import { PressableScale } from './PressableScale';
import { SwipeableRow } from './SwipeableRow';

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
  onPress,
}: {
  readonly orderNumber: string;
  readonly clientName: string;
  /** Не передан — свайп «позвонить» выключен. */
  readonly clientPhone?: string;
  readonly status: OrderStatusName;
  readonly priority: PriorityName;
  readonly deadline: string | null;
  readonly workPrice: string;
  readonly onPress: () => void;
}): ReactElement {
  const { t } = useLocale();
  const isOverdue =
    deadline !== null && isActiveStatus(status) && isOverdueDate(deadline);

  const deadlineLabel =
    deadline === null ? 'Срок не указан' : `до ${formatIsoDateShort(deadline)}`;

  const card = (
    <View style={styles.card}>
      {priority !== Priority.NORMAL && (
        <View
          style={[
            styles.stripe,
            { backgroundColor: priority === Priority.CRITICAL ? colors.danger : colors.warning },
          ]}
          accessibilityLabel={`Приоритет: ${t(PRIORITY_LABELS, priority)}`}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.number} numberOfLines={1}>
          {orderNumber}
        </Text>
        <Pill
          text={t(ORDER_STATUS_LABELS, status)}
          tone={statusTone(status, isOverdue)}
        />
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {clientName}
      </Text>

      <View style={styles.footer}>
        <Text style={[styles.deadline, isOverdue ? styles.overdue : null]} numberOfLines={1}>
          {isOverdue ? `просрочен · ${formatIsoDateShort(deadline)}` : deadlineLabel}
        </Text>
        <Text style={styles.price}>{formatMoneyShort(parseMoney(workPrice))}</Text>
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
                label: 'Позвонить',
                color: colors.accentBright,
                onTrigger: () => {
                  void Linking.openURL(`tel:${clientPhone}`);
                },
              }
        }
        right={{
          icon: 'forward',
          label: 'Открыть',
          color: colors.header,
          onTrigger: onPress,
        }}
      >
        <PressableScale
          onPress={onPress}
          accessibilityLabel={`Заказ ${orderNumber}, клиент ${clientName}, статус ${t(ORDER_STATUS_LABELS, status)}`}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  number: {
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
  overdue: {
    color: colors.danger,
    fontWeight: '700',
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

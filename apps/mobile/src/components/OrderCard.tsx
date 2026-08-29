import {
  formatIsoDate,
  formatMoney,
  isActiveStatus,
  isOverdueDate,
  ORDER_STATUS_LABELS,
  parseMoney,
  PRIORITY_LABELS,
  type OrderStatus,
  type Priority,
} from '@curtain-crm/shared';
import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';
import { useLocale } from '../hooks/useLocale';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Pill } from './Card';
import { PressableScale } from './PressableScale';

/**
 * Заказ в списке.
 *
 * Просроченный срок подсвечивается красным И подписывается словом
 * «просрочен»: в цехе экран часто смотрят под углом и при ярком свете,
 * где на один цвет полагаться нельзя.
 */
export function OrderCard({
  orderNumber,
  clientName,
  status,
  priority,
  deadline,
  workPrice,
  onPress,
}: {
  readonly orderNumber: string;
  readonly clientName: string;
  readonly status: OrderStatus;
  readonly priority: Priority;
  readonly deadline: string | null;
  readonly workPrice: string;
  readonly onPress: () => void;
}): ReactElement {
  const { t } = useLocale();
  const isOverdue =
    deadline !== null && isActiveStatus(status) && isOverdueDate(deadline);

  const deadlineLabel = deadline === null ? 'Срок не указан' : formatIsoDate(deadline);

  return (
    <PressableScale
      onPress={onPress}
      style={styles.cardWrapper}
      accessibilityLabel={`Заказ ${orderNumber}, клиент ${clientName}, статус ${t(ORDER_STATUS_LABELS, status)}`}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.number} numberOfLines={1}>
            {orderNumber}
          </Text>
          {priority !== 'normal' && (
            <Pill
              text={t(PRIORITY_LABELS, priority)}
              tone={priority === 'critical' ? 'danger' : 'warning'}
            />
          )}
        </View>

        <Text style={styles.client} numberOfLines={1}>
          {clientName}
        </Text>

        <View style={styles.statusRow}>
          <Pill text={t(ORDER_STATUS_LABELS, status)} tone="info" />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.deadline, isOverdue ? styles.overdue : null]}>
            {isOverdue ? `${deadlineLabel} · просрочен` : deadlineLabel}
          </Text>
          <Text style={styles.price}>{formatMoney(parseMoney(workPrice))}</Text>
        </View>
      </View>
    </PressableScale>
  );
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
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.header,
  },
  client: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: 2,
  },
  statusRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
  },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deadline: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  overdue: {
    color: colors.danger,
    fontWeight: '600',
  },
  price: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

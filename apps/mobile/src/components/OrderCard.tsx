import {
  formatMoney,
  isActiveStatus,
  ORDER_STATUS_LABELS_RU,
  parseMoney,
  PRIORITY_LABELS_RU,
  type OrderStatus,
  type Priority,
} from '@curtain-crm/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Pill } from './Card';

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
  const isOverdue =
    deadline !== null && isActiveStatus(status) && new Date(deadline) < new Date();

  const deadlineLabel =
    deadline === null
      ? 'Срок не указан'
      : new Date(deadline).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`Заказ ${orderNumber}, клиент ${clientName}, статус ${ORDER_STATUS_LABELS_RU[status]}`}
    >
      <View style={styles.header}>
        <Text style={styles.number}>{orderNumber}</Text>
        {priority !== 'normal' && (
          <Pill
            text={PRIORITY_LABELS_RU[priority]}
            tone={priority === 'critical' ? 'danger' : 'warning'}
          />
        )}
      </View>

      <Text style={styles.client} numberOfLines={1}>
        {clientName}
      </Text>

      <View style={styles.statusRow}>
        <Pill text={ORDER_STATUS_LABELS_RU[status]} tone="info" />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.deadline, isOverdue ? styles.overdue : null]}>
          {isOverdue ? `${deadlineLabel} · просрочен` : deadlineLabel}
        </Text>
        <Text style={styles.price}>{formatMoney(parseMoney(workPrice))}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  pressed: {
    opacity: 0.7,
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
    paddingTop: spacing.sm,
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

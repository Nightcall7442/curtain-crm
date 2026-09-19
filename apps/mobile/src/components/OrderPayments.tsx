import {
  formatDate,
  formatMoney,
  inputToMajor,
  parseMoney,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentKind,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { SubmitButton } from './SubmitButton';
import { ChipSelect, Field, MoneyInput } from './Field';
import { Icon } from './Icon';

/**
 * Оплаты по заказу и кнопка «Принять оплату».
 *
 * Установщик берёт остаток у клиента на месте, продавец — предоплату или
 * остаток в салоне. Кто именно может принять, решает сервер
 * (`payments.acceptForOrder`); здесь кнопка показывается только тем, кому
 * она пригодится, — иначе цех видел бы кнопку и получал отказ.
 *
 * Сумма по умолчанию — остаток: обычно берут всё. Способ — из него потом
 * складывается касса дня, поэтому спрашивается всегда.
 */
export function OrderPayments({
  orderId,
  remaining,
  canAccept,
}: {
  readonly orderId: number;
  /** Остаток по заказу в копейках-строке; `null` — цена не задана. */
  readonly remaining: string | null;
  readonly canAccept: boolean;
}): ReactElement | null {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const history = trpc.payments.byOrder.useQuery({ orderId });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);

  const remainingValue = remaining === null ? 0 : parseMoney(remaining);

  const accept = trpc.payments.acceptForOrder.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      await Promise.all([
        utils.orders.byId.invalidate({ id: orderId }),
        utils.payments.byOrder.invalidate({ orderId }),
        utils.payments.onHands.invalidate(),
      ]);
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const rows = history.data ?? [];
  if (rows.length === 0 && !(canAccept && remainingValue > 0)) return null;

  return (
    <View style={styles.wrap}>
      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>
              {t(PAYMENT_KIND_LABELS, row.kind)} · {t(PAYMENT_METHOD_LABELS, row.method)}
            </Text>
            <Text style={styles.rowMeta}>
              {formatDate(row.receivedAt)} · {row.receivedByName}
            </Text>
          </View>
          <Text
            style={[styles.rowAmount, row.kind === PaymentKind.REFUND ? styles.rowRefund : null]}
          >
            {row.kind === PaymentKind.REFUND ? '−' : ''}
            {formatMoney(parseMoney(row.amount))}
          </Text>
        </View>
      ))}

      {canAccept && remainingValue > 0 && (
        <Pressable
          onPress={() => {
            setAmount(String(remainingValue / 100));
            setOpen(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
        >
          <Icon name="paid" size={18} color={colors.accent} />
          <Text style={styles.buttonText}>{m('payment.accept')}</Text>
        </Pressable>
      )}

      <BottomSheet
        visible={open}
        title={m('payment.accept')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field
          label={m('payment.amount')}
          hint={m('payment.remainingHint', { sum: formatMoney(remainingValue) })}
        >
          <MoneyInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        <Field label={m('cash.method')}>
          <ChipSelect
            value={method}
            onChange={setMethod}
            options={PAYMENT_METHODS.map((value) => ({
              value,
              label: t(PAYMENT_METHOD_LABELS, value),
            }))}
          />
        </Field>
        <SubmitButton
          label={m('payment.confirm')}
          onPress={() => {
            accept.mutate({ id: orderId, amount: inputToMajor(amount), method });
          }}
          disabled={inputToMajor(amount) <= 0}
          pending={accept.isPending}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowAmount: {
    ...typography.value,
    color: colors.textPrimary,
  },
  rowRefund: {
    color: colors.danger,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

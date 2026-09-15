import { formatMoney, parseMoney, Role, todayIso } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Card, CardTitle } from './Card';
import { Field, MoneyInput } from './Field';
import { Icon } from './Icon';

/**
 * Инкассация: наличные на руках у сотрудника и кнопка «сдал в кассу».
 *
 * Продавец и установщик принимают наличные от клиентов; пока они не
 * сданы, они «на руках» и в кассе не считаются. Сумму сотрудник пишет
 * сам — сдаёт то, что в кармане, а не то, что насчитала система. Ниже —
 * сколько уже сдано сегодня, чтобы не сдавать дважды.
 *
 * Сдаёт продавец: ему карточка показывается всегда (живёт в «Кассе», рядом с
 * продажей), «на руках 0» тоже ответ. Руководству сдавать некому — принятые
 * директором наличные и есть касса, сервер отдаёт ему «на руках 0», и
 * карточка не рисуется; свой контроль у него в кассе дня. Остальным — только
 * если у них что-то на руках: установщик принимает остаток у клиента по
 * своему заказу, и эти деньги должны быть сданы, а не повиснуть на нём без
 * кнопки «сдал».
 */
export function CashCollectionCard(): ReactElement | null {
  const { m } = useLocale();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const handlesCash = (user?.roles ?? []).includes(Role.SELLER);
  const today = todayIso();
  const onHands = trpc.payments.onHands.useQuery();
  const collections = trpc.payments.collections.useQuery({ day: today });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const collect = trpc.payments.collect.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setAmount('');
      await Promise.all([utils.payments.onHands.invalidate(), utils.payments.collections.invalidate()]);
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const onHandsValue = onHands.data === undefined ? 0 : parseMoney(onHands.data.onHands);
  const todayTotal = collections.data === undefined ? 0 : parseMoney(collections.data.total);
  if (!handlesCash && onHandsValue === 0 && todayTotal === 0) return null;

  return (
    <Card>
      <CardTitle title={m('collection.title')} icon="paid" />
      <View style={styles.row}>
        <Text style={styles.label}>{m('collection.onHands')}</Text>
        <Text style={styles.value}>{formatMoney(onHandsValue)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{m('collection.todayTotal')}</Text>
        <Text style={styles.value}>{formatMoney(todayTotal)}</Text>
      </View>

      {onHandsValue > 0 && (
        <Pressable
          onPress={() => {
            setAmount(String(onHandsValue / 100));
            setOpen(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.accent} />
          <Text style={styles.buttonText}>{m('collection.create')}</Text>
        </Pressable>
      )}

      <BottomSheet
        visible={open}
        title={m('collection.create')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field label={m('payment.amount')} hint={m('collection.onHandsHint', { sum: formatMoney(onHandsValue) })}>
          <MoneyInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        <Pressable
          onPress={() => {
            collect.mutate({ amount: toMajor(amount) });
          }}
          disabled={collect.isPending || toMajor(amount) <= 0}
          accessibilityRole="button"
          style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
        >
          {collect.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>{m('collection.confirm')}</Text>
          )}
        </Pressable>
      </BottomSheet>
    </Card>
  );
}

function toMajor(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.value,
    color: colors.textPrimary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
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
  submit: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});

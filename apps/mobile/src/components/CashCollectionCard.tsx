import { inputToMajor, parseMoney, Role } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { useToday } from '../hooks/useToday';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { ShiftRequiredBanner, useNeedsShift } from './ShiftRequiredBanner';
import { SubmitButton } from './SubmitButton';
import { Card, CardTitle } from './Card';
import { Field, MoneyInput } from './Field';

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
  const { m, money } = useLocale();
  const needsShift = useNeedsShift();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const handlesCash = (user?.roles ?? []).includes(Role.SELLER);
  const today = useToday();
  const onHands = trpc.payments.onHands.useQuery();
  const collections = trpc.payments.collections.useQuery({ day: today });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const collect = trpc.payments.collect.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setAmount('');
      await Promise.all([
        utils.payments.onHands.invalidate(),
        utils.payments.collections.invalidate(),
      ]);
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
        <Text style={styles.value}>{money(onHandsValue)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{m('collection.todayTotal')}</Text>
        <Text style={styles.value}>{money(todayTotal)}</Text>
      </View>

      {/*
        Второстепенное действие кассы — та же таблетка в 48, что «+ Позиция»
        над ней и «Пробить чек» в подвале. Была своя кнопка в 44 со
        скруглением 14 — третья система кнопок на одном экране.
      */}
      {onHandsValue > 0 && (
        <SubmitButton
          variant="secondary"
          label={m('collection.create')}
          onPress={() => {
            setAmount(String(onHandsValue / 100));
            setOpen(true);
          }}
        />
      )}

      <BottomSheet
        visible={open}
        title={m('collection.create')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field
          label={m('payment.amount')}
          hint={m('collection.onHandsHint', { sum: money(onHandsValue) })}
        >
          <MoneyInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        {/* Инкассация — касса, а касса — только на смене (412). */}
        <ShiftRequiredBanner style={styles.shiftBanner} />
        <SubmitButton
          label={m('collection.confirm')}
          onPress={() => {
            collect.mutate({ amount: inputToMajor(amount) });
          }}
          disabled={inputToMajor(amount) <= 0 || needsShift}
          pending={collect.isPending}
        />
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  // В шторке у полей свой нижний отступ, у баннера — этот: до кнопки тот же шаг.
  shiftBanner: {
    marginBottom: spacing.md,
  },
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
});

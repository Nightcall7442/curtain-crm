import { discountFromInput, formatMoney, inputToMajor, parseMoney } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { spacing } from '../theme';
import { ChipSelect, Field, Input, MoneyInput } from './Field';

/**
 * Скидка при приёме заказа и при продаже готовых штор — та же форма, что в
 * панели: суммой или процентом, с обязательной причиной. В базу уходит
 * цена уже со скидкой и скидка отдельной суммой; владелец видит в отчёте,
 * кто и за что сбросил.
 */
export interface DiscountDraft {
  readonly value: string;
  readonly mode: 'sum' | 'percent';
  readonly reason: string;
}

export const emptyDiscount = (): DiscountDraft => ({ value: '', mode: 'sum', reason: '' });

/** Поля процедур `orders.create` и `orders.sellReadyMade` из цены и черновика скидки. */
export function discountPayload(priceRaw: string, draft: DiscountDraft): {
  readonly workPrice: number;
  readonly discountAmount: number;
  readonly discountReason?: string;
} {
  const money = discountFromInput(priceRaw, draft.value, draft.mode);
  return { ...money, ...(money.discountAmount > 0 ? { discountReason: draft.reason.trim() } : {}) };
}

/** Есть скидка, нет причины — форму не отправляем. */
export function discountMissingReason(priceRaw: string, draft: DiscountDraft): boolean {
  return discountFromInput(priceRaw, draft.value, draft.mode).discountAmount > 0 && draft.reason.trim() === '';
}

const major = (sum: number): string => formatMoney(parseMoney(sum.toString()));

export function DiscountFields({
  price,
  value,
  onChange,
  showError = false,
}: {
  /** Цена до скидки — текст поля «Стоимость». */
  readonly price: string;
  readonly value: DiscountDraft;
  readonly onChange: (next: DiscountDraft) => void;
  readonly showError?: boolean;
}): ReactElement {
  const { m } = useLocale();
  const { workPrice, discountAmount } = discountFromInput(price, value.value, value.mode);

  return (
    <>
      <Field
        label={m('discount.title')}
        hint={discountAmount > 0 ? m('discount.payable', { pay: major(workPrice), was: major(inputToMajor(price)) }) : undefined}
      >
        <View style={styles.row}>
          <View style={styles.input}>
            {value.mode === 'percent' ? (
              <Input
                value={value.value}
                onChangeText={(next) => {
                  onChange({ ...value, value: next });
                }}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            ) : (
              <MoneyInput
                value={value.value}
                onChangeText={(next) => {
                  onChange({ ...value, value: next });
                }}
                placeholder="0"
              />
            )}
          </View>
          <ChipSelect
            value={value.mode}
            options={[
              { value: 'sum', label: m('discount.sum') },
              { value: 'percent', label: '%' },
            ]}
            onChange={(mode) => {
              onChange({ ...value, mode, value: '' });
            }}
          />
        </View>
      </Field>

      <Field
        label={m('discount.reason')}
        required={discountAmount > 0}
        error={showError && discountMissingReason(price, value) ? m('discount.reasonRequired') : undefined}
      >
        <Input
          value={value.reason}
          onChangeText={(next) => {
            onChange({ ...value, reason: next });
          }}
          placeholder={m('discount.reasonPlaceholder')}
          editable={discountAmount > 0}
        />
      </Field>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
});

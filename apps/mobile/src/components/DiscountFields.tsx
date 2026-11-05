import { discountFromInput, inputToMajor, parseMoney } from '@curtain-crm/shared';
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
export function discountPayload(
  priceRaw: string,
  draft: DiscountDraft,
): {
  readonly workPrice: number;
  readonly discountAmount: number;
  readonly discountReason?: string;
} {
  const money = discountFromInput(priceRaw, draft.value, draft.mode);
  return { ...money, ...(money.discountAmount > 0 ? { discountReason: draft.reason.trim() } : {}) };
}

/** Есть скидка, нет причины — форму не отправляем. */
export function discountMissingReason(priceRaw: string, draft: DiscountDraft): boolean {
  return (
    discountFromInput(priceRaw, draft.value, draft.mode).discountAmount > 0 &&
    draft.reason.trim() === ''
  );
}

export function DiscountFields({
  price,
  value,
  onChange,
  showError = false,
  last = false,
}: {
  /** Цена до скидки — текст поля «Стоимость». */
  readonly price: string;
  readonly value: DiscountDraft;
  readonly onChange: (next: DiscountDraft) => void;
  readonly showError?: boolean;
  /**
   * Скидка — последнее в карточке: у поля причины нет нижнего отступа.
   *
   * Сами поля не знают, что идёт за ними: в кассе это конец карточки
   * «Скидка», а в продаже и в новом заказе ниже ещё «Способ оплаты».
   * Без этого карточка в кассе была снизу в 32 точки при 16 сверху.
   */
  readonly last?: boolean;
}): ReactElement {
  const { m, money } = useLocale();
  const { workPrice, discountAmount } = discountFromInput(price, value.value, value.mode);
  const major = (sum: number): string => money(parseMoney(sum.toString()));

  return (
    <>
      <Field
        label={m('discount.title')}
        hint={
          discountAmount > 0
            ? m('discount.payable', { pay: major(workPrice), was: major(inputToMajor(price)) })
            : undefined
        }
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
        last={last}
        error={
          showError && discountMissingReason(price, value)
            ? m('discount.reasonRequired')
            : undefined
        }
      >
        <Input
          value={value.reason}
          onChangeText={(next) => {
            onChange({ ...value, reason: next });
          }}
          placeholder={m('discount.reasonPlaceholder')}
          /*
            Пока скидки нет, причина не вводится — и поле выглядит
            выключенным: приглушённый вид `Input` даёт сам по `editable`,
            один на всё приложение. Прежде поле ничем не отличалось от
            живого: нажатие ничего не делало, и непонятно было почему.
          */
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

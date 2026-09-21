'use client';

import { formatMoney, parseMoney } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { Field, Input, MoneyInput } from '@/components/ui/Form';
import { cn } from '@/lib/utils';

/**
 * Скидка при приёме заказа и при продаже готовых штор.
 *
 * Продавец вводит цену как есть, а скидку — суммой или процентом; форма
 * показывает, сколько клиент платит в итоге. В базу уходит цена уже со
 * скидкой и скидка отдельной суммой: так остаток, оплаты и процент
 * продавца считаются как раньше, а владелец видит в отчёте, кто и за что
 * сбросил. Причина обязательна: скидка без причины — дыра в кассе.
 */

export interface DiscountDraft {
  readonly value: string;
  readonly mode: 'sum' | 'percent';
  readonly reason: string;
}

export const emptyDiscount = (): DiscountDraft => ({ value: '', mode: 'sum', reason: '' });

const numberOf = (raw: string): number => Number.parseFloat(raw.replace(',', '.').replace(/\s/g, '')) || 0;

/** Скидка в сумах от цены до скидки. Не больше самой цены. */
export function discountAmountOf(price: string, draft: DiscountDraft): number {
  const base = numberOf(price);
  const raw = draft.mode === 'percent' ? (base * numberOf(draft.value)) / 100 : numberOf(draft.value);
  return Math.min(base, Math.max(0, Math.round(raw)));
}

/** Поля процедур `orders.create` и `orders.sellReadyMade` из цены и черновика скидки. */
export function discountPayload(price: string, draft: DiscountDraft): {
  readonly workPrice: number;
  readonly discountAmount: number;
  readonly discountReason?: string;
} {
  const amount = discountAmountOf(price, draft);
  return {
    workPrice: numberOf(price) - amount,
    discountAmount: amount,
    ...(amount > 0 ? { discountReason: draft.reason.trim() } : {}),
  };
}

/** Ошибка формы до отправки: скидка есть, причины нет. */
export function discountError(price: string, draft: DiscountDraft): string | undefined {
  return discountAmountOf(price, draft) > 0 && draft.reason.trim() === '' ? 'Укажите причину скидки' : undefined;
}

const money = (sum: number): string => formatMoney(parseMoney(sum.toString()));

export function DiscountFields({
  price,
  value,
  onChange,
  error,
}: {
  /** Цена до скидки — текст поля «Стоимость». */
  readonly price: string;
  readonly value: DiscountDraft;
  readonly onChange: (next: DiscountDraft) => void;
  readonly error?: string | undefined;
}): ReactElement {
  const amount = discountAmountOf(price, value);
  const payable = numberOf(price) - amount;

  return (
    <>
      <Field label="Скидка" hint={amount > 0 ? `К оплате ${money(payable)} вместо ${money(numberOf(price))}` : undefined}>
        <div className="flex gap-2">
          {value.mode === 'percent' ? (
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={value.value}
              onChange={(event) => {
                onChange({ ...value, value: event.target.value });
              }}
              placeholder="0"
            />
          ) : (
            <MoneyInput
              value={value.value}
              onChange={(next) => {
                onChange({ ...value, value: next });
              }}
              placeholder="0"
            />
          )}
          <div className="flex shrink-0 overflow-hidden rounded-xl border border-subtle" role="radiogroup" aria-label="Скидка суммой или процентом">
            {(['sum', 'percent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={value.mode === mode}
                className={cn(
                  'px-3 text-caption transition-colors',
                  value.mode === mode ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-raised',
                )}
                onClick={() => {
                  onChange({ ...value, mode, value: '' });
                }}
              >
                {mode === 'sum' ? 'сум' : '%'}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field label="Причина скидки" required={amount > 0} error={error}>
        <Input
          value={value.reason}
          onChange={(event) => {
            onChange({ ...value, reason: event.target.value });
          }}
          placeholder="Постоянный клиент, акция, брак ткани…"
          disabled={amount === 0}
        />
      </Field>
    </>
  );
}

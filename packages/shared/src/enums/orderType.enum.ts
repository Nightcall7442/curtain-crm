import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Тип заказа: пошив на заказ или продажа готовых штор.
 *
 * У мастерской два разных бизнеса под одной крышей. Пошив — полный
 * конвейер: замер, раскрой, шитьё, контроль, установка. Готовые шторы —
 * товар с витрины: продавец продаёт его сразу, цех не участвует вовсе.
 * Единственное, что у готовых штор может остаться от конвейера, — хвост
 * установки: если клиенту нужен монтаж, админ назначает установщика.
 *
 * Тип задаётся при создании и НЕ меняется: «переделать» продажу в пошив —
 * это новый заказ, а не правка старого. Поэтому колонка без updated-логики,
 * а переходы, доступные только готовым шторам, помечены в таблице
 * `ORDER_TRANSITIONS` полем `orderTypes`.
 */
export const ORDER_TYPES = ['custom', 'ready_made'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export const OrderType = {
  CUSTOM: 'custom',
  READY_MADE: 'ready_made',
} as const satisfies Record<string, OrderType>;

export const orderTypeSchema = z.enum(ORDER_TYPES);

export const ORDER_TYPE_LABELS: Translated<OrderType> = {
  ru: {
    custom: 'Пошив на заказ',
    ready_made: 'Готовые шторы',
  },
  uz: {
    custom: 'Buyurtma asosida tikuv',
    ready_made: 'Tayyor pardalar',
  },
};

export const ORDER_TYPE_LABELS_RU = ORDER_TYPE_LABELS.ru;

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === 'string' && (ORDER_TYPES as readonly string[]).includes(value);
}

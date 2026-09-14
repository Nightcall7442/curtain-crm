import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Тип заказа: пошив на заказ, продажа готовых штор или пошив для склада.
 *
 * У мастерской два разных бизнеса под одной крышей плюс их общий источник.
 * Пошив на заказ — полный конвейер по заявке клиента: замер, раскрой,
 * шитьё, контроль, установка. Продажа готовых штор — товар с витрины:
 * продавец продаёт его сразу, цех не участвует вовсе. Пошив для склада —
 * третий, «поставляющий»: цех шьёт штору заранее, без клиента и установки,
 * чтобы она легла на витрину и попала в продажу готовых штор следующей.
 *
 * Тип задаётся при создании и НЕ меняется: «переделать» продажу в пошив —
 * это новый заказ, а не правка старого. Поэтому колонка без updated-логики,
 * а переходы, доступные только части типов, помечены в таблице
 * `ORDER_TRANSITIONS` полем `orderTypes`.
 */
export const ORDER_TYPES = ['custom', 'ready_made', 'stock'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export const OrderType = {
  CUSTOM: 'custom',
  READY_MADE: 'ready_made',
  /** Пошив для склада — без клиента, без установки, на выходе прибавка к витрине. */
  STOCK: 'stock',
} as const satisfies Record<string, OrderType>;

export const orderTypeSchema = z.enum(ORDER_TYPES);

export const ORDER_TYPE_LABELS: Translated<OrderType> = {
  ru: {
    custom: 'Пошив на заказ',
    // Уточнено с «Готовые шторы»: рядом появился «Пошив для склада», и два
    // разных пункта с одним и тем же словом «шторы» неразличимы в списке.
    ready_made: 'Продажа готовых штор',
    stock: 'Пошив для склада',
  },
  uz: {
    custom: 'Buyurtma asosida tikuv',
    ready_made: 'Tayyor pardalar sotuvi',
    stock: 'Ombor uchun tikuv',
  },
};

export const ORDER_TYPE_LABELS_RU = ORDER_TYPE_LABELS.ru;

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === 'string' && (ORDER_TYPES as readonly string[]).includes(value);
}

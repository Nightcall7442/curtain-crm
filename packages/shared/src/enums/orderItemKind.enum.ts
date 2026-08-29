import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Вид позиции заказа.
 *
 * В `curtain-bot` заказ жёстко состоял из двух блоков: основной комплект штор
 * и дверной (`door_*` колонки). Здесь это обобщено до списка позиций
 * `order_items`, а вид позиции сохраняет исходное различие.
 *
 * Перечисление живёт здесь, а не рядом с таблицей: подпись «Дверь» нужна
 * и веб-панели, и мобильному приложению, а тип колонки `packages/db` берёт
 * отсюда так же, как берёт роли и статусы.
 */
export const ORDER_ITEM_KINDS = ['window', 'door', 'other'] as const;

export type OrderItemKind = (typeof ORDER_ITEM_KINDS)[number];

export const OrderItemKind = {
  WINDOW: 'window',
  DOOR: 'door',
  OTHER: 'other',
} as const satisfies Record<string, OrderItemKind>;

export const orderItemKindSchema = z.enum(ORDER_ITEM_KINDS);

export const ORDER_ITEM_KIND_LABELS: Translated<OrderItemKind> = {
  ru: { window: 'Окно', door: 'Дверь', other: 'Прочее' },
  uz: { window: 'Deraza', door: 'Eshik', other: 'Boshqa' },
};

export const ORDER_ITEM_KIND_LABELS_RU = ORDER_ITEM_KIND_LABELS.ru;

export function isOrderItemKind(value: unknown): value is OrderItemKind {
  return typeof value === 'string' && (ORDER_ITEM_KINDS as readonly string[]).includes(value);
}

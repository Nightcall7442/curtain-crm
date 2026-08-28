import { z } from 'zod';

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

export const ORDER_ITEM_KIND_LABELS_RU: Readonly<Record<OrderItemKind, string>> = {
  window: 'Окно',
  door: 'Дверь',
  other: 'Прочее',
};

export function isOrderItemKind(value: unknown): value is OrderItemKind {
  return typeof value === 'string' && (ORDER_ITEM_KINDS as readonly string[]).includes(value);
}

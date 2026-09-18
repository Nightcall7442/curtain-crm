import { orderItems, readyMadeItems, type DbExecutor, type Order } from '@curtain-crm/db';
import { moneyToDecimalString, OrderType } from '@curtain-crm/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

import { recordAudit } from './audit.service';

/**
 * Пошив для склада закрыт — шторы ложатся на полку.
 *
 * Раньше переход «Готово — на склад» только закрывал заказ: строки в
 * `ready_made_items` не появлялось, и сшитое существовало лишь в истории
 * статусов — владелец назвал это утечкой. Теперь каждая позиция заказа
 * становится карточкой на складе: модель, окно/дверь, размер, код, штук.
 *
 * Цена приходит с переходом «Готово — на склад»: так задал владелец —
 * после контроля админ ставит цену, и только потом штора на полке. В
 * описании — пометка «из пошива TDH-…».
 */
export async function shelveStockOrder(
  executor: DbExecutor,
  order: Order,
  actorId: number,
  prices: ReadonlyMap<number, number>,
): Promise<void> {
  if (order.orderType !== OrderType.STOCK) return;

  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.position));
  if (items.length === 0) return;

  const created = await executor
    .insert(readyMadeItems)
    .values(
      items.map((item) => ({
        branchId: order.branchId,
        model: item.model ?? item.readyMadeCode ?? 'Без модели',
        kind: item.kind,
        code: item.readyMadeCode,
        widthCm: item.widthCm ?? '0.0',
        heightCm: item.heightCm ?? '0.0',
        price: moneyToDecimalString(prices.get(item.id) ?? 0),
        quantity: item.quantity,
        comment: `Из пошива ${order.orderNumber ?? `#${order.id.toString()}`}`,
        sourceOrderId: order.id,
        setKey: `order:${order.id.toString()}`,
        createdBy: actorId,
      })),
    )
    .returning({ id: readyMadeItems.id, model: readyMadeItems.model, quantity: readyMadeItems.quantity });

  for (const row of created) {
    await recordAudit(executor, {
      actorId,
      action: 'ready_made_item.created',
      entityType: 'ready_made_item',
      entityId: row.id,
      details: { model: row.model, quantity: row.quantity, sourceOrderId: order.id },
    });
  }
}

/**
 * Отмена продажи с полки возвращает штору на склад.
 *
 * Продажа списывает остаток сразу, в момент оформления; отмена без
 * возврата оставляла полку пустой, хотя штора никуда не делась, — и
 * продавец «терял» её при следующей продаже. Возвращаем столько, сколько
 * списали, по той же строке склада.
 */
export async function restockCancelledSale(executor: DbExecutor, order: Order, actorId: number): Promise<void> {
  if (order.orderType !== OrderType.READY_MADE) return;

  const sold = await executor
    .select({ readyMadeItemId: orderItems.readyMadeItemId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), isNotNull(orderItems.readyMadeItemId)));

  for (const item of sold) {
    if (item.readyMadeItemId === null) continue;
    const [restored] = await executor
      .update(readyMadeItems)
      .set({ quantity: sql`${readyMadeItems.quantity} + ${item.quantity}`, updatedAt: new Date() })
      .where(eq(readyMadeItems.id, item.readyMadeItemId))
      .returning({ id: readyMadeItems.id, model: readyMadeItems.model, quantity: readyMadeItems.quantity });
    if (restored === undefined) continue;
    await recordAudit(executor, {
      actorId,
      action: 'ready_made_item.stock_changed',
      entityType: 'ready_made_item',
      entityId: restored.id,
      details: { model: restored.model, quantity: restored.quantity, restoredFromOrderId: order.id, restored: item.quantity },
    });
  }
}

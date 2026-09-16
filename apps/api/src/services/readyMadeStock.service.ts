import { orderItems, readyMadeItems, type DbExecutor, type Order } from '@curtain-crm/db';
import { OrderType } from '@curtain-crm/shared';
import { asc, eq } from 'drizzle-orm';

import { recordAudit } from './audit.service';

/**
 * Пошив для склада закрыт — шторы ложатся на полку.
 *
 * Раньше переход «Готово — на склад» только закрывал заказ: строки в
 * `ready_made_items` не появлялось, и сшитое существовало лишь в истории
 * статусов — владелец назвал это утечкой. Теперь каждая позиция заказа
 * становится карточкой на складе: модель, окно/дверь, размер, код, штук.
 *
 * Цены у пошива для склада нет — ценник ставит руководство на полке, а
 * продавец при продаже всё равно вводит сумму сам. Поэтому цена 0 и
 * пометка в описании: «из пошива TDH-…».
 */
export async function shelveStockOrder(executor: DbExecutor, order: Order, actorId: number): Promise<void> {
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
        price: '0.00',
        quantity: item.quantity,
        comment: `Из пошива ${order.orderNumber ?? `#${order.id.toString()}`}`,
        sourceOrderId: order.id,
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

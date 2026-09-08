import { fabricStock, orderItems, orders, type DbExecutor, type Order } from '@curtain-crm/db';
import {
  MATERIAL_CODE_KINDS,
  type MaterialSlot,
  type OrderItemMaterial,
} from '@curtain-crm/shared';
import { and, eq, sql } from 'drizzle-orm';

import { recordAudit } from './audit.service';

/**
 * Списание ткани со склада при раскрое.
 *
 * Заказ уходит в пошив — значит, его раскроили, и метры, проставленные
 * админом в позициях, физически ушли с полки. Списание привязано к этому
 * переходу, а не к отдельной кнопке: кнопку нажимают, когда вспомнят, и
 * остаток отстаёт от полки ровно настолько, насколько занят человек.
 *
 * Чего здесь намеренно НЕТ:
 *
 *  - проверки «хватает ли метров». Ткань уже раскроили; отказать в переходе
 *    значило бы остановить цех из-за расхождения в учёте. Остаток уходит в
 *    минус — это видимый долг учёта, и его видно красным в складе;
 *  - позиций без метража. Метр проставляет админ, и пока он этого не сделал,
 *    списывать нечего: выдумать расход по коду нельзя.
 */

/** Вид справочника кодов — им же обозначен остаток на складе. */
type FabricKind = (typeof MATERIAL_CODE_KINDS)[MaterialSlot];

interface MaterialLine {
  readonly kind: FabricKind;
  readonly material: OrderItemMaterial;
}

/** Строки материала позиции, по которым ведётся склад. */
function materialsOf(item: {
  readonly portieres: readonly OrderItemMaterial[];
  readonly tulle: OrderItemMaterial | null;
  readonly protection: OrderItemMaterial | null;
  readonly cornice: OrderItemMaterial | null;
  readonly plastic: OrderItemMaterial | null;
  readonly pipe: OrderItemMaterial | null;
}): readonly MaterialLine[] {
  const lines: MaterialLine[] = item.portieres.map((material) => ({
    kind: MATERIAL_CODE_KINDS.portiere,
    material,
  }));

  const single = [
    ['tulle', item.tulle],
    ['protection', item.protection],
    ['cornice', item.cornice],
    ['plastic', item.plastic],
    ['pipe', item.pipe],
  ] as const;

  for (const [slot, material] of single) {
    if (material !== null) lines.push({ kind: MATERIAL_CODE_KINDS[slot], material });
  }

  return lines;
}

export async function writeOffOrderFabric(
  executor: DbExecutor,
  order: Order,
  actorId: number,
  ipAddress: string | null,
): Promise<void> {
  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  /*
    Одинаковый код в двух позициях складывается в одно списание: на складе
    это один остаток, и две записи по нему в журнале заставляли бы читателя
    складывать их в уме.
  */
  const byCode = new Map<string, { kind: FabricKind; code: string; meters: number }>();

  for (const item of items) {
    for (const { kind, material } of materialsOf(item)) {
      if (material.meters === null || material.meters <= 0) continue;

      const code = material.code.trim();
      if (code === '') continue;

      const key = `${kind}:${code.toLowerCase()}`;
      const previous = byCode.get(key);
      byCode.set(key, {
        kind,
        code,
        meters: (previous?.meters ?? 0) + material.meters,
      });
    }
  }

  // Отметку ставим всегда: заказ прошёл раскрой, даже если метража не было
  // проставлено ни в одной позиции — иначе второй заход спишет задним числом.
  await executor
    .update(orders)
    .set({ fabricWrittenOffAt: new Date() })
    .where(eq(orders.id, order.id));

  if (byCode.size === 0) return;

  for (const entry of byCode.values()) {
    const [existing] = await executor
      .select()
      .from(fabricStock)
      .where(
        and(
          eq(fabricStock.branchId, order.branchId),
          eq(fabricStock.kind, entry.kind),
          sql`lower(${fabricStock.code}) = lower(${entry.code})`,
        ),
      )
      .limit(1);

    /*
      Кода на складе может не быть вовсе: ткань, которую забыли оприходовать,
      всё равно раскроили. Заводим строку с отрицательным остатком — молча
      пропустить расход значило бы спрятать и ткань, и ошибку учёта.
    */
    const [updated] =
      existing === undefined
        ? await executor
            .insert(fabricStock)
            .values({
              branchId: order.branchId,
              kind: entry.kind,
              code: entry.code,
              meters: (-entry.meters).toFixed(3),
              createdBy: actorId,
            })
            .returning()
        : await executor
            .update(fabricStock)
            .set({
              meters: sql`${fabricStock.meters} - ${entry.meters.toFixed(3)}`,
              updatedAt: new Date(),
            })
            .where(eq(fabricStock.id, existing.id))
            .returning();

    if (updated === undefined) continue;

    await recordAudit(executor, {
      actorId,
      action: 'fabric_stock.written_off',
      entityType: 'fabric_stock',
      entityId: updated.id,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        code: entry.code,
        kind: entry.kind,
        meters: entry.meters,
        stockAfter: updated.meters,
      },
      ipAddress,
    });
  }
}

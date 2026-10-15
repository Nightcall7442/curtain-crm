import { orders, type DbExecutor, type Order } from '@curtain-crm/db';
import { canDispatchOrders, INSTALLATION_SCHEDULABLE_STATUSES } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import type { AuthenticatedUser } from '../types';
import { recordAudit } from './audit.service';
import { notifyInstallationScheduled } from './notifications.service';
import { loadOrderForUpdate } from './orderWorkflow.service';

/**
 * Дата и время установки.
 *
 * Одно место для всех путей — отдельная процедура, переход в «Назначен
 * установщик» и назначение установщика: проверки, журнал и уведомление
 * не могут разойтись между ними.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

export async function setInstallationTime(
  executor: DbExecutor,
  params: {
    readonly orderId: number;
    /** `null` — убрать время. */
    readonly at: Date | null;
    readonly actor: AuthenticatedUser;
    readonly ipAddress?: string | null;
    readonly now?: Date;
  },
): Promise<Order> {
  // Время назначают те же, кто назначает исполнителей: иначе любой участник
  // заказа переносил бы приезд к клиенту в обход руководства.
  if (!canDispatchOrders(params.actor.roles)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Время установки назначают менеджер, администратор или директор',
    });
  }

  const order = await loadOrderForUpdate(executor, params.orderId);
  if (!INSTALLATION_SCHEDULABLE_STATUSES.includes(order.status)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Время установки меняется до выезда' });
  }

  const { at } = params;
  const now = params.now ?? new Date();
  if (at !== null && at.getTime() < now.getTime() - DAY_MS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Время установки — не раньше вчерашнего дня' });
  }
  if (at !== null && at.getTime() > now.getTime() + YEAR_MS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Время установки — не дальше чем через год' });
  }

  const before = order.installationAt;
  if ((before?.getTime() ?? null) === (at?.getTime() ?? null)) return order;

  const [updated] = await executor
    .update(orders)
    .set({ installationAt: at, updatedAt: now })
    .where(eq(orders.id, order.id))
    .returning();
  if (updated === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось обновить заказ' });
  }

  await recordAudit(executor, {
    actorId: params.actor.id,
    action: 'order.installation_scheduled',
    entityType: 'order',
    entityId: order.id,
    details: { from: before?.toISOString() ?? null, to: at?.toISOString() ?? null },
    ipAddress: params.ipAddress ?? null,
  });

  // Без установщика сообщать некому: время уйдёт ему вместе с назначением
  // (`assignExecutor`).
  if (at !== null && updated.installerId !== null) {
    await notifyInstallationScheduled(
      executor,
      {
        orderId: updated.id,
        orderNumber: updated.orderNumber ?? `#${updated.id.toString()}`,
        clientName: updated.clientName,
        address: updated.installAddress,
      },
      updated.installerId,
      at,
    );
  }

  return updated;
}

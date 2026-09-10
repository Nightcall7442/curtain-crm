import {
  orderInstallationTeam,
  orderItems,
  orderPackChecks,
  users,
  type DbExecutor,
  type Order,
} from '@curtain-crm/db';
import { buildPackList, isManagement, type PackListRow } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';

import type { AuthenticatedUser } from '../types';

/**
 * Сборка на выезд: сверка перед установкой.
 *
 * Забытый держатель — это второй выезд через весь город, и вспоминают о нём
 * уже у клиента. Поэтому перед тем, как уехать, установщик проходит по
 * списку, собранному из самого заказа, и отмечает, что положил в машину.
 *
 * Список строится на лету (`buildPackList`), а хранятся только отметки: заказ
 * до выезда ещё правят, и сохранённая копия списка разошлась бы с тем, что
 * действительно нужно везти.
 */

export interface PackListEntry extends PackListRow {
  readonly checked: boolean;
  readonly checkedBy: string | null;
  readonly checkedAt: Date | null;
}

/** Строки листа с отметками. Пустой список — у заказа нет ни одной позиции. */
export async function loadPackList(
  executor: DbExecutor,
  orderId: number,
): Promise<readonly PackListEntry[]> {
  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.position));

  const checks = await executor
    .select({
      key: orderPackChecks.key,
      checkedAt: orderPackChecks.checkedAt,
      checkedBy: users.fullName,
    })
    .from(orderPackChecks)
    .innerJoin(users, eq(users.id, orderPackChecks.checkedBy))
    .where(eq(orderPackChecks.orderId, orderId));

  const byKey = new Map(checks.map((check) => [check.key, check]));

  return buildPackList(items).map((row) => {
    const check = byKey.get(row.key);

    return {
      ...row,
      checked: check !== undefined,
      checkedBy: check?.checkedBy ?? null,
      checkedAt: check?.checkedAt ?? null,
    };
  });
}

/**
 * Право отмечать сборку: руководство, назначенный установщик и его бригада.
 *
 * Не «все, кому виден заказ»: галочка здесь означает «я это взял», и ставить
 * её за установщика не должен ни продавец, ни швея — спрашивать за забытое
 * будут не их.
 */
export async function assertCanPack(
  executor: DbExecutor,
  order: Order,
  user: AuthenticatedUser,
): Promise<void> {
  if (isManagement(user.roles)) return;
  if (order.installerId === user.id) return;

  const [member] = await executor
    .select({ userId: orderInstallationTeam.userId })
    .from(orderInstallationTeam)
    .where(
      and(eq(orderInstallationTeam.orderId, order.id), eq(orderInstallationTeam.userId, user.id)),
    )
    .limit(1);

  if (member !== undefined) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Отмечать сборку может тот, кто едет на установку',
  });
}

/**
 * Не выпускает заказ на установку, пока лист не пройден до конца.
 *
 * Это и есть смысл затеи: сверка, которую можно пропустить, не сверка. В
 * сообщении перечислено недостающее — чтобы не возвращаться к экрану за
 * ответом на вопрос «а что именно».
 */
export async function assertOrderPacked(executor: DbExecutor, orderId: number): Promise<void> {
  const rows = await loadPackList(executor, orderId);
  const missing = rows.filter((row) => !row.checked);
  if (missing.length === 0) return;

  const listed = missing.slice(0, 3).map((row) => row.label);
  const tail = missing.length > listed.length ? ` и ещё ${(missing.length - listed.length).toString()}` : '';

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Сначала соберитесь на выезд. Не отмечено: ${listed.join(', ')}${tail}`,
  });
}

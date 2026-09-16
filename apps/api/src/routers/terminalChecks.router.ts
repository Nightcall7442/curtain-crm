import {
  moneyToDecimalString,
  ORDER_INTAKE_ROLES,
  parseMoney,
  Role,
  TERMINAL_CHECKS_DAILY_TARGET,
} from '@curtain-crm/shared';
import { terminalChecks, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure, roleProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { notifyTerminalCheckCreated } from '../services/notifications.service';
import { buildStorageKey, decodeBase64Payload, getStorage } from '../services/storage.service';
import { router } from '../trpc';

/**
 * Терминальные чеки.
 *
 * Обязанность продавцов: за день пробить на терминале не меньше
 * `TERMINAL_CHECKS_DAILY_TARGET` чеков, каждый — с фото. Цель общая на всех
 * продавцов: пробил один — остальным приходит «сегодня 2 из 3, остался 1».
 *
 * Права:
 *  - `create` — продавец и руководство (кто оформляет продажи, тот и
 *    пробивает);
 *  - `today` — любой вошедший: счётчик дня показывается в «Работе»;
 *  - `byDay` — руководство: чеки за любой день с фото.
 *
 * К оплатам и инкассации не привязано — по слову владельца это отдельная
 * система: считаем штуки и храним фото, сумму с чека не переписываем.
 */

/** День по Ташкенту: чеки считаются по местным суткам, а не по UTC. */
const localDay = (column: typeof terminalChecks.createdAt) => sql`(${column} at time zone 'Asia/Tashkent')::date`;

async function countForDay(executor: DbExecutor, day: string | null): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(terminalChecks)
    .where(dayFilter(day));
  return row?.count ?? 0;
}

/** Условие «чек за этот день» / «за период»; `null` — сегодня по Ташкенту. */
function dayFilter(day: string | null) {
  return day === null
    ? sql`${localDay(terminalChecks.createdAt)} = (now() at time zone 'Asia/Tashkent')::date`
    : sql`${localDay(terminalChecks.createdAt)} = ${day}::date`;
}

async function listChecks(executor: DbExecutor, where: ReturnType<typeof sql>) {
  const storage = getStorage();
  const rows = await executor
    .select({
      id: terminalChecks.id,
      userId: terminalChecks.userId,
      fullName: users.fullName,
      amount: terminalChecks.amount,
      comment: terminalChecks.comment,
      photoKey: terminalChecks.photoKey,
      createdAt: terminalChecks.createdAt,
    })
    .from(terminalChecks)
    .innerJoin(users, eq(users.id, terminalChecks.userId))
    .where(where)
    .orderBy(desc(terminalChecks.createdAt));
  return Promise.all(
    rows.map(async ({ photoKey, ...row }) => ({ ...row, photoUrl: await storage.getUrl(photoKey) })),
  );
}

const listForDay = (executor: DbExecutor, day: string | null) => listChecks(executor, dayFilter(day));

/** Активные продавцы — адресаты «чек пробит» и напоминаний. */
export async function sellerUserIds(executor: DbExecutor): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), eq(userRoles.role, Role.SELLER)));
  return rows.map((row) => row.id);
}

export { countForDay as terminalChecksToday };

export const terminalChecksRouter = router({
  /** Пробить чек: фото и сумма обязательны, комментарий — по желанию. */
  create: roleProcedure(...ORDER_INTAKE_ROLES)
    .input(
      z.object({
        photo: base64FileSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const stored = await getStorage().upload({
        key: buildStorageKey(['terminal-checks', ctx.user.id.toString()], input.photo.mimeType),
        body: decodeBase64Payload(input.photo, {
          allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
          maxBytes: getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        }),
        mimeType: input.photo.mimeType,
      });

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(terminalChecks)
          .values({
            userId: ctx.user.id,
            branchId: ctx.user.primaryBranchId ?? null,
            photoKey: stored.key,
            amount: moneyToDecimalString(parseMoney(input.amount)),
            comment: input.comment ?? null,
          })
          .returning({ id: terminalChecks.id });
        const count = await countForDay(tx, null);

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'terminal_check.created',
          entityType: 'terminal_check',
          entityId: created?.id ?? null,
          details: { count, target: TERMINAL_CHECKS_DAILY_TARGET },
          ipAddress: ctx.ipAddress,
        });
        const recipients = (await sellerUserIds(tx)).filter((id) => id !== ctx.user.id);
        await notifyTerminalCheckCreated(tx, recipients, {
          byName: ctx.user.fullName,
          count,
          target: TERMINAL_CHECKS_DAILY_TARGET,
        });

        return { id: created?.id ?? 0, count, target: TERMINAL_CHECKS_DAILY_TARGET };
      });
    }),

  /** Сегодня: сколько пробито, сколько осталось и кто пробивал. */
  today: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listForDay(ctx.db, null);
    return {
      target: TERMINAL_CHECKS_DAILY_TARGET,
      count: rows.length,
      remaining: Math.max(0, TERMINAL_CHECKS_DAILY_TARGET - rows.length),
      rows,
    };
  }),

  /** Архив за период — руководству: таблица и выгрузка в Excel. */
  list: managementProcedure
    .input(
      z
        .object({ from: z.string().date(), to: z.string().date() })
        .refine((value) => value.to >= value.from, { message: 'Конец периода раньше начала', path: ['to'] }),
    )
    .query(({ ctx, input }) =>
      listChecks(
        ctx.db,
        sql`${localDay(terminalChecks.createdAt)} between ${input.from}::date and ${input.to}::date`,
      ),
    ),

  /** Чеки за день — руководству. */
  byDay: managementProcedure.input(z.object({ day: z.string().date() })).query(async ({ ctx, input }) => {
    const rows = await listForDay(ctx.db, input.day);
    return { target: TERMINAL_CHECKS_DAILY_TARGET, count: rows.length, rows };
  }),
});

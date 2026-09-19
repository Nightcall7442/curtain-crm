import {
  isManagement,
  ORDER_INTAKE_ROLES,
  parseMoney,
  PAYMENT_INCOME_KINDS,
  PaymentKind,
  Role,
  TERMINAL_CHECKS_DAILY_TARGET,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { branches, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, idSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { attachPhoto, entries, post, terminalChecksCount } from '../services/ledger.service';
import { notifyTerminalCheckCreated } from '../services/notifications.service';
import { buildStorageKey, decodeBase64Payload, getStorage } from '../services/storage.service';
import { router } from '../trpc';

import { dayRange, workshopToday } from './payments.router';

/**
 * Терминальные чеки — обязанность продавцов: за день не меньше
 * `TERMINAL_CHECKS_DAILY_TARGET` чеков по платёжному терминалу на всех.
 *
 * Чек — не отдельная сущность, а приход по карте в книге проводок с фото
 * чека. Поэтому «пробито сегодня» и «принято картой» — одно число, и
 * карта, принятая по заказу продавцом или установщиком, тоже идёт в норму.
 * Роутер оставлен как фасад: экранам нужен именно «чеки за день».
 */

export async function sellerUserIds(executor: DbExecutor): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), eq(userRoles.role, Role.SELLER)));
  return rows.map((row) => row.id);
}

/** Чеков по терминалу сегодня — норма дня; `null` день = сегодня по Ташкенту. */
export const terminalChecksToday = (executor: DbExecutor, day: string | null): Promise<number> =>
  terminalChecksCount(executor, dayRange(day ?? workshopToday()));

const toCheck = (row: Awaited<ReturnType<typeof entries>>[number]) => ({
  id: row.id,
  userId: row.receivedBy,
  fullName: row.receivedByName,
  amount: row.amount,
  comment: row.comment,
  photoUrl: row.photoUrl,
  createdAt: row.receivedAt,
  orderNumber: row.orderNumber,
});

/** Видит суммы и фото чеков тот, кто их пробивает или считает кассу. */
const seesChecks = (roles: readonly RoleName[]): boolean =>
  isManagement(roles) || roles.some((role) => ORDER_INTAKE_ROLES.includes(role));

async function checksInRange(executor: DbExecutor, range: { from: Date; to: Date }, limit = 500) {
  const rows = await entries(executor, {
    range,
    methods: ['card'],
    kinds: [...PAYMENT_INCOME_KINDS],
    limit,
  });
  return rows.filter((row) => !row.opening).map(toCheck);
}

/** Филиал для чека: основной, любой свой, иначе первый — чек важнее привязки. */
async function branchFor(executor: DbExecutor, user: { primaryBranchId: number | null; branchIds: readonly number[] }): Promise<number> {
  const own = user.primaryBranchId ?? user.branchIds[0];
  if (own !== undefined) return own;
  const [first] = await executor.select({ id: branches.id }).from(branches).orderBy(asc(branches.id)).limit(1);
  if (first === undefined) throw new TRPCError({ code: 'BAD_REQUEST', message: 'В системе нет ни одного филиала' });
  return first.id;
}

export const terminalChecksRouter = router({
  /**
   * Пробить чек: фото с терминала и сумма.
   *
   * Если приход по карте уже есть (оплата по заказу, чек витрины) — фото
   * прикрепляется к нему (`paymentId`) его владельцем, хоть установщиком у
   * двери, и второй приход не рождается. Без `paymentId` — прочий приход по
   * карте, его заводят только те, кто принимает заказы.
   */
  create: protectedProcedure
    .input(
      z.object({
        photo: base64FileSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(200),
        /** Приход по карте, к которому это фото; пусто — новый приход. */
        paymentId: idSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.paymentId === undefined && !ctx.user.roles.some((role) => ORDER_INTAKE_ROLES.includes(role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Чек без прихода заводит продавец или руководство' });
      }
      const branchId = await branchFor(ctx.db, ctx.user);
      const stored = await getStorage().upload({
        key: buildStorageKey(['terminal-checks', ctx.user.id.toString()], input.photo.mimeType),
        body: decodeBase64Payload(input.photo, {
          allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
          maxBytes: getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        }),
        mimeType: input.photo.mimeType,
      });

      return ctx.db.transaction(async (tx) => {
        let id: number | null;
        if (input.paymentId !== undefined) {
          const attached = await attachPhoto(tx, { paymentId: input.paymentId, actorId: ctx.user.id, photoKey: stored.key });
          if (!attached) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Приход по карте не найден или не ваш' });
          }
          id = input.paymentId;
        } else {
          id = await post(tx, {
            branchId,
            kind: PaymentKind.OTHER,
            method: 'card',
            amount: parseMoney(input.amount),
            photoKey: stored.key,
            actorId: ctx.user.id,
            comment: input.comment ?? null,
          });
        }
        const count = await terminalChecksToday(tx, null);

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'terminal_check.created',
          entityType: 'payment',
          entityId: id,
          details: { count, target: TERMINAL_CHECKS_DAILY_TARGET },
          ipAddress: ctx.ipAddress,
        });
        const recipients = (await sellerUserIds(tx)).filter((userId) => userId !== ctx.user.id);
        await notifyTerminalCheckCreated(tx, recipients, {
          byName: ctx.user.fullName,
          count,
          target: TERMINAL_CHECKS_DAILY_TARGET,
        });

        return { id: id ?? 0, count, target: TERMINAL_CHECKS_DAILY_TARGET };
      });
    }),

  /** Норму дня видят все (она общая), суммы и фото — только продавцы и руководство. */
  today: protectedProcedure.query(async ({ ctx }) => {
    const rows = await checksInRange(ctx.db, dayRange(workshopToday()));
    return {
      target: TERMINAL_CHECKS_DAILY_TARGET,
      count: rows.length,
      remaining: Math.max(0, TERMINAL_CHECKS_DAILY_TARGET - rows.length),
      rows: seesChecks(ctx.user.roles) ? rows : [],
    };
  }),

  list: managementProcedure
    .input(
      z
        .object({ from: z.string().date(), to: z.string().date() })
        .refine((value) => value.to >= value.from, { message: 'Конец периода раньше начала', path: ['to'] }),
    )
    .query(({ ctx, input }) =>
      // Архив — для выгрузки в Excel, потолок щедрый.
      checksInRange(ctx.db, { from: dayRange(input.from).from, to: dayRange(input.to).to }, 5000),
    ),

  byDay: managementProcedure.input(z.object({ day: z.string().date() })).query(async ({ ctx, input }) => {
    const rows = await checksInRange(ctx.db, dayRange(input.day));
    return { target: TERMINAL_CHECKS_DAILY_TARGET, count: rows.length, rows };
  }),
});

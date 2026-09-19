import {
  ORDER_INTAKE_ROLES,
  parseMoney,
  PAYMENT_INCOME_KINDS,
  PaymentKind,
  Role,
  TERMINAL_CHECKS_DAILY_TARGET,
} from '@curtain-crm/shared';
import { userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure, roleProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { entries, post, terminalChecksCount } from '../services/ledger.service';
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

async function checksInRange(executor: DbExecutor, range: { from: Date; to: Date }) {
  const rows = await entries(executor, {
    range,
    methods: ['card'],
    kinds: [...PAYMENT_INCOME_KINDS],
  });
  return rows.map(toCheck);
}

export const terminalChecksRouter = router({
  /** Пробить чек: фото с терминала, сумма — прочий приход по карте. */
  create: roleProcedure(...ORDER_INTAKE_ROLES)
    .input(
      z.object({
        photo: base64FileSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchId = ctx.user.primaryBranchId;
      if (branchId === null || branchId === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Укажите филиал: у вас не задан основной филиал' });
      }
      const stored = await getStorage().upload({
        key: buildStorageKey(['terminal-checks', ctx.user.id.toString()], input.photo.mimeType),
        body: decodeBase64Payload(input.photo, {
          allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
          maxBytes: getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        }),
        mimeType: input.photo.mimeType,
      });

      return ctx.db.transaction(async (tx) => {
        const id = await post(tx, {
          branchId,
          kind: PaymentKind.OTHER,
          method: 'card',
          amount: parseMoney(input.amount),
          photoKey: stored.key,
          actorId: ctx.user.id,
          comment: input.comment ?? null,
        });
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

  today: protectedProcedure.query(async ({ ctx }) => {
    const rows = await checksInRange(ctx.db, dayRange(workshopToday()));
    return {
      target: TERMINAL_CHECKS_DAILY_TARGET,
      count: rows.length,
      remaining: Math.max(0, TERMINAL_CHECKS_DAILY_TARGET - rows.length),
      rows,
    };
  }),

  list: managementProcedure
    .input(
      z
        .object({ from: z.string().date(), to: z.string().date() })
        .refine((value) => value.to >= value.from, { message: 'Конец периода раньше начала', path: ['to'] }),
    )
    .query(({ ctx, input }) =>
      checksInRange(ctx.db, { from: dayRange(input.from).from, to: dayRange(input.to).to }),
    ),

  byDay: managementProcedure.input(z.object({ day: z.string().date() })).query(async ({ ctx, input }) => {
    const rows = await checksInRange(ctx.db, dayRange(input.day));
    return { target: TERMINAL_CHECKS_DAILY_TARGET, count: rows.length, rows };
  }),
});

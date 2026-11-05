import {
  isManagement,
  ORDER_INTAKE_ROLES,
  parseMoney,
  PaymentKind,
  Role,
  summarizeTerminalChecks,
  TERMINAL_CHECKS_DAILY_TARGET,
  terminalPayTypeSchema,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { branches, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
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
 * Чек — проводка вида `terminal_check` в книге: фото, сумма и тип оплаты.
 * Это не деньги мастерской: в кассу и на счёт не идёт, а приход по карте
 * по заказу в норму не засчитывается — владелец развёл эти две вещи.
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
  /** Чем заплатили: Click, Payme, …, наличные; у старых чеков — `null`. */
  payType: row.terminalPayType,
});

/** Видит суммы и фото чеков тот, кто их пробивает или считает кассу. */
const seesChecks = (roles: readonly RoleName[]): boolean =>
  isManagement(roles) || roles.some((role) => ORDER_INTAKE_ROLES.includes(role));

async function checksInRange(executor: DbExecutor, range: { from: Date; to: Date }, limit = 500) {
  /*
    Чеки — только записи своего вида. Приход по карте сюда больше не
    попадает: владелец развёл кассу и терминал («bir birina aloqasi
    bulmashi garak»), и норма дня считается по пробитым чекам, а не по
    оплатам картой.
  */
  const rows = await entries(executor, {
    range,
    methods: ['card'],
    kinds: [PaymentKind.TERMINAL_CHECK],
    limit,
  });
  return rows.map(toCheck);
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
   * Пробить чек: фото с терминала, сумма и тип оплаты.
   *
   * Тип оплаты (Click, Payme, Uzum, Humo, Uzcard, наличные) спрашивается у
   * каждого нового чека — так попросил заказчик 05.11: у чека значок, по
   * дню — сумма с разбивкой по типам.
   *
   * Чек — запись о пробитом фискальном чеке, а не деньги: в кассу и на счёт
   * он не идёт, в приход по источникам не входит. Прикрепить фото к приходу
   * по карте больше нельзя — владелец развёл эти две вещи совсем.
   */
  create: protectedProcedure
    .input(
      z.object({
        photo: base64FileSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        payType: terminalPayTypeSchema,
        comment: optionalText(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
        const id = await post(tx, {
          branchId,
          kind: PaymentKind.TERMINAL_CHECK,
          method: 'card',
          amount: parseMoney(input.amount),
          photoKey: stored.key,
          terminalPayType: input.payType,
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

  /**
   * Норму дня видят все (она общая), суммы и фото — только продавцы и
   * руководство. Сумма дня — им же: остальным `summary` = `null`, а не ноль.
   */
  today: protectedProcedure.query(async ({ ctx }) => {
    const rows = await checksInRange(ctx.db, dayRange(workshopToday()));
    const sees = seesChecks(ctx.user.roles);
    return {
      target: TERMINAL_CHECKS_DAILY_TARGET,
      count: rows.length,
      remaining: Math.max(0, TERMINAL_CHECKS_DAILY_TARGET - rows.length),
      rows: sees ? rows : [],
      summary: sees ? summarizeTerminalChecks(rows) : null,
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
    // Сумма дня с разбивкой по типам — под «День» (просьба заказчика 05.11).
    return { target: TERMINAL_CHECKS_DAILY_TARGET, count: rows.length, rows, summary: summarizeTerminalChecks(rows) };
  }),
});

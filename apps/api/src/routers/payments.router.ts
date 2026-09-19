import { orders, userRoles, type DbExecutor } from '@curtain-crm/db';
import {
  isManagement,
  moneyToDecimalString,
  parseMoney,
  MANAGEMENT_ROLES,
  paymentIncomeKindSchema,
  PaymentKind,
  paymentMethodSchema,
  Role,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  balance,
  dayReport,
  entries,
  onHands,
  onHandsByUser,
  orderPaid,
  post,
  sumEntries,
} from '../services/ledger.service';
import { loadOrderForUpdate } from '../services/orderWorkflow.service';
import { router } from '../trpc';

/**
 * Деньги: приходы по заказам, инкассация, возвраты и отчёт кассы.
 *
 * Роутер — тонкий: кто имеет право и какой ответ, а как движутся деньги —
 * знает книга проводок (`ledger.service`). «Оплачено» по заказу здесь не
 * пишется: колонку ведёт база от проводок.
 */

/** Полусуток по Ташкенту нет: день кассы — календарный день по UTC+5. */
const WORKSHOP_OFFSET_MS = 5 * 60 * 60 * 1000;

export function dayRange(day: string): { from: Date; to: Date } {
  const from = new Date(new Date(`${day}T00:00:00Z`).getTime() - WORKSHOP_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** Сегодня по Ташкенту, `YYYY-MM-DD` — не по UTC, где до пяти утра ещё вчера. */
export const workshopToday = (): string =>
  new Date(Date.now() + WORKSHOP_OFFSET_MS).toISOString().slice(0, 10);

/** Кто считается кассой: наличные этих людей в ящике сразу. */
export async function managementIds(executor: DbExecutor): Promise<number[]> {
  const rows = await executor
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.role, [...MANAGEMENT_ROLES]));
  return [...new Set(rows.map((row) => row.userId))];
}

/** Пространство advisory-замков инкассации — чтобы не пересечься с чужими замками. */
const LOCK_COLLECT = 7_001;

const requireBranch = (branchId: number | null | undefined): number => {
  if (branchId === null || branchId === undefined) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Укажите филиал: у вас не задан основной филиал' });
  }
  return branchId;
};

export const paymentsRouter = router({
  /**
   * Принять деньги по заказу: остаток или ещё одна часть.
   *
   * Принимает продавец, создавший заказ, установщик заказа или руководство.
   * Больше остатка не принять — переплата рождает возврат, а не «минус».
   */
  acceptForOrder: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        method: paymentMethodSchema,
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);

        const mayAccept =
          isManagement(ctx.user.roles) ||
          (ctx.user.roles.includes(Role.SELLER) && order.createdBy === ctx.user.id) ||
          order.installerId === ctx.user.id;
        if (!mayAccept) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Принять оплату может продавец, установщик заказа или руководство',
          });
        }

        const amount = parseMoney(input.amount);
        const remaining = parseMoney(order.workPrice) - (await orderPaid(tx, order.id));
        if (amount > remaining) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Сумма больше остатка по заказу' });
        }

        await post(tx, {
          branchId: order.branchId,
          kind: PaymentKind.ORDER_BALANCE,
          method: input.method,
          amount,
          orderId: order.id,
          actorId: ctx.user.id,
          comment: input.comment ?? null,
        });

        const [updated] = await tx
          .select({ paidAmount: orders.paidAmount, remainingPayment: orders.remainingPayment })
          .from(orders)
          .where(eq(orders.id, order.id));

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.received',
          entityType: 'order',
          entityId: order.id,
          details: {
            payment: moneyToDecimalString(amount),
            method: input.method,
            paid: updated?.paidAmount ?? null,
          },
          ipAddress: ctx.ipAddress,
        });

        return { paidAmount: updated?.paidAmount ?? '0.00', remainingPayment: updated?.remainingPayment ?? null };
      }),
    ),

  /**
   * Вернуть клиенту деньги по заказу — руководство.
   *
   * Возврат — обычная проводка; «оплачено» уменьшается сама, и база не даст
   * вернуть больше, чем оплачено. Наличный возврат из кассы — руководством,
   * поэтому и право только у него.
   */
  refund: managementProcedure
    .input(
      z.object({
        orderId: idSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        method: paymentMethodSchema,
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.orderId);
        const amount = parseMoney(input.amount);
        const paid = await orderPaid(tx, order.id);
        if (amount > paid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Возврат больше, чем оплачено по заказу' });
        }

        await post(tx, {
          branchId: order.branchId,
          kind: PaymentKind.REFUND,
          method: input.method,
          amount,
          orderId: order.id,
          actorId: ctx.user.id,
          comment: input.comment ?? null,
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.refunded',
          entityType: 'order',
          entityId: order.id,
          details: { payment: moneyToDecimalString(amount), method: input.method },
          ipAddress: ctx.ipAddress,
        });

        const [updated] = await tx
          .select({ paidAmount: orders.paidAmount, remainingPayment: orders.remainingPayment })
          .from(orders)
          .where(eq(orders.id, order.id));
        return { paidAmount: updated?.paidAmount ?? '0.00', remainingPayment: updated?.remainingPayment ?? null };
      }),
    ),

  /**
   * Наличные на руках.
   *
   * Сотруднику — свои, чтобы знать, сколько сдать; руководству — по всем,
   * у кого что-то есть. У руководства «на руках» нет: принятое им — касса.
   */
  onHands: protectedProcedure.query(async ({ ctx }) => {
    if (!isManagement(ctx.user.roles)) {
      return { onHands: moneyToDecimalString(await onHands(ctx.db, ctx.user.id)), byUser: [] };
    }
    const byUser = await onHandsByUser(ctx.db, await managementIds(ctx.db));
    return {
      onHands: moneyToDecimalString(0),
      byUser: byUser.map((row) => ({ ...row, onHands: moneyToDecimalString(row.onHands) })),
    };
  }),

  /**
   * Инкассация: сотрудник сдал наличные в кассу.
   *
   * Сумму пишет сам — сдаёт то, что в кармане. Больше, чем на руках,
   * сдать нельзя: иначе «на руках» ушло бы в минус и отчёт врал бы.
   */
  collect: protectedProcedure
    .input(
      z.object({
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isManagement(ctx.user.roles)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Наличные руководства и так в кассе — сдавать нечего' });
      }
      const branchId = requireBranch(ctx.user.primaryBranchId);
      const amount = parseMoney(input.amount);
      return ctx.db.transaction(async (tx) => {
        // Две параллельные сдачи не должны вдвоём пройти проверку «не больше,
        // чем на руках»: замок на человека до конца транзакции.
        await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_COLLECT}, ${ctx.user.id})`);
        const held = await onHands(tx, ctx.user.id);
        if (amount > held) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Сумма больше, чем на руках' });
        }
        const id = await post(tx, {
          branchId,
          kind: PaymentKind.COLLECTION,
          method: 'cash',
          amount,
          actorId: ctx.user.id,
          comment: input.comment ?? null,
        });
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.collected',
          entityType: 'user',
          entityId: ctx.user.id,
          details: { payment: moneyToDecimalString(amount), onHands: moneyToDecimalString(held - amount) },
          ipAddress: ctx.ipAddress,
        });
        return { id: id ?? 0, onHands: moneyToDecimalString(held - amount) };
      });
    }),

  /** Инкассации за день: свои — сотруднику, все — руководству. */
  collections: protectedProcedure
    .input(z.object({ day: z.string().date() }))
    .query(async ({ ctx, input }) => {
      const rows = await entries(ctx.db, {
        range: dayRange(input.day),
        kinds: [PaymentKind.COLLECTION],
        ...(isManagement(ctx.user.roles) ? {} : { actorId: ctx.user.id }),
      });
      return {
        rows: rows.map((row) => ({
          id: row.id,
          userId: row.receivedBy,
          fullName: row.receivedByName,
          amount: row.amount,
          comment: row.comment,
          createdAt: row.receivedAt,
        })),
        total: moneyToDecimalString(sumEntries(rows)),
      };
    }),

  /** Проводки по заказу — что и чем клиент отдал и что вернули; видят те, кто видит деньги заказа. */
  byOrder: protectedProcedure
    .input(z.object({ orderId: idSchema }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select({ installerId: orders.installerId })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      const seesMoney =
        isManagement(ctx.user.roles) ||
        ctx.user.roles.includes(Role.SELLER) ||
        order.installerId === ctx.user.id;
      if (!seesMoney) return [];

      return entries(ctx.db, { orderId: input.orderId });
    }),

  /** Отчёт кассы за день (`day` = `YYYY-MM-DD`) или за произвольный отрезок. */
  summary: managementProcedure
    .input(
      z.object({
        day: z.string().date().optional(),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        branchId: idSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const range =
        input.day !== undefined
          ? dayRange(input.day)
          : {
              from: dayRange(input.from ?? workshopToday()).from,
              to: dayRange(input.to ?? workshopToday()).to,
            };
      return dayReport(ctx.db, range, input.branchId, await managementIds(ctx.db));
    }),

  /** Касса и счёт сейчас — для главной руководства. */
  balance: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) =>
      balance(ctx.db, { at: new Date(), branchId: input.branchId, managementIds: await managementIds(ctx.db) }),
    ),

  /** Строки книги за день — кто, чем и за что; для сверки ящика вечером. */
  list: managementProcedure
    .input(z.object({ day: z.string().date(), branchId: idSchema.optional() }))
    .query(({ ctx, input }) => entries(ctx.db, { range: dayRange(input.day), branchId: input.branchId })),

  /** Прочий приход руководством — без заказа и чека. */
  recordOther: managementProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        kind: paymentIncomeKindSchema.default(PaymentKind.OTHER),
        method: paymentMethodSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchId = requireBranch(input.branchId ?? ctx.user.primaryBranchId);
      await ctx.db.transaction(async (tx) => {
        await post(tx, {
          branchId,
          kind: input.kind,
          method: input.method,
          amount: parseMoney(input.amount),
          actorId: ctx.user.id,
          comment: input.comment ?? null,
        });
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.received',
          entityType: 'branch',
          entityId: branchId,
          details: { payment: moneyToDecimalString(parseMoney(input.amount)), method: input.method },
          ipAddress: ctx.ipAddress,
        });
      });
      return { ok: true };
    }),
});

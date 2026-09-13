import { orders, payments, users } from '@curtain-crm/db';
import {
  isManagement,
  moneyToDecimalString,
  parseMoney,
  paymentKindSchema,
  PaymentKind,
  PaymentMethod,
  paymentMethodSchema,
  Role,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { loadOrderForUpdate } from '../services/orderWorkflow.service';
import { cashSummary, recordPayment } from '../services/payments.service';
import { router } from '../trpc';

/**
 * Касса: приём денег и отчёт.
 *
 * Приём по заказу открыт продавцу, руководству и установщику ЭТОГО заказа:
 * остаток клиент отдаёт тому, кто привёз шторы. Швее и ОТК деньги не
 * приносят — им и принимать нечего.
 */

/** Полусуток по Ташкенту нет: день кассы — календарный день по UTC+5. */
const WORKSHOP_OFFSET_MS = 5 * 60 * 60 * 1000;

function dayRange(day: string): { from: Date; to: Date } {
  const from = new Date(new Date(`${day}T00:00:00Z`).getTime() - WORKSHOP_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

export const paymentsRouter = router({
  /**
   * Принять деньги по заказу: остаток или ещё одна часть.
   *
   * Сумма прибавляется к `orders.deposit` — оттуда БД считает остаток, и
   * все экраны видят долг клиента без второго источника правды. Строка
   * кассы пишется рядом: со способом и тем, кто принял.
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
        const remaining = parseMoney(order.workPrice) - parseMoney(order.deposit);
        if (amount > remaining) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сумма больше остатка по заказу',
          });
        }

        const [updated] = await tx
          .update(orders)
          .set({
            deposit: moneyToDecimalString(parseMoney(order.deposit) + amount),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();
        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }

        // Установщик принял у двери — наличные у него на руках до сдачи.
        // Продавец и руководство принимают у ящика — деньги сразу в кассе.
        const atDesk = isManagement(ctx.user.roles) || ctx.user.roles.includes(Role.SELLER);
        await recordPayment(tx, {
          branchId: order.branchId,
          kind: PaymentKind.ORDER_BALANCE,
          method: input.method,
          amount,
          orderId: order.id,
          receivedBy: ctx.user.id,
          comment: input.comment ?? null,
          inKassa: atDesk,
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.received',
          entityType: 'order',
          entityId: order.id,
          details: {
            payment: moneyToDecimalString(amount),
            method: input.method,
            deposit: updated.deposit,
          },
          ipAddress: ctx.ipAddress,
        });

        return { deposit: updated.deposit, remainingPayment: updated.remainingPayment };
      }),
    ),

  /**
   * Наличные на руках: приняты у клиента, в кассу ещё не сданы.
   *
   * Руководству — по всем, чтобы знать, у кого сколько; сотруднику — свои,
   * чтобы видеть, сколько сдать вечером.
   */
  onHands: protectedProcedure.query(async ({ ctx }) => {
    const mine = !isManagement(ctx.user.roles);
    const rows = await ctx.db
      .select({
        id: payments.id,
        amount: payments.amount,
        receivedAt: payments.receivedAt,
        receivedBy: payments.receivedBy,
        receivedByName: users.fullName,
        orderId: payments.orderId,
        orderNumber: orders.orderNumber,
        clientName: orders.clientName,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.receivedBy))
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.method, PaymentMethod.CASH),
          isNull(payments.handedOverAt),
          ...(mine ? [eq(payments.receivedBy, ctx.user.id)] : []),
        ),
      )
      .orderBy(desc(payments.receivedAt))
      .limit(500);

    const total = rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
    return { rows, total: moneyToDecimalString(total) };
  }),

  /** Директор принял наличные у установщика: деньги дошли до кассы. */
  confirmHandover: managementProcedure
    .input(z.object({ ids: z.array(idSchema).min(1).max(200) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const updated = await tx
          .update(payments)
          .set({ handedOverAt: new Date(), handedOverTo: ctx.user.id })
          .where(and(inArray(payments.id, input.ids), isNull(payments.handedOverAt)))
          .returning({ id: payments.id, amount: payments.amount, receivedBy: payments.receivedBy });

        const total = updated.reduce((sum, row) => sum + parseMoney(row.amount), 0);
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.handed_over',
          entityType: 'branch',
          entityId: ctx.user.primaryBranchId ?? 0,
          details: { payment: moneyToDecimalString(total), lines: updated.length },
          ipAddress: ctx.ipAddress,
        });

        return { confirmed: updated.length, total: moneyToDecimalString(total) };
      }),
    ),

  /** Платежи по заказу — что и чем клиент уже отдал; видят те, кто видит деньги заказа. */
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

      return ctx.db
        .select({
          id: payments.id,
          kind: payments.kind,
          method: payments.method,
          amount: payments.amount,
          receivedAt: payments.receivedAt,
          receivedByName: users.fullName,
          handedOverAt: payments.handedOverAt,
        })
        .from(payments)
        .innerJoin(users, eq(users.id, payments.receivedBy))
        .where(eq(payments.orderId, input.orderId))
        .orderBy(desc(payments.receivedAt));
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
              from: dayRange(input.from ?? new Date().toISOString().slice(0, 10)).from,
              to: dayRange(input.to ?? new Date().toISOString().slice(0, 10)).to,
            };
      return cashSummary(ctx.db, range, input.branchId);
    }),

  /** Строки кассы за день — кто, чем и за что; для сверки ящика вечером. */
  list: managementProcedure
    .input(z.object({ day: z.string().date(), branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const range = dayRange(input.day);
      return ctx.db
        .select({
          id: payments.id,
          kind: payments.kind,
          method: payments.method,
          amount: payments.amount,
          comment: payments.comment,
          receivedAt: payments.receivedAt,
          receivedByName: users.fullName,
          handedOverAt: payments.handedOverAt,
          orderId: payments.orderId,
          orderNumber: orders.orderNumber,
          clientName: orders.clientName,
        })
        .from(payments)
        .innerJoin(users, eq(users.id, payments.receivedBy))
        .leftJoin(orders, eq(orders.id, payments.orderId))
        .where(
          and(
            gte(payments.receivedAt, range.from),
            lt(payments.receivedAt, range.to),
            ...(input.branchId === undefined ? [] : [eq(payments.branchId, input.branchId)]),
          ),
        )
        .orderBy(desc(payments.receivedAt))
        .limit(500);
    }),

  /** Прочий приход руками — то, что не заказ и не витрина. */
  recordOther: managementProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        kind: paymentKindSchema.default(PaymentKind.OTHER),
        method: paymentMethodSchema,
        amount: moneySchema.refine((value) => value > 0, 'Сумма должна быть больше нуля'),
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchId = input.branchId ?? ctx.user.primaryBranchId;
      if (branchId === null || branchId === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Укажите филиал: у вас не задан основной филиал' });
      }
      await ctx.db.transaction(async (tx) => {
        await recordPayment(tx, {
          branchId,
          kind: input.kind,
          method: input.method,
          amount: parseMoney(input.amount),
          receivedBy: ctx.user.id,
          comment: input.comment ?? null,
          inKassa: true,
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

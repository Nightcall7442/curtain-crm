import { cashCollections, orders, payments, userRoles, users } from '@curtain-crm/db';
import {
  isManagement,
  moneyToDecimalString,
  parseMoney,
  MANAGEMENT_ROLES,
  paymentKindSchema,
  PaymentKind,
  paymentMethodSchema,
  Role,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { loadOrderForUpdate } from '../services/orderWorkflow.service';
import {
  cashOnHands,
  cashOnHandsByUser,
  cashSummary,
  collectionsInRange,
  recordPayment,
} from '../services/payments.service';
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

/** Сегодня по Ташкенту, `YYYY-MM-DD` — не по UTC, где до пяти утра ещё вчера. */
const workshopToday = (): string =>
  new Date(Date.now() + WORKSHOP_OFFSET_MS).toISOString().slice(0, 10);

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

        await recordPayment(tx, {
          branchId: order.branchId,
          kind: PaymentKind.ORDER_BALANCE,
          method: input.method,
          amount,
          orderId: order.id,
          receivedBy: ctx.user.id,
          comment: input.comment ?? null,
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
   * Наличные на руках: принято наличными минус сдано инкассацией.
   *
   * Сотруднику — свои, чтобы знать, сколько сдать; руководству — по всем,
   * у кого что-то есть, чтобы знать, с кого спросить.
   */
  onHands: protectedProcedure.query(async ({ ctx }) => {
    const mine = await cashOnHands(ctx.db, ctx.user.id);
    const byUser = isManagement(ctx.user.roles) ? await cashOnHandsByUser(ctx.db) : [];
    return {
      onHands: moneyToDecimalString(mine.onHands),
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
      const branchId = ctx.user.primaryBranchId;
      if (branchId === null || branchId === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Укажите филиал: у вас не задан основной филиал' });
      }
      const amount = parseMoney(input.amount);
      return ctx.db.transaction(async (tx) => {
        const { onHands } = await cashOnHands(tx, ctx.user.id);
        if (amount > onHands) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Сумма больше, чем на руках' });
        }
        const [created] = await tx
          .insert(cashCollections)
          .values({
            branchId,
            userId: ctx.user.id,
            amount: moneyToDecimalString(amount),
            comment: input.comment ?? null,
          })
          .returning();
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payment.collected',
          entityType: 'user',
          entityId: ctx.user.id,
          details: { payment: moneyToDecimalString(amount), onHands: moneyToDecimalString(onHands - amount) },
          ipAddress: ctx.ipAddress,
        });
        return { id: created?.id ?? 0, onHands: moneyToDecimalString(onHands - amount) };
      });
    }),

  /** Инкассации за день: свои — сотруднику, все — руководству. */
  collections: protectedProcedure
    .input(z.object({ day: z.string().date() }))
    .query(async ({ ctx, input }) => {
      const result = await collectionsInRange(
        ctx.db,
        dayRange(input.day),
        isManagement(ctx.user.roles) ? undefined : ctx.user.id,
      );
      return { rows: result.rows, total: moneyToDecimalString(result.total) };
    }),

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
              from: dayRange(input.from ?? workshopToday()).from,
              to: dayRange(input.to ?? workshopToday()).to,
            };
      const management = await ctx.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(inArray(userRoles.role, [...MANAGEMENT_ROLES]));
      return cashSummary(
        ctx.db,
        range,
        input.branchId,
        [...new Set(management.map((row) => row.userId))],
      );
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

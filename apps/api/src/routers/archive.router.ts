import { orders, users } from '@curtain-crm/db';
import { ARCHIVED_ORDER_STATUSES, isManagement, orderStatusSchema } from '@curtain-crm/shared';
import { and, count, desc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, paginationSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Архив заказов.
 *
 * Права доступа: любой вошедший сотрудник, но видит он только те закрытые
 * заказы, в которых участвовал. Руководство видит все.
 *
 * Отдельной таблицы для архива НЕТ намеренно: выполненные и отменённые заказы
 * остаются в `orders`, а архив — это фильтр по `ARCHIVED_ORDER_STATUSES`.
 * Перенос строк в отдельную таблицу означал бы, что ссылки на заказ из
 * закупок, фотографий и зарплатных расчётов надо переписывать.
 */
export const archiveRouter = router({
  list: protectedProcedure
    .input(
      paginationSchema
        .extend({
          /** Уточнение: только выполненные либо только отменённые. */
          status: orderStatusSchema
            .refine(
              (value) => ARCHIVED_ORDER_STATUSES.includes(value),
              'В архиве только выполненные и отменённые заказы',
            )
            .optional(),
          branchId: idSchema.optional(),
          search: z.string().trim().max(200).optional(),
          closedFrom: z.date().optional(),
          closedTo: z.date().optional(),
        })
        .default({ page: 1, pageSize: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const visibility = isManagement(ctx.user.roles)
        ? undefined
        : or(
            eq(orders.createdBy, ctx.user.id),
            eq(orders.masterId, ctx.user.id),
            eq(orders.sewerId, ctx.user.id),
            eq(orders.qcId, ctx.user.id),
            eq(orders.installerId, ctx.user.id),
          );

      const where = and(
        visibility,
        input.status === undefined
          ? inArray(orders.status, [...ARCHIVED_ORDER_STATUSES])
          : eq(orders.status, input.status),
        ...(input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)]),
        ...(input.closedFrom === undefined ? [] : [gte(orders.updatedAt, input.closedFrom)]),
        ...(input.closedTo === undefined ? [] : [lt(orders.updatedAt, input.closedTo)]),
        ...(input.search === undefined || input.search.length === 0
          ? []
          : [
              or(
                ilike(orders.orderNumber, `%${input.search}%`),
                ilike(orders.clientName, `%${input.search}%`),
                ilike(orders.clientPhone, `%${input.search}%`),
              ),
            ]),
      );

      const [items, [totalRow]] = await Promise.all([
        ctx.db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            clientName: orders.clientName,
            clientPhone: orders.clientPhone,
            workPrice: orders.workPrice,
            branchId: orders.branchId,
            completedAt: orders.completedAt,
            cancelledAt: orders.cancelledAt,
            cancellationReason: orders.cancellationReason,
            createdAt: orders.createdAt,
            createdByName: users.fullName,
          })
          .from(orders)
          .innerJoin(users, eq(users.id, orders.createdBy))
          .where(where)
          .orderBy(desc(orders.updatedAt))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(orders).where(where),
      ]);

      return toPage(items, totalRow?.value ?? 0, input);
    }),
});

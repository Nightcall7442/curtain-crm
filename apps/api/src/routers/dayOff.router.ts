import {
  DayOffStatus,
  dayOffStatusSchema,
  isManagement,
  MANAGEMENT_ROLES,
  MAX_DAY_OFF_REASON_LENGTH,
  MAX_DAY_OFF_REJECTION_REASON_LENGTH,
} from '@curtain-crm/shared';
import { dayOffRequests, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, optionalText, reasonSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  notifyDayOffApproved,
  notifyDayOffRejected,
  notifyDayOffRequested,
} from '../services/notifications.service';
import { router } from '../trpc';

/**
 * Запросы на выходные.
 *
 * Права доступа:
 *  - `request`, `my` — любой вошедший, ТОЛЬКО свои запросы: попросить
 *    выходной за коллегу нельзя, увидеть чужой — тоже;
 *  - `cancel` — автор запроса либо руководство: отозвать ещё не
 *    рассмотренный запрос вправе и тот, кто его подал, и тот, кто его
 *    всё равно рассматривает (отзыв руководством — то же решение, что
 *    отказ, только без причины, поэтому отдельного запрета не нужно);
 *  - `list`, `approve`, `reject` — руководство (CEO, админ).
 *
 * Записи не удаляются: решённый запрос — история отсутствий по
 * согласованию, а не просто «не вышел на смену». Инварианты статуса
 * («решён руководством ⇒ есть рецензент», «отклонён ⇒ есть причина»)
 * держит БД (check-констрейнты), а не только код — как у поручений.
 */

const MAX_PERIOD_DAYS = 60;

function isValidPeriod(input: { readonly startDate: string; readonly endDate: string }): boolean {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (end < start) return false;
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  return days <= MAX_PERIOD_DAYS;
}

const PERIOD_ERROR = {
  message: `Период не может превышать ${MAX_PERIOD_DAYS.toString()} дней, а конец — быть раньше начала`,
  path: ['endDate'],
};

/** Все активные сотрудники с ролью CEO или админ — адресаты нового запроса. */
async function managementUserIds(executor: DbExecutor): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), inArray(userRoles.role, [...MANAGEMENT_ROLES])));

  return rows.map((row) => row.id);
}

export const dayOffRouter = router({
  /** Запросить выходные. */
  request: protectedProcedure
    .input(
      z
        .object({
          startDate: z.string().date(),
          endDate: z.string().date(),
          reason: optionalText(MAX_DAY_OFF_REASON_LENGTH),
        })
        .refine(isValidPeriod, PERIOD_ERROR),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(dayOffRequests)
          .values({
            userId: ctx.user.id,
            startDate: input.startDate,
            endDate: input.endDate,
            reason: input.reason ?? null,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось создать запрос' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'dayoff.requested',
          entityType: 'day_off_request',
          entityId: created.id,
          details: { startDate: input.startDate, endDate: input.endDate },
          ipAddress: ctx.ipAddress,
        });

        const recipients = (await managementUserIds(tx)).filter((id) => id !== ctx.user.id);
        await notifyDayOffRequested(tx, recipients, {
          requesterName: ctx.user.fullName,
          startDate: input.startDate,
          endDate: input.endDate,
        });

        return created;
      }),
    ),

  /** Мои запросы. */
  my: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: dayOffRequests.id,
        startDate: dayOffRequests.startDate,
        endDate: dayOffRequests.endDate,
        reason: dayOffRequests.reason,
        status: dayOffRequests.status,
        rejectionReason: dayOffRequests.rejectionReason,
        createdAt: dayOffRequests.createdAt,
        reviewerName: users.fullName,
      })
      .from(dayOffRequests)
      .leftJoin(users, eq(dayOffRequests.reviewedBy, users.id))
      .where(eq(dayOffRequests.userId, ctx.user.id))
      // Ждущие решения сверху; внутри — ближайшие даты первыми.
      .orderBy(
        sql`case ${dayOffRequests.status} when 'pending' then 0 else 1 end`,
        asc(dayOffRequests.startDate),
        desc(dayOffRequests.createdAt),
      )
      .limit(50);

    return rows;
  }),

  /** Все запросы — для руководства. */
  list: managementProcedure
    .input(
      z
        .object({
          status: dayOffStatusSchema.optional(),
          userId: idSchema.optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.status === undefined ? [] : [eq(dayOffRequests.status, input.status)]),
        ...(input.userId === undefined ? [] : [eq(dayOffRequests.userId, input.userId)]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db.query.dayOffRequests.findMany({
          where,
          with: {
            requester: { columns: { id: true, fullName: true } },
            reviewer: { columns: { id: true, fullName: true } },
          },
          orderBy: [
            sql`case ${dayOffRequests.status} when 'pending' then 0 else 1 end`,
            asc(dayOffRequests.startDate),
            desc(dayOffRequests.createdAt),
          ],
          limit: 200,
        }),
        ctx.db.select({ value: count() }).from(dayOffRequests).where(where),
      ]);

      return { items: rows, total: totalRow?.value ?? 0 };
    }),

  /** Одобрить запрос. */
  approve: managementProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await tx.query.dayOffRequests.findFirst({
          where: eq(dayOffRequests.id, input.id),
        });

        if (request === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Запрос не найден' });
        }
        if (request.status !== DayOffStatus.PENDING) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Запрос уже рассмотрен' });
        }

        const now = new Date();
        const [updated] = await tx
          .update(dayOffRequests)
          .set({ status: DayOffStatus.APPROVED, reviewedBy: ctx.user.id, reviewedAt: now })
          .where(eq(dayOffRequests.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'dayoff.approved',
          entityType: 'day_off_request',
          entityId: input.id,
          details: { startDate: request.startDate, endDate: request.endDate },
          ipAddress: ctx.ipAddress,
        });

        if (request.userId !== ctx.user.id) {
          await notifyDayOffApproved(tx, request.userId, {
            startDate: request.startDate,
            endDate: request.endDate,
            reviewerName: ctx.user.fullName,
          });
        }

        return updated;
      }),
    ),

  /** Отклонить запрос — только с причиной. */
  reject: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema.max(MAX_DAY_OFF_REJECTION_REASON_LENGTH) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await tx.query.dayOffRequests.findFirst({
          where: eq(dayOffRequests.id, input.id),
        });

        if (request === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Запрос не найден' });
        }
        if (request.status !== DayOffStatus.PENDING) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Запрос уже рассмотрен' });
        }

        const now = new Date();
        const [updated] = await tx
          .update(dayOffRequests)
          .set({
            status: DayOffStatus.REJECTED,
            reviewedBy: ctx.user.id,
            reviewedAt: now,
            rejectionReason: input.reason,
          })
          .where(eq(dayOffRequests.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'dayoff.rejected',
          entityType: 'day_off_request',
          entityId: input.id,
          details: { reason: input.reason },
          ipAddress: ctx.ipAddress,
        });

        if (request.userId !== ctx.user.id) {
          await notifyDayOffRejected(tx, request.userId, {
            startDate: request.startDate,
            endDate: request.endDate,
            reason: input.reason,
          });
        }

        return updated;
      }),
    ),

  /** Отозвать свой ещё не рассмотренный запрос. */
  cancel: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await tx.query.dayOffRequests.findFirst({
          where: eq(dayOffRequests.id, input.id),
        });

        if (request === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Запрос не найден' });
        }
        if (request.userId !== ctx.user.id && !isManagement(ctx.user.roles)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Это не ваш запрос' });
        }
        if (request.status !== DayOffStatus.PENDING) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Запрос уже рассмотрен' });
        }

        const [updated] = await tx
          .update(dayOffRequests)
          .set({ status: DayOffStatus.CANCELLED })
          .where(eq(dayOffRequests.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'dayoff.cancelled',
          entityType: 'day_off_request',
          entityId: input.id,
          details: {},
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

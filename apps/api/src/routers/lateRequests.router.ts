import {
  CLOCK_TIME_PATTERN,
  DayOffStatus,
  dayOffStatusSchema,
  MAX_LATE_REQUEST_REASON_LENGTH,
  MAX_LATE_REQUEST_REJECTION_REASON_LENGTH,
  workshopClockTime,
  workshopDayIso,
} from '@curtain-crm/shared';
import { lateRequests, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, optionalText, reasonSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  notifyLateApproved,
  notifyLateRejected,
  notifyLateRequested,
} from '../services/notifications.service';
import { router } from '../trpc';

import { managementUserIds } from './dayOff.router';

/**
 * Запросы на опоздание: «12.11 приду к 10:30».
 *
 * Права доступа — как у выходных, с одним отличием в отзыве:
 *  - `create`, `my` — любой вошедший, ТОЛЬКО за себя: попросить опоздание
 *    за коллегу нельзя, увидеть чужие — тоже;
 *  - `cancel` — только автор и только пока запрос ждёт решения. Руководству
 *    отзыв не нужен: у него есть «отклонить», и с причиной;
 *  - `list`, `approve`, `reject` — руководство (CEO, админ), тот же guard,
 *    что у выходных.
 *
 * Одобренный запрос сдвигает порог опоздания на «приду к» в этот день
 * (`lateness.service`), и больше ни на что не влияет: табель, зарплата и
 * табло считают человека работающим, как и есть.
 */

/** «10:30» — так же, как время смены в условиях оплаты. */
const arriveBySchema = z.string().regex(CLOCK_TIME_PATTERN, 'Время в формате ЧЧ:ММ');

/**
 * Порядок в списках — тот же, что у выходных (`DAY_OFF_ORDER`): ждущие
 * решения сверху, свежие первыми; ниже решённые — по времени решения.
 * Экран у сотрудника и у руководства один на оба вида запросов, и два
 * разных порядка в соседних блоках читались бы как ошибка.
 */
const LATE_ORDER = [
  sql`case ${lateRequests.status} when 'pending' then 0 else 1 end`,
  sql`coalesce(${lateRequests.reviewedAt}, ${lateRequests.createdAt}) desc`,
  desc(lateRequests.id),
] as const;

/** Запрос по id, иначе `NOT_FOUND`. */
async function findRequest(
  executor: DbExecutor,
  id: number,
): Promise<typeof lateRequests.$inferSelect> {
  const request = await executor.query.lateRequests.findFirst({ where: eq(lateRequests.id, id) });
  if (request === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Запрос не найден' });
  }
  return request;
}

const alreadyReviewed = (): TRPCError =>
  new TRPCError({ code: 'CONFLICT', message: 'Запрос уже рассмотрен' });

export const lateRequestsRouter = router({
  /** Попросить опоздать в конкретный день. */
  create: protectedProcedure
    .input(
      z.object({
        date: z.string().date(),
        arriveBy: arriveBySchema,
        reason: optionalText(MAX_LATE_REQUEST_REASON_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // «Сегодня» — по Ташкенту, а не по часам сервера: в 03:00 по Ташкенту
      // в UTC ещё вчера, и запрос на сегодня отбивался бы как прошедший.
      const now = new Date();
      const today = workshopDayIso(now);
      if (input.date < today) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Опоздание просят заранее — на сегодня или на другой будущий день',
        });
      }
      // Сегодня в 11:00 «приду к 10:30» уже ни о чём: отметка либо есть,
      // либо опоздание уже наступило.
      if (input.date === today && input.arriveBy <= workshopClockTime(now)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Это время сегодня уже прошло' });
      }

      return ctx.db.transaction(async (tx) => {
        // Частичный уникальный индекс держит «одна живая договорённость на
        // день»; без `onConflictDoNothing` второй запрос был бы ошибкой 500.
        const [created] = await tx
          .insert(lateRequests)
          .values({
            userId: ctx.user.id,
            date: input.date,
            arriveBy: input.arriveBy,
            reason: input.reason ?? null,
          })
          .onConflictDoNothing()
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'На этот день запрос на опоздание уже есть — отзовите его или дождитесь решения',
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'late.requested',
          entityType: 'late_request',
          entityId: created.id,
          // Причины здесь нет намеренно: журнал читает лента в группе, а
          // причина — разговор сотрудника с руководством, не с цехом.
          details: { userId: ctx.user.id, date: input.date, arriveBy: input.arriveBy },
          ipAddress: ctx.ipAddress,
        });

        const recipients = (await managementUserIds(tx)).filter((id) => id !== ctx.user.id);
        await notifyLateRequested(tx, recipients, {
          requesterName: ctx.user.fullName,
          date: input.date,
          arriveBy: input.arriveBy,
        });

        return created;
      });
    }),

  /** Мои запросы на опоздание. */
  my: protectedProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({
        id: lateRequests.id,
        date: lateRequests.date,
        arriveBy: lateRequests.arriveBy,
        reason: lateRequests.reason,
        status: lateRequests.status,
        rejectionReason: lateRequests.rejectionReason,
        createdAt: lateRequests.createdAt,
        reviewedAt: lateRequests.reviewedAt,
        reviewerName: users.fullName,
      })
      .from(lateRequests)
      .leftJoin(users, eq(lateRequests.reviewedBy, users.id))
      .where(eq(lateRequests.userId, ctx.user.id))
      .orderBy(...LATE_ORDER)
      .limit(50),
  ),

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
        ...(input.status === undefined ? [] : [eq(lateRequests.status, input.status)]),
        ...(input.userId === undefined ? [] : [eq(lateRequests.userId, input.userId)]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db.query.lateRequests.findMany({
          where,
          with: {
            requester: { columns: { id: true, fullName: true } },
            reviewer: { columns: { id: true, fullName: true } },
          },
          orderBy: [...LATE_ORDER],
          limit: 200,
        }),
        ctx.db.select({ value: count() }).from(lateRequests).where(where),
      ]);

      return { items: rows, total: totalRow?.value ?? 0 };
    }),

  /** Согласовать опоздание. */
  approve: managementProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await findRequest(tx, input.id);
        if (request.status !== DayOffStatus.PENDING) throw alreadyReviewed();

        // Условие на статус — в самом UPDATE: двое руководителей, открывших
        // запрос одновременно, не решат его дважды.
        const [updated] = await tx
          .update(lateRequests)
          .set({ status: DayOffStatus.APPROVED, reviewedBy: ctx.user.id, reviewedAt: new Date() })
          .where(and(eq(lateRequests.id, input.id), eq(lateRequests.status, DayOffStatus.PENDING)))
          .returning();
        if (updated === undefined) throw alreadyReviewed();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'late.approved',
          entityType: 'late_request',
          entityId: input.id,
          // `userId` — о ком запрос: в группе пишется имя просившего, а не руководителя.
          details: { userId: request.userId, date: request.date, arriveBy: request.arriveBy },
          ipAddress: ctx.ipAddress,
        });

        if (request.userId !== ctx.user.id) {
          await notifyLateApproved(tx, request.userId, {
            date: request.date,
            arriveBy: request.arriveBy,
            reviewerName: ctx.user.fullName,
          });
        }

        return updated;
      }),
    ),

  /** Отказать в опоздании — только с причиной. */
  reject: managementProcedure
    .input(
      z.object({ id: idSchema, reason: reasonSchema.max(MAX_LATE_REQUEST_REJECTION_REASON_LENGTH) }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await findRequest(tx, input.id);
        if (request.status !== DayOffStatus.PENDING) throw alreadyReviewed();

        const [updated] = await tx
          .update(lateRequests)
          .set({
            status: DayOffStatus.REJECTED,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
            rejectionReason: input.reason,
          })
          .where(and(eq(lateRequests.id, input.id), eq(lateRequests.status, DayOffStatus.PENDING)))
          .returning();
        if (updated === undefined) throw alreadyReviewed();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'late.rejected',
          entityType: 'late_request',
          entityId: input.id,
          details: {
            userId: request.userId,
            date: request.date,
            arriveBy: request.arriveBy,
            reason: input.reason,
          },
          ipAddress: ctx.ipAddress,
        });

        if (request.userId !== ctx.user.id) {
          await notifyLateRejected(tx, request.userId, {
            date: request.date,
            arriveBy: request.arriveBy,
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
        const request = await findRequest(tx, input.id);
        if (request.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Это не ваш запрос' });
        }
        if (request.status !== DayOffStatus.PENDING) throw alreadyReviewed();

        const [updated] = await tx
          .update(lateRequests)
          .set({ status: DayOffStatus.CANCELLED })
          .where(and(eq(lateRequests.id, input.id), eq(lateRequests.status, DayOffStatus.PENDING)))
          .returning();
        if (updated === undefined) throw alreadyReviewed();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'late.cancelled',
          entityType: 'late_request',
          entityId: input.id,
          details: { userId: request.userId, date: request.date },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

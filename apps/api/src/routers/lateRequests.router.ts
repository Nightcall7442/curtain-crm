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
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, optionalText, reasonSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  lockLatenessOf,
  recomputeLatenessForDay,
  type LatenessRecomputeOutcome,
  type LateReviewMode,
} from '../services/lateness.service';
import {
  notifyDisciplineRecorded,
  notifyLateApproved,
  notifyLateRejected,
  notifyLateRequested,
  notifyLateWithdrawn,
  type LatePenaltyChange,
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
 *  - `list`, `approve`, `reject`, `withdraw` — руководство (CEO, админ), тот
 *    же guard, что у выходных.
 *
 * Одобренный запрос сдвигает порог опоздания на «приду к» в этот день
 * (`lateness.service`), и больше ни на что не влияет: табель, зарплата и
 * табло считают человека работающим, как и есть. Если отметка в этот день
 * уже была, одобрение и снятие пересчитывают записанное опоздание.
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

const notApproved = (): TRPCError =>
  new TRPCError({ code: 'CONFLICT', message: 'Снять можно только одобренное опоздание' });

const alreadyReviewed = (): TRPCError =>
  new TRPCError({ code: 'CONFLICT', message: 'Запрос уже рассмотрен' });

/**
 * Отказ во втором запросе на тот же день — по тому, что уже лежит.
 *
 * «Отзовите или дождитесь решения» верно только для ждущего запроса: у
 * одобренного ждать нечего, а отозвать его сотрудник не может. Тогда
 * говорим, до которого часа опоздание уже разрешено. `null` — живого
 * запроса на день нет.
 */
async function activeRequestConflict(
  executor: DbExecutor,
  userId: number,
  date: string,
): Promise<TRPCError | null> {
  const [existing] = await executor
    .select({ status: lateRequests.status, arriveBy: lateRequests.arriveBy })
    .from(lateRequests)
    .where(
      and(
        eq(lateRequests.userId, userId),
        eq(lateRequests.date, date),
        inArray(lateRequests.status, [DayOffStatus.PENDING, DayOffStatus.APPROVED]),
      ),
    )
    .limit(1);
  if (existing === undefined) return null;

  return existing.status === DayOffStatus.APPROVED
    ? new TRPCError({ code: 'CONFLICT', message: `На этот день опоздание уже одобрено — до ${existing.arriveBy}` })
    : new TRPCError({
        code: 'CONFLICT',
        message: 'На этот день уже есть запрос на опоздание — отзовите его или дождитесь решения',
      });
}

/**
 * Пересчитать опоздание за день запроса — если этот день уже наступил.
 *
 * Будущий день пересчитывать незачем: отметки ещё нет, и порог возьмётся
 * из запроса в момент отметки. Сегодня и прошлое — по Ташкенту.
 */
async function recomputeIfDayStarted(
  executor: DbExecutor,
  request: { readonly userId: number; readonly date: string },
  mode: LateReviewMode,
  actor: { readonly actorId: number; readonly ipAddress: string | null },
): Promise<LatenessRecomputeOutcome> {
  if (request.date > workshopDayIso(new Date())) return { kind: 'none' };
  return recomputeLatenessForDay(executor, {
    userId: request.userId,
    day: request.date,
    mode,
    actorId: actor.actorId,
    ipAddress: actor.ipAddress,
  });
}

/**
 * Что сказать сотруднику о записанном опоздании после решения.
 *
 * Снятую или пересчитанную запись называем в уведомлении о решении — иначе
 * в ленте остаются два штрафа подряд. Заново созданная запись приходит
 * своим уведомлением о дисциплине, «без изменений» — не новость.
 */
function penaltyChange(outcome: LatenessRecomputeOutcome): LatePenaltyChange | null {
  switch (outcome.kind) {
    case 'removed':
      return { kind: 'removed' };
    case 'adjusted':
      return { kind: 'recounted', minutes: outcome.toMinutes };
    case 'none':
    case 'unchanged':
    case 'created':
      return null;
  }
}

/**
 * Уведомление о заново созданной записи — последним шагом решения.
 *
 * Оно сразу уходит и в Telegram, не дожидаясь коммита. Если бы его
 * отправлял сам пересчёт — до пересчёта повторов, журнала и уведомления о
 * решении, — а что-то из них потом упало (хоть взаимная блокировка),
 * транзакция откатилась бы, а сотрудник уже прочёл бы о штрафе, которого
 * нет. После этого шага в транзакции остаётся только коммит. Запись создаёт
 * только снятие согласования, но исход у решений общий — и объявляется
 * одинаково.
 */
async function announceRecreatedLateness(
  executor: DbExecutor,
  userId: number,
  outcome: LatenessRecomputeOutcome,
): Promise<void> {
  if (outcome.kind === 'created') await notifyDisciplineRecorded(executor, userId, outcome.notice);
}

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
        const conflict = await activeRequestConflict(tx, ctx.user.id, input.date);
        if (conflict !== null) throw conflict;

        // Частичный уникальный индекс держит «одна живая договорённость на
        // день» и при гонке двух одновременных запросов; без
        // `onConflictDoNothing` второй из них был бы ошибкой 500.
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
          // Проиграли гонку: соседний запрос уже зафиксирован, и INSERT дождался
          // его коммита — новый SELECT его видит. Отказ — тот же, что и без гонки.
          throw (
            (await activeRequestConflict(tx, ctx.user.id, input.date)) ??
            new TRPCError({
              code: 'CONFLICT',
              message: 'На этот день уже есть запрос на опоздание — отзовите его или дождитесь решения',
            })
          );
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

        // Замок сотрудника — ДО UPDATE запроса: в том же порядке его берёт
        // отметка прихода (замок, потом строка запроса). Возьми мы его после
        // UPDATE, решение ждало бы замок со строкой в руках, а отметка — строку
        // с замком (см. `lockLatenessOf`).
        await lockLatenessOf(tx, request.userId);

        // Условие на статус — в самом UPDATE: двое руководителей, открывших
        // запрос одновременно, не решат его дважды.
        const [updated] = await tx
          .update(lateRequests)
          .set({ status: DayOffStatus.APPROVED, reviewedBy: ctx.user.id, reviewedAt: new Date() })
          .where(and(eq(lateRequests.id, input.id), eq(lateRequests.status, DayOffStatus.PENDING)))
          .returning();
        if (updated === undefined) throw alreadyReviewed();

        /*
          Согласовать можно и задним числом — так руководитель прощает уже
          случившееся опоздание. Отметка в этот день могла быть раньше
          решения, и записанное при ней опоздание считалось от графика.

          Пересчёт — ДО журнала и уведомления: журнал пишет в группу, а
          уведомление — в личку, и оба уходят сразу, не дожидаясь коммита.
          Упади пересчёт после них, транзакция откатилась бы, а группа и
          сотрудник уже прочли бы об одобрении, которого нет.
        */
        const lateness = await recomputeIfDayStarted(tx, request, 'approved', {
          actorId: ctx.user.id,
          ipAddress: ctx.ipAddress,
        });

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
            penalty: penaltyChange(lateness),
          });
        }
        await announceRecreatedLateness(tx, request.userId, lateness);

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

  /**
   * Снять согласованное опоздание: одобрили по ошибке или передумали.
   *
   * Как снятие выходного: запрос становится отозванным, рецензент и время
   * решения стираются — так требует инвариант БД «решён руководством ⇒ есть
   * рецензент». Кто и когда снял, остаётся в журнале (`late.withdrawn`); в
   * группу снятие не пишется — как и снятие выходного. Сотрудник узнаёт
   * сразу: он рассчитывал на «приду к». Если день уже наступил и отметка
   * была, опоздание пересчитывается от графика.
   */
  withdraw: managementProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const request = await findRequest(tx, input.id);
        if (request.status !== DayOffStatus.APPROVED) throw notApproved();

        // Замок сотрудника — до UPDATE запроса, как у одобрения.
        await lockLatenessOf(tx, request.userId);

        // Статус — в самом UPDATE: двое руководителей не снимут одно согласование дважды.
        const [updated] = await tx
          .update(lateRequests)
          .set({ status: DayOffStatus.CANCELLED, reviewedBy: null, reviewedAt: null })
          .where(and(eq(lateRequests.id, input.id), eq(lateRequests.status, DayOffStatus.APPROVED)))
          .returning();
        if (updated === undefined) throw notApproved();

        // Пересчёт — до журнала и уведомления, как у одобрения.
        const lateness = await recomputeIfDayStarted(tx, request, 'withdrawn', {
          actorId: ctx.user.id,
          ipAddress: ctx.ipAddress,
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'late.withdrawn',
          entityType: 'late_request',
          entityId: input.id,
          details: { userId: request.userId, date: request.date, arriveBy: request.arriveBy },
          ipAddress: ctx.ipAddress,
        });

        if (request.userId !== ctx.user.id) {
          await notifyLateWithdrawn(tx, request.userId, {
            date: request.date,
            arriveBy: request.arriveBy,
            reviewerName: ctx.user.fullName,
            penalty: penaltyChange(lateness),
          });
        }
        // Заново созданная запись — самым последним: после журнала и уведомления о снятии.
        await announceRecreatedLateness(tx, request.userId, lateness);

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

import {
  disciplineKindSchema,
  disciplineLevel,
  disciplinePoints,
  isDisciplineViolation,
  isManagement,
  MANAGEMENT_ROLES,
  MAX_DISCIPLINE_COMMENT_LENGTH,
  MAX_DISCIPLINE_DESCRIPTION_LENGTH,
  type DisciplineKind,
  type DisciplineLevel,
} from '@curtain-crm/shared';
import { disciplineEvents, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { idSchema, optionalText, periodSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { notifyDisciplineRecorded } from '../services/notifications.service';
import { router } from '../trpc';

/**
 * Дисциплина: нарушения и поощрения с баллами.
 *
 * Права доступа:
 *  - `record`, `remove`, `list`, `summary` — руководство: факт фиксирует
 *    менеджер, он же отвечает за одинаковое применение правил;
 *  - `my` — любой вошедший, ТОЛЬКО свои записи и своя сводка;
 *  - `explain` — сотрудник по СВОЕЙ записи: объяснение — его право по
 *    правилам, и чужую запись объяснять нельзя.
 *
 * Баллы не вводятся руками: категория задаёт балл (`@curtain-crm/shared`),
 * повтор той же категории в том же месяце делает его строже. Уровень
 * реакции — от суммы штрафных за месяц; поощрения его не гасят, но видны
 * рядом. Удержаний из зарплаты система не делает и не предлагает.
 */

interface Period {
  readonly year: number;
  readonly month: number;
}

function monthBounds(period: Period): { from: string; to: string } {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const next: Period =
    period.month === 12 ? { year: period.year + 1, month: 1 } : { year: period.year, month: period.month + 1 };
  return {
    from: `${period.year.toString()}-${pad(period.month)}-01`,
    to: `${next.year.toString()}-${pad(next.month)}-01`,
  };
}

function monthOf(isoDate: string): Period {
  return {
    year: Number.parseInt(isoDate.slice(0, 4), 10),
    month: Number.parseInt(isoDate.slice(5, 7), 10),
  };
}

export interface UserMonth {
  readonly userId: number;
  readonly fullName: string;
  readonly violations: number;
  readonly penalty: number;
  readonly bonus: number;
  readonly net: number;
  readonly level: DisciplineLevel;
}

/**
 * Сводка за месяц по сотрудникам.
 *
 * Руководство в сводке не участвует — правила для всех одни, но
 * фиксировать себе баллы директору некому, и нули у него в таблице только
 * заслоняли бы цех. Сотрудники без единой записи остаются в списке:
 * «чистый месяц» — это тоже результат, и его должно быть видно.
 */
async function monthSummary(executor: DbExecutor, period: Period, onlyUserId?: number): Promise<UserMonth[]> {
  const { from, to } = monthBounds(period);
  const management = executor
    .select({ id: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.role, [...MANAGEMENT_ROLES]));
  const penaltySql = sql`coalesce(sum(${disciplineEvents.points}) filter (where ${disciplineEvents.points} < 0), 0)`;

  const rows = await executor
    .select({
      userId: users.id,
      fullName: users.fullName,
      violations: sql<number>`count(${disciplineEvents.id}) filter (where ${disciplineEvents.points} < 0)`.mapWith(
        Number,
      ),
      penalty: sql<number>`${penaltySql}`.mapWith(Number),
      bonus: sql<number>`coalesce(sum(${disciplineEvents.points}) filter (where ${disciplineEvents.points} > 0), 0)`.mapWith(
        Number,
      ),
    })
    .from(users)
    .leftJoin(
      disciplineEvents,
      and(
        eq(disciplineEvents.userId, users.id),
        gte(disciplineEvents.occurredOn, from),
        lt(disciplineEvents.occurredOn, to),
      ),
    )
    .where(
      and(
        eq(users.isActive, true),
        onlyUserId === undefined ? notInArray(users.id, management) : eq(users.id, onlyUserId),
      ),
    )
    .groupBy(users.id, users.fullName)
    // Кому нужен разговор — сверху: самые штрафные первыми.
    .orderBy(penaltySql, users.fullName);

  return rows.map((row) => ({
    ...row,
    net: row.penalty + row.bonus,
    level: disciplineLevel(row.penalty),
  }));
}

const recorder = alias(users, 'recorder');

export interface DisciplineEventRow {
  readonly id: number;
  readonly userId: number;
  readonly fullName: string;
  readonly kind: DisciplineKind;
  readonly points: number;
  readonly isRepeat: boolean;
  readonly occurredOn: string;
  readonly description: string | null;
  readonly employeeComment: string | null;
  readonly employeeCommentAt: Date | null;
  readonly recordedByName: string;
  readonly createdAt: Date;
}

async function listEvents(executor: DbExecutor, period: Period, userId?: number): Promise<DisciplineEventRow[]> {
  const { from, to } = monthBounds(period);
  const rows = await executor
    .select({
      id: disciplineEvents.id,
      userId: disciplineEvents.userId,
      fullName: users.fullName,
      kind: disciplineEvents.kind,
      points: disciplineEvents.points,
      isRepeat: disciplineEvents.isRepeat,
      occurredOn: disciplineEvents.occurredOn,
      description: disciplineEvents.description,
      employeeComment: disciplineEvents.employeeComment,
      employeeCommentAt: disciplineEvents.employeeCommentAt,
      recordedByName: recorder.fullName,
      createdAt: disciplineEvents.createdAt,
    })
    .from(disciplineEvents)
    .innerJoin(users, eq(disciplineEvents.userId, users.id))
    .innerJoin(recorder, eq(disciplineEvents.recordedBy, recorder.id))
    .where(
      and(
        gte(disciplineEvents.occurredOn, from),
        lt(disciplineEvents.occurredOn, to),
        userId === undefined ? undefined : eq(disciplineEvents.userId, userId),
      ),
    )
    .orderBy(desc(disciplineEvents.occurredOn), desc(disciplineEvents.id));

  return rows.map((row) => ({ ...row, points: Number.parseFloat(row.points) }));
}

export const disciplineRouter = router({
  /** Зафиксировать факт: категория даёт балл, повтор в месяце — строже. */
  record: managementProcedure
    .input(
      z.object({
        userId: idSchema,
        kind: disciplineKindSchema,
        occurredOn: z.string().date(),
        description: optionalText(MAX_DISCIPLINE_DESCRIPTION_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ id: users.id, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (target === undefined || !target.isActive) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден или уволен' });
        }

        const { from, to } = monthBounds(monthOf(input.occurredOn));
        const [prior] = await tx
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(disciplineEvents)
          .where(
            and(
              eq(disciplineEvents.userId, input.userId),
              eq(disciplineEvents.kind, input.kind),
              gte(disciplineEvents.occurredOn, from),
              lt(disciplineEvents.occurredOn, to),
            ),
          );
        const isRepeat = isDisciplineViolation(input.kind) && (prior?.count ?? 0) > 0;
        const points = disciplinePoints(input.kind, isRepeat);

        const [created] = await tx
          .insert(disciplineEvents)
          .values({
            userId: input.userId,
            kind: input.kind,
            points: points.toFixed(1),
            isRepeat,
            occurredOn: input.occurredOn,
            description: input.description ?? null,
            recordedBy: ctx.user.id,
          })
          .returning();
        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить запись' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'discipline.recorded',
          entityType: 'discipline_event',
          entityId: created.id,
          details: { userId: input.userId, kind: input.kind, points, isRepeat, occurredOn: input.occurredOn },
          ipAddress: ctx.ipAddress,
        });
        await notifyDisciplineRecorded(tx, input.userId, {
          kind: input.kind,
          points,
          occurredOn: input.occurredOn,
          recordedByName: ctx.user.fullName,
        });

        return { ...created, points };
      }),
    ),

  /** Объяснение сотрудника по своей записи. Одно; повторное заменяет прежнее. */
  explain: protectedProcedure
    .input(z.object({ id: idSchema, comment: z.string().trim().min(1).max(MAX_DISCIPLINE_COMMENT_LENGTH) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(disciplineEvents)
          .set({ employeeComment: input.comment, employeeCommentAt: new Date() })
          .where(and(eq(disciplineEvents.id, input.id), eq(disciplineEvents.userId, ctx.user.id)))
          .returning({ id: disciplineEvents.id });
        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Запись не найдена' });
        }
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'discipline.explained',
          entityType: 'discipline_event',
          entityId: updated.id,
          details: {},
          ipAddress: ctx.ipAddress,
        });
        return updated;
      }),
    ),

  /** Убрать ошибочную запись. Факты перед решением проверяются — в том числе так. */
  remove: managementProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      const [removed] = await tx.delete(disciplineEvents).where(eq(disciplineEvents.id, input.id)).returning();
      if (removed === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Запись не найдена' });
      }
      await recordAudit(tx, {
        actorId: ctx.user.id,
        action: 'discipline.removed',
        entityType: 'discipline_event',
        entityId: removed.id,
        details: { userId: removed.userId, kind: removed.kind, points: removed.points, occurredOn: removed.occurredOn },
        ipAddress: ctx.ipAddress,
      });
      return removed;
    }),
  ),

  /** Сводка за месяц по всем сотрудникам. */
  summary: managementProcedure.input(periodSchema).query(({ ctx, input }) => monthSummary(ctx.db, input)),

  /** Записи за месяц — все или одного сотрудника. */
  list: managementProcedure
    .input(periodSchema.extend({ userId: idSchema.optional() }))
    .query(({ ctx, input }) => listEvents(ctx.db, input, input.userId)),

  /** Мои баллы за месяц: сводка и записи. Руководству — пусто. */
  my: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    if (isManagement(ctx.user.roles)) return { summary: null, events: [] as DisciplineEventRow[] };
    const [summary] = await monthSummary(ctx.db, input, ctx.user.id);
    return { summary: summary ?? null, events: await listEvents(ctx.db, input, ctx.user.id) };
  }),
});

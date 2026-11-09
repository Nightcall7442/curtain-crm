import {
  DisciplineAuditReason,
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
  type Locale,
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
import {
  hasEarlierSameKind,
  isLateKind,
  localizeLatenessDescription,
  lockLatenessOf,
  recountMonthRepeats,
} from '../services/lateness.service';
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
 * повтор той же категории в том же месяце делает его строже. Повтор —
 * событие, у которого такое же было РАНЬШЕ в месяце (день, затем id), — тот
 * же порядок, что у опоздания при отметке и пересчёта повторов
 * (`lateness.service`). Опоздания система ведёт сама, и ручная запись или
 * удаление опоздания пересчитывает повторы её записей за месяц. Уровень
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

/**
 * Записи дисциплины за месяц.
 *
 * `locale` — язык клиента: пояснение к опозданию система пишет по-русски
 * («Смена с 09:00, отметка в 11:52 — опоздание 172 мин»), и в узбекском
 * интерфейсе оно стояло русской строкой под узбекским заголовком. Текст,
 * введённый руководителем руками, показывается как есть.
 */
async function listEvents(
  executor: DbExecutor,
  period: Period,
  userId: number | undefined,
  locale: Locale,
): Promise<DisciplineEventRow[]> {
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

  return rows.map((row) => ({
    ...row,
    points: Number.parseFloat(row.points),
    description: row.description === null ? null : localizeLatenessDescription(row.description, locale),
  }));
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
        const late = isLateKind(input.kind);
        // Опоздание: замок сотрудника — до любой записи. Ниже пересчёт
        // повторов берёт записи месяца FOR UPDATE, как и пересчёт после
        // решения по запросу; без общего замка они ловили бы взаимную
        // блокировку (см. `lockLatenessOf`).
        if (late) await lockLatenessOf(tx, input.userId);

        const [target] = await tx
          .select({ id: users.id, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (target === undefined || !target.isActive) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден или уволен' });
        }

        /*
          Повтор — если такое же событие было РАНЬШЕ в этом месяце. Раньше
          хватало любого в месяце: опоздание за 05.11, записанное задним
          числом, становилось повтором из-за 09.11, а пересчёт месяца
          (`recountRepeats`) считал наоборот — 09.11 повтором из-за 05.11.
        */
        const isRepeat =
          isDisciplineViolation(input.kind) &&
          (await hasEarlierSameKind(tx, { userId: input.userId, kind: input.kind, day: input.occurredOn }));
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

        /*
          Ручное опоздание за 05.11 делает повтором системное за 09.11 того же
          вида — балл той записи пересчитывается. ДО журнала и уведомления:
          журнал пишет в группу, уведомление — в Telegram, и оба уходят
          сразу, не дожидаясь коммита; упади пересчёт после них, группа и
          сотрудник прочли бы о записи, которой нет.
        */
        if (late) {
          await recountMonthRepeats(
            tx,
            { userId: input.userId, day: input.occurredOn, kinds: new Set([input.kind]) },
            { actorId: ctx.user.id, ipAddress: ctx.ipAddress },
            { reason: DisciplineAuditReason.MANUAL_DISCIPLINE_CHANGE, policy: 'any' },
          );
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
      const notFound = (): TRPCError => new TRPCError({ code: 'NOT_FOUND', message: 'Запись не найдена' });

      // Чья запись и какого вида — до удаления: замок сотрудника берётся раньше строки (см. `lockLatenessOf`).
      const [target] = await tx
        .select({ userId: disciplineEvents.userId, kind: disciplineEvents.kind })
        .from(disciplineEvents)
        .where(eq(disciplineEvents.id, input.id))
        .limit(1);
      if (target === undefined) throw notFound();
      const late = isLateKind(target.kind);
      if (late) await lockLatenessOf(tx, target.userId);

      // Запись могли удалить, пока ждали замка, — тогда её уже нет.
      const [removed] = await tx.delete(disciplineEvents).where(eq(disciplineEvents.id, input.id)).returning();
      if (removed === undefined) throw notFound();

      // Убрали опоздание за 05.11 — системное за 09.11 того же вида больше не повтор.
      if (late) {
        await recountMonthRepeats(
          tx,
          { userId: removed.userId, day: removed.occurredOn, kinds: new Set([removed.kind]) },
          { actorId: ctx.user.id, ipAddress: ctx.ipAddress },
          { reason: DisciplineAuditReason.MANUAL_DISCIPLINE_CHANGE, policy: 'any' },
        );
      }

      await recordAudit(tx, {
        actorId: ctx.user.id,
        action: 'discipline.removed',
        entityType: 'discipline_event',
        entityId: removed.id,
        details: {
          userId: removed.userId,
          kind: removed.kind,
          points: removed.points,
          occurredOn: removed.occurredOn,
          /*
            Чья была запись. Убрать запись системы — простить опоздание, и
            снятие согласования его уже не вернёт; стереть свою ошибочную
            ручную запись — не прощение. Различает это `forgivenByHand` в
            `lateness.service` — по `recordedBy`; `auto` — то же словом:
            запись сделала система (`recorded_by` — сам сотрудник).
          */
          recordedBy: removed.recordedBy,
          auto: removed.recordedBy === removed.userId,
        },
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
    .query(({ ctx, input }) => listEvents(ctx.db, input, input.userId, ctx.locale)),

  /** Мои баллы за месяц: сводка и записи. Руководству — пусто. */
  my: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    if (isManagement(ctx.user.roles)) return { summary: null, events: [] as DisciplineEventRow[] };
    const [summary] = await monthSummary(ctx.db, input, ctx.user.id);
    return { summary: summary ?? null, events: await listEvents(ctx.db, input, ctx.user.id, ctx.locale) };
  }),
});

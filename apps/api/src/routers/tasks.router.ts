import {
  isManagement,
  MAX_TASK_DETAILS_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  TaskStatus,
  taskStatusSchema,
} from '@curtain-crm/shared';
import { tasks, users } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { idSchema, nonEmptyString, optionalText, reasonSchema } from '../lib/schemas';
import { recordAudit } from '../services/audit.service';
import {
  notifyTaskAssigned,
  notifyTaskCancelled,
  notifyTaskCompleted,
} from '../services/notifications.service';
import { router } from '../trpc';

/**
 * Доп работы (в коде — tasks) — дополнительная работа мимо конвейера заказов.
 *
 * Права доступа:
 *  - `create`, `list`, `cancel` — руководство (CEO, админ): поручения выдаёт
 *    и отменяет тот, кто отвечает за загрузку людей;
 *  - `my` — любой вошедший, ТОЛЬКО свои поручения;
 *  - `complete` — адресат поручения или руководство: отметить чужую работу
 *    выполненной нельзя, руководитель может закрыть за сотрудника.
 *
 * Записи не удаляются: выполненное — история работы, ошибочное отменяется
 * с причиной. Инварианты «выполнено ⇒ есть дата», «отменено ⇒ есть причина»
 * держит БД (check-констрейнты), а не только код.
 */
export const tasksRouter = router({
  /** Выдать поручение сотруднику. */
  create: managementProcedure
    .input(
      z.object({
        assigneeId: idSchema,
        title: nonEmptyString(MAX_TASK_TITLE_LENGTH, 'Опишите поручение'),
        details: optionalText(MAX_TASK_DETAILS_LENGTH),
        dueDate: z.string().date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const assignee = await tx.query.users.findFirst({
          where: eq(users.id, input.assigneeId),
          columns: { id: true, isActive: true, fullName: true },
        });

        if (assignee === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }
        if (!assignee.isActive) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сотрудник уволен — поручение выдать некому',
          });
        }

        const [created] = await tx
          .insert(tasks)
          .values({
            assigneeId: input.assigneeId,
            createdBy: ctx.user.id,
            title: input.title,
            details: input.details ?? null,
            dueDate: input.dueDate ?? null,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Доп. работа не создана' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.created',
          entityType: 'task',
          entityId: created.id,
          details: { assigneeId: input.assigneeId, title: input.title },
          ipAddress: ctx.ipAddress,
        });

        await notifyTaskAssigned(tx, input.assigneeId, {
          title: input.title,
          creatorName: ctx.user.fullName,
          dueDate: input.dueDate ?? null,
        });

        return created;
      }),
    ),

  /**
   * Мои поручения.
   *
   * Открытые — все; закрытые ограничены последними, чтобы список не рос
   * бесконечно: сотруднику нужна рабочая лента, а не архив (архив — у
   * руководства в `list`).
   */
  my: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: tasks.id,
        title: tasks.title,
        details: tasks.details,
        dueDate: tasks.dueDate,
        status: tasks.status,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        creatorName: users.fullName,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.createdBy, users.id))
      .where(eq(tasks.assigneeId, ctx.user.id))
      // Открытые сверху; внутри — ближайший срок первым, поручения без
      // срока в конце (в Postgres `asc` ставит NULL последними по nulls last).
      .orderBy(
        sql`case ${tasks.status} when 'open' then 0 else 1 end`,
        sql`${tasks.dueDate} asc nulls last`,
        desc(tasks.createdAt),
      )
      .limit(50);

    return rows;
  }),

  /** Все поручения — для руководства. */
  list: managementProcedure
    .input(
      z
        .object({
          status: taskStatusSchema.optional(),
          assigneeId: idSchema.optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.status === undefined ? [] : [eq(tasks.status, input.status)]),
        ...(input.assigneeId === undefined ? [] : [eq(tasks.assigneeId, input.assigneeId)]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db.query.tasks.findMany({
          where,
          with: {
            assignee: { columns: { id: true, fullName: true } },
            creator: { columns: { id: true, fullName: true } },
          },
          orderBy: [
            sql`case ${tasks.status} when 'open' then 0 else 1 end`,
            asc(tasks.dueDate),
            desc(tasks.createdAt),
          ],
          limit: 200,
        }),
        ctx.db.select({ value: count() }).from(tasks).where(where),
      ]);

      return { items: rows, total: totalRow?.value ?? 0 };
    }),

  /** Отметить выполнение. Адресат — или руководитель за него. */
  complete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, input.id),
          with: { assignee: { columns: { fullName: true } } },
        });

        if (task === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Доп. работа не найдена' });
        }

        const isOwn = task.assigneeId === ctx.user.id;
        const isBoss = isManagement(ctx.user.roles);
        if (!isOwn && !isBoss) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Доп. работа закреплена за другим сотрудником',
          });
        }

        if (task.status !== TaskStatus.OPEN) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Доп. работа уже закрыта' });
        }

        const [updated] = await tx
          .update(tasks)
          .set({ status: TaskStatus.DONE, completedAt: new Date() })
          .where(eq(tasks.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.completed',
          entityType: 'task',
          entityId: input.id,
          details: { title: task.title },
          ipAddress: ctx.ipAddress,
        });

        // Автор узнаёт о выполнении — кроме случая, когда сам и закрыл.
        if (task.createdBy !== ctx.user.id) {
          await notifyTaskCompleted(tx, task.createdBy, {
            title: task.title,
            assigneeName: task.assignee.fullName,
          });
        }

        return updated;
      }),
    ),

  /** Отменить поручение — только руководство и только с причиной. */
  cancel: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, input.id) });

        if (task === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Доп. работа не найдена' });
        }
        if (task.status !== TaskStatus.OPEN) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Доп. работа уже закрыта' });
        }

        const [updated] = await tx
          .update(tasks)
          .set({ status: TaskStatus.CANCELLED, cancelReason: input.reason })
          .where(eq(tasks.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.cancelled',
          entityType: 'task',
          entityId: input.id,
          details: { title: task.title, reason: input.reason },
          ipAddress: ctx.ipAddress,
        });

        await notifyTaskCancelled(tx, task.assigneeId, {
          title: task.title,
          reason: input.reason,
        });

        return updated;
      }),
    ),
});

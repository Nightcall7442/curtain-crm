import { personalWorks, users, type DbExecutor, type PersonalWork } from '@curtain-crm/db';
import {
  MAX_PERSONAL_WORK_DETAILS_LENGTH,
  MAX_PERSONAL_WORK_TITLE_LENGTH,
  PersonalWorkStatus,
  personalWorkStatusSchema,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, nonEmptyString, optionalText, paginationSchema, reasonSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Личные работы — то, что сотрудник шьёт себе или знакомым в цеху.
 *
 * Права доступа:
 *  - `my`, `create`, `complete`, `cancel` — любой вошедший, но ТОЛЬКО со
 *    своими записями. Личную работу заводит сам человек: руководство её не
 *    выдаёт, поэтому и процедуры создания для руководства нет;
 *  - `list` — руководство: сводка «чем занят цех» по всем сотрудникам.
 *
 * Учёт открытый намеренно. Запретить такие работы нельзя — люди всё равно
 * шьют себе, просто молча, и тогда занятая машинка выглядит как поломка, а
 * израсходованная ткань — как недостача. Записанная работа отвечает на оба
 * вопроса сразу.
 *
 * Инварианты «закрыта ⇒ есть дата закрытия» и «отменена ⇒ есть причина»
 * держит БД check-констрейнтами, а не только этот код.
 */

/**
 * Своя открытая запись — или отказ.
 *
 * Отказ по правам, а не 404: запись существует, просто чужая. Ответ «не
 * найдено» на чужую работу означал бы, что перебором номеров можно выяснить,
 * какие записи вообще есть.
 */
async function loadOwnOpenOrThrow(
  executor: DbExecutor,
  id: number,
  userId: number,
): Promise<PersonalWork> {
  const work = await executor.query.personalWorks.findFirst({
    where: eq(personalWorks.id, id),
  });

  if (work === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Личная работа не найдена' });
  }
  if (work.userId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Это личная работа другого сотрудника' });
  }
  if (work.status !== PersonalWorkStatus.IN_PROGRESS) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Личная работа уже закрыта' });
  }

  return work;
}

export const personalWorksRouter = router({
  /** Свои личные работы, свежие сверху. */
  my: protectedProcedure
    .input(z.object({ status: personalWorkStatusSchema.optional() }).default({}))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select()
        .from(personalWorks)
        .where(
          and(
            eq(personalWorks.userId, ctx.user.id),
            ...(input.status === undefined ? [] : [eq(personalWorks.status, input.status)]),
          ),
        )
        .orderBy(desc(personalWorks.createdAt)),
    ),

  /**
   * Завести личную работу.
   *
   * Исполнитель не спрашивается — им всегда становится тот, кто создаёт
   * запись. Возможность записать личную работу на другого означала бы, что
   * один сотрудник может занять цех от чужого имени.
   */
  create: protectedProcedure
    .input(
      z.object({
        title: nonEmptyString(MAX_PERSONAL_WORK_TITLE_LENGTH, 'Опишите, что шьёте'),
        details: optionalText(MAX_PERSONAL_WORK_DETAILS_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(personalWorks)
        .values({
          userId: ctx.user.id,
          title: input.title,
          details: input.details ?? null,
        })
        .returning();

      if (created === undefined) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Личная работа не создана',
        });
      }

      return created;
    }),

  /** Отметить готовой. */
  complete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const work = await loadOwnOpenOrThrow(ctx.db, input.id, ctx.user.id);

      const [updated] = await ctx.db
        .update(personalWorks)
        .set({
          status: PersonalWorkStatus.DONE,
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(personalWorks.id, work.id))
        .returning();

      return updated ?? work;
    }),

  /** Отменить — с причиной, как заказ. */
  cancel: protectedProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) => {
      const work = await loadOwnOpenOrThrow(ctx.db, input.id, ctx.user.id);

      const [updated] = await ctx.db
        .update(personalWorks)
        .set({
          status: PersonalWorkStatus.CANCELLED,
          cancellationReason: input.reason,
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(personalWorks.id, work.id))
        .returning();

      return updated ?? work;
    }),

  /**
   * Сводка для руководства: кто и что делает для себя.
   *
   * Отдаёт имя сотрудника вместе с записью — иначе панели пришлось бы
   * подтягивать людей вторым запросом и сшивать списки на клиенте.
   */
  list: managementProcedure
    .input(
      paginationSchema
        .extend({
          status: personalWorkStatusSchema.optional(),
          userId: idSchema.optional(),
        })
        .default({ page: 1, pageSize: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.status === undefined ? [] : [eq(personalWorks.status, input.status)]),
        ...(input.userId === undefined ? [] : [eq(personalWorks.userId, input.userId)]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db
          .select({
            id: personalWorks.id,
            userId: personalWorks.userId,
            userFullName: users.fullName,
            title: personalWorks.title,
            details: personalWorks.details,
            status: personalWorks.status,
            cancellationReason: personalWorks.cancellationReason,
            closedAt: personalWorks.closedAt,
            createdAt: personalWorks.createdAt,
          })
          .from(personalWorks)
          .innerJoin(users, eq(users.id, personalWorks.userId))
          .where(where)
          .orderBy(desc(personalWorks.createdAt))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(personalWorks).where(where),
      ]);

      return toPage(rows, totalRow?.value ?? 0, input);
    }),

  /** Сколько личных работ сейчас занимает цех. Для плитки в панели. */
  openCount: managementProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(personalWorks)
      .where(eq(personalWorks.status, PersonalWorkStatus.IN_PROGRESS));

    return row?.value ?? 0;
  }),
});


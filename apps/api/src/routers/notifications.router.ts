import { notifications } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, paginationSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Уведомления сотрудника.
 *
 * Права доступа: все процедуры доступны любому вошедшему сотруднику, но
 * КАЖДАЯ жёстко ограничена его собственными уведомлениями — `user_id`
 * берётся из контекста и никогда из входных данных. Даже директор не читает
 * здесь чужую ленту: для разбора событий есть журнал `audit.list`
 * (`audit.router.ts`, только директор).
 */
export const notificationsRouter = router({
  /** Лента уведомлений, свежие сверху. */
  list: protectedProcedure
    .input(
      paginationSchema
        .extend({ unreadOnly: z.boolean().default(false) })
        .default({ page: 1, pageSize: 20, unreadOnly: false }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.unreadOnly
        ? and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false))
        : eq(notifications.userId, ctx.user.id);

      const [items, [totalRow]] = await Promise.all([
        ctx.db
          .select()
          .from(notifications)
          .where(where)
          .orderBy(desc(notifications.createdAt))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(notifications).where(where),
      ]);

      return toPage(items, totalRow?.value ?? 0, input);
    }),

  /** Счётчик непрочитанных — для бейджа на табе. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)));

    return row?.value ?? 0;
  }),

  /**
   * Отметить уведомление прочитанным.
   *
   * Условие включает `user_id`, поэтому чужое уведомление не найдётся и
   * вернёт `NOT_FOUND` — по коду ответа нельзя понять, существует ли оно.
   */
  markAsRead: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)))
        .returning();

      if (updated === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Уведомление не найдено' });
      }

      return updated;
    }),

  /** Отметить всё прочитанным. */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const updated = await ctx.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return { markedCount: updated.length };
  }),
});

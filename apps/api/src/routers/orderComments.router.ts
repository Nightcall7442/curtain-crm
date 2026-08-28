import { orderComments, orders, users } from '@curtain-crm/db';
import { isManagement } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_VOICE_DURATION_SECONDS,
  getEnv,
} from '../lib/constants';
import { base64FileSchema, idSchema, nonEmptyString } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { notifyOrderCommentAdded } from '../services/notifications.service';
import {
  assertCanAccessOrder,
  collectOrderParticipants,
} from '../services/orderWorkflow.service';
import {
  buildStorageKey,
  decodeBase64Payload,
  getStorage,
} from '../services/storage.service';
import { router } from '../trpc';

/**
 * Комментарии к заказу — текстовые и голосовые.
 *
 * Права доступа: все процедуры доступны участникам заказа и руководству.
 * Ограничения по роли здесь намеренно НЕТ: по требованию заказчика
 * комментарии доступны всем, кто участвует в заказе на любом этапе — швея
 * должна прочитать замечание установщика, а продавец — увидеть их оба.
 *
 * Удалять комментарии может только автор и только руководство: переписка
 * по заказу — часть его истории.
 */

/** Короткая выжимка для тела уведомления. */
const preview = (text: string): string =>
  text.length <= 120 ? text : `${text.slice(0, 117)}...`;

export const orderCommentsRouter = router({
  listByOrder: protectedProcedure
    .input(z.object({ orderId: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      const rows = await ctx.db
        .select({
          id: orderComments.id,
          body: orderComments.body,
          isVoice: orderComments.isVoice,
          voiceStorageKey: orderComments.voiceStorageKey,
          voiceDurationSeconds: orderComments.voiceDurationSeconds,
          userId: orderComments.userId,
          authorName: users.fullName,
          createdAt: orderComments.createdAt,
        })
        .from(orderComments)
        .innerJoin(users, eq(users.id, orderComments.userId))
        .where(eq(orderComments.orderId, input.orderId))
        .orderBy(asc(orderComments.createdAt));

      const storage = getStorage();

      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          voiceUrl:
            row.voiceStorageKey === null ? null : await storage.getUrl(row.voiceStorageKey),
        })),
      );
    }),

  /** Текстовый комментарий. */
  add: protectedProcedure
    .input(z.object({ orderId: idSchema, body: nonEmptyString(4000, 'Введите текст комментария') }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await tx.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
        if (order === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }
        assertCanAccessOrder(order, ctx.user);

        const [created] = await tx
          .insert(orderComments)
          .values({ orderId: order.id, userId: ctx.user.id, body: input.body, isVoice: false })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось сохранить комментарий',
          });
        }

        await notifyOrderCommentAdded(
          tx,
          {
            orderId: order.id,
            orderNumber: order.orderNumber ?? `#${order.id.toString()}`,
            clientName: order.clientName,
          },
          collectOrderParticipants(order).filter((id) => id !== ctx.user.id),
          { authorName: ctx.user.fullName, preview: preview(input.body) },
        );

        return created;
      }),
    ),

  /**
   * Голосовой комментарий.
   *
   * Расшифровка (`body`) необязательна: распознавание речи в этой версии
   * не реализуется, но поле уже есть — добавить его заполнение можно, не меняя
   * ни схему, ни клиентов.
   */
  addVoice: protectedProcedure
    .input(
      z.object({
        orderId: idSchema,
        file: base64FileSchema,
        durationSeconds: z
          .number()
          .int()
          .positive()
          .max(
            MAX_VOICE_DURATION_SECONDS,
            `Голосовое сообщение не длиннее ${MAX_VOICE_DURATION_SECONDS.toString()} секунд`,
          ),
        transcript: z.string().trim().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const env = getEnv();
      const body = decodeBase64Payload(input.file, {
        allowedMimeTypes: ALLOWED_AUDIO_MIME_TYPES,
        maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      });

      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      const storage = getStorage();
      const key = buildStorageKey(
        ['orders', order.id.toString(), 'voice'],
        input.file.mimeType,
      );
      const stored = await storage.upload({ key, body, mimeType: input.file.mimeType });

      try {
        return await ctx.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(orderComments)
            .values({
              orderId: order.id,
              userId: ctx.user.id,
              body: input.transcript ?? null,
              isVoice: true,
              voiceStorageKey: stored.key,
              voiceDurationSeconds: input.durationSeconds,
            })
            .returning();

          if (created === undefined) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось сохранить голосовой комментарий',
            });
          }

          await notifyOrderCommentAdded(
            tx,
            {
              orderId: order.id,
              orderNumber: order.orderNumber ?? `#${order.id.toString()}`,
              clientName: order.clientName,
            },
            collectOrderParticipants(order).filter((id) => id !== ctx.user.id),
            {
              authorName: ctx.user.fullName,
              preview: `голосовое сообщение, ${input.durationSeconds.toString()} с`,
            },
          );

          return { ...created, voiceUrl: await storage.getUrl(stored.key) };
        });
      } catch (error) {
        await storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
    }),

  /** Удаление собственного комментария; руководство может удалить любой. */
  remove: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.query.orderComments.findFirst({
        where: eq(orderComments.id, input.id),
      });

      if (comment === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Комментарий не найден' });
      }

      if (comment.userId !== ctx.user.id && !isManagement(ctx.user.roles)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Удалить комментарий может его автор или руководство',
        });
      }

      await ctx.db.delete(orderComments).where(eq(orderComments.id, input.id));

      if (comment.voiceStorageKey !== null) {
        await getStorage().delete(comment.voiceStorageKey).catch(() => undefined);
      }

      return { success: true } as const;
    }),
});

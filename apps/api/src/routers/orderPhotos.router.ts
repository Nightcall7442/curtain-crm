import { orderPhotos, orders, users, type DbExecutor } from '@curtain-crm/db';
import {
  AUTO_COMPLETE_PHOTO_STAGE,
  autoCompletePathFrom,
  hasAnyRole,
  isManagement,
  PHOTO_STAGE_LABELS_RU,
  PHOTO_STAGE_UPLOADER_ROLES,
  photoStageSchema,
  type PhotoStage,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, idSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import {
  assertCanAccessOrder,
  changeOrderStatus,
  loadOrderForUpdate,
} from '../services/orderWorkflow.service';
import {
  buildStorageKey,
  decodeBase64Payload,
  getStorage,
} from '../services/storage.service';
import { router } from '../trpc';
import type { AuthenticatedUser } from '../types';

/**
 * Фотофиксация этапов заказа.
 *
 * Права доступа:
 *  - `listByOrder` — участники заказа и руководство;
 *  - `upload` — участники заказа, у которых есть роль, допустимая для этой
 *    стадии (`PHOTO_STAGE_UPLOADER_ROLES`): замер снимает мастер, пошив — швея,
 *    установку — установщик. Руководство может закрыть пробел на любой стадии;
 *  - `remove` — тот, кто загрузил, либо руководство.
 *
 * Файлы лежат в хранилище (`storage.service.ts`), в БД — только ключ объекта.
 */
export const orderPhotosRouter = router({
  /** Фотографии заказа со ссылками на файлы. */
  listByOrder: protectedProcedure
    .input(z.object({ orderId: idSchema, stage: photoStageSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      const rows = await ctx.db
        .select({
          id: orderPhotos.id,
          stage: orderPhotos.stage,
          storageKey: orderPhotos.storageKey,
          originalFileName: orderPhotos.originalFileName,
          mimeType: orderPhotos.mimeType,
          sizeBytes: orderPhotos.sizeBytes,
          uploadedBy: orderPhotos.uploadedBy,
          uploadedByName: users.fullName,
          createdAt: orderPhotos.createdAt,
        })
        .from(orderPhotos)
        .innerJoin(users, eq(users.id, orderPhotos.uploadedBy))
        .where(
          and(
            eq(orderPhotos.orderId, input.orderId),
            ...(input.stage === undefined ? [] : [eq(orderPhotos.stage, input.stage)]),
          ),
        )
        .orderBy(asc(orderPhotos.createdAt));

      const storage = getStorage();

      return Promise.all(
        rows.map(async (row) => ({ ...row, url: await storage.getUrl(row.storageKey) })),
      );
    }),

  /**
   * Загрузка фотографии.
   *
   * Загрузка фото стадии «После установки» автоматически закрывает заказ:
   *  - из `installation_in_progress` заказ проходит через `installation_done`
   *    в `completed` — «есть фото после» и означает, что установка завершена;
   *  - из `installation_done` — сразу в `completed`.
   * Подтверждение клиента не требуется (по требованию заказчика).
   * Автопереход выполняется системно и всё так же пишется в историю статусов.
   */
  upload: protectedProcedure
    .input(
      z.object({
        orderId: idSchema,
        stage: photoStageSchema,
        file: base64FileSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const env = getEnv();
      const body = decodeBase64Payload(input.file, {
        allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
        maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      });

      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      const allowedRoles = PHOTO_STAGE_UPLOADER_ROLES[input.stage];
      if (!hasAnyRole(ctx.user.roles, allowedRoles)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Фото стадии «${PHOTO_STAGE_LABELS_RU[input.stage]}» загружает другой исполнитель`,
        });
      }

      const storage = getStorage();
      const key = buildStorageKey(
        ['orders', order.id.toString(), input.stage],
        input.file.mimeType,
      );

      // Файл кладём ДО транзакции: если запись в БД не удастся, останется
      // «осиротевший» объект — это дешевле, чем строка в БД без файла,
      // на которой ломается галерея.
      const stored = await storage.upload({ key, body, mimeType: input.file.mimeType });

      try {
        return await ctx.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(orderPhotos)
            .values({
              orderId: order.id,
              stage: input.stage,
              storageKey: stored.key,
              originalFileName: input.file.fileName ?? null,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              uploadedBy: ctx.user.id,
            })
            .returning();

          if (created === undefined) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось сохранить фото',
            });
          }

          const autoCompleted = await autoCompleteIfInstallFinished(tx, {
            orderId: order.id,
            stage: input.stage,
            actor: ctx.user,
            ipAddress: ctx.ipAddress,
          });

          return {
            ...created,
            url: await storage.getUrl(created.storageKey),
            autoCompleted,
          };
        });
      } catch (error) {
        // Транзакция откатилась — убираем уже загруженный файл, чтобы
        // хранилище не заполнялось мусором от неудачных попыток.
        await storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
    }),

  /** Удаление фотографии: автором загрузки или руководством. */
  remove: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const photo = await ctx.db.query.orderPhotos.findFirst({
        where: eq(orderPhotos.id, input.id),
      });

      if (photo === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Фото не найдено' });
      }

      if (photo.uploadedBy !== ctx.user.id && !isManagement(ctx.user.roles)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Удалить фото может тот, кто его загрузил, или руководство',
        });
      }

      await ctx.db.delete(orderPhotos).where(eq(orderPhotos.id, input.id));
      // Файл удаляем после записи: если удаление файла упадёт, строки в БД
      // уже нет, и галерея не сломается на битой ссылке.
      await getStorage().delete(photo.storageKey).catch(() => undefined);

      return { success: true } as const;
    }),
});

/**
 * Автозакрытие заказа после загрузки фото «После установки».
 *
 * Текущий статус читается ВНУТРИ транзакции через `loadOrderForUpdate`,
 * а не берётся из объекта, прочитанного до неё: между чтением и загрузкой
 * файла статус мог измениться, и решение о переходе принималось бы по
 * устаревшим данным.
 *
 * @returns `true`, если заказ был закрыт этим вызовом.
 */
async function autoCompleteIfInstallFinished(
  executor: DbExecutor,
  params: {
    readonly orderId: number;
    readonly stage: PhotoStage;
    readonly actor: AuthenticatedUser;
    readonly ipAddress: string | null;
  },
): Promise<boolean> {
  if (params.stage !== AUTO_COMPLETE_PHOTO_STAGE) return false;

  const order = await loadOrderForUpdate(executor, params.orderId);

  // Маршрут закрытия задаёт `@curtain-crm/shared`: то же правило читают
  // клиенты, чтобы предупредить о закрытии заказа ДО загрузки фото.
  const path = autoCompletePathFrom(order.status);

  if (path.length === 0) return false;

  for (const status of path) {
    await changeOrderStatus(executor, {
      orderId: params.orderId,
      toStatus: status,
      actor: params.actor,
      comment: 'Загружено фото после установки — заказ закрыт автоматически',
      systemInitiated: true,
      ipAddress: params.ipAddress,
    });
  }

  return true;
}

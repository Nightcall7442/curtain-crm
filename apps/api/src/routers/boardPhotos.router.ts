import { boardPhotos, type Database, type DbExecutor } from '@curtain-crm/db';
import {
  BOARD_PHOTO_KIND_LABELS,
  BOARD_PHOTO_KINDS,
  boardPhotoKindSchema,
  MONITOR_GROUP_ROLES,
  type BoardPhotoKind,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, idSchema } from '../lib/schemas';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { makeAvatarPreview } from '../services/avatarPreview.service';
import { loadBoardPhotos, loadGroupPeople } from '../services/monitor.queries';
import { monitorGroupOf } from '../services/monitor.service';
import { buildStorageKey, decodeBase64Payload, getStorage } from '../services/storage.service';
import { router } from '../trpc';

/**
 * Фото табло по статусам — «Табло → Настройки».
 *
 * Заказчик (переписка 25.10): у каждого человека табло фото «Работает»,
 * «Без заказа», «На перерыве», и табло показывает то, что соответствует
 * статусу. Фото — только для табло: профиль и списки сотрудников их не
 * видят, поэтому и меняются они отсюда, а не из карточки сотрудника.
 *
 * Права — как у обычной аватарки (`users.setAvatar`): руководство.
 */

const BOARD_ROLES = [...MONITOR_GROUP_ROLES.workshop, ...MONITOR_GROUP_ROLES.installation];

/** Человек на табло? Иначе фото повесить некуда — табло его не покажет. */
async function loadBoardPersonOrThrow(executor: Database, userId: number): Promise<{ fullName: string }> {
  const [person] = (await loadGroupPeople(executor, BOARD_ROLES, null)).filter((row) => row.id === userId);
  if (person === undefined || monitorGroupOf(person.roles) === null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Сотрудника нет на табло: фото табло — только у швей, установщиков и карнизчиков',
    });
  }
  return { fullName: person.fullName };
}

async function currentPhoto(
  executor: DbExecutor,
  userId: number,
  kind: BoardPhotoKind,
): Promise<{ storageKey: string; previewKey: string | null } | null> {
  const [row] = await executor
    .select({ storageKey: boardPhotos.storageKey, previewKey: boardPhotos.previewKey })
    .from(boardPhotos)
    .where(and(eq(boardPhotos.userId, userId), eq(boardPhotos.kind, kind)))
    .limit(1);
  return row ?? null;
}

export const boardPhotosRouter = router({
  /**
   * Люди табло с аватаркой и тремя фото по статусам — для страницы настроек.
   * Ссылки — на превью: страница показывает миниатюры, а не мегабайтные оригиналы.
   */
  list: managementProcedure.query(async ({ ctx }) => {
    const people = await loadGroupPeople(ctx.db, BOARD_ROLES, null);
    const photos = await loadBoardPhotos(
      ctx.db,
      people.map((person) => person.id),
    );
    const storage = getStorage();
    const urlOf = async (key: string | null): Promise<string | null> =>
      key === null ? null : storage.getUrl(key, { stableWithinHour: true });

    return {
      people: await Promise.all(
        people.flatMap((person) => {
          const group = monitorGroupOf(person.roles);
          if (group === null) return [];
          const own = photos.get(person.id);
          return [
            (async () => ({
              userId: person.id,
              fullName: person.fullName,
              group,
              roles: person.roles,
              avatarUrl: await urlOf(person.avatarPreviewKey ?? person.avatarStorageKey),
              photos: Object.fromEntries(
                await Promise.all(
                  BOARD_PHOTO_KINDS.map(async (kind) => {
                    const photo = own?.[kind];
                    return [kind, photo === undefined ? null : await urlOf(photo.previewKey ?? photo.storageKey)] as const;
                  }),
                ),
              ) as Record<BoardPhotoKind, string | null>,
            }))(),
          ];
        }),
      ),
    };
  }),

  /**
   * Загрузить или заменить фото одного статуса.
   *
   * Как у аватарки: оригинал и превью webp; прежние файлы удаляются после
   * записи — иначе хранилище прирастало бы снимком при каждой замене.
   */
  set: managementProcedure
    .input(z.object({ userId: idSchema, kind: boardPhotoKindSchema, file: base64FileSchema }))
    .mutation(async ({ ctx, input }) => {
      // Проверка ДО загрузки: файл человека не с табло осел бы в хранилище.
      const person = await loadBoardPersonOrThrow(ctx.db, input.userId);

      const env = getEnv();
      const body = decodeBase64Payload(input.file, {
        allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
        maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      });
      const before = await currentPhoto(ctx.db, input.userId, input.kind);

      const storage = getStorage();
      const keyParts = ['board-photos', input.userId.toString(), input.kind];
      const stored = await storage.upload({
        key: buildStorageKey(keyParts, input.file.mimeType),
        body,
        mimeType: input.file.mimeType,
      });
      // Не вышло прочитать картинку — сохраняем без превью: панель возьмёт
      // оригинал, а ТВ (только превью) — аватарку.
      const previewBody = await makeAvatarPreview(body);
      const preview =
        previewBody === null
          ? null
          : await storage
              .upload({ key: buildStorageKey([...keyParts, 'preview'], 'image/webp'), body: previewBody, mimeType: 'image/webp' })
              .catch(async (error: unknown) => {
                await storage.delete(stored.key).catch(() => undefined);
                throw error;
              });

      try {
        await ctx.db
          .insert(boardPhotos)
          .values({
            userId: input.userId,
            kind: input.kind,
            storageKey: stored.key,
            previewKey: preview?.key ?? null,
            uploadedBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: [boardPhotos.userId, boardPhotos.kind],
            set: {
              storageKey: stored.key,
              previewKey: preview?.key ?? null,
              uploadedBy: ctx.user.id,
              updatedAt: new Date(),
            },
          });
      } catch (error) {
        // Ссылку в БД поставить не удалось — убираем загруженное, иначе файлы
        // останутся в хранилище навсегда и ничем не будут видны.
        await storage.delete(stored.key).catch(() => undefined);
        if (preview !== null) await storage.delete(preview.key).catch(() => undefined);
        throw error;
      }

      for (const key of [before?.storageKey ?? null, before?.previewKey ?? null]) {
        if (key !== null && key !== stored.key && key !== preview?.key) {
          await storage.delete(key).catch(() => undefined);
        }
      }

      await recordAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'board_photo.set',
        entityType: 'user',
        entityId: input.userId,
        details: { fullName: person.fullName, kind: input.kind, label: BOARD_PHOTO_KIND_LABELS.ru[input.kind] },
        ipAddress: ctx.ipAddress,
      });

      return { ok: true as const };
    }),

  /** Убрать фото статуса: табло снова покажет аватарку. */
  remove: managementProcedure
    .input(z.object({ userId: idSchema, kind: boardPhotoKindSchema }))
    .mutation(async ({ ctx, input }) => {
      const before = await currentPhoto(ctx.db, input.userId, input.kind);
      if (before === null) return { ok: true as const };

      await ctx.db
        .delete(boardPhotos)
        .where(and(eq(boardPhotos.userId, input.userId), eq(boardPhotos.kind, input.kind)));

      const storage = getStorage();
      for (const key of [before.storageKey, before.previewKey]) {
        if (key !== null) await storage.delete(key).catch(() => undefined);
      }

      await recordAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'board_photo.removed',
        entityType: 'user',
        entityId: input.userId,
        details: { kind: input.kind, label: BOARD_PHOTO_KIND_LABELS.ru[input.kind] },
        ipAddress: ctx.ipAddress,
      });

      return { ok: true as const };
    }),
});

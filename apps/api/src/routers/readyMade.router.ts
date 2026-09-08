import { branches, readyMadeItems, type DbExecutor } from '@curtain-crm/db';
import { isManagement, moneyToDecimalString, parseMoney } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, gt, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';

import { base64FileSchema, idSchema, moneySchema, nonEmptyString, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { orderIntakeProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { buildStorageKey, decodeBase64Payload, getStorage } from '../services/storage.service';
import { router } from '../trpc';

/**
 * Склад готовых штор.
 *
 * Готовые шторы шьют заранее, без заказа: клиент приходит, называет модель и
 * забирает то, что есть. До сих пор продажа готовых штор знала только модель
 * из справочника — сколько таких штор лежит и какого они размера, продавец
 * держал в голове и уточнял голосом у цеха.
 *
 * Заводит и правит записи приёмка (продавец, админ, директор) — это тот же
 * круг людей, что и продаёт: шторы приносят из цеха в торговый зал, и
 * ждать, пока их оприходует руководство, значит не продать их сегодня.
 * Читает список любой вошедший.
 */

const dimensionSchema = z.number().positive().max(2000);

/** Ссылка на снимок. Строится на лету: ключ в хранилище живёт дольше ссылки. */
async function withPhotoUrl<T extends { photoKey: string | null }>(
  rows: readonly T[],
): Promise<(T & { photoUrl: string | null })[]> {
  const storage = getStorage();

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      photoUrl: row.photoKey === null ? null : await storage.getUrl(row.photoKey),
    })),
  );
}

/** Филиал, в котором сотрудник вправе распоряжаться складом. */
function assertBranchAllowed(
  user: { roles: readonly string[]; branchIds: readonly number[] },
  branchId: number,
): void {
  if (isManagement(user.roles as never)) return;
  if (user.branchIds.includes(branchId)) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Нельзя вести склад филиала, к которому вы не привязаны',
  });
}

async function loadItem(executor: DbExecutor, id: number) {
  const [item] = await executor
    .select()
    .from(readyMadeItems)
    .where(eq(readyMadeItems.id, id))
    .limit(1);

  if (item === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Готовая штора не найдена' });
  }

  return item;
}

export const readyMadeRouter = router({
  /**
   * Что есть в наличии.
   *
   * `model` — подстрокой, а не точным совпадением: продавец набирает «рим» и
   * должен увидеть «Римские». Пустые остатки по умолчанию скрыты — на
   * вопрос «что есть» ноль штук не отвечает.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          model: optionalText(200),
          search: optionalText(200),
          branchId: idSchema.optional(),
          includeEmpty: z.boolean().default(false),
          includeInactive: z.boolean().default(false),
        })
        .default({ includeEmpty: false, includeInactive: false }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: readyMadeItems.id,
          branchId: readyMadeItems.branchId,
          branchName: branches.name,
          model: readyMadeItems.model,
          code: readyMadeItems.code,
          color: readyMadeItems.color,
          widthCm: readyMadeItems.widthCm,
          heightCm: readyMadeItems.heightCm,
          price: readyMadeItems.price,
          quantity: readyMadeItems.quantity,
          photoKey: readyMadeItems.photoKey,
          comment: readyMadeItems.comment,
          isActive: readyMadeItems.isActive,
        })
        .from(readyMadeItems)
        .innerJoin(branches, eq(branches.id, readyMadeItems.branchId))
        .where(
          and(
            ...(input.includeInactive ? [] : [eq(readyMadeItems.isActive, true)]),
            ...(input.includeEmpty ? [] : [gt(readyMadeItems.quantity, 0)]),
            ...(input.branchId === undefined ? [] : [eq(readyMadeItems.branchId, input.branchId)]),
            ...(input.model === undefined
              ? []
              : [ilike(readyMadeItems.model, `%${input.model}%`)]),
            ...(input.search === undefined
              ? []
              : [
                  sql`(${readyMadeItems.model} ilike ${`%${input.search}%`}
                       or ${readyMadeItems.code} ilike ${`%${input.search}%`}
                       or ${readyMadeItems.color} ilike ${`%${input.search}%`})`,
                ]),
          ),
        )
        .orderBy(asc(readyMadeItems.model), asc(readyMadeItems.widthCm))
        .limit(200);

      return withPhotoUrl(rows);
    }),

  /** Поставить готовую штору на склад. */
  create: orderIntakeProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        model: nonEmptyString(200, 'Укажите модель'),
        code: optionalText(100),
        color: optionalText(100),
        widthCm: dimensionSchema,
        heightCm: dimensionSchema,
        price: moneySchema,
        quantity: z.number().int().min(0).max(10000).default(1),
        comment: optionalText(500),
        photo: base64FileSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchId = input.branchId ?? ctx.user.primaryBranchId;
      if (branchId === null || branchId === undefined) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Укажите филиал: у вас не задан основной филиал',
        });
      }
      assertBranchAllowed(ctx.user, branchId);

      // Файл кладём до транзакции — как у фото заказа: осиротевший объект
      // в хранилище дешевле, чем строка в базе со ссылкой в никуда.
      const stored =
        input.photo === undefined
          ? null
          : await getStorage().upload({
              key: buildStorageKey(['ready-made', branchId.toString()], input.photo.mimeType),
              body: decodeBase64Payload(input.photo, {
                allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
                maxBytes: getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024,
              }),
              mimeType: input.photo.mimeType,
            });

      try {
        return await ctx.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(readyMadeItems)
            .values({
              branchId,
              model: input.model,
              code: input.code ?? null,
              color: input.color ?? null,
              widthCm: input.widthCm.toFixed(1),
              heightCm: input.heightCm.toFixed(1),
              price: moneyToDecimalString(parseMoney(input.price)),
              quantity: input.quantity,
              photoKey: stored?.key ?? null,
              comment: input.comment ?? null,
              createdBy: ctx.user.id,
            })
            .returning();

          if (created === undefined) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось сохранить готовую штору',
            });
          }

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: 'ready_made_item.created',
            entityType: 'ready_made_item',
            entityId: created.id,
            details: { model: created.model, quantity: created.quantity, price: created.price },
            ipAddress: ctx.ipAddress,
          });

          return created;
        });
      } catch (error) {
        if (stored !== null) await getStorage().delete(stored.key).catch(() => undefined);
        throw error;
      }
    }),

  /**
   * Изменение остатка: приход из цеха или списание.
   *
   * Числом «сколько стало», а не «сколько прибавить»: продавец пересчитывает
   * стопку и вводит то, что видит. Прибавление требовало бы от него
   * вычитания в уме, а ошибка в нём тихо разошлась бы с полкой.
   */
  setQuantity: orderIntakeProcedure
    .input(
      z.object({
        id: idSchema,
        quantity: z.number().int().min(0).max(10000),
        comment: optionalText(300),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const item = await loadItem(tx, input.id);
        assertBranchAllowed(ctx.user, item.branchId);

        const [updated] = await tx
          .update(readyMadeItems)
          .set({ quantity: input.quantity, updatedAt: new Date() })
          .where(eq(readyMadeItems.id, item.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Готовая штора не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'ready_made_item.stock_changed',
          entityType: 'ready_made_item',
          entityId: item.id,
          details: {
            model: item.model,
            from: item.quantity,
            to: updated.quantity,
            comment: input.comment ?? null,
          },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  /** Снять с витрины или вернуть на неё. */
  setActive: orderIntakeProcedure
    .input(z.object({ id: idSchema, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const item = await loadItem(tx, input.id);
        assertBranchAllowed(ctx.user, item.branchId);

        const [updated] = await tx
          .update(readyMadeItems)
          .set({ isActive: input.isActive, updatedAt: new Date() })
          .where(eq(readyMadeItems.id, item.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Готовая штора не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: input.isActive ? 'ready_made_item.activated' : 'ready_made_item.deactivated',
          entityType: 'ready_made_item',
          entityId: item.id,
          details: { model: item.model },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

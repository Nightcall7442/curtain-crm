import { catalogItems } from '@curtain-crm/db';
import { CATALOG_KINDS } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, nonEmptyString } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { router } from '../trpc';

/**
 * Справочники характеристик заказа: модели штор, материалы, цвета, карнизы,
 * тюль, сачак, аксессуары.
 *
 * Права доступа:
 *  - `list` — любой вошедший сотрудник: справочники нужны форме создания заказа;
 *  - `create`, `update`, `setActive` — руководство (CEO, админ).
 *
 * В `curtain-bot` эти списки задавались переменными окружения и требовали
 * перезапуска для правки. Позиции не удаляются, а деактивируются: заказы
 * хранят выбранное значение текстом, но пропавшая из справочника позиция
 * сбивала бы аналитику.
 */

const kindSchema = z.enum(CATALOG_KINDS);

export const catalogRouter = router({
  /** Позиции справочника. Неактивные показываются только по явному запросу. */
  list: protectedProcedure
    .input(
      z
        .object({
          kind: kindSchema.optional(),
          includeInactive: z.boolean().default(false),
        })
        .default({ includeInactive: false }),
    )
    .query(async ({ ctx, input }) =>
      ctx.db
        .select({
          id: catalogItems.id,
          kind: catalogItems.kind,
          name: catalogItems.name,
          sortOrder: catalogItems.sortOrder,
          isActive: catalogItems.isActive,
        })
        .from(catalogItems)
        .where(
          and(
            ...(input.kind === undefined ? [] : [eq(catalogItems.kind, input.kind)]),
            ...(input.includeInactive ? [] : [eq(catalogItems.isActive, true)]),
          ),
        )
        .orderBy(asc(catalogItems.kind), asc(catalogItems.sortOrder), asc(catalogItems.name)),
    ),

  create: managementProcedure
    .input(
      z.object({
        kind: kindSchema,
        name: nonEmptyString(200, 'Укажите название'),
        sortOrder: z.number().int().min(0).max(9999).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(catalogItems)
          .values({
            kind: input.kind,
            name: input.name,
            sortOrder: input.sortOrder,
            createdBy: ctx.user.id,
          })
          .onConflictDoNothing()
          .returning();

        // Уникальный индекс по (kind, lower(name)) не даст завести дубль.
        if (created === undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Позиция «${input.name}» уже есть в этом справочнике`,
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'catalog.item_created',
          entityType: 'catalog_item',
          entityId: created.id,
          details: { kind: created.kind, name: created.name },
          ipAddress: ctx.ipAddress,
        });

        return created;
      }),
    ),

  update: managementProcedure
    .input(
      z.object({
        id: idSchema,
        name: nonEmptyString(200).optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const patch = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        };

        const [updated] = await tx
          .update(catalogItems)
          .set(patch)
          .where(eq(catalogItems.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция справочника не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'catalog.item_updated',
          entityType: 'catalog_item',
          entityId: updated.id,
          details: patch,
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  /** Вывод позиции из обращения. Физического удаления нет намеренно. */
  setActive: managementProcedure
    .input(z.object({ id: idSchema, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(catalogItems)
          .set({ isActive: input.isActive })
          .where(eq(catalogItems.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция справочника не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: input.isActive ? 'catalog.item_updated' : 'catalog.item_deactivated',
          entityType: 'catalog_item',
          entityId: updated.id,
          details: { isActive: input.isActive },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

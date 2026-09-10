import { catalogItems } from '@curtain-crm/db';
import { CATALOG_KINDS, CURTAIN_MOUNT_KINDS } from '@curtain-crm/shared';
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

/**
 * Пояснение к значению и группа крепления модели.
 *
 * Описание нужно справочникам кодов: продавец вводит код с этикетки и должен
 * увидеть, что это за ткань. Группа крепления — только моделям штор: от неё
 * зависит, спросит ли форма заказа трубу или пластик с карнизом.
 *
 * Ни то, ни другое не привязано к виду справочника проверкой: лишнее поле у
 * цвета ничего не ломает, а отказ на ровном месте — ломает работу.
 */
const descriptionSchema = z.string().trim().max(300).nullable();
const mountKindSchema = z.enum(CURTAIN_MOUNT_KINDS).nullable();

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
          description: catalogItems.description,
          mountKind: catalogItems.mountKind,
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
        description: descriptionSchema.default(null),
        mountKind: mountKindSchema.default(null),
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
            description: input.description === '' ? null : input.description,
            mountKind: input.mountKind,
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
        description: descriptionSchema.optional(),
        mountKind: mountKindSchema.optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const patch = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description === '' ? null : input.description }),
          ...(input.mountKind === undefined ? {} : { mountKind: input.mountKind }),
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

  /**
   * Загрузка кодов списком — тем самым, который выгрузили в Excel.
   *
   * Коды приезжают от поставщика таблицей, и заводить их по одному через
   * форму — работа на вечер. Уже известный код не задваивается: у него
   * дополняется описание, если в файле оно есть, а название остаётся своим —
   * файл может отличаться регистром, а заказы ссылаются на код текстом.
   */
  importItems: managementProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              kind: kindSchema,
              name: nonEmptyString(200, 'Укажите код'),
              description: descriptionSchema.default(null),
            }),
          )
          .min(1)
          .max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const existing = await tx
          .select({
            id: catalogItems.id,
            kind: catalogItems.kind,
            name: catalogItems.name,
            description: catalogItems.description,
          })
          .from(catalogItems);

        const keyOf = (kind: string, name: string): string => `${kind} ${name.toLowerCase()}`;
        const known = new Map(existing.map((row) => [keyOf(row.kind, row.name), row]));

        const fresh: { kind: (typeof input.items)[number]['kind']; name: string; description: string | null; createdBy: number }[] = [];
        const seen = new Set<string>();
        let updated = 0;

        for (const item of input.items) {
          const name = item.name.trim();
          const description = item.description === null || item.description === '' ? null : item.description;
          const key = keyOf(item.kind, name);

          const found = known.get(key);
          if (found === undefined) {
            // Дубли внутри самого файла — обычное дело: код встречается в
            // нескольких строках накладной.
            if (seen.has(key)) continue;
            seen.add(key);
            fresh.push({ kind: item.kind, name, description, createdBy: ctx.user.id });
            continue;
          }

          // Пустое описание в файле не стирает заведённое руками.
          if (description === null || description === found.description) continue;

          await tx
            .update(catalogItems)
            .set({ description })
            .where(eq(catalogItems.id, found.id));
          updated += 1;
        }

        if (fresh.length > 0) {
          await tx.insert(catalogItems).values(fresh);
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'catalog.items_imported',
          entityType: 'catalog_item',
          entityId: null,
          details: { created: fresh.length, updated, received: input.items.length },
          ipAddress: ctx.ipAddress,
        });

        return { created: fresh.length, updated, received: input.items.length };
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

import { branches } from '@curtain-crm/db';
import {
  DEFAULT_CHECK_IN_RADIUS_METERS,
  MAX_CHECK_IN_RADIUS_METERS,
  MIN_CHECK_IN_RADIUS_METERS,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, nonEmptyString, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { diffFields, recordAudit } from '../services/audit.service';
import { router } from '../trpc';

/**
 * Филиалы (цеха).
 *
 * Права доступа:
 *  - `list`, `byId` — любой вошедший сотрудник: мобильному приложению нужны
 *    координаты и радиус, чтобы объяснить отказ в чек-ине;
 *  - `create`, `update`, `setActive` — только руководство (CEO, админ).
 *
 * Филиалы не удаляются: `setActive(false)` выводит филиал из обращения,
 * сохраняя все смены и заказы, которые на него ссылаются.
 */

const radiusSchema = z
  .number()
  .int()
  .min(
    MIN_CHECK_IN_RADIUS_METERS,
    `Радиус не может быть меньше ${MIN_CHECK_IN_RADIUS_METERS.toString()} м`,
  )
  .max(
    MAX_CHECK_IN_RADIUS_METERS,
    `Радиус не может быть больше ${MAX_CHECK_IN_RADIUS_METERS.toString()} м`,
  );

export const branchesRouter = router({
  /** Список филиалов. Неактивные показываются только по явному запросу. */
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(branches)
        .orderBy(asc(branches.name));

      return input.includeInactive ? rows : rows.filter((branch) => branch.isActive);
    }),

  byId: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const branch = await ctx.db.query.branches.findFirst({
        where: eq(branches.id, input.id),
      });

      if (branch === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Филиал не найден' });
      }

      return branch;
    }),

  create: managementProcedure
    .input(
      z.object({
        name: nonEmptyString(200, 'Укажите название филиала'),
        address: optionalText(500),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: radiusSchema.default(DEFAULT_CHECK_IN_RADIUS_METERS),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(branches)
          .values({
            name: input.name,
            address: input.address ?? null,
            latitude: input.latitude,
            longitude: input.longitude,
            radiusMeters: input.radiusMeters,
          })
          .onConflictDoNothing()
          .returning();

        // `onConflictDoNothing` вернёт пустой массив, если название занято:
        // уникальный индекс по `lower(name)` не даст завести «Цех №1» дважды.
        if (created === undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Филиал с названием «${input.name}» уже существует`,
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'branch.created',
          entityType: 'branch',
          entityId: created.id,
          details: { name: created.name, radiusMeters: created.radiusMeters },
          ipAddress: ctx.ipAddress,
        });

        return created;
      }),
    ),

  /** Правка филиала, включая радиус чек-ина. */
  update: managementProcedure
    .input(
      z.object({
        id: idSchema,
        name: nonEmptyString(200).optional(),
        address: optionalText(500),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        radiusMeters: radiusSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const existing = await tx.query.branches.findFirst({ where: eq(branches.id, input.id) });
        if (existing === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Филиал не найден' });
        }

        const patch = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
          ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
          ...(input.radiusMeters === undefined ? {} : { radiusMeters: input.radiusMeters }),
        };

        if (Object.keys(patch).length === 0) return existing;

        const [updated] = await tx
          .update(branches)
          .set(patch)
          .where(eq(branches.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Филиал не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'branch.updated',
          entityType: 'branch',
          entityId: updated.id,
          details: diffFields(existing, patch),
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  /** Ввод филиала в обращение или вывод из него. Удаления нет намеренно. */
  setActive: managementProcedure
    .input(z.object({ id: idSchema, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(branches)
          .set({ isActive: input.isActive })
          .where(eq(branches.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Филиал не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'branch.updated',
          entityType: 'branch',
          entityId: updated.id,
          details: { isActive: input.isActive },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

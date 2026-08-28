import { branches, shifts, users } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  geoPointSchema,
  idSchema,
  paginationSchema,
  periodSchema,
  reasonSchema,
} from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  measureDistanceToBranch,
  resolveCheckInBranch,
} from '../services/geolocation.service';
import { notifyShiftAdjusted } from '../services/notifications.service';
import { calculateWorkedHours, periodBounds, sqlTimestamp } from '../services/shifts.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Смены сотрудников.
 *
 * Права доступа:
 *  - `current`, `checkIn`, `checkOut`, `my`, `mySummary` — любой вошедший
 *    сотрудник, всегда только со своей сменой (`user_id` берётся из контекста);
 *  - `list`, `summary`, `adjustManually`, `remove` — руководство (CEO, админ).
 *
 * Смена — один непрерывный блок без учёта перерывов. Открытая смена может быть
 * только одна: это гарантирует частичный уникальный индекс
 * `shifts_single_open_per_user`, а не проверка в коде.
 */

/** Открытая смена сотрудника. */
const findOpenShift = (userId: number) =>
  and(eq(shifts.userId, userId), isNull(shifts.endedAt));

export const shiftsRouter = router({
  /** Текущая открытая смена или `null`. Экран чек-ина спрашивает это при старте. */
  current: protectedProcedure.query(async ({ ctx }) => {
    const [shift] = await ctx.db
      .select({
        id: shifts.id,
        branchId: shifts.branchId,
        branchName: branches.name,
        startedAt: shifts.startedAt,
        startDistanceMeters: shifts.startDistanceMeters,
      })
      .from(shifts)
      .innerJoin(branches, eq(branches.id, shifts.branchId))
      .where(findOpenShift(ctx.user.id))
      .limit(1);

    return shift ?? null;
  }),

  /**
   * Открытие смены по геолокации.
   *
   * Филиал определяется автоматически: берётся ближайший из филиалов
   * сотрудника, в чей радиус он попал. Вне радиуса — `FORBIDDEN` с указанием
   * фактического расстояния.
   */
  checkIn: protectedProcedure
    .input(geoPointSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [openShift] = await tx
          .select({ id: shifts.id, startedAt: shifts.startedAt })
          .from(shifts)
          .where(findOpenShift(ctx.user.id))
          .limit(1);

        if (openShift !== undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Смена уже открыта. Сначала завершите текущую смену',
          });
        }

        const matched = await resolveCheckInBranch(tx, ctx.user.id, input);

        const [created] = await tx
          .insert(shifts)
          .values({
            userId: ctx.user.id,
            branchId: matched.branchId,
            startedAt: new Date(),
            startLatitude: input.latitude,
            startLongitude: input.longitude,
            startDistanceMeters: matched.distanceMeters,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось открыть смену',
          });
        }

        return { ...created, branchName: matched.branchName };
      }),
    ),

  /**
   * Закрытие смены.
   *
   * Расстояние до филиала сохраняется, но НЕ блокирует действие: сотрудник мог
   * уехать на объект, а незакрытая смена ломает расчёт часов сильнее, чем
   * неточная геометка.
   */
  checkOut: protectedProcedure
    .input(geoPointSchema.partial().optional())
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [openShift] = await tx
          .select()
          .from(shifts)
          .where(findOpenShift(ctx.user.id))
          .for('update')
          .limit(1);

        if (openShift === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Открытая смена не найдена' });
        }

        const position =
          input?.latitude === undefined || input.longitude === undefined
            ? null
            : { latitude: input.latitude, longitude: input.longitude };

        const distance = await measureDistanceToBranch(tx, openShift.branchId, position);

        const [updated] = await tx
          .update(shifts)
          .set({
            endedAt: new Date(),
            endLatitude: position?.latitude ?? null,
            endLongitude: position?.longitude ?? null,
            endDistanceMeters: distance,
          })
          .where(eq(shifts.id, openShift.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось закрыть смену',
          });
        }

        return updated;
      }),
    ),

  /** История собственных смен. */
  my: protectedProcedure
    .input(
      paginationSchema
        .extend({ from: z.date().optional(), to: z.date().optional() })
        .default({ page: 1, pageSize: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(shifts.userId, ctx.user.id),
        ...(input.from === undefined ? [] : [gte(shifts.startedAt, input.from)]),
        ...(input.to === undefined ? [] : [lt(shifts.startedAt, input.to)]),
      );

      const [items, [totalRow]] = await Promise.all([
        ctx.db
          .select({
            id: shifts.id,
            branchId: shifts.branchId,
            branchName: branches.name,
            startedAt: shifts.startedAt,
            endedAt: shifts.endedAt,
            isManuallyAdjusted: shifts.isManuallyAdjusted,
            adjustmentReason: shifts.adjustmentReason,
          })
          .from(shifts)
          .innerJoin(branches, eq(branches.id, shifts.branchId))
          .where(where)
          .orderBy(desc(shifts.startedAt))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(shifts).where(where),
      ]);

      return toPage(items, totalRow?.value ?? 0, input);
    }),

  /** Отработанные часы сотрудника за месяц. */
  mySummary: protectedProcedure
    .input(periodSchema)
    .query(async ({ ctx, input }) => ({
      period: input,
      workedHours: await calculateWorkedHours(ctx.db, ctx.user.id, periodBounds(input)),
    })),

  /** Табель: смены всех сотрудников с фильтрами. */
  list: managementProcedure
    .input(
      paginationSchema
        .extend({
          userId: idSchema.optional(),
          branchId: idSchema.optional(),
          from: z.date().optional(),
          to: z.date().optional(),
          openOnly: z.boolean().default(false),
        })
        .default({ page: 1, pageSize: 20, openOnly: false }),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.userId === undefined ? [] : [eq(shifts.userId, input.userId)]),
        ...(input.branchId === undefined ? [] : [eq(shifts.branchId, input.branchId)]),
        ...(input.from === undefined ? [] : [gte(shifts.startedAt, input.from)]),
        ...(input.to === undefined ? [] : [lt(shifts.startedAt, input.to)]),
        ...(input.openOnly ? [isNull(shifts.endedAt)] : []),
      );

      const [items, [totalRow]] = await Promise.all([
        ctx.db
          .select({
            id: shifts.id,
            userId: shifts.userId,
            userFullName: users.fullName,
            branchId: shifts.branchId,
            branchName: branches.name,
            startedAt: shifts.startedAt,
            endedAt: shifts.endedAt,
            startDistanceMeters: shifts.startDistanceMeters,
            isManuallyAdjusted: shifts.isManuallyAdjusted,
            adjustmentReason: shifts.adjustmentReason,
          })
          .from(shifts)
          .innerJoin(users, eq(users.id, shifts.userId))
          .innerJoin(branches, eq(branches.id, shifts.branchId))
          .where(where)
          .orderBy(desc(shifts.startedAt))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(shifts).where(where),
      ]);

      return toPage(items, totalRow?.value ?? 0, input);
    }),

  /**
   * Ручная корректировка смены задним числом.
   *
   * Без `shiftId` создаёт смену (сотрудник забыл отметиться), с `shiftId` —
   * правит существующую. В обоих случаях смена помечается как
   * скорректированная, причина сохраняется в самой смене и в `audit_log`,
   * а сотрудник получает уведомление: изменение его рабочего времени не должно
   * происходить незаметно для него.
   */
  adjustManually: managementProcedure
    .input(
      z
        .object({
          shiftId: idSchema.optional(),
          userId: idSchema,
          branchId: idSchema,
          startedAt: z.date(),
          endedAt: z.date().nullable(),
          reason: reasonSchema,
        })
        .refine(
          (value) => value.endedAt === null || value.endedAt > value.startedAt,
          { message: 'Время окончания должно быть позже начала', path: ['endedAt'] },
        )
        .refine((value) => value.startedAt.getTime() <= Date.now(), {
          message: 'Нельзя завести смену будущим числом',
          path: ['startedAt'],
        }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const adjustment = {
          isManuallyAdjusted: true,
          adjustedBy: ctx.user.id,
          adjustedAt: new Date(),
          adjustmentReason: input.reason,
        };

        const before =
          input.shiftId === undefined
            ? null
            : ((await tx.query.shifts.findFirst({ where: eq(shifts.id, input.shiftId) })) ?? null);

        if (input.shiftId !== undefined && before === null) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Смена не найдена' });
        }

        const [saved] =
          before === null
            ? await tx
                .insert(shifts)
                .values({
                  userId: input.userId,
                  branchId: input.branchId,
                  startedAt: input.startedAt,
                  endedAt: input.endedAt,
                  ...adjustment,
                })
                .returning()
            : await tx
                .update(shifts)
                .set({
                  userId: input.userId,
                  branchId: input.branchId,
                  startedAt: input.startedAt,
                  endedAt: input.endedAt,
                  ...adjustment,
                })
                .where(eq(shifts.id, before.id))
                .returning();

        if (saved === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось сохранить смену',
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'shift.adjusted',
          entityType: 'shift',
          entityId: saved.id,
          details: {
            created: before === null,
            reason: input.reason,
            before:
              before === null
                ? null
                : { startedAt: before.startedAt, endedAt: before.endedAt, userId: before.userId },
            after: { startedAt: saved.startedAt, endedAt: saved.endedAt, userId: saved.userId },
          },
          ipAddress: ctx.ipAddress,
        });

        await notifyShiftAdjusted(tx, input.userId, {
          actorName: ctx.user.fullName,
          reason: input.reason,
          shiftDate: input.startedAt.toISOString().slice(0, 10),
        });

        return saved;
      }),
    ),

  /**
   * Удаление ошибочно заведённой смены.
   *
   * Единственный сценарий физического удаления в системе: дубль, созданный
   * по ошибке, невозможно «закрыть» — он исказит расчёт часов. Причина
   * и снимок удалённой смены остаются в `audit_log`.
   */
  remove: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(shifts)
          .where(eq(shifts.id, input.id))
          .returning();

        if (deleted === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Смена не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'shift.deleted',
          entityType: 'shift',
          entityId: deleted.id,
          details: {
            reason: input.reason,
            userId: deleted.userId,
            startedAt: deleted.startedAt,
            endedAt: deleted.endedAt,
          },
          ipAddress: ctx.ipAddress,
        });

        return { success: true } as const;
      }),
    ),

  /** Сводка отработанных часов по сотрудникам за месяц. Для раздела «Табель». */
  summary: managementProcedure
    .input(periodSchema.extend({ branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);

      return ctx.db
        .select({
          userId: shifts.userId,
          userFullName: users.fullName,
          shiftsCount: count(),
          workedHours: sql<string>`round(coalesce(sum(
            extract(epoch from (
              least(${shifts.endedAt}, ${sqlTimestamp(bounds.end)}::timestamptz)
              - greatest(${shifts.startedAt}, ${sqlTimestamp(bounds.start)}::timestamptz)
            ))
          ), 0) / 3600, 2)`,
        })
        .from(shifts)
        .innerJoin(users, eq(users.id, shifts.userId))
        .where(
          and(
            lt(shifts.startedAt, bounds.end),
            gte(shifts.endedAt, bounds.start),
            ...(input.branchId === undefined ? [] : [eq(shifts.branchId, input.branchId)]),
          ),
        )
        .groupBy(shifts.userId, users.fullName)
        .orderBy(users.fullName);
    }),
});

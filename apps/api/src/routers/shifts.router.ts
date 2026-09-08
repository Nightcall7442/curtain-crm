import { branches, installationTrips, orders, personalBreaks, shifts, users } from '@curtain-crm/db';
import { MAX_PERSONAL_BREAK_MINUTES } from '@curtain-crm/shared';
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
import { calculateWorkedHours, periodBounds, workedSecondsExpression } from '../services/shifts.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Смены сотрудников.
 *
 * Права доступа:
 *  - `current`, `checkIn`, `checkOut`, `my`, `mySummary` — любой вошедший
 *    сотрудник, всегда только со своей сменой (`user_id` берётся из контекста);
 *  - `startTrip`, `endTrip`, `currentTrip` — свой выезд на установку: смена
 *    при этом не закрывается, человек просто не в цеху;
 *  - `list`, `summary`, `adjustManually`, `remove`, `activeTrips` —
 *    руководство (CEO, админ).
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
        /*
          Пауза за выезды — чтобы часы на экране совпадали с теми, что уйдут
          в зарплату. Считать их на клиенте по списку выездов нельзя: тогда
          в двух местах появились бы два разных правила, и разошлись бы они
          незаметно.
        */
        pausedSeconds: sql<string>`coalesce((
          select sum(extract(epoch from (
            ${installationTrips.returnedAt} - ${installationTrips.startedAt}
          )))
          from ${installationTrips}
          where ${installationTrips.shiftId} = ${shifts.id}
            and ${installationTrips.returnedAt} is not null
        ), 0) + coalesce((
          select sum(extract(epoch from (
            ${personalBreaks.returnedAt} - ${personalBreaks.startedAt}
          )))
          from ${personalBreaks}
          where ${personalBreaks.shiftId} = ${shifts.id}
            and ${personalBreaks.returnedAt} is not null
        ), 0)`,
        /*
          Начало незакрытой паузы — секундами эпохи, а не отметкой времени.

          Значение из `sql` мимо схемы драйвер отдаёт как есть, и до телефона
          доезжала строка Postgres («2026-09-09 00:25:37.46+05»). Node её
          разбирает, Hermes в мобильном приложении — нет, и таймер смены
          показывал «NaN:NaN:NaN». Число разбирать нечем: оно одинаково
          читается везде.
        */
        tripSince: sql<string | null>`(
          select extract(epoch from ${installationTrips.startedAt})
          from ${installationTrips}
          where ${installationTrips.shiftId} = ${shifts.id}
            and ${installationTrips.returnedAt} is null
          limit 1
        )`,
        /** То же для незакрытой личной отлучки. */
        breakSince: sql<string | null>`(
          select extract(epoch from ${personalBreaks.startedAt})
          from ${personalBreaks}
          where ${personalBreaks.shiftId} = ${shifts.id}
            and ${personalBreaks.returnedAt} is null
          limit 1
        )`,
      })
      .from(shifts)
      .innerJoin(branches, eq(branches.id, shifts.branchId))
      .where(findOpenShift(ctx.user.id))
      .limit(1);

    if (shift === undefined) return null;

    const { tripSince, breakSince, ...rest } = shift;

    /** Секунды эпохи в момент времени. `null` — паузы нет. */
    const momentOf = (epochSeconds: string | null): Date | null => {
      if (epochSeconds === null) return null;
      const seconds = Number.parseFloat(epochSeconds);
      return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
    };

    const tripStart = momentOf(tripSince);
    const breakStart = momentOf(breakSince);

    /*
      Причина паузы нужна экрану, чтобы подписать таймер: «на установке» и
      «на перерыве» — разные вещи для того, кто смотрит явку. Одновременно
      они не открываются (см. `startBreak` и `startTrip`), так что выбор
      однозначен.
    */
    return {
      ...rest,
      pausedSeconds: Math.max(0, Math.round(Number.parseFloat(shift.pausedSeconds) || 0)),
      pausedSince: tripStart ?? breakStart ?? null,
      pausedReason:
        tripStart !== null ? ('trip' as const) : breakStart !== null ? ('break' as const) : null,
    };
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

  /**
   * Начать личную отлучку.
   *
   * Доступно только при открытой смене: без неё отлучаться не от чего —
   * это не отгул и не перерыв в расписании, а пауза внутри рабочего дня,
   * который уже идёт. Вторая отлучка поверх ещё не закрытой первой
   * запрещена и кодом, и частичным уникальным индексом на случай гонки.
   */
  startBreak: protectedProcedure
    .input(z.object({ plannedMinutes: z.number().int().min(1).max(MAX_PERSONAL_BREAK_MINUTES) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [openShift] = await tx
          .select({ id: shifts.id })
          .from(shifts)
          .where(findOpenShift(ctx.user.id))
          .limit(1);

        if (openShift === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сначала откройте смену — отлучаться не от чего',
          });
        }

        const [activeBreak] = await tx
          .select({ id: personalBreaks.id })
          .from(personalBreaks)
          .where(and(eq(personalBreaks.shiftId, openShift.id), isNull(personalBreaks.returnedAt)))
          .limit(1);

        if (activeBreak !== undefined) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Отлучка уже начата' });
        }

        /*
          На выезде отлучиться нельзя — и наоборот.

          Оба состояния значат «меня нет на месте», и оба вычитаются из
          рабочего времени. Открытые одновременно, они вычлись бы дважды за
          один и тот же час — и как раз не в пользу сотрудника.
        */
        const [activeTrip] = await tx
          .select({ id: installationTrips.id })
          .from(installationTrips)
          .where(
            and(
              eq(installationTrips.shiftId, openShift.id),
              isNull(installationTrips.returnedAt),
            ),
          )
          .limit(1);

        if (activeTrip !== undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Вы на установке — сначала отметьте возвращение',
          });
        }

        const [created] = await tx
          .insert(personalBreaks)
          .values({ shiftId: openShift.id, plannedMinutes: input.plannedMinutes })
          .returning();

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось начать отлучку' });
        }

        return created;
      }),
    ),

  /** Отметить возвращение из личной отлучки. */
  endBreak: protectedProcedure.mutation(async ({ ctx }) =>
    ctx.db.transaction(async (tx) => {
      const [openShift] = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(findOpenShift(ctx.user.id))
        .limit(1);

      if (openShift === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Открытая смена не найдена' });
      }

      const [updated] = await tx
        .update(personalBreaks)
        .set({ returnedAt: new Date() })
        .where(and(eq(personalBreaks.shiftId, openShift.id), isNull(personalBreaks.returnedAt)))
        .returning();

      if (updated === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Открытая отлучка не найдена' });
      }

      return updated;
    }),
  ),

  /** Текущая открытая отлучка или `null`. Экран смены спрашивает это при старте. */
  currentBreak: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: personalBreaks.id,
        plannedMinutes: personalBreaks.plannedMinutes,
        startedAt: personalBreaks.startedAt,
      })
      .from(personalBreaks)
      .innerJoin(shifts, eq(shifts.id, personalBreaks.shiftId))
      .where(and(eq(shifts.userId, ctx.user.id), isNull(shifts.endedAt), isNull(personalBreaks.returnedAt)))
      .limit(1);

    return row ?? null;
  }),

  /**
   * Все, кто сейчас в личной отлучке — для руководства.
   *
   * Отлучка не пишется в аудит и не рассылает уведомления: это рутинное
   * самообслуживание, как чек-ин, а не событие, о котором нужно оповещать.
   * Видимость руководству — не пуш, а этот список по запросу.
   *
   * `isNull(shifts.endedAt)` обязателен — как и в `currentBreak` выше.
   * Без него отлучка, которую сотрудник не закрыл (забыл нажать «вернулся»,
   * а смену потом закрыли или она просто оборвалась), висела бы «активной»
   * вечно: новая смена назавтра открывается новой строкой в `shifts`,
   * старая — с незакрытой отлучкой — никуда не девается, и директор видел
   * бы человека одновременно на смене и на отлучке трёхдневной давности.
   */
  activeBreaks: managementProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: personalBreaks.id,
        plannedMinutes: personalBreaks.plannedMinutes,
        startedAt: personalBreaks.startedAt,
        userId: shifts.userId,
        userFullName: users.fullName,
        branchName: branches.name,
      })
      .from(personalBreaks)
      .innerJoin(shifts, eq(shifts.id, personalBreaks.shiftId))
      .innerJoin(users, eq(users.id, shifts.userId))
      .innerJoin(branches, eq(branches.id, shifts.branchId))
      .where(and(isNull(shifts.endedAt), isNull(personalBreaks.returnedAt)))
      .orderBy(personalBreaks.startedAt);

    return rows;
  }),

  /* ---------------------------- Выезд на установку ---------------------------- */

  /**
   * Уехал на установку — смена продолжается.
   *
   * Раньше выбор был из двух: закрыть смену и потерять полдня в табеле или
   * не отмечаться вовсе — тогда человек числится в цеху, где его нет.
   *
   * Координаты обязательны: владелец просил, чтобы всё было по GPS. А вот
   * радиус филиала здесь НЕ проверяется — из него как раз уезжают, и
   * отказать «вы слишком далеко» значило бы запретить отметить именно то
   * событие, ради которого кнопка и сделана. Расстояние записывается: оно
   * отвечает на вопрос «откуда отметился», ничему не мешая.
   */
  startTrip: protectedProcedure
    .input(geoPointSchema.extend({ orderId: idSchema.optional() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [openShift] = await tx
          .select({ id: shifts.id, branchId: shifts.branchId })
          .from(shifts)
          .where(findOpenShift(ctx.user.id))
          .limit(1);

        if (openShift === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сначала откройте смену — выезжать не с чего',
          });
        }

        const [activeTrip] = await tx
          .select({ id: installationTrips.id })
          .from(installationTrips)
          .where(
            and(
              eq(installationTrips.shiftId, openShift.id),
              isNull(installationTrips.returnedAt),
            ),
          )
          .limit(1);

        if (activeTrip !== undefined) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Вы уже отмечены на установке' });
        }

        // Обратная половина того же запрета — см. `startBreak`.
        const [activeBreak] = await tx
          .select({ id: personalBreaks.id })
          .from(personalBreaks)
          .where(and(eq(personalBreaks.shiftId, openShift.id), isNull(personalBreaks.returnedAt)))
          .limit(1);

        if (activeBreak !== undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Вы на личной отлучке — сначала отметьте возвращение',
          });
        }

        const distance = await measureDistanceToBranch(tx, openShift.branchId, input);

        const [created] = await tx
          .insert(installationTrips)
          .values({
            shiftId: openShift.id,
            orderId: input.orderId ?? null,
            startLatitude: input.latitude,
            startLongitude: input.longitude,
            startDistanceMeters: distance,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось отметить выезд',
          });
        }

        return created;
      }),
    ),

  /** Вернулся с установки. Координаты — те же правила, что и при выезде. */
  endTrip: protectedProcedure.input(geoPointSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      const [openShift] = await tx
        .select({ id: shifts.id, branchId: shifts.branchId })
        .from(shifts)
        .where(findOpenShift(ctx.user.id))
        .limit(1);

      if (openShift === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Открытая смена не найдена' });
      }

      const distance = await measureDistanceToBranch(tx, openShift.branchId, input);

      const [updated] = await tx
        .update(installationTrips)
        .set({
          returnedAt: new Date(),
          endLatitude: input.latitude,
          endLongitude: input.longitude,
          endDistanceMeters: distance,
        })
        .where(
          and(eq(installationTrips.shiftId, openShift.id), isNull(installationTrips.returnedAt)),
        )
        .returning();

      if (updated === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Открытый выезд не найден' });
      }

      return updated;
    }),
  ),

  /** Текущий выезд или `null`. Экран смены спрашивает это при старте. */
  currentTrip: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: installationTrips.id,
        startedAt: installationTrips.startedAt,
        orderId: installationTrips.orderId,
        orderNumber: orders.orderNumber,
      })
      .from(installationTrips)
      .innerJoin(shifts, eq(shifts.id, installationTrips.shiftId))
      .leftJoin(orders, eq(orders.id, installationTrips.orderId))
      .where(
        and(
          eq(shifts.userId, ctx.user.id),
          isNull(shifts.endedAt),
          isNull(installationTrips.returnedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }),

  /**
   * Кто сейчас на установке — для руководства.
   *
   * `isNull(shifts.endedAt)` обязателен ровно по той же причине, что и у
   * отлучек: незакрытый выезд от позавчерашней смены иначе висел бы
   * «активным» вечно, и человек показывался бы одновременно в цеху и на
   * объекте.
   */
  activeTrips: managementProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: installationTrips.id,
        startedAt: installationTrips.startedAt,
        userId: shifts.userId,
        userFullName: users.fullName,
        branchName: branches.name,
        orderId: installationTrips.orderId,
        orderNumber: orders.orderNumber,
      })
      .from(installationTrips)
      .innerJoin(shifts, eq(shifts.id, installationTrips.shiftId))
      .innerJoin(users, eq(users.id, shifts.userId))
      .innerJoin(branches, eq(branches.id, shifts.branchId))
      .leftJoin(orders, eq(orders.id, installationTrips.orderId))
      .where(and(isNull(shifts.endedAt), isNull(installationTrips.returnedAt)))
      .orderBy(installationTrips.startedAt);

    return rows;
  }),

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
          // То же выражение, что в расчёте зарплаты: часы за вычетом выездов.
          workedHours: sql<string>`round(${workedSecondsExpression(bounds)} / 3600, 2)`,
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

import { users } from '@curtain-crm/db';
import {
  formatMoney,
  RATED_ROLES,
  ratingScopeSchema,
  RatingScope,
  Role,
} from '@curtain-crm/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, periodSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import {
  employeeRating,
  ratingPeriodBounds,
  type RatedEmployee,
  type RatingEntry,
} from '../services/rating.service';
import { getStorage } from '../services/storage.service';
import { router } from '../trpc';

import type { AppContext } from '../context';

/**
 * Рейтинг сотрудников.
 *
 * Вынесен из `reports.router` намеренно: там инвариант «все процедуры —
 * только руководство», а рейтинг обязан быть виден рядовому сотруднику,
 * иначе соревнования не выходит. Держать в одном роутере процедуры с
 * разными правами — верный способ однажды выдать выручку компании швее.
 *
 * ПРАВА ДОСТУПА:
 *  - `board` — только руководство: полная таблица со всеми показателями,
 *    включая выручку по каждому продавцу;
 *  - `me` — любой сотрудник: пьедестал из пяти лучших и собственная строка.
 *    Ни выручки, ни чужих метрик здесь не отдаётся — только имя, место и
 *    балл, то есть ровно то, что показывает мобильное приложение.
 *
 * Сужение выдачи для `me` сделано на СЕРВЕРЕ, а не скрытием полей в
 * интерфейсе: мобильный клиент ходит в тот же API, и «не показали на
 * экране» не значит «не отдали в ответе».
 */

/** Сколько строк показывает пьедестал в мобильном приложении. */
const PODIUM_SIZE = 5;

/* -------------------------------------------------------------------------- */
/*  Общая часть                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Активные сотрудники со всеми их ролями.
 *
 * Уволенные (`isActive = false`) в рейтинг не попадают: их заказы за период
 * остаются в отчётах, но соревноваться с тем, кто уже не работает, бессмысленно.
 */
async function loadEmployees(ctx: AppContext): Promise<RatedEmployee[]> {
  const rows = await ctx.db.query.users.findMany({
    where: eq(users.isActive, true),
    columns: { id: true, fullName: true, avatarStorageKey: true },
    with: { roles: { columns: { role: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    avatarStorageKey: row.avatarStorageKey,
    roles: row.roles.map((entry) => entry.role),
  }));
}

/**
 * Ссылки на аватары одним проходом.
 *
 * У disk-драйвера это сборка строки, у S3 — подпись; последовательные вызовы
 * в цикле по сотне сотрудников дали бы сотню ожиданий подряд.
 */
async function resolveAvatars(entries: readonly RatingEntry[]): Promise<Map<number, string>> {
  const storage = getStorage();

  return new Map(
    await Promise.all(
      entries
        .filter((entry) => entry.avatarStorageKey !== null)
        .map(async (entry): Promise<[number, string]> => [
          entry.userId,
          await storage.getUrl(entry.avatarStorageKey as string),
        ]),
    ),
  );
}

/** Изменение места между периодами; `null` — сравнивать не с чем. */
function placeDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  // Вверх по таблице — уменьшение номера места, поэтому знак переворачиваем:
  // с 12-го на 9-е это «+3», а не «−3».
  return previous - current;
}

const ratingInputSchema = periodSchema.extend({
  scope: ratingScopeSchema.default(RatingScope.MONTH),
  branchId: idSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/*  Роутер                                                                    */
/* -------------------------------------------------------------------------- */

export const ratingRouter = router({
  /**
   * Полная таблица рейтинга с аналитикой — для веб-панели руководства.
   *
   * Считает период дважды: текущий и предыдущий. Второй нужен только ради
   * колонки «изменение места» — без неё таблица показывает срез, по которому
   * невозможно понять, кто растёт, а кто сползает.
   */
  board: managementProcedure.input(ratingInputSchema).query(async ({ ctx, input }) => {
    const bounds = ratingPeriodBounds(input.scope, input);
    const employees = await loadEmployees(ctx);

    const [current, previous] = await Promise.all([
      employeeRating(ctx.db, employees, bounds.current, input.branchId),
      employeeRating(ctx.db, employees, bounds.previous, input.branchId),
    ]);

    const previousPlaces = new Map(previous.map((entry) => [entry.userId, entry.place]));
    const avatars = await resolveAvatars(current);

    const rows = current.map((entry) => ({
      ...entry,
      avatarUrl: avatars.get(entry.userId) ?? null,
      placeDelta: placeDelta(entry.place, previousPlaces.get(entry.userId) ?? null),
      byRole: entry.byRole.map((role) => ({
        ...role,
        // Выручка приходит в минорных единицах — формат собираем на сервере,
        // чтобы веб и мобилка не разошлись в разделителях.
        volumeFormatted:
          role.role === Role.SELLER ? formatMoney(role.volumeValue) : null,
      })),
    }));

    const ranked = rows.filter((row) => row.place !== null);

    return {
      period: {
        scope: input.scope,
        start: bounds.current.start,
        end: bounds.current.end,
      },

      rows,

      /**
       * Доски по ролям.
       *
       * Массив пар, а не объект `{ роль: строки }`: словарь пришлось бы
       * собирать через `Object.fromEntries`, который теряет типы ключей и
       * значений, и клиент получил бы `unknown` вместо строк таблицы.
       *
       * Тот же сотрудник может стоять в двух досках — совмещающая швея и
       * мастер попадёт и туда, и туда со своими показателями в каждой роли.
       */
      boards: RATED_ROLES.map((role) => ({
        role,
        rows: rows
          .flatMap((row) => {
            const entry = row.byRole.find((item) => item.role === role);
            if (entry === undefined) return [];

            return [{ userId: row.userId, fullName: row.fullName, ...entry }];
          })
          .sort((a, b) => b.score - a.score || b.ordersCount - a.ordersCount),
      })),

      /**
       * Сводка по таблице.
       *
       * Медиана, а не только среднее: один продавец с выдающейся выручкой
       * поднимает среднее так, что оно перестаёт описывать типичного
       * сотрудника, — а решения принимают именно про типичного.
       */
      summary: {
        participants: ranked.length,
        unrated: rows.length - ranked.length,
        ordersCounted: ranked.reduce((sum, row) => sum + row.ordersCount, 0),
        averageScore: average(ranked.map((row) => row.score ?? 0)),
        medianScore: median(ranked.map((row) => row.score ?? 0)),
        withoutOrders: ranked.filter((row) => row.ordersCount === 0).length,
      },
    };
  }),

  /**
   * Пьедестал и собственное место — для мобильного приложения.
   *
   * Показывает пять лучших поимённо и строку самого сотрудника. Остальные
   * участники не перечисляются: соревнование должно подталкивать, а не
   * вывешивать отстающих на всю мастерскую.
   */
  me: protectedProcedure
    .input(z.object({ scope: ratingScopeSchema.default(RatingScope.MONTH) }).default({}))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
      const bounds = ratingPeriodBounds(input.scope, period, now);

      const employees = await loadEmployees(ctx);

      const [current, previous] = await Promise.all([
        employeeRating(ctx.db, employees, bounds.current),
        employeeRating(ctx.db, employees, bounds.previous),
      ]);

      const previousPlaces = new Map(previous.map((entry) => [entry.userId, entry.place]));
      const ranked = current.filter((entry) => entry.place !== null);

      const mine = current.find((entry) => entry.userId === ctx.user.id) ?? null;

      return {
        period: {
          scope: input.scope,
          start: bounds.current.start,
          end: bounds.current.end,
        },

        participants: ranked.length,

        /**
         * Пятёрка лучших: только имя, место и балл — без чужих метрик.
         *
         * Фото здесь нет намеренно: экран его не показывает, а сборка ссылки
         * у S3-драйвера — это подпись, то есть работа на каждый запрос ради
         * поля, которое никто не читает.
         */
        podium: ranked.slice(0, PODIUM_SIZE).map((entry) => ({
          userId: entry.userId,
          fullName: entry.fullName,
          place: entry.place,
          score: entry.score,
          isMe: entry.userId === ctx.user.id,
        })),

        /**
         * Собственная строка — со всеми своими показателями.
         *
         * `null` бывает у уволенного сотрудника, чей токен ещё жив: он не
         * попадает в список активных, и подставлять ему пустую строку с
         * нулями было бы враньём.
         */
        me:
          mine === null
            ? null
            : {
                place: mine.place,
                score: mine.score,
                ordersCount: mine.ordersCount,
                placeDelta: placeDelta(mine.place, previousPlaces.get(mine.userId) ?? null),
                unratedReason: mine.unratedReason,
                byRole: mine.byRole.map((role) => ({
                  ...role,
                  volumeFormatted:
                    role.role === Role.SELLER ? formatMoney(role.volumeValue) : null,
                })),
              },
      };
    }),
});

/* -------------------------------------------------------------------------- */
/*  Мелкая статистика                                                         */
/* -------------------------------------------------------------------------- */

/** Среднее с округлением до десятых; `null` на пустом наборе. */
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sum = values.reduce((total, value) => total + value, 0);

  return Math.round((sum / values.length) * 10) / 10;
}

/** Медиана; при чётном числе значений — среднее двух центральных. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const value =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);

  return Math.round(value * 10) / 10;
}

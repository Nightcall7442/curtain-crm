import { shifts, type DbExecutor } from '@curtain-crm/db';
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

/**
 * Учёт рабочего времени.
 *
 * Модуль отвечает за периоды и отработанные часы. `payroll.service.ts`
 * зависит от него, а не наоборот: часы — первичные данные, зарплата — производные.
 */

/** Расчётный период — календарный месяц. */
export interface Period {
  readonly year: number;
  readonly month: number;
}

export interface PeriodBounds {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Границы месяца в UTC: `[00:00 первого числа; 00:00 первого числа следующего)`.
 *
 * Полуинтервал, а не отрезок: смена, начавшаяся ровно в полночь первого числа,
 * должна попасть строго в один период, а не в оба.
 */
export function periodBounds(period: Period): PeriodBounds {
  return {
    start: new Date(Date.UTC(period.year, period.month - 1, 1)),
    end: new Date(Date.UTC(period.year, period.month, 1)),
  };
}

/** Период для интерфейса: `03.2026`. */
export function formatPeriod(period: Period): string {
  return `${period.month.toString().padStart(2, '0')}.${period.year.toString()}`;
}

/**
 * Момент времени для подстановки в сырой SQL с явным приведением типа.
 *
 * Передавать в такое выражение объект `Date` НЕЛЬЗЯ. Запись вида
 * `$1::timestamptz` заставляет PostgreSQL описать параметр как `text`
 * (нетипизированный литерал, приведённый каст-выражением), и драйвер
 * postgres.js падает с `The "string" argument must be of type string...
 * Received an instance of Date` при попытке сериализовать объект как строку.
 *
 * Поймано интеграционной проверкой `src/scripts/smoke.ts`: юнит-тесты
 * этот путь не проходят, а типы ошибку не видят — сырой SQL для них
 * непрозрачен.
 *
 * Через операторы Drizzle (`gte`, `lt`) даты по-прежнему передаются
 * объектами: там тип параметра выводится из колонки, и каст не нужен.
 */
export function sqlTimestamp(value: Date): string {
  return value.toISOString();
}

/**
 * Отработанные часы сотрудника за период.
 *
 * Смена, пересекающая границу месяца, обрезается границами периода: ночная
 * смена с 31-го на 1-е иначе целиком попала бы в один из двух месяцев.
 * Открытые смены (`ended_at is null`) не учитываются — их длительность
 * ещё не определена, и включать «сейчас минус начало» в расчёт зарплаты нельзя.
 */
export async function calculateWorkedHours(
  executor: DbExecutor,
  userId: number,
  bounds: PeriodBounds,
): Promise<number> {
  const [row] = await executor
    .select({
      hours: sql<string>`coalesce(sum(
        extract(epoch from (
          least(${shifts.endedAt}, ${sqlTimestamp(bounds.end)}::timestamptz)
          - greatest(${shifts.startedAt}, ${sqlTimestamp(bounds.start)}::timestamptz)
        ))
      ), 0) / 3600`,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        isNotNull(shifts.endedAt),
        lt(shifts.startedAt, bounds.end),
        gte(shifts.endedAt, bounds.start),
      ),
    );

  const hours = Number.parseFloat(row?.hours ?? '0');
  return Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0;
}

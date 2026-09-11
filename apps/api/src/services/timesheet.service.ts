import { dayOffRequests, shifts, users, type DbExecutor } from '@curtain-crm/db';
import { DayOffStatus, isoWeekdayOf, WORKSHOP_TIME_ZONE } from '@curtain-crm/shared';
import { and, asc, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { periodBounds, workedSecondsExpression, type Period } from './shifts.service';

/**
 * Табель: кто в какой день работал, сколько и когда отдыхал.
 *
 * Итог за месяц у руководства был, а вот «когда именно» — нет: чтобы понять,
 * выходил ли человек во вторник, приходилось листать журнал смен. Здесь месяц
 * разложен по дням: в клетке часы, если смена была, и пометка выходного, если
 * день согласован.
 *
 * День определяется по НАЧАЛУ смены и по ташкентскому времени: смена,
 * начатая в восемь утра, принадлежит этому дню целиком, даже если затянулась
 * за полночь. Иначе один рабочий день распадался бы в табеле на два.
 */

export interface TimesheetDay {
  /** Число месяца, 1–31. */
  readonly day: number;
  readonly hours: number;
  readonly shifts: number;
}

export interface TimesheetRow {
  readonly userId: number;
  readonly userFullName: string;
  readonly days: readonly TimesheetDay[];
  /** Числа месяца, на которые согласован выходной. */
  readonly daysOff: readonly number[];
  readonly totalHours: number;
  readonly shiftsCount: number;
}

export interface Timesheet {
  readonly period: Period;
  /** Дней в месяце — по нему рисуются колонки. */
  readonly daysInMonth: number;
  readonly rows: readonly TimesheetRow[];
}

/** Числа месяца, попавшие в согласованный период выходных. */
function daysOfRange(
  startDate: string,
  endDate: string,
  period: Period,
): readonly number[] {
  const days: number[] = [];
  const last = new Date(`${endDate}T00:00:00Z`);

  for (
    let cursor = new Date(`${startDate}T00:00:00Z`);
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (cursor.getUTCFullYear() !== period.year) continue;
    if (cursor.getUTCMonth() + 1 !== period.month) continue;
    days.push(cursor.getUTCDate());
  }

  return days;
}

/**
 * Табель за месяц.
 *
 * `userIds` сужает выборку до одного сотрудника — так свой график читает
 * мобильное приложение. Без него в табель попадают все работающие: тот, кто
 * весь месяц отдыхал, — такая же строка табеля, как и тот, кто не вылезал
 * из цеха, и пустая строка здесь сама по себе ответ.
 */
export async function buildTimesheet(
  executor: DbExecutor,
  params: {
    readonly period: Period;
    readonly branchId?: number;
    readonly userIds?: readonly number[];
  },
): Promise<Timesheet> {
  const bounds = periodBounds(params.period);
  const onlyUsers = params.userIds;

  const staff = await executor
    .select({ id: users.id, fullName: users.fullName, weeklyDayOff: users.weeklyDayOff })
    .from(users)
    .where(
      and(
        ...(onlyUsers === undefined ? [eq(users.isActive, true)] : [inArray(users.id, [...onlyUsers])]),
      ),
    )
    .orderBy(asc(users.fullName));

  /*
    Часы считаются тем же выражением, что и зарплата (`workedSecondsExpression`):
    за вычетом выездов и личных отлучек. Три разных числа за один месяц спорили
    бы между собой, и доказать сотруднику правоту любого из них было бы нельзя.
  */
  const worked = await executor
    .select({
      userId: shifts.userId,
      day: sql<number>`extract(day from (${shifts.startedAt} at time zone ${WORKSHOP_TIME_ZONE}))::int`,
      shiftsCount: count(),
      hours: sql<string>`round(${workedSecondsExpression(bounds)} / 3600, 2)`,
    })
    .from(shifts)
    .where(
      and(
        lt(shifts.startedAt, bounds.end),
        gte(shifts.endedAt, bounds.start),
        ...(params.branchId === undefined ? [] : [eq(shifts.branchId, params.branchId)]),
        ...(onlyUsers === undefined ? [] : [inArray(shifts.userId, [...onlyUsers])]),
      ),
    )
    .groupBy(shifts.userId, sql`2`);

  const approved = await executor
    .select({
      userId: dayOffRequests.userId,
      startDate: dayOffRequests.startDate,
      endDate: dayOffRequests.endDate,
    })
    .from(dayOffRequests)
    .where(
      and(
        eq(dayOffRequests.status, DayOffStatus.APPROVED),
        lt(dayOffRequests.startDate, bounds.end.toISOString().slice(0, 10)),
        gte(dayOffRequests.endDate, bounds.start.toISOString().slice(0, 10)),
        ...(onlyUsers === undefined ? [] : [inArray(dayOffRequests.userId, [...onlyUsers])]),
      ),
    );

  const daysByUser = new Map<number, TimesheetDay[]>();
  for (const row of worked) {
    const list = daysByUser.get(row.userId) ?? [];
    list.push({
      day: row.day,
      hours: Number.parseFloat(row.hours),
      shifts: row.shiftsCount,
    });
    daysByUser.set(row.userId, list);
  }

  const offByUser = new Map<number, Set<number>>();
  for (const row of approved) {
    const set = offByUser.get(row.userId) ?? new Set<number>();
    for (const day of daysOfRange(row.startDate, row.endDate, params.period)) set.add(day);
    offByUser.set(row.userId, set);
  }

  const daysInMonth = new Date(Date.UTC(params.period.year, params.period.month, 0)).getUTCDate();

  // Фиксированный выходной «по пятницам» — те же клетки «В», что и разовый.
  for (const person of staff) {
    if (person.weeklyDayOff === null) continue;
    const set = offByUser.get(person.id) ?? new Set<number>();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(params.period.year, params.period.month - 1, day));
      if (isoWeekdayOf(date) === person.weeklyDayOff) set.add(day);
    }
    offByUser.set(person.id, set);
  }

  return {
    period: params.period,
    daysInMonth,
    rows: staff.map((person) => {
      const days = (daysByUser.get(person.id) ?? []).sort((a, b) => a.day - b.day);

      return {
        userId: person.id,
        userFullName: person.fullName,
        days,
        daysOff: [...(offByUser.get(person.id) ?? [])].sort((a, b) => a - b),
        totalHours: days.reduce((sum, day) => sum + day.hours, 0),
        shiftsCount: days.reduce((sum, day) => sum + day.shifts, 0),
      };
    }),
  };
}

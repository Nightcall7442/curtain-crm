import { personalBreaks, shifts, users, type DbExecutor } from '@curtain-crm/db';
import {
  ageBucket,
  ageInYears,
  daysUntilBirthday,
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  PresenceStatus,
  tenureBucket,
  TENURE_BUCKETS,
  type AgeBucketKey,
  type Department,
  type EmploymentType,
  type PresenceStatus as PresenceStatusName,
  type TenureBucketKey,
} from '@curtain-crm/shared';
import { and, count, eq, gte, isNull, lt, sql } from 'drizzle-orm';

/**
 * Кадровая аналитика для раздела «Ведомость рабочих».
 *
 * Агрегация выполняется в SQL везде, где это возможно. Разбор дат
 * (возраст, стаж) вынесен в приложение осознанно: считать возрастные группы
 * выражением в Postgres пришлось бы дублировать границы из
 * `AGE_BUCKETS`, и они разъехались бы при первой же правке.
 */

/* -------------------------------------------------------------------------- */
/*                          Присутствие на сегодня                            */
/* -------------------------------------------------------------------------- */

/** Границы текущих суток в UTC. */
function todayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Статус присутствия сотрудников на сегодня.
 *
 * Открытая смена — «на работе», закрытая — «смена закрыта», нет смены —
 * «отсутствует». Открытая смена с незакрытой личной отлучкой — «на отлучке»:
 * статус не различает, уложился сотрудник в заявленный срок или нет —
 * это вопрос точного времени, а не одной из четырёх фиксированных меток,
 * и его показывают места, где секунды под рукой (`shifts.activeBreaks`).
 */
export async function presenceToday(
  executor: DbExecutor,
  now: Date = new Date(),
): Promise<Map<number, PresenceStatusName>> {
  const bounds = todayBounds(now);

  const [rows, onBreakRows] = await Promise.all([
    executor
      .select({
        userId: shifts.userId,
        hasOpen: sql<boolean>`bool_or(${shifts.endedAt} is null)`,
      })
      .from(shifts)
      .where(and(gte(shifts.startedAt, bounds.start), lt(shifts.startedAt, bounds.end)))
      .groupBy(shifts.userId),

    executor
      .selectDistinct({ userId: shifts.userId })
      .from(personalBreaks)
      .innerJoin(shifts, eq(shifts.id, personalBreaks.shiftId))
      .where(and(isNull(shifts.endedAt), isNull(personalBreaks.returnedAt))),
  ]);

  const onBreak = new Set(onBreakRows.map((row) => row.userId));

  return new Map(
    rows.map((row) => [
      row.userId,
      row.hasOpen
        ? onBreak.has(row.userId)
          ? PresenceStatus.ON_BREAK
          : PresenceStatus.AT_WORK
        : PresenceStatus.FINISHED,
    ]),
  );
}

/* -------------------------------------------------------------------------- */
/*                             Сводные показатели                             */
/* -------------------------------------------------------------------------- */

export interface StaffSummary {
  readonly total: number;
  readonly active: number;
  readonly inactive: number;
  readonly atWorkToday: number;
  readonly absentToday: number;
  readonly hiredThisMonth: number;
  readonly firedThisMonth: number;
}

export async function staffSummary(
  executor: DbExecutor,
  now: Date = new Date(),
): Promise<StaffSummary> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const bounds = todayBounds(now);

  const [[totals], [hires], [fires], [atWork]] = await Promise.all([
    executor
      .select({
        total: count(),
        active: sql<string>`count(*) filter (where ${users.isActive})`,
      })
      .from(users),

    executor
      .select({ value: count() })
      .from(users)
      .where(gte(users.hiredAt, monthStart)),

    executor
      .select({ value: count() })
      .from(users)
      .where(gte(users.firedAt, monthStart)),

    executor
      .select({ value: sql<string>`count(distinct ${shifts.userId})` })
      .from(shifts)
      .where(
        and(
          isNull(shifts.endedAt),
          gte(shifts.startedAt, bounds.start),
          lt(shifts.startedAt, bounds.end),
        ),
      ),
  ]);

  const total = totals?.total ?? 0;
  const active = Number.parseInt(totals?.active ?? '0', 10);
  const atWorkToday = Number.parseInt(atWork?.value ?? '0', 10);

  return {
    total,
    active,
    inactive: total - active,
    atWorkToday,
    // «Отсутствуют» считается от активных: уволенные не должны попадать
    // в число прогульщиков.
    absentToday: Math.max(0, active - atWorkToday),
    hiredThisMonth: hires?.value ?? 0,
    firedThisMonth: fires?.value ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Разрезы                                    */
/* -------------------------------------------------------------------------- */

export interface DistributionEntry<TKey extends string> {
  readonly key: TKey;
  readonly count: number;
  /** Доля от общего числа, проценты с одним знаком. */
  readonly percent: number;
}

const toDistribution = <TKey extends string>(
  keys: readonly TKey[],
  counts: ReadonlyMap<TKey, number>,
  total: number,
): DistributionEntry<TKey>[] =>
  keys.map((key) => {
    const value = counts.get(key) ?? 0;
    return {
      key,
      count: value,
      percent: total === 0 ? 0 : Math.round((value / total) * 1000) / 10,
    };
  });

export interface StaffDistributions {
  readonly total: number;
  readonly byDepartment: readonly DistributionEntry<Department>[];
  readonly byEmploymentType: readonly DistributionEntry<EmploymentType>[];
  readonly byAge: readonly DistributionEntry<AgeBucketKey>[];
  readonly byTenure: readonly DistributionEntry<TenureBucketKey>[];
}

/**
 * Разрезы по подразделениям, типу занятости, возрасту и стажу.
 *
 * Считаются только по активным сотрудникам: диаграмма «48 всего» на экране
 * отражает текущий штат, а не всех, кто когда-либо работал.
 */
export async function staffDistributions(
  executor: DbExecutor,
  now: Date = new Date(),
): Promise<StaffDistributions> {
  const rows = await executor
    .select({
      department: users.department,
      employmentType: users.employmentType,
      birthDate: users.birthDate,
      hiredAt: users.hiredAt,
    })
    .from(users)
    .where(eq(users.isActive, true));

  const byDepartment = new Map<Department, number>();
  const byEmploymentType = new Map<EmploymentType, number>();
  const byAge = new Map<AgeBucketKey, number>();
  const byTenure = new Map<TenureBucketKey, number>();

  const bump = <TKey>(map: Map<TKey, number>, key: TKey): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const row of rows) {
    bump(byDepartment, row.department);
    bump(byEmploymentType, row.employmentType);

    if (row.birthDate !== null) {
      const age = ageInYears(row.birthDate, now);
      const bucket = age === null ? null : ageBucket(age);
      if (bucket !== null) bump(byAge, bucket);
    }

    if (row.hiredAt !== null) {
      const hired = new Date(row.hiredAt);
      if (!Number.isNaN(hired.getTime())) {
        const months =
          (now.getUTCFullYear() - hired.getUTCFullYear()) * 12 +
          (now.getUTCMonth() - hired.getUTCMonth());
        bump(byTenure, tenureBucket(Math.max(0, months)));
      }
    }
  }

  const total = rows.length;

  return {
    total,
    byDepartment: toDistribution(DEPARTMENTS, byDepartment, total),
    byEmploymentType: toDistribution(EMPLOYMENT_TYPES, byEmploymentType, total),
    byAge: toDistribution(
      ['18-25', '26-30', '31-35', '36-40', '41-45', '46+'] as const,
      byAge,
      total,
    ),
    byTenure: toDistribution(
      TENURE_BUCKETS.map((bucket) => bucket.key),
      byTenure,
      total,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*                               Посещаемость                                 */
/* -------------------------------------------------------------------------- */

export interface AttendanceDay {
  /** Дата в формате `YYYY-MM-DD`. */
  readonly date: string;
  readonly presentCount: number;
  readonly activeCount: number;
  /** Доля вышедших от активного штата, проценты. */
  readonly rate: number;
}

/**
 * Посещаемость по дням месяца — данные для тепловой карты.
 *
 * Возвращаются сырые доли по датам, а не готовые категории «высокая/средняя/
 * низкая»: пороги окраски — вопрос представления, и держать их на сервере
 * означало бы менять API ради изменения палитры.
 */
export async function attendanceByDay(
  executor: DbExecutor,
  bounds: { readonly start: Date; readonly end: Date },
): Promise<AttendanceDay[]> {
  const [[activeRow], rows] = await Promise.all([
    executor.select({ value: count() }).from(users).where(eq(users.isActive, true)),

    executor
      .select({
        date: sql<string>`to_char(date_trunc('day', ${shifts.startedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        presentCount: sql<string>`count(distinct ${shifts.userId})`,
      })
      .from(shifts)
      .where(and(gte(shifts.startedAt, bounds.start), lt(shifts.startedAt, bounds.end)))
      .groupBy(sql`date_trunc('day', ${shifts.startedAt} at time zone 'UTC')`)
      .orderBy(sql`date_trunc('day', ${shifts.startedAt} at time zone 'UTC')`),
  ]);

  const activeCount = activeRow?.value ?? 0;

  return rows.map((row) => {
    const presentCount = Number.parseInt(row.presentCount, 10);
    return {
      date: row.date,
      presentCount,
      activeCount,
      rate: activeCount === 0 ? 0 : Math.round((presentCount / activeCount) * 1000) / 10,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                              Дни рождения                                  */
/* -------------------------------------------------------------------------- */

export interface UpcomingBirthday {
  readonly userId: number;
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly birthDate: string;
  readonly daysUntil: number;
  readonly turningAge: number | null;
  /** Ключ файла в хранилище. Ссылку подписывает роутер. */
  readonly avatarStorageKey: string | null;
}

/**
 * Ближайшие дни рождения активных сотрудников.
 *
 * Отбор идёт в приложении, а не в SQL: выражение «ближайший день рождения»
 * с переходом через Новый год в SQL получается громоздким и плохо читается,
 * а активных сотрудников заведомо немного.
 */
export async function upcomingBirthdays(
  executor: DbExecutor,
  withinDays: number,
  now: Date = new Date(),
): Promise<UpcomingBirthday[]> {
  const rows = await executor
    .select({
      id: users.id,
      fullName: users.fullName,
      jobTitle: users.jobTitle,
      birthDate: users.birthDate,
      avatarStorageKey: users.avatarStorageKey,
    })
    .from(users)
    .where(eq(users.isActive, true));

  return rows
    .flatMap((row) => {
      if (row.birthDate === null) return [];

      const daysUntil = daysUntilBirthday(row.birthDate, now);
      if (daysUntil === null || daysUntil > withinDays) return [];

      const age = ageInYears(row.birthDate, now);

      return [
        {
          userId: row.id,
          fullName: row.fullName,
          jobTitle: row.jobTitle,
          birthDate: row.birthDate,
          daysUntil,
          turningAge: age === null ? null : age + (daysUntil === 0 ? 0 : 1),
          avatarStorageKey: row.avatarStorageKey,
        },
      ];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

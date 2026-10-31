import {
  installationTrips,
  personalBreaks,
  shifts,
  type DbExecutor,
} from '@curtain-crm/db';
import { and, asc, eq, gte, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

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
 *
 * Время выездов на установку вычитается — см. `workedSecondsExpression`.
 */
/**
 * Часы смен за период ЗА ВЫЧЕТОМ выездов на установку.
 *
 * Время не идёт, пока сотрудника нет на месте: ни на выезде, ни на личной
 * отлучке. Так решил владелец.
 *
 * У выезда есть и вторая причина: установка оплачивается сдельной расценкой
 * за этап, и засчитать её ещё и часами значило бы заплатить дважды. Отлучка
 * же — личное время, и оплачивать его как рабочее не за что.
 *
 * Одновременно быть на выезде и на отлучке нельзя — это запрещено в самих
 * процедурах (`startBreak`, `startTrip`). Иначе пересечение вычлось бы
 * дважды, и как раз не в пользу сотрудника.
 *
 * Выражение общее для всех трёх мест, где считаются часы: расчёт зарплаты,
 * ведомость смен у руководства и отчёт по сотрудникам. Разойтись они не
 * могут — три разных числа за один и тот же месяц спорят между собой, и
 * доказать сотруднику правоту любого из них уже нельзя.
 *
 * Вычитаются ТОЛЬКО закрытые выезды. Выезд, оставшийся открытым на закрытой
 * смене (человек уехал, а «вернулся» нажать забыл), — это пробел в данных, и
 * молча урезать по нему зарплату хуже, чем не урезать: ошибка в свою пользу
 * заметна сотруднику, ошибка против него — нет.
 */
export function workedSecondsExpression(bounds: PeriodBounds): SQL<string> {
  const { gross, away } = shiftSecondsExpressions(bounds);

  return sql<string>`coalesce(sum(${gross} - ${away}), 0)`;
}

/**
 * Части `workedSecondsExpression` для ОДНОЙ строки `shifts`: длительность
 * смены, обрезанная периодом (`gross`), и время вне рабочего места внутри
 * неё — закрытые выезды и отлучки, тоже обрезанные (`away`).
 *
 * Вынесены, чтобы зарплата могла считать смену за сменой (оплата почасовика
 * округляется по каждой смене), а табель и отчёты — суммой, и оба пути шли
 * через одно и то же выражение.
 *
 * Отлучка, целиком лежащая за границей периода (ночная смена через
 * полночь первого числа), даёт ноль, а не отрицательную длительность:
 * иначе вычитание прибавляло бы время.
 */
export function shiftSecondsExpressions(bounds: PeriodBounds): {
  readonly gross: SQL<string>;
  readonly away: SQL<string>;
} {
  const periodEnd = sql`${sqlTimestamp(bounds.end)}::timestamptz`;
  const periodStart = sql`${sqlTimestamp(bounds.start)}::timestamptz`;

  const gross = sql<string>`extract(epoch from (
      least(${shifts.endedAt}, ${periodEnd}) - greatest(${shifts.startedAt}, ${periodStart})
    ))`;

  const away = sql<string>`(
    coalesce((
      select sum(greatest(0, extract(epoch from (
        least(${installationTrips.returnedAt}, ${periodEnd})
        - greatest(${installationTrips.startedAt}, ${periodStart})
      ))))
      from ${installationTrips}
      where ${installationTrips.shiftId} = ${shifts.id}
        and ${installationTrips.returnedAt} is not null
    ), 0)
    + coalesce((
      select sum(greatest(0, extract(epoch from (
        least(${personalBreaks.returnedAt}, ${periodEnd})
        - greatest(${personalBreaks.startedAt}, ${periodStart})
      ))))
      from ${personalBreaks}
      where ${personalBreaks.shiftId} = ${shifts.id}
        and ${personalBreaks.returnedAt} is not null
    ), 0)
  )`;

  return { gross, away };
}

/** Смена сотрудника за период — строка таблицы смен в зарплате. */
export interface WorkedShift {
  readonly id: number;
  readonly startedAt: Date;
  /** `null` — смена ещё идёт. */
  readonly endedAt: Date | null;
  /** Отработано внутри периода за вычетом выездов и отлучек; `null` у открытой. */
  readonly workedSeconds: number | null;
  /** Закрытые выезды и отлучки внутри смены и периода. */
  readonly awaySeconds: number;
  readonly isManuallyAdjusted: boolean;
}

/**
 * Смены сотрудника, задевающие период, по порядку.
 *
 * Те же границы и то же выражение, что у `calculateWorkedHours`: сумма
 * `workedSeconds` закрытых смен — ровно его часы. Открытая смена в списке
 * есть (её видно в таблице как «идёт»), но длительности у неё нет: в
 * расчёт она не идёт, как и раньше.
 */
export async function listWorkedShifts(
  executor: DbExecutor,
  userId: number,
  bounds: PeriodBounds,
): Promise<readonly WorkedShift[]> {
  const { gross, away } = shiftSecondsExpressions(bounds);

  const rows = await executor
    .select({
      id: shifts.id,
      startedAt: shifts.startedAt,
      endedAt: shifts.endedAt,
      workedSeconds: sql<string | null>`case when ${shifts.endedAt} is null then null
        else greatest(0, ${gross} - ${away}) end`,
      awaySeconds: away,
      isManuallyAdjusted: shifts.isManuallyAdjusted,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        lt(shifts.startedAt, bounds.end),
        or(isNull(shifts.endedAt), gte(shifts.endedAt, bounds.start)),
      ),
    )
    .orderBy(asc(shifts.startedAt));

  const toSeconds = (value: string | number | null): number => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    workedSeconds: row.workedSeconds === null ? null : toSeconds(row.workedSeconds),
    awaySeconds: toSeconds(row.awaySeconds),
    isManuallyAdjusted: row.isManuallyAdjusted,
  }));
}

export async function calculateWorkedHours(
  executor: DbExecutor,
  userId: number,
  bounds: PeriodBounds,
): Promise<number> {
  const [row] = await executor
    .select({
      hours: sql<string>`${workedSecondsExpression(bounds)} / 3600`,
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

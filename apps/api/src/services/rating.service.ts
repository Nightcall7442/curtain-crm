import {
  assignPlaces,
  normalizeVolume,
  OrderStatus,
  RATED_ROLES,
  ratingScore,
  RatingScope,
  unratedReason,
  type RatedRole,
  type RatingScope as RatingScopeName,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '@curtain-crm/db';

import { periodBounds, sqlTimestamp, type Period, type PeriodBounds } from './shifts.service';

/**
 * Рейтинг сотрудников.
 *
 * Считает то же, что и `performance.service.ts`, но по ВСЕМ участникам, а не
 * по одному лучшему в роли, и добавляет попадание в срок. Два сервиса не
 * слиты в один намеренно: «лучший месяца» на дашборде руководства и таблица
 * соревнования — разные запросы с разной ценой, и объединение заставило бы
 * дашборд тянуть всю выборку ради четырёх карточек.
 *
 * Арифметика балла живёт в `@curtain-crm/shared`: её обязаны применять
 * одинаково и веб-панель, и мобильное приложение.
 *
 * ЧТО СЧИТАЕТСЯ СЛЕДОМ РАБОТЫ. Только закрытые заказы (`completed`) с
 * `completed_at` внутри периода. Незакрытый заказ в рейтинг не идёт: пока он
 * в работе, ни качества, ни срока по нему ещё не известно, и учитывать его
 * значило бы начислять балл авансом.
 *
 * КАЧЕСТВО — через возвраты на переделку, единственный объективный след,
 * который есть в системе (см. `performance.service.ts`, там же разобрано,
 * что считается возвратом для каждой роли). У контролёра качества след свой:
 * ему в минус идёт ПРОПУЩЕННЫЙ брак — заказ, который он принял, а установку
 * потом вернули на доработку.
 *
 * СРОК — доля заказов, закрытых не позже `deadline`. Заказы без срока из
 * расчёта исключаются целиком, а не считаются просроченными: пустой дедлайн
 * означает «срок не назначали», а не «опоздали».
 */

/* -------------------------------------------------------------------------- */
/*  Контракт                                                                  */
/* -------------------------------------------------------------------------- */

/** Показатели сотрудника в одной из его ролей. */
export interface RatingRoleEntry {
  readonly role: RatedRole;
  /** Закрытых за период заказов, где сотрудник исполнял эту роль. */
  readonly ordersCount: number;
  /** Сырое значение метрики роли: выручка (в минорных), м², число заказов. */
  readonly volumeValue: number;
  /** Тот же объём после нормировки на лучший результат в роли, 0–100. */
  readonly volumeScore: number;
  readonly qualityPercent: number | null;
  readonly punctualityPercent: number | null;
  /** Балл сотрудника именно в этой роли, 0–100. */
  readonly score: number;
}

/** Строка сводного рейтинга. */
export interface RatingEntry {
  readonly userId: number;
  readonly fullName: string;
  readonly avatarStorageKey: string | null;
  /** Все роли сотрудника, включая не участвующие в конкурсе. */
  readonly roles: readonly RoleName[];
  /** Разбивка по участвующим ролям — то, из чего сложился общий балл. */
  readonly byRole: readonly RatingRoleEntry[];
  /** Закрытых заказов за период суммарно по всем ролям. */
  readonly ordersCount: number;
  /** Общий балл; `null` — сотрудник вне конкурса. */
  readonly score: number | null;
  /** Место в сводной таблице; `null` — вне конкурса. */
  readonly place: number | null;
  /** Почему сотрудник вне конкурса; `null` — участвует. */
  readonly unratedReason: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Разбор ответа драйвера                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Значение колонки в текст.
 *
 * Драйвер отдаёт `count` и `numeric` строками. Слепой `String()` над
 * `unknown` превратил бы объект в `[object Object]` и дал бы `NaN` вместо
 * ошибки — приводим только то, что действительно может прийти.
 */
const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '0';
};

const asInt = (value: unknown): number => Number.parseInt(toText(value), 10);
const asFloat = (value: unknown): number => Number.parseFloat(toText(value));

/** Процент с округлением до десятых; `null`, когда база для сравнения пуста. */
const percent = (part: unknown, total: unknown): number | null => {
  const totalCount = asInt(total);
  if (totalCount === 0) return null;
  return Math.round((asInt(part) / totalCount) * 1000) / 10;
};

/* -------------------------------------------------------------------------- */
/*  Запросы                                                                   */
/* -------------------------------------------------------------------------- */

/** Заказы, закрытые в периоде; при необходимости — одного филиала. */
const completedInPeriod = (bounds: PeriodBounds, branchId: number | undefined): SQL => {
  // Границы передаём строкой с явным приведением: драйвер не превращает
  // `Date` в параметр сырого запроса, а падает на нём (см. `sqlTimestamp`).
  const from = sql`${sqlTimestamp(bounds.start)}::timestamptz`;
  const to = sql`${sqlTimestamp(bounds.end)}::timestamptz`;

  const period = sql`o.status = ${OrderStatus.COMPLETED}
    and o.completed_at >= ${from} and o.completed_at < ${to}`;

  return branchId === undefined ? period : sql`${period} and o.branch_id = ${branchId}`;
};

/**
 * Попадание в срок — общие для всех ролей колонки.
 *
 * Дата закрытия приводится к дате в UTC, а не в часовом поясе сервера:
 * иначе один и тот же заказ считался бы просроченным или нет в зависимости
 * от настроек машины, на которой запущен API.
 */
const punctualityColumns = sql`
  count(*) filter (where o.deadline is not null) as with_deadline,
  count(*) filter (
    where o.deadline is not null
      and (o.completed_at at time zone 'UTC')::date <= o.deadline
  ) as on_time`;

/** Сырые строки одного роутинга «роль → показатели участников». */
interface RoleRow {
  readonly userId: number;
  readonly ordersCount: number;
  readonly volumeValue: number;
  readonly qualityPercent: number | null;
  readonly punctualityPercent: number | null;
}

const toRoleRow = (
  row: Record<string, unknown>,
  volume: (row: Record<string, unknown>) => number,
  quality: (row: Record<string, unknown>) => number | null,
): RoleRow => ({
  userId: asInt(row['user_id']),
  ordersCount: asInt(row['orders_count']),
  volumeValue: volume(row),
  qualityPercent: quality(row),
  punctualityPercent: percent(row['on_time'], row['with_deadline']),
});

/**
 * Показатели всех участников по каждой роли.
 *
 * Пять независимых запросов вместо одного с `union`: у каждой роли свой набор
 * боковых подзапросов по истории статусов, и объединение читалось бы хуже, а
 * планировщику всё равно пришлось бы выполнять те же пять сканов.
 */
async function collectRoleRows(
  db: Database,
  bounds: PeriodBounds,
  branchId: number | undefined,
): Promise<Record<RatedRole, RoleRow[]>> {
  const scope = completedInPeriod(bounds, branchId);

  const [sellerRows, masterRows, sewerRows, qcRows, installerRows] = await Promise.all([
    db.execute(sql`
      select o.created_by as user_id,
             count(*) as orders_count,
             coalesce(sum(o.work_price), 0) as revenue,
             ${punctualityColumns}
      from orders o
      where ${scope}
      group by o.created_by`),

    db.execute(sql`
      select o.master_id as user_id,
             count(*) as orders_count,
             count(*) filter (where redone.n = 0) as clean_orders,
             ${punctualityColumns}
      from orders o
      -- Повторный замер: вход в measurement_assigned не из приёмки,
      -- то есть откат с более позднего этапа.
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id
          and h.to_status = ${OrderStatus.MEASUREMENT_ASSIGNED}
          and h.from_status not in (${OrderStatus.PENDING_ADMIN_REVIEW}, ${OrderStatus.REJECTED_TO_CEO})
      ) redone on true
      where ${scope} and o.master_id is not null
      group by o.master_id`),

    db.execute(sql`
      select o.sewer_id as user_id,
             count(*) as orders_count,
             count(*) filter (where failed.n = 0) as clean_orders,
             coalesce(sum(area.total), 0) as area_m2,
             ${punctualityColumns}
      from orders o
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id and h.to_status = ${OrderStatus.QC_FAILED}
      ) failed on true
      left join lateral (
        select sum(oi.area_m2 * oi.quantity) as total
        from order_items oi where oi.order_id = o.id
      ) area on true
      where ${scope} and o.sewer_id is not null
      group by o.sewer_id`),

    db.execute(sql`
      select o.qc_id as user_id,
             count(*) as orders_count,
             count(*) filter (where missed.n = 0) as clean_orders,
             ${punctualityColumns}
      from orders o
      -- Пропущенный брак: контролёр принял заказ, а установку затем
      -- вернули на доработку. Возврат ПЕРЕД установкой (qc_failed) в минус
      -- контролёру не идёт — это ровно та работа, за которую он отвечает.
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id
          and h.from_status = ${OrderStatus.INSTALLATION_DONE}
          and h.to_status = ${OrderStatus.INSTALLATION_IN_PROGRESS}
      ) missed on true
      where ${scope} and o.qc_id is not null
      group by o.qc_id`),

    db.execute(sql`
      select o.installer_id as user_id,
             count(*) as orders_count,
             count(*) filter (where redone.n = 0) as clean_orders,
             ${punctualityColumns}
      from orders o
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id
          and h.from_status = ${OrderStatus.INSTALLATION_DONE}
          and h.to_status = ${OrderStatus.INSTALLATION_IN_PROGRESS}
      ) redone on true
      where ${scope} and o.installer_id is not null
      group by o.installer_id`),
  ]);

  const cleanQuality = (row: Record<string, unknown>): number | null =>
    percent(row['clean_orders'], row['orders_count']);

  return {
    // `work_price` хранится в основных единицах с двумя знаками, а деньги
    // в контракте — в минорных: приводим так же, как это делает `parseMoney`.
    seller: sellerRows.map((row) =>
      toRoleRow(row, (r) => Math.round(asFloat(r['revenue']) * 100), () => null),
    ),
    master: masterRows.map((row) => toRoleRow(row, (r) => asInt(r['orders_count']), cleanQuality)),
    sewer: sewerRows.map((row) =>
      toRoleRow(row, (r) => Math.round(asFloat(r['area_m2']) * 10) / 10, cleanQuality),
    ),
    qc: qcRows.map((row) => toRoleRow(row, (r) => asInt(r['orders_count']), cleanQuality)),
    installer: installerRows.map((row) =>
      toRoleRow(row, (r) => asInt(r['orders_count']), cleanQuality),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Сборка рейтинга                                                           */
/* -------------------------------------------------------------------------- */

/** Сотрудник, попадающий в таблицу, — приходит из `users`, а не из заказов. */
export interface RatedEmployee {
  readonly id: number;
  readonly fullName: string;
  readonly avatarStorageKey: string | null;
  readonly roles: readonly RoleName[];
}

/**
 * Сводный рейтинг за период.
 *
 * Список сотрудников приходит снаружи (из `users`), а не выводится из заказов:
 * иначе тот, кто за период не закрыл ни одного заказа, просто исчез бы из
 * таблицы, и «меня нет в рейтинге» читалось бы как ошибка системы. Он
 * присутствует с нулём и честной подписью.
 */
export async function employeeRating(
  db: Database,
  employees: readonly RatedEmployee[],
  bounds: PeriodBounds,
  branchId?: number,
): Promise<RatingEntry[]> {
  const byRole = await collectRoleRows(db, bounds, branchId);

  // Лучший объём в каждой роли — знаменатель нормировки.
  const bestVolume = new Map<RatedRole, number>(
    RATED_ROLES.map((role) => [
      role,
      byRole[role].reduce((max, row) => Math.max(max, row.volumeValue), 0),
    ]),
  );

  const rowsByUser = new Map<number, RatingRoleEntry[]>();

  for (const role of RATED_ROLES) {
    for (const row of byRole[role]) {
      const volumeScore = normalizeVolume(row.volumeValue, bestVolume.get(role) ?? 0);

      const entry: RatingRoleEntry = {
        role,
        ordersCount: row.ordersCount,
        volumeValue: row.volumeValue,
        volumeScore,
        qualityPercent: row.qualityPercent,
        punctualityPercent: row.punctualityPercent,
        score: ratingScore({
          volume: volumeScore,
          quality: row.qualityPercent,
          punctuality: row.punctualityPercent,
        }),
      };

      const existing = rowsByUser.get(row.userId);
      if (existing === undefined) rowsByUser.set(row.userId, [entry]);
      else existing.push(entry);
    }
  }

  const entries = employees.map((employee) => {
    const reason = unratedReason(employee.roles);
    // Роль могли снять после того, как заказы закрылись: показатели за период
    // остаются, но в конкурсе такой сотрудник уже не участвует.
    const roleEntries = reason === null ? (rowsByUser.get(employee.id) ?? []) : [];
    const ordersCount = roleEntries.reduce((sum, entry) => sum + entry.ordersCount, 0);

    return {
      userId: employee.id,
      fullName: employee.fullName,
      avatarStorageKey: employee.avatarStorageKey,
      roles: employee.roles,
      byRole: roleEntries,
      ordersCount,
      score: reason === null ? combineRoleScores(roleEntries) : null,
      place: null,
      unratedReason: reason,
    } satisfies RatingEntry;
  });

  return rankEntries(entries);
}

/**
 * Общий балл сотрудника, совмещающего роли.
 *
 * Средневзвешенное по числу закрытых заказов: у швеи, которая двадцать раз
 * шила и дважды выезжала на замер, балл определяется пошивом. Простое
 * среднее дало бы двум замерам тот же вес, что и двадцати пошивам.
 *
 * Ноль заказов за период — ноль баллов: сотрудник в таблице есть, но внизу.
 */
function combineRoleScores(entries: readonly RatingRoleEntry[]): number {
  const totalOrders = entries.reduce((sum, entry) => sum + entry.ordersCount, 0);
  if (totalOrders === 0) return 0;

  const weighted = entries.reduce((sum, entry) => sum + entry.score * entry.ordersCount, 0);

  return Math.round(weighted / totalOrders);
}

/**
 * Сортировка и расстановка мест.
 *
 * Вне конкурса — всегда в конце списка и без места, независимо от того, что
 * у них в `score`. Внутри конкурса при равном балле выше тот, кто закрыл
 * больше заказов; при полном равенстве — по алфавиту, чтобы порядок не
 * прыгал между запросами.
 */
function rankEntries(entries: readonly RatingEntry[]): RatingEntry[] {
  const ranked = entries
    .filter((entry) => entry.unratedReason === null)
    .sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        b.ordersCount - a.ordersCount ||
        a.fullName.localeCompare(b.fullName, 'ru'),
    );

  const unrated = entries
    .filter((entry) => entry.unratedReason !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  // Место делят только полностью неразличимые строки. Одного балла для
  // дележа мало: объём нормируется внутри роли, поэтому лидер каждой роли
  // получает ровно 100, и без второго критерия первое место делили бы
  // пятеро — по одному от каждой роли, что для соревнования бессмысленно.
  return [
    ...assignPlaces(ranked, (a, b) => a.score === b.score && a.ordersCount === b.ordersCount),
    ...unrated,
  ];
}

/* -------------------------------------------------------------------------- */
/*  Период рейтинга                                                           */
/* -------------------------------------------------------------------------- */

/** Текущий и предыдущий периоды — второй нужен, чтобы показать изменение. */
export interface RatingPeriodBounds {
  readonly scope: RatingScopeName;
  readonly current: PeriodBounds;
  readonly previous: PeriodBounds;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Понедельник недели, содержащей момент `at`, в 00:00 UTC.
 *
 * Неделя начинается с понедельника, а не с воскресенья: мастерская работает
 * по пятидневке, и воскресное начало разрезало бы рабочую неделю пополам.
 */
function weekStart(at: Date): Date {
  const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // getUTCDay(): воскресенье — 0, понедельник — 1. Сдвигаем так, чтобы
  // понедельник давал 0, а воскресенье — 6.
  const offset = (date.getUTCDay() + 6) % 7;

  return new Date(date.getTime() - offset * DAY_MS);
}

/**
 * Границы периода рейтинга и предыдущего периода для сравнения.
 *
 * Месяц берётся из запроса — руководству нужно уметь открыть прошедший.
 * Неделя всегда ТЕКУЩАЯ: она существует ради быстрой обратной связи в
 * мобильном приложении, и выбор произвольной недели в прошлом там никому
 * не нужен, а поле выбора занимало бы половину экрана.
 */
export function ratingPeriodBounds(
  scope: RatingScopeName,
  period: Period,
  now: Date = new Date(),
): RatingPeriodBounds {
  if (scope === RatingScope.WEEK) {
    const start = weekStart(now);

    return {
      scope,
      current: { start, end: new Date(start.getTime() + WEEK_MS) },
      previous: { start: new Date(start.getTime() - WEEK_MS), end: start },
    };
  }

  return {
    scope,
    current: periodBounds(period),
    previous: periodBounds(
      period.month === 1
        ? { year: period.year - 1, month: 12 }
        : { year: period.year, month: period.month - 1 },
    ),
  };
}

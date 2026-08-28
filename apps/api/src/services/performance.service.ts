import { OrderStatus } from '@curtain-crm/shared';
import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '@curtain-crm/db';

import { sqlTimestamp } from './shifts.service';

/**
 * Производительность и качество работы сотрудников.
 *
 * Всё считается по фактам, уже лежащим в базе: закрытые заказы, площадь
 * позиций и переходы статусов. Ни плана, ни оценок здесь нет — их в системе
 * не существует, и «выполнение 108 %» пришлось бы выдумать.
 *
 * КАЧЕСТВО определяется через откаты, а не через отдельную оценку: система
 * фиксирует, когда работу вернули на переделку, и это единственный
 * объективный след качества, который у неё есть.
 *  - швея: заказ вернули с контроля (`-> qc_failed`);
 *  - мастер: заказ отправили на ПОВТОРНЫЙ замер, то есть в
 *    `measurement_assigned` не из приёмки, а откатом с более поздних этапов;
 *  - установщик: установку вернули на доработку
 *    (`installation_done -> installation_in_progress`).
 * Процент — доля заказов сотрудника, по которым такого возврата не было.
 *
 * SQL здесь сырой намеренно: у каждой метрики свой боковой подзапрос по
 * истории статусов, и на конструкторе запросов Drizzle это читалось бы
 * заметно хуже, чем сам SQL.
 */

export interface PeriodBounds {
  readonly start: Date;
  readonly end: Date;
}

/** Общая часть карточки «лучший в роли». */
interface PerformerBase {
  readonly userId: number;
  readonly fullName: string;
  /** Закрытых за период заказов, где сотрудник исполнял эту роль. */
  readonly ordersCount: number;
  /**
   * Доля заказов без возврата на переделку, проценты.
   * `null`, если сравнивать не с чем — например, ни один заказ ещё не дошёл
   * до контроля качества.
   */
  readonly qualityPercent: number | null;
}

export interface SellerPerformer extends Omit<PerformerBase, 'qualityPercent'> {
  readonly revenueMinor: number;
}

export interface MasterPerformer extends PerformerBase {
  /** Среднее время от назначения замера до его выполнения, дни. */
  readonly avgMeasurementDays: number | null;
}

export interface SewerPerformer extends PerformerBase {
  /** Суммарная площадь сшитого, м². Погонных метров система не знает. */
  readonly areaM2: number;
}

export type InstallerPerformer = PerformerBase;

export interface TopPerformers {
  readonly seller: SellerPerformer | null;
  readonly master: MasterPerformer | null;
  readonly sewer: SewerPerformer | null;
  readonly installer: InstallerPerformer | null;
}

/** Заказы, закрытые в периоде; при необходимости — одного филиала. */
const completedInPeriod = (bounds: PeriodBounds, branchId: number | undefined): SQL => {
  // Границы передаём строкой с явным приведением: драйвер не превращает
  // `Date` в параметр сырого запроса, а падает на нём.
  const from = sql`${sqlTimestamp(bounds.start)}::timestamptz`;
  const to = sql`${sqlTimestamp(bounds.end)}::timestamptz`;

  const period = sql`o.status = ${OrderStatus.COMPLETED}
    and o.completed_at >= ${from} and o.completed_at < ${to}`;

  return branchId === undefined ? period : sql`${period} and o.branch_id = ${branchId}`;
};

/**
 * Значение колонки в текст.
 *
 * Драйвер отдаёт `count` и `numeric` строками, а `avg` — либо строкой,
 * либо `null`. Приводим только то, что действительно может прийти:
 * слепой `String()` над `unknown` превратил бы объект в `[object Object]`
 * и дал бы `NaN` вместо ошибки.
 */
const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '0';
};

const asInt = (value: unknown): number => Number.parseInt(toText(value), 10);
const asFloat = (value: unknown): number => Number.parseFloat(toText(value));

/** Процент качества с округлением до десятых; `null`, когда заказов нет. */
const quality = (clean: unknown, total: unknown): number | null => {
  const totalCount = asInt(total);
  if (totalCount === 0) return null;
  return Math.round((asInt(clean) / totalCount) * 1000) / 10;
};

export async function topPerformers(
  db: Database,
  bounds: PeriodBounds,
  branchId?: number,
): Promise<TopPerformers> {
  const scope = completedInPeriod(bounds, branchId);

  const [sellerRows, masterRows, sewerRows, installerRows] = await Promise.all([
    db.execute(sql`
      select u.id, u.full_name,
             count(*) as orders_count,
             coalesce(sum(o.work_price), 0) as revenue
      from orders o
      join users u on u.id = o.created_by
      where ${scope}
      group by u.id, u.full_name
      order by revenue desc, orders_count desc
      limit 1`),

    db.execute(sql`
      select u.id, u.full_name,
             count(*) as orders_count,
             count(*) filter (where redone.n = 0) as clean_orders,
             avg(spent.days) as avg_days
      from orders o
      join users u on u.id = o.master_id
      -- Повторный замер: вход в measurement_assigned не из приёмки,
      -- то есть откат с более позднего этапа.
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id
          and h.to_status = ${OrderStatus.MEASUREMENT_ASSIGNED}
          and h.from_status not in (${OrderStatus.PENDING_ADMIN_REVIEW}, ${OrderStatus.REJECTED_TO_CEO})
      ) redone on true
      left join lateral (
        select extract(epoch from (done.created_at - assigned.created_at)) / 86400 as days
        from order_status_history assigned
        join order_status_history done
          on done.order_id = assigned.order_id
         and done.to_status = ${OrderStatus.MEASUREMENT_DONE}
         and done.created_at >= assigned.created_at
        where assigned.order_id = o.id
          and assigned.to_status = ${OrderStatus.MEASUREMENT_ASSIGNED}
        order by assigned.created_at
        limit 1
      ) spent on true
      where ${scope}
      group by u.id, u.full_name
      order by orders_count desc
      limit 1`),

    db.execute(sql`
      select u.id, u.full_name,
             count(*) as orders_count,
             count(*) filter (where failed.n = 0) as clean_orders,
             coalesce(sum(area.total), 0) as area_m2
      from orders o
      join users u on u.id = o.sewer_id
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id and h.to_status = ${OrderStatus.QC_FAILED}
      ) failed on true
      left join lateral (
        select sum(oi.area_m2 * oi.quantity) as total
        from order_items oi where oi.order_id = o.id
      ) area on true
      where ${scope}
      group by u.id, u.full_name
      order by area_m2 desc, orders_count desc
      limit 1`),

    db.execute(sql`
      select u.id, u.full_name,
             count(*) as orders_count,
             count(*) filter (where redone.n = 0) as clean_orders
      from orders o
      join users u on u.id = o.installer_id
      -- Возврат установки на доработку.
      left join lateral (
        select count(*) as n from order_status_history h
        where h.order_id = o.id
          and h.from_status = ${OrderStatus.INSTALLATION_DONE}
          and h.to_status = ${OrderStatus.INSTALLATION_IN_PROGRESS}
      ) redone on true
      where ${scope}
      group by u.id, u.full_name
      order by orders_count desc
      limit 1`),
  ]);

  const seller = sellerRows[0];
  const master = masterRows[0];
  const sewer = sewerRows[0];
  const installer = installerRows[0];

  return {
    seller:
      seller === undefined
        ? null
        : {
            userId: asInt(seller['id']),
            fullName: toText(seller['full_name']),
            ordersCount: asInt(seller['orders_count']),
            // `work_price` хранится в основных единицах с двумя знаками,
            // а деньги в контракте — в минорных: приводим так же, как
            // это делает `parseMoney` для строк из БД.
            revenueMinor: Math.round(asFloat(seller['revenue']) * 100),
          },

    master:
      master === undefined
        ? null
        : {
            userId: asInt(master['id']),
            fullName: toText(master['full_name']),
            ordersCount: asInt(master['orders_count']),
            qualityPercent: quality(master['clean_orders'], master['orders_count']),
            avgMeasurementDays:
              master['avg_days'] === null || master['avg_days'] === undefined
                ? null
                : Math.round(asFloat(master['avg_days']) * 10) / 10,
          },

    sewer:
      sewer === undefined
        ? null
        : {
            userId: asInt(sewer['id']),
            fullName: toText(sewer['full_name']),
            ordersCount: asInt(sewer['orders_count']),
            qualityPercent: quality(sewer['clean_orders'], sewer['orders_count']),
            areaM2: Math.round(asFloat(sewer['area_m2']) * 10) / 10,
          },

    installer:
      installer === undefined
        ? null
        : {
            userId: asInt(installer['id']),
            fullName: toText(installer['full_name']),
            ordersCount: asInt(installer['orders_count']),
            qualityPercent: quality(installer['clean_orders'], installer['orders_count']),
          },
  };
}

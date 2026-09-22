import { users, type Database } from '@curtain-crm/db';
import {
  PAYMENT_INCOME_KINDS,
  PAYMENT_METHODS,
  PaymentKind,
  Role,
  RatingScope,
  type MoneyMinor,
  type PaymentMethod as PaymentMethodName,
  type PayrollSchemeType as PayrollSchemeTypeName,
  type Role as RoleName,
  type SewerCategory,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';

import { calculateForUserRole, payableRoles, type PayrollLine } from './payroll.service';
import { employeeRating, ratingPeriodBounds, type RatedEmployee } from './rating.service';
import { sewerCategories } from './sewerCategory.service';
import { periodBounds, sqlTimestamp, type Period } from './shifts.service';

/**
 * Отчёты «более детально» — четыре, которые попросил владелец: касса по
 * дням и способам оплаты, зарплата «из чего сложилась», сроки и переделки,
 * выработка швей. Всё считается здесь агрегатами; панель только рисует и
 * выгружает в Excel.
 */

/** Значение сырого запроса — строкой: `numeric` приходит текстом, `count` — числом. */
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? value.toString() : '');
const optionalText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const money = (value: unknown): MoneyMinor => Math.round(Number.parseFloat(text(value) || '0') * 100) || 0;
const int = (value: unknown): number => Number.parseInt(text(value) || '0', 10) || 0;
const emptyByMethod = (): Record<PaymentMethodName, MoneyMinor> =>
  Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<PaymentMethodName, MoneyMinor>;

/* -------------------------------------------------------------------------- */
/*  Касса по дням                                                             */
/* -------------------------------------------------------------------------- */

export interface CashDayRow {
  readonly day: string;
  readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
  readonly total: MoneyMinor;
  readonly refunds: MoneyMinor;
  /** Сколько приходов было в этот день — из него считается средний чек. */
  readonly count: number;
}

export interface CashSellerRow {
  readonly userId: number;
  readonly fullName: string;
  readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
  readonly total: MoneyMinor;
}

/** Приход по дням и способам оплаты, и то же по продавцам — за отрезок дат. */
export async function cashByDay(
  db: Database,
  range: { readonly from: Date; readonly to: Date },
  branchId: number | undefined,
): Promise<{ days: CashDayRow[]; bySeller: CashSellerRow[]; totals: CashDayRow }> {
  const from = sql`${sqlTimestamp(range.from)}::timestamptz`;
  const to = sql`${sqlTimestamp(range.to)}::timestamptz`;
  const branch = branchId === undefined ? sql`` : sql`and p.branch_id = ${branchId}`;
  const income = sql.join(PAYMENT_INCOME_KINDS.map((kind) => sql`${kind}`), sql`, `);

  const [byDay, bySeller] = await Promise.all([
    db.execute(sql`
      select (p.received_at at time zone 'Asia/Tashkent')::date::text as day, p.method,
             coalesce(sum(p.amount) filter (where p.kind in (${income})), 0) as income,
             coalesce(sum(p.amount) filter (where p.kind = ${PaymentKind.REFUND}), 0) as refunds,
             count(*) filter (where p.kind in (${income})) as n
      from payments p
      where not p.opening and p.received_at >= ${from} and p.received_at < ${to} ${branch}
        and (p.kind in (${income}) or p.kind = ${PaymentKind.REFUND})
      group by 1, 2 order by 1`),
    db.execute(sql`
      select p.received_by as user_id, u.full_name, p.method, coalesce(sum(p.amount), 0) as income
      from payments p join users u on u.id = p.received_by
      where not p.opening and p.kind in (${income})
        and p.received_at >= ${from} and p.received_at < ${to} ${branch}
      group by 1, 2, 3`),
  ]);

  const days = new Map<string, { byMethod: Record<PaymentMethodName, MoneyMinor>; refunds: MoneyMinor; count: number }>();
  for (const row of byDay as Iterable<Record<string, unknown>>) {
    const day = text(row['day']);
    const entry = days.get(day) ?? { byMethod: emptyByMethod(), refunds: 0, count: 0 };
    entry.byMethod[text(row['method']) as PaymentMethodName] += money(row['income']);
    entry.refunds += money(row['refunds']);
    entry.count += int(row['n']);
    days.set(day, entry);
  }

  const sellers = new Map<number, { fullName: string; byMethod: Record<PaymentMethodName, MoneyMinor> }>();
  for (const row of bySeller as Iterable<Record<string, unknown>>) {
    const userId = int(row['user_id']);
    const entry = sellers.get(userId) ?? { fullName: text(row['full_name']), byMethod: emptyByMethod() };
    entry.byMethod[text(row['method']) as PaymentMethodName] += money(row['income']);
    sellers.set(userId, entry);
  }

  const sum = (byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>): MoneyMinor =>
    PAYMENT_METHODS.reduce((total, method) => total + byMethod[method], 0);
  const totals = { byMethod: emptyByMethod(), refunds: 0, count: 0 };
  const dayRows = [...days.entries()].map(([day, entry]) => {
    for (const method of PAYMENT_METHODS) totals.byMethod[method] += entry.byMethod[method];
    totals.refunds += entry.refunds;
    totals.count += entry.count;
    return { day, byMethod: entry.byMethod, total: sum(entry.byMethod), refunds: entry.refunds, count: entry.count };
  });

  return {
    days: dayRows,
    bySeller: [...sellers.entries()]
      .map(([userId, entry]) => ({ userId, fullName: entry.fullName, byMethod: entry.byMethod, total: sum(entry.byMethod) }))
      .sort((a, b) => b.total - a.total),
    totals: { day: '', byMethod: totals.byMethod, total: sum(totals.byMethod), refunds: totals.refunds, count: totals.count },
  };
}

/* -------------------------------------------------------------------------- */
/*  Зарплата: из чего сложилась                                               */
/* -------------------------------------------------------------------------- */

export interface PayrollBreakdownRow {
  readonly userId: number;
  readonly fullName: string;
  readonly role: RoleName;
  /** `null` — условий оплаты в этой роли нет: считать нечего. */
  readonly schemeType: PayrollSchemeTypeName | null;
  readonly amount: MoneyMinor;
  readonly lines: readonly PayrollLine[];
  readonly workedHours: number;
  readonly completedOrders: number;
  readonly stageFeesAmount: MoneyMinor;
  /** Баллы дисциплины за месяц — рядом с суммой: владелец связал их с оплатой через категорию. */
  readonly disciplinePoints: number;
  readonly sewerCategory: SewerCategory | null;
  readonly problem: string | null;
}

async function activeEmployees(db: Database): Promise<RatedEmployee[]> {
  const rows = await db.query.users.findMany({
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

/** По каждому сотруднику и роли: сумма, её строки, часы, заказы, дисциплина, категория. */
export async function payrollBreakdown(db: Database, period: Period): Promise<PayrollBreakdownRow[]> {
  const employees = await activeEmployees(db);
  const bounds = ratingPeriodBounds(RatingScope.MONTH, period).current;
  const [rating, categories] = await Promise.all([employeeRating(db, employees, bounds), sewerCategories(db, employees, period)]);
  const disciplineOf = new Map(rating.map((entry) => [entry.userId, entry.disciplinePoints]));
  const categoryOf = new Map(categories.map((row) => [row.userId, row.category]));

  const rows: PayrollBreakdownRow[] = [];
  for (const employee of employees) {
    for (const role of payableRoles(employee.roles)) {
      const base = {
        userId: employee.id,
        fullName: employee.fullName,
        role,
        disciplinePoints: disciplineOf.get(employee.id) ?? 0,
        sewerCategory: role === Role.SEWER ? (categoryOf.get(employee.id) ?? null) : null,
      };
      try {
        const result = await calculateForUserRole(db, employee.id, role, period);
        rows.push({
          ...base,
          schemeType: result.snapshot.type,
          amount: result.calculation.amount,
          lines: result.calculation.breakdown,
          workedHours: result.snapshot.inputs.workedHours,
          completedOrders: result.snapshot.inputs.completedOrders,
          stageFeesAmount: money(result.snapshot.inputs.stageFeesAmount),
          problem: null,
        });
      } catch (error) {
        // Нет схемы или она настроена криво — строка остаётся, с причиной:
        // отчёт «из чего сложилась» обязан показать и то, из чего не сложилось.
        rows.push({
          ...base,
          schemeType: null,
          amount: 0,
          lines: [],
          workedHours: 0,
          completedOrders: 0,
          stageFeesAmount: 0,
          problem: error instanceof TRPCError ? error.message : 'Ошибка расчёта',
        });
      }
    }
  }
  return rows.sort((a, b) => b.amount - a.amount || a.fullName.localeCompare(b.fullName, 'ru'));
}

/* -------------------------------------------------------------------------- */
/*  Сроки и переделки                                                          */
/* -------------------------------------------------------------------------- */

export interface LateOrderRow {
  readonly id: number;
  readonly orderNumber: string | null;
  readonly clientName: string;
  readonly deadline: string;
  readonly completedAt: Date;
  readonly lateDays: number;
  readonly sewerName: string | null;
  readonly installerName: string | null;
}

export interface ReworkBySewerRow {
  readonly userId: number;
  readonly fullName: string;
  readonly sewn: number;
  readonly reworks: number;
  readonly late: number;
}

/** Закрытые за месяц заказы: в срок и с опозданием; возвраты на переделку — по швеям. */
export async function deadlinesReport(
  db: Database,
  period: Period,
  branchId: number | undefined,
): Promise<{
  completed: number;
  onTime: number;
  late: number;
  withoutDeadline: number;
  avgLateDays: number | null;
  reworks: number;
  lateOrders: LateOrderRow[];
  bySewer: ReworkBySewerRow[];
}> {
  const bounds = periodBounds(period);
  const from = sql`${sqlTimestamp(bounds.start)}::timestamptz`;
  const to = sql`${sqlTimestamp(bounds.end)}::timestamptz`;
  const branch = branchId === undefined ? sql`` : sql`and o.branch_id = ${branchId}`;
  const lateDays = sql`(o.completed_at at time zone 'Asia/Tashkent')::date - o.deadline`;

  const [[summary], lateRows, [reworkTotal], sewerRows] = await Promise.all([
    db.execute(sql`
      select count(*) as completed,
             count(*) filter (where o.deadline is null) as without_deadline,
             count(*) filter (where o.deadline is not null and ${lateDays} <= 0) as on_time,
             count(*) filter (where o.deadline is not null and ${lateDays} > 0) as late,
             avg(${lateDays}) filter (where o.deadline is not null and ${lateDays} > 0) as avg_late
      from orders o
      where o.status = 'completed' and o.completed_at >= ${from} and o.completed_at < ${to} ${branch}`),
    db.execute(sql`
      select o.id, o.order_number, o.client_name, o.deadline::text as deadline, o.completed_at,
             ${lateDays} as late_days, s.full_name as sewer_name, i.full_name as installer_name
      from orders o
      left join users s on s.id = o.sewer_id
      left join users i on i.id = o.installer_id
      where o.status = 'completed' and o.completed_at >= ${from} and o.completed_at < ${to} ${branch}
        and o.deadline is not null and ${lateDays} > 0
      order by late_days desc limit 200`),
    db.execute(sql`
      select count(*) as n from order_status_history h join orders o on o.id = h.order_id
      where h.to_status = 'qc_failed' and h.created_at >= ${from} and h.created_at < ${to} ${branch}`),
    // По швеям: сшито (пошив завершён в месяце), возвратов на переделку, закрыто с опозданием.
    db.execute(sql`
      select u.id as user_id, u.full_name,
             (select count(distinct h.order_id) from order_status_history h join orders o on o.id = h.order_id
               where o.sewer_id = u.id and h.to_status = 'sewing_done'
                 and h.created_at >= ${from} and h.created_at < ${to} ${branch}) as sewn,
             (select count(*) from order_status_history h join orders o on o.id = h.order_id
               where o.sewer_id = u.id and h.to_status = 'qc_failed'
                 and h.created_at >= ${from} and h.created_at < ${to} ${branch}) as reworks,
             (select count(*) from orders o
               where o.sewer_id = u.id and o.status = 'completed' and o.deadline is not null
                 and o.completed_at >= ${from} and o.completed_at < ${to} and ${lateDays} > 0 ${branch}) as late
      from users u join user_roles r on r.user_id = u.id and r.role = 'sewer'
      where u.is_active = true
      order by u.full_name`),
  ]);

  const s: Record<string, unknown> = summary ?? {};
  return {
    completed: int(s['completed']),
    onTime: int(s['on_time']),
    late: int(s['late']),
    withoutDeadline: int(s['without_deadline']),
    avgLateDays: text(s['avg_late']) === '' ? null : Math.round(Number.parseFloat(text(s['avg_late'])) * 10) / 10,
    reworks: int(reworkTotal?.['n']),
    lateOrders: [...(lateRows as Iterable<Record<string, unknown>>)].map((row) => ({
      id: int(row['id']),
      orderNumber: optionalText(row['order_number']),
      clientName: text(row['client_name']),
      deadline: text(row['deadline']),
      completedAt: row['completed_at'] instanceof Date ? row['completed_at'] : new Date(text(row['completed_at'])),
      lateDays: int(row['late_days']),
      sewerName: optionalText(row['sewer_name']),
      installerName: optionalText(row['installer_name']),
    })),
    bySewer: [...(sewerRows as Iterable<Record<string, unknown>>)]
      .map((row) => ({
        userId: int(row['user_id']),
        fullName: text(row['full_name']),
        sewn: int(row['sewn']),
        reworks: int(row['reworks']),
        late: int(row['late']),
      }))
      .filter((row) => row.sewn + row.reworks + row.late > 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  Швеи: выработка и категория                                                */
/* -------------------------------------------------------------------------- */

export interface SewerOutputRow {
  readonly userId: number;
  readonly fullName: string;
  readonly ordersCount: number;
  readonly areaM2: number;
  readonly qualityPercent: number | null;
  readonly punctualityPercent: number | null;
  readonly score: number | null;
  readonly disciplinePoints: number;
  readonly category: SewerCategory | null;
}

const HISTORY_MONTHS = 6;

/** Швеи за месяц — те же цифры, что в рейтинге, плюс категория; и динамика за полгода. */
export async function sewerOutput(
  db: Database,
  period: Period,
): Promise<{ rows: SewerOutputRow[]; history: { period: Period; rows: { userId: number; ordersCount: number; areaM2: number }[] }[] }> {
  const employees = (await activeEmployees(db)).filter((employee) => employee.roles.includes(Role.SEWER));
  const monthOf = (offset: number): Period => {
    const date = new Date(Date.UTC(period.year, period.month - 1 - offset, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  };
  const sewerRole = (entry: Awaited<ReturnType<typeof employeeRating>>[number]) =>
    entry.byRole.find((role) => role.role === Role.SEWER);

  const [current, categories, ...past] = await Promise.all([
    employeeRating(db, employees, periodBounds(period)),
    sewerCategories(db, employees, period),
    ...Array.from({ length: HISTORY_MONTHS - 1 }, (_, index) => employeeRating(db, employees, periodBounds(monthOf(index + 1)))),
  ]);
  const categoryOf = new Map(categories.map((row) => [row.userId, row.category]));

  const rows = current
    .map((entry) => {
      const role = sewerRole(entry);
      return {
        userId: entry.userId,
        fullName: entry.fullName,
        ordersCount: role?.ordersCount ?? 0,
        areaM2: role?.volumeValue ?? 0,
        qualityPercent: role?.qualityPercent ?? null,
        punctualityPercent: role?.punctualityPercent ?? null,
        score: entry.score,
        disciplinePoints: entry.disciplinePoints,
        category: categoryOf.get(entry.userId) ?? null,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.fullName.localeCompare(b.fullName, 'ru'));

  const history = [current, ...past].map((entries, index) => ({
    period: monthOf(index),
    rows: entries.map((entry) => {
      const role = sewerRole(entry);
      return { userId: entry.userId, ordersCount: role?.ordersCount ?? 0, areaM2: role?.volumeValue ?? 0 };
    }),
  }));

  return { rows, history };
}

import { orders, payments, purchases, users, type DbExecutor } from '@curtain-crm/db';
import {
  CASHLESS_METHODS,
  moneyToDecimalString,
  PAYMENT_INCOME_KINDS,
  PAYMENT_METHODS,
  parseMoney,
  PaymentKind,
  PaymentMethod,
  type MoneyMinor,
  type PaymentIncomeKind,
  type PaymentKind as PaymentKindName,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { and, desc, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';

import { sqlTimestamp } from './shifts.service';
import { getStorage } from './storage.service';

/**
 * Книга проводок — единственное место, которое знает, как движутся деньги.
 *
 * Снаружи четыре вопроса: записать движение (`post`), сколько на руках у
 * человека (`onHands`), что в кассе и на счёте (`balance`), что было за
 * период (`dayReport`, `entries`). Всё, что раньше считали заказ, зарплата,
 * терминальные чеки и инкассация каждый по-своему, теперь считается здесь
 * и только здесь — из одной таблицы `payments`.
 *
 * Знак движения задаёт вид (`kind`):
 *   приход — `order_deposit`, `order_balance`, `ready_made`, `other`;
 *   перекладывание с рук в кассу — `collection`;
 *   расход — `payroll`, `refund`.
 * Закупки — не проводки, а документы (`purchases`); касса читает их как
 * расход наличными напрямую. Способа оплаты у закупки нет.
 *
 * Деньги наличными проходят через руки того, кто их принял: до инкассации
 * они «на руках», у руководства — сразу в кассе. Безнал (карта, QR, Click)
 * через руки не проходит — он «на счёте».
 */

/* -------------------------------------------------------------------------- */
/*                                   Запись                                   */
/* -------------------------------------------------------------------------- */

export interface LedgerPost {
  readonly branchId: number;
  readonly kind: PaymentKindName;
  readonly method: PaymentMethodName;
  /** В минорных единицах, строго больше нуля; знак задаёт `kind`. */
  readonly amount: MoneyMinor;
  /** Чьи руки: принял, сдал, выдал. */
  readonly actorId: number;
  readonly orderId?: number | null;
  readonly retailSaleId?: number | null;
  readonly payrollRecordId?: number | null;
  /** У выплат — за какой день. */
  readonly day?: string | null;
  readonly photoKey?: string | null;
  readonly comment?: string | null;
  readonly at?: Date;
}

/**
 * Записать движение. Ноль и меньше — не движение: молча пропускается, чтобы
 * «предоплата 0» при создании заказа не рождала пустых строк.
 *
 * Инварианты формы (выплата ↔ расчёт, день только у выплат, инкассация только
 * наличными, сумма > 0) держит база; здесь — только то, чего ей не видно.
 */
export async function post(executor: DbExecutor, entry: LedgerPost): Promise<number | null> {
  if (entry.amount <= 0) return null;

  const [row] = await executor
    .insert(payments)
    .values({
      branchId: entry.branchId,
      kind: entry.kind,
      method: entry.method,
      amount: moneyToDecimalString(entry.amount),
      orderId: entry.orderId ?? null,
      retailSaleId: entry.retailSaleId ?? null,
      payrollRecordId: entry.payrollRecordId ?? null,
      day: entry.day ?? null,
      photoKey: entry.photoKey ?? null,
      comment: entry.comment ?? null,
      receivedBy: entry.actorId,
      ...(entry.at === undefined ? {} : { receivedAt: entry.at }),
    })
    .returning({ id: payments.id });

  return row?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*                                   Чтение                                   */
/* -------------------------------------------------------------------------- */

/** Значение сырого запроса — строкой: `numeric` приходит текстом, `count` — числом. */
const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '0';
};

const money = (value: unknown): MoneyMinor => parseMoney(toText(value));

const list = (values: readonly (string | number)[]): SQL =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

const INCOME = list(PAYMENT_INCOME_KINDS);
const CASHLESS = list(CASHLESS_METHODS);

/** Оплачено по заказу — та же формула, что в триггере `orders_sync_paid_amount`. */
export async function orderPaid(executor: DbExecutor, orderId: number): Promise<MoneyMinor> {
  const [row] = await executor.execute(sql`
    select coalesce(sum(case when p.kind = ${PaymentKind.REFUND} then -p.amount else p.amount end), 0) as paid
    from ${payments} p
    where p.order_id = ${orderId} and p.kind in (${INCOME}, ${PaymentKind.REFUND})`);
  return money(row?.['paid']);
}

/**
 * Наличные на руках: принял от клиентов − сдал в кассу − вернул клиентам
 * наличными. Ниже нуля не бывает: сдать больше, чем принял, книга не даёт.
 */
export async function onHands(executor: DbExecutor, userId: number): Promise<MoneyMinor> {
  const [row] = await executor.execute(sql`
    select coalesce(sum(case
      when p.kind in (${INCOME}) then p.amount
      when p.kind in (${PaymentKind.COLLECTION}, ${PaymentKind.REFUND}) then -p.amount
      else 0 end), 0) as on_hands
    from ${payments} p
    where p.received_by = ${userId} and p.method = ${PaymentMethod.CASH} and not p.opening`);
  return Math.max(0, money(row?.['on_hands']));
}

/** У кого что на руках — только те, у кого больше нуля; руководство исключается снаружи. */
export async function onHandsByUser(
  executor: DbExecutor,
  excludeUserIds: readonly number[] = [],
): Promise<readonly { userId: number; fullName: string; onHands: MoneyMinor }[]> {
  const exclude = excludeUserIds.length === 0 ? sql`` : sql`and u.id not in (${list(excludeUserIds)})`;
  const rows = await executor.execute(sql`
    select u.id as user_id, u.full_name,
      coalesce((select sum(case
          when p.kind in (${INCOME}) then p.amount
          when p.kind in (${PaymentKind.COLLECTION}, ${PaymentKind.REFUND}) then -p.amount
          else 0 end)
        from ${payments} p
        where p.received_by = u.id and p.method = ${PaymentMethod.CASH} and not p.opening), 0) as on_hands
    from ${users} u
    where u.is_active = true ${exclude}
    order by on_hands desc`);

  return [...(rows as Iterable<Record<string, unknown>>)]
    .map((row) => ({
      userId: Number.parseInt(toText(row['user_id']), 10),
      fullName: toText(row['full_name']),
      onHands: money(row['on_hands']),
    }))
    .filter((row) => row.onHands > 0);
}

export interface LedgerBalance {
  /** День первого движения через книгу (`YYYY-MM-DD`) — с него отсчёт; `null` — движений не было. */
  readonly since: string | null;
  /** Наличные в ящике и из чего они сложились. */
  readonly cash: {
    readonly collected: MoneyMinor;
    readonly byManagement: MoneyMinor;
    readonly payroll: MoneyMinor;
    readonly purchases: MoneyMinor;
    readonly refunds: MoneyMinor;
    readonly total: MoneyMinor;
  };
  /** На счёте: безналичные приходы минус безналичные возвраты, по способам. */
  readonly cashless: Readonly<Record<PaymentMethodName, MoneyMinor>> & { readonly total: MoneyMinor };
}

/**
 * Что в кассе и на счёте на момент `at` — накопленным итогом.
 *
 * Отсчёт — с первого движения через книгу: закупки и зарплата велись и до
 * того, как касса переехала сюда, и без этой границы остаток начинался бы с
 * минуса в миллионы — долгом, которого нет.
 *
 * Наличные руководства — в кассе сразу (у него нет «на руках»); наличные
 * остальных попадают в кассу инкассацией. Возврат наличными уменьшает
 * кассу, если возвращало руководство, и «на руках», если сотрудник.
 */
export async function balance(
  executor: DbExecutor,
  input: {
    readonly at: Date;
    readonly branchId?: number | undefined;
    /** Кто считается кассой. */
    readonly managementIds: readonly number[];
  },
): Promise<LedgerBalance> {
  const to = sql`${sqlTimestamp(input.at)}::timestamptz`;
  const branch = input.branchId === undefined ? sql`` : sql`and p.branch_id = ${input.branchId}`;
  const purchaseBranch = input.branchId === undefined ? sql`` : sql`and o.branch_id = ${input.branchId}`;
  const managers = input.managementIds.length === 0 ? sql`null` : list(input.managementIds);

  const emptyCashless = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<
    PaymentMethodName,
    MoneyMinor
  >;

  const [first] = await executor.execute(sql`
    select min(p.received_at) as since from ${payments} p
    where not p.opening and (
         p.kind = ${PaymentKind.COLLECTION}
      or (p.method = ${PaymentMethod.CASH} and p.received_by in (${managers}))
      or p.method in (${CASHLESS}))`);
  const sinceRaw = first?.['since'];
  if (typeof sinceRaw !== 'string' && !(sinceRaw instanceof Date)) {
    return {
      since: null,
      cash: { collected: 0, byManagement: 0, payroll: 0, purchases: 0, refunds: 0, total: 0 },
      cashless: { ...emptyCashless, total: 0 },
    };
  }
  const sinceAt = new Date(sinceRaw);
  const since = sql`${sqlTimestamp(sinceAt)}::timestamptz`;

  const [cash] = await executor.execute(sql`
    select
      coalesce(sum(case when p.kind = ${PaymentKind.COLLECTION} then p.amount end), 0) as collected,
      coalesce(sum(case when p.kind in (${INCOME}) and p.method = ${PaymentMethod.CASH}
                          and p.received_by in (${managers}) then p.amount end), 0) as by_management,
      coalesce(sum(case when p.kind = ${PaymentKind.PAYROLL} and p.method = ${PaymentMethod.CASH} then p.amount end), 0) as payroll,
      coalesce(sum(case when p.kind = ${PaymentKind.REFUND} and p.method = ${PaymentMethod.CASH}
                          and p.received_by in (${managers}) then p.amount end), 0) as refunds
    from ${payments} p
    where not p.opening and p.received_at >= ${since} and p.received_at < ${to} ${branch}`);
  const [bought] = await executor.execute(sql`
    select coalesce(sum(pu.total_price), 0) as amount
    from ${purchases} pu join ${orders} o on o.id = pu.order_id
    where pu.created_at >= ${since} and pu.created_at < ${to} ${purchaseBranch}`);

  const cashless = { ...emptyCashless };
  const cells = await executor.execute(sql`
    select p.method,
      coalesce(sum(case when p.kind in (${INCOME}) then p.amount
                        when p.kind = ${PaymentKind.REFUND} then -p.amount else 0 end), 0) as amount
    from ${payments} p
    where not p.opening and p.method in (${CASHLESS}) and p.received_at < ${to} ${branch}
    group by p.method`);
  for (const cell of cells as Iterable<Record<string, unknown>>) {
    cashless[toText(cell['method']) as PaymentMethodName] = money(cell['amount']);
  }

  const parts = {
    collected: money(cash?.['collected']),
    byManagement: money(cash?.['by_management']),
    payroll: money(cash?.['payroll']),
    purchases: money(bought?.['amount']),
    refunds: money(cash?.['refunds']),
  };

  return {
    since: new Date(sinceAt.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10),
    cash: {
      ...parts,
      total: parts.collected + parts.byManagement - parts.payroll - parts.purchases - parts.refunds,
    },
    cashless: {
      ...cashless,
      total: CASHLESS_METHODS.reduce((sum, method) => sum + cashless[method], 0),
    },
  };
}

export interface DayReport {
  /** Приход: по каждому источнику — сумма по каждому способу. */
  readonly rows: readonly {
    readonly kind: PaymentIncomeKind;
    readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
    readonly total: MoneyMinor;
  }[];
  readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
  readonly total: MoneyMinor;
  /** Ушло за период. */
  readonly out: {
    readonly payroll: MoneyMinor;
    readonly purchases: MoneyMinor;
    readonly refunds: MoneyMinor;
  };
  /** Сдано инкассацией за период. */
  readonly collected: MoneyMinor;
  /** Наличные, принятые руководством за период, — в кассе сразу. */
  readonly cashByManagement: MoneyMinor;
  /** Чеков по терминалу (приходов по карте) за период — норма дня продавцов. */
  readonly terminalChecks: number;
  /** Скидок обещано по заказам, принятым за период: сколько и по скольким заказам. */
  readonly discounts: { readonly total: MoneyMinor; readonly count: number };
  /** Касса и счёт на конец периода. */
  readonly balance: LedgerBalance;
}

/** Отчёт за отрезок: матрица прихода, расходы, инкассация и остатки на конец. */
export async function dayReport(
  executor: DbExecutor,
  range: { readonly from: Date; readonly to: Date },
  branchId: number | undefined,
  managementIds: readonly number[],
): Promise<DayReport> {
  const from = sql`${sqlTimestamp(range.from)}::timestamptz`;
  const to = sql`${sqlTimestamp(range.to)}::timestamptz`;
  const branch = branchId === undefined ? sql`` : sql`and p.branch_id = ${branchId}`;
  const managers = managementIds.length === 0 ? sql`null` : list(managementIds);

  const cells = await executor.execute(sql`
    select p.kind, p.method, coalesce(sum(p.amount), 0) as amount, count(*) as n
    from ${payments} p
    where not p.opening and p.received_at >= ${from} and p.received_at < ${to} ${branch}
    group by p.kind, p.method`);

  const grid = new Map<string, MoneyMinor>();
  let terminalChecks = 0;
  const out = { payroll: 0, purchases: 0, refunds: 0 };
  let collected = 0;
  for (const cell of cells as Iterable<Record<string, unknown>>) {
    const kind = toText(cell['kind']) as PaymentKindName;
    const method = toText(cell['method']) as PaymentMethodName;
    const amount = money(cell['amount']);
    if (kind === PaymentKind.PAYROLL) out.payroll += amount;
    else if (kind === PaymentKind.REFUND) out.refunds += amount;
    else if (kind === PaymentKind.COLLECTION) collected += amount;
    else {
      grid.set(`${kind}:${method}`, amount);
      if (method === PaymentMethod.CARD) terminalChecks += Number.parseInt(toText(cell['n']), 10);
    }
  }

  const emptyByMethod = (): Record<PaymentMethodName, MoneyMinor> =>
    Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<PaymentMethodName, MoneyMinor>;
  const byMethod = emptyByMethod();
  const rows = PAYMENT_INCOME_KINDS.map((kind) => {
    const rowByMethod = emptyByMethod();
    for (const method of PAYMENT_METHODS) {
      const amount = grid.get(`${kind}:${method}`) ?? 0;
      rowByMethod[method] = amount;
      byMethod[method] += amount;
    }
    return {
      kind,
      byMethod: rowByMethod,
      total: PAYMENT_METHODS.reduce((sum, method) => sum + rowByMethod[method], 0),
    };
  });

  const purchaseBranch = branchId === undefined ? sql`` : sql`and o.branch_id = ${branchId}`;
  const [bought] = await executor.execute(sql`
    select coalesce(sum(pu.total_price), 0) as amount
    from ${purchases} pu join ${orders} o on o.id = pu.order_id
    where pu.created_at >= ${from} and pu.created_at < ${to} ${purchaseBranch}`);
  out.purchases = money(bought?.['amount']);

  const [byManagement] = await executor.execute(sql`
    select coalesce(sum(p.amount), 0) as amount from ${payments} p
    where not p.opening and p.kind in (${INCOME}) and p.method = ${PaymentMethod.CASH}
      and p.received_by in (${managers})
      and p.received_at >= ${from} and p.received_at < ${to} ${branch}`);

  // Скидки — по дате приёма заказа: их дают при приёме, и деньги в кассу не
  // придут именно тогда. Владелец хочет видеть это рядом с выручкой дня.
  const [discounted] = await executor.execute(sql`
    select coalesce(sum(o.discount_amount), 0) as amount, count(*) filter (where o.discount_amount > 0) as n
    from ${orders} o
    where o.created_at >= ${from} and o.created_at < ${to} ${purchaseBranch}`);

  return {
    rows,
    byMethod,
    total: PAYMENT_METHODS.reduce((sum, method) => sum + byMethod[method], 0),
    out,
    collected,
    cashByManagement: money(byManagement?.['amount']),
    terminalChecks,
    discounts: { total: money(discounted?.['amount']), count: Number.parseInt(toText(discounted?.['n']), 10) || 0 },
    balance: await balance(executor, { at: range.to, branchId, managementIds }),
  };
}

/** Сколько приходов по карте за отрезок — норма терминальных чеков. */
export async function terminalChecksCount(
  executor: DbExecutor,
  range: { readonly from: Date; readonly to: Date },
): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(payments)
    .where(
      and(
        eq(payments.method, PaymentMethod.CARD),
        eq(payments.opening, false),
        inArray(payments.kind, [...PAYMENT_INCOME_KINDS]),
        gte(payments.receivedAt, range.from),
        lt(payments.receivedAt, range.to),
      ),
    );
  return row?.count ?? 0;
}

export interface LedgerEntry {
  readonly id: number;
  readonly kind: PaymentKindName;
  readonly method: PaymentMethodName;
  readonly amount: string;
  readonly comment: string | null;
  readonly day: string | null;
  readonly receivedAt: Date;
  readonly receivedBy: number;
  readonly receivedByName: string;
  readonly orderId: number | null;
  readonly orderNumber: string | null;
  readonly clientName: string | null;
  readonly retailSaleId: number | null;
  readonly payrollRecordId: number | null;
  /** Ссылка на фото чека, если оно есть. */
  readonly photoUrl: string | null;
  /** Перенос из старого учёта: в кассе и на руках не участвует. */
  readonly opening: boolean;
}

/**
 * Строки книги по фильтру — одна выборка на все журналы: касса дня, оплаты
 * по заказу, инкассации, терминальные чеки, выплаты по расчёту.
 */
export async function entries(
  executor: DbExecutor,
  filter: {
    readonly range?: { readonly from: Date; readonly to: Date } | undefined;
    readonly branchId?: number | undefined;
    readonly kinds?: readonly PaymentKindName[] | undefined;
    readonly methods?: readonly PaymentMethodName[] | undefined;
    readonly actorId?: number | undefined;
    readonly orderId?: number | undefined;
    readonly payrollRecordId?: number | undefined;
    readonly withPhoto?: boolean | undefined;
    readonly limit?: number | undefined;
  },
): Promise<readonly LedgerEntry[]> {
  const rows = await executor
    .select({
      id: payments.id,
      kind: payments.kind,
      method: payments.method,
      amount: payments.amount,
      comment: payments.comment,
      day: payments.day,
      receivedAt: payments.receivedAt,
      receivedBy: payments.receivedBy,
      receivedByName: users.fullName,
      orderId: payments.orderId,
      orderNumber: orders.orderNumber,
      clientName: orders.clientName,
      retailSaleId: payments.retailSaleId,
      payrollRecordId: payments.payrollRecordId,
      photoKey: payments.photoKey,
      opening: payments.opening,
    })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.receivedBy))
    .leftJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        ...(filter.range === undefined
          ? []
          : [gte(payments.receivedAt, filter.range.from), lt(payments.receivedAt, filter.range.to)]),
        ...(filter.branchId === undefined ? [] : [eq(payments.branchId, filter.branchId)]),
        ...(filter.kinds === undefined ? [] : [inArray(payments.kind, [...filter.kinds])]),
        ...(filter.methods === undefined ? [] : [inArray(payments.method, [...filter.methods])]),
        ...(filter.actorId === undefined ? [] : [eq(payments.receivedBy, filter.actorId)]),
        ...(filter.orderId === undefined ? [] : [eq(payments.orderId, filter.orderId)]),
        ...(filter.payrollRecordId === undefined ? [] : [eq(payments.payrollRecordId, filter.payrollRecordId)]),
        ...(filter.withPhoto === true ? [isNotNull(payments.photoKey)] : []),
      ),
    )
    .orderBy(desc(payments.receivedAt), desc(payments.id))
    .limit(filter.limit ?? 500);

  const storage = getStorage();
  return Promise.all(
    rows.map(async ({ photoKey, ...row }) => ({
      ...row,
      photoUrl: photoKey === null ? null : await storage.getUrl(photoKey),
    })),
  );
}

/** Прикрепить фото чека к приходу по карте — второй раз приход не рождается. */
export async function attachPhoto(
  executor: DbExecutor,
  input: { readonly paymentId: number; readonly actorId: number; readonly photoKey: string },
): Promise<boolean> {
  const [row] = await executor
    .update(payments)
    .set({ photoKey: input.photoKey })
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.receivedBy, input.actorId),
        eq(payments.method, PaymentMethod.CARD),
        inArray(payments.kind, [...PAYMENT_INCOME_KINDS]),
      ),
    )
    .returning({ id: payments.id });
  return row !== undefined;
}

/** Сумма строк — для итогов журналов. */
export const sumEntries = (rows: readonly { readonly amount: string }[]): MoneyMinor =>
  rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);

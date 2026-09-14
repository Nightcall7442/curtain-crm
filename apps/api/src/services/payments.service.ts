import { cashCollections, payments, payrollRecords, purchases, users, type DbExecutor } from '@curtain-crm/db';
import {
  moneyToDecimalString,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  parseMoney,
  PaymentMethod,
  type MoneyMinor,
  type PaymentKind,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { sqlTimestamp } from './shifts.service';

/**
 * Касса.
 *
 * Приход — одна строка `payments`: кто, когда, сколько, чем и за что.
 * Наличные у продавца и установщика лежат на руках до инкассации
 * (`cash_collections`); у руководства — сразу в кассе. Отчёт дня — сетка
 * «источник × способ» плюс «в кассе»: наличные, дошедшие до ящика, минус
 * наличные ушедшие — зарплата (выплаты за период) и закупки материалов:
 * и то и другое в мастерской платят из ящика. Если это перестанет быть
 * так — сюда нужен способ у выплат и закупок, а не правка отчёта.
 */

export async function recordPayment(
  executor: DbExecutor,
  input: {
    readonly branchId: number;
    readonly kind: PaymentKind;
    readonly method: PaymentMethodName;
    readonly amount: MoneyMinor;
    readonly orderId?: number;
    readonly retailSaleId?: number;
    readonly receivedBy: number;
    readonly comment?: string | null;
  },
): Promise<void> {
  if (input.amount <= 0) return;

  await executor.insert(payments).values({
    branchId: input.branchId,
    kind: input.kind,
    method: input.method,
    amount: moneyToDecimalString(input.amount),
    orderId: input.orderId ?? null,
    retailSaleId: input.retailSaleId ?? null,
    receivedBy: input.receivedBy,
    comment: input.comment ?? null,
  });
}

/**
 * Наличные на руках у сотрудника: принято наличными минус сдано.
 *
 * За всё время, а не за период: вчерашняя несданная выручка никуда не
 * делась. Руководство в расчёт не входит — его наличные и есть касса.
 */
export async function cashOnHands(
  executor: DbExecutor,
  userId: number,
): Promise<{ received: MoneyMinor; collected: MoneyMinor; onHands: MoneyMinor }> {
  const [received] = await executor
    .select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(eq(payments.receivedBy, userId), eq(payments.method, PaymentMethod.CASH)));
  const [collected] = await executor
    .select({ amount: sql<string>`coalesce(sum(${cashCollections.amount}), 0)` })
    .from(cashCollections)
    .where(eq(cashCollections.userId, userId));

  const receivedMinor = parseMoney(received?.amount ?? '0');
  const collectedMinor = parseMoney(collected?.amount ?? '0');
  return {
    received: receivedMinor,
    collected: collectedMinor,
    onHands: Math.max(0, receivedMinor - collectedMinor),
  };
}

/** У кого сколько на руках — по всем, у кого есть остаток. */
export async function cashOnHandsByUser(
  executor: DbExecutor,
): Promise<readonly { userId: number; fullName: string; onHands: MoneyMinor }[]> {
  const rows = await executor.execute(sql`
    select u.id as user_id, u.full_name,
      coalesce((select sum(p.amount) from ${payments} p
                where p.received_by = u.id and p.method = ${PaymentMethod.CASH}), 0)
      - coalesce((select sum(c.amount) from ${cashCollections} c where c.user_id = u.id), 0)
      as on_hands
    from ${users} u
    where u.is_active = true
    order by on_hands desc`);

  return [...(rows as Iterable<Record<string, unknown>>)]
    .map((row) => ({
      userId: Number.parseInt(toText(row['user_id']), 10),
      fullName: toText(row['full_name']),
      onHands: parseMoney(toText(row['on_hands'])),
    }))
    .filter((row) => row.onHands > 0);
}

/** Инкассации за отрезок — список и сумма. */
export async function collectionsInRange(
  executor: DbExecutor,
  range: { readonly from: Date; readonly to: Date },
  userId?: number,
): Promise<{
  rows: readonly {
    id: number;
    userId: number;
    fullName: string;
    amount: string;
    comment: string | null;
    createdAt: Date;
  }[];
  total: MoneyMinor;
}> {
  const rows = await executor
    .select({
      id: cashCollections.id,
      userId: cashCollections.userId,
      fullName: users.fullName,
      amount: cashCollections.amount,
      comment: cashCollections.comment,
      createdAt: cashCollections.createdAt,
    })
    .from(cashCollections)
    .innerJoin(users, eq(users.id, cashCollections.userId))
    .where(
      and(
        gte(cashCollections.createdAt, range.from),
        lt(cashCollections.createdAt, range.to),
        ...(userId === undefined ? [] : [eq(cashCollections.userId, userId)]),
      ),
    )
    .orderBy(desc(cashCollections.createdAt))
    .limit(500);

  return { rows, total: rows.reduce((sum, row) => sum + parseMoney(row.amount), 0) };
}

export interface CashSummary {
  /** Сетка: по каждому источнику — сумма по каждому способу, в минорных. */
  readonly rows: readonly {
    readonly kind: PaymentKind;
    readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
    readonly total: MoneyMinor;
  }[];
  readonly byMethod: Readonly<Record<PaymentMethodName, MoneyMinor>>;
  readonly total: MoneyMinor;
  /** Наличные, выданные за период: зарплата и закупки. */
  readonly cashOut: { readonly payroll: MoneyMinor; readonly purchases: MoneyMinor };
  /** Сдано инкассацией за период. */
  readonly collected: MoneyMinor;
  /** Наличные, принятые самим руководством за период, — они в кассе сразу. */
  readonly cashByManagement: MoneyMinor;
  /** Наличные, дошедшие до кассы (инкассация + принятое руководством), минус ушедшие. */
  readonly inKassa: MoneyMinor;
}

/** Значение сырого запроса — строкой: `numeric` приходит текстом, `count` — числом. */
const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '0';
};

const emptyByMethod = (): Record<PaymentMethodName, MoneyMinor> =>
  Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<
    PaymentMethodName,
    MoneyMinor
  >;

export async function cashSummary(
  executor: DbExecutor,
  range: { readonly from: Date; readonly to: Date },
  branchId?: number,
  /** Кто считается кассой: наличные этих людей в ящике сразу. */
  managementIds: readonly number[] = [],
): Promise<CashSummary> {
  // Границы строкой с приведением — драйвер не принимает `Date` в сыром SQL.
  const from = sql`${sqlTimestamp(range.from)}::timestamptz`;
  const to = sql`${sqlTimestamp(range.to)}::timestamptz`;
  const branch = branchId === undefined ? sql`` : sql`and p.branch_id = ${branchId}`;

  const cells = await executor.execute(sql`
    select p.kind, p.method, coalesce(sum(p.amount), 0) as amount
    from ${payments} p
    where p.received_at >= ${from} and p.received_at < ${to} ${branch}
    group by p.kind, p.method`);

  const grid = new Map<string, MoneyMinor>();
  for (const cell of cells as Iterable<Record<string, unknown>>) {
    grid.set(`${toText(cell['kind'])}:${toText(cell['method'])}`, parseMoney(toText(cell['amount'])));
  }

  const byMethod = emptyByMethod();
  const rows = PAYMENT_KINDS.map((kind) => {
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
  const total = PAYMENT_METHODS.reduce((sum, method) => sum + byMethod[method], 0);

  /*
    Наличные ушли. Зарплата — по дате выплаты, закупки — по дате закупки.
    Филиал у выплат не хранится, поэтому при фильтре по филиалу зарплата
    считается по всей компании — честнее показать больше расхода, чем
    сделать вид, что кассу этого филиала он не трогал.
  */
  const [payroll] = await executor.execute(sql`
    select coalesce(sum(paid_amount), 0) as amount from ${payrollRecords}
    where paid_at >= ${from} and paid_at < ${to}`);
  const purchaseBranch = branchId === undefined ? sql`` : sql`and o.branch_id = ${branchId}`;
  const [bought] = await executor.execute(sql`
    select coalesce(sum(pu.total_price), 0) as amount
    from ${purchases} pu join orders o on o.id = pu.order_id
    where pu.created_at >= ${from} and pu.created_at < ${to} ${purchaseBranch}`);

  const cashOut = {
    payroll: parseMoney(toText(payroll?.['amount'])),
    purchases: parseMoney(toText(bought?.['amount'])),
  };

  // Инкассация без филиала — как зарплата: сдают в одну кассу.
  const collected = (await collectionsInRange(executor, range)).total;

  const [byManagement] =
    managementIds.length === 0
      ? [undefined]
      : await executor.execute(sql`
          select coalesce(sum(p.amount), 0) as amount from ${payments} p
          where p.method = ${PaymentMethod.CASH}
            and p.received_by in (${sql.join(managementIds.map((id) => sql`${id}`), sql`, `)})
            and p.received_at >= ${from} and p.received_at < ${to} ${branch}`);
  const cashByManagement = parseMoney(toText(byManagement?.['amount']));

  return {
    rows,
    byMethod,
    total,
    cashOut,
    collected,
    cashByManagement,
    inKassa: collected + cashByManagement - cashOut.payroll - cashOut.purchases,
  };
}

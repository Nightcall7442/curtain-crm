import { payments, payrollRecords, purchases, type DbExecutor } from '@curtain-crm/db';
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
import { sql } from 'drizzle-orm';

import { sqlTimestamp } from './shifts.service';

/**
 * Касса.
 *
 * Приход — одна строка `payments`: кто, когда, сколько, чем и за что.
 * Отчёт дня — сетка «источник × способ» из этих строк плюс «в кассе»:
 * наличные пришли минус наличные ушли. Ушедшие наличные — зарплата
 * (выплаты за период) и закупки материалов: и то и другое в мастерской
 * платят из ящика, а не с карты. Если это перестанет быть так — сюда
 * нужен способ у выплат и закупок, а не правка отчёта.
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
    /**
     * Деньги сразу в кассе — принял тот, кто у ящика (продавец, руководство),
     * или безнал. Наличные у установщика в поле сдаются отдельно.
     */
    readonly inKassa: boolean;
  },
): Promise<void> {
  if (input.amount <= 0) return;

  const settled = input.inKassa || input.method !== PaymentMethod.CASH;

  await executor.insert(payments).values({
    branchId: input.branchId,
    kind: input.kind,
    method: input.method,
    amount: moneyToDecimalString(input.amount),
    orderId: input.orderId ?? null,
    retailSaleId: input.retailSaleId ?? null,
    receivedBy: input.receivedBy,
    comment: input.comment ?? null,
    ...(settled ? { handedOverAt: new Date(), handedOverTo: input.receivedBy } : {}),
  });
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
  /** Наличные за период, ещё не сданные в кассу (у установщиков на руках). */
  readonly onHands: MoneyMinor;
  /** Наличные, дошедшие до кассы, минус наличные ушедшие. */
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

  const [pending] = await executor.execute(sql`
    select coalesce(sum(p.amount), 0) as amount from ${payments} p
    where p.method = ${PaymentMethod.CASH} and p.handed_over_at is null
      and p.received_at >= ${from} and p.received_at < ${to} ${branch}`);
  const onHands = parseMoney(toText(pending?.['amount']));

  return {
    rows,
    byMethod,
    total,
    cashOut,
    onHands,
    inKassa: byMethod[PaymentMethod.CASH] - onHands - cashOut.payroll - cashOut.purchases,
  };
}

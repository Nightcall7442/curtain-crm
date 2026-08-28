import {
  orders,
  payrollRecords,
  payrollSchemes,
  type DbExecutor,
  type PayrollScheme,
  type PayrollSchemeSnapshot,
} from '@curtain-crm/db';
import {
  moneyToDecimalString,
  multiplyMoney,
  OrderStatus,
  parseMoney,
  PayrollRecordStatus,
  PayrollSchemeType,
  percentOfMoney,
  Role,
  sumMoney,
  type MoneyMinor,
  type PayrollSchemeType as PayrollSchemeTypeName,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import {
  calculateWorkedHours,
  periodBounds,
  type Period,
  type PeriodBounds,
} from './shifts.service';

/**
 * Расчёт заработной платы.
 *
 * Устройство модуля:
 *  - на каждый тип схемы — отдельная ЧИСТАЯ функция без обращений к БД и без
 *    побочных эффектов (`calculateFixed`, `calculateHourly`, `calculateKpi`,
 *    `calculateCommission`). Они покрыты юнит-тестами;
 *  - сбор исходных данных (часы из смен, закрытые заказы) и запись результата
 *    вынесены в отдельные функции ниже.
 *
 * ПРИНЯТЫЕ ДОПУЩЕНИЯ (требуют подтверждения заказчиком):
 *  1. KPI измеряется числом заказов, ЗАКРЫТЫХ за период с участием сотрудника
 *     в данной роли. Это единственная метрика, доступная по всем ролям.
 *  2. Премия за KPI не превышает `rate` — перевыполнение плана сверх 100 %
 *     дополнительной премии не приносит.
 *  3. База для процента (`commission`) — сумма `orders.work_price` закрытых
 *     заказов, то есть выручка, а НЕ маржа за вычетом закупок.
 *  4. Заказ считается закрытым, если `completed_at` попадает в период;
 *     отменённые заказы не учитываются.
 *  5. Для админа, директора и SMM заказ не привязан к персональному участию,
 *     поэтому их KPI считается по всем закрытым за период заказам компании.
 */

/* -------------------------------------------------------------------------- */
/*                             Чистые функции                                 */
/* -------------------------------------------------------------------------- */

/** Параметры схемы, приведённые к числам приложения. */
export interface PayrollSchemeParams {
  readonly type: PayrollSchemeTypeName;
  readonly baseAmount: MoneyMinor | null;
  readonly rate: MoneyMinor | null;
  readonly kpiTarget: number | null;
  readonly commissionPercent: number | null;
}

/** Исходные данные сотрудника за период. */
export interface PayrollInputs {
  /** Отработанные часы по закрытым сменам, обрезанным границами периода. */
  readonly workedHours: number;
  /** Количество закрытых за период заказов, засчитанных сотруднику. */
  readonly completedOrders: number;
  /** Сумма работ по этим заказам. */
  readonly completedOrdersAmount: MoneyMinor;
}

export interface PayrollLine {
  readonly label: string;
  readonly amount: MoneyMinor;
}

export interface PayrollCalculation {
  readonly amount: MoneyMinor;
  /** Процент выполнения плана. Заполняется только для схемы типа `kpi`. */
  readonly kpiPercent: number | null;
  /** Расшифровка начисления — показывается сотруднику в мобильном приложении. */
  readonly breakdown: readonly PayrollLine[];
}

const missingField = (type: PayrollSchemeTypeName, field: string): TRPCError =>
  new TRPCError({
    code: 'BAD_REQUEST',
    message: `Схема «${type}» настроена некорректно: не заполнено поле «${field}»`,
  });

/** Оклад: фиксированная сумма за период. */
export function calculateFixed(scheme: PayrollSchemeParams): PayrollCalculation {
  if (scheme.baseAmount === null) throw missingField(PayrollSchemeType.FIXED, 'baseAmount');

  return {
    amount: scheme.baseAmount,
    kpiPercent: null,
    breakdown: [{ label: 'Оклад', amount: scheme.baseAmount }],
  };
}

/** Почасовая: ставка, умноженная на отработанные часы. */
export function calculateHourly(
  scheme: PayrollSchemeParams,
  inputs: PayrollInputs,
): PayrollCalculation {
  if (scheme.rate === null) throw missingField(PayrollSchemeType.HOURLY, 'rate');

  // Отрицательные часы означали бы битые данные смен; считаем как ноль,
  // а не как отрицательную зарплату.
  const hours = Math.max(0, inputs.workedHours);
  const amount = multiplyMoney(scheme.rate, hours);

  return {
    amount,
    kpiPercent: null,
    breakdown: [
      { label: `Часы: ${hours.toFixed(2)} × ставка`, amount },
    ],
  };
}

/**
 * Оклад + премия за выполнение плана.
 *
 * Премия линейна: половина плана — половина премии. Сверх 100 % премия
 * не растёт (допущение 2).
 */
export function calculateKpi(
  scheme: PayrollSchemeParams,
  inputs: PayrollInputs,
): PayrollCalculation {
  if (scheme.baseAmount === null) throw missingField(PayrollSchemeType.KPI, 'baseAmount');
  if (scheme.rate === null) throw missingField(PayrollSchemeType.KPI, 'rate');
  if (scheme.kpiTarget === null) throw missingField(PayrollSchemeType.KPI, 'kpiTarget');

  if (scheme.kpiTarget <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'План KPI должен быть больше нуля',
    });
  }

  const achievement = Math.max(0, inputs.completedOrders) / scheme.kpiTarget;
  const cappedAchievement = Math.min(1, achievement);

  const bonus = multiplyMoney(scheme.rate, cappedAchievement);
  const amount = sumMoney([scheme.baseAmount, bonus]);

  return {
    amount,
    // Показываем фактический процент, в том числе выше 100 — сотруднику важно
    // видеть перевыполнение, даже если оно не оплачивается дополнительно.
    kpiPercent: Math.round(achievement * 100 * 100) / 100,
    breakdown: [
      { label: 'Оклад', amount: scheme.baseAmount },
      {
        label: `Премия за KPI (${inputs.completedOrders.toString()} из ${scheme.kpiTarget.toString()})`,
        amount: bonus,
      },
    ],
  };
}

/** Процент от суммы закрытых заказов. */
export function calculateCommission(
  scheme: PayrollSchemeParams,
  inputs: PayrollInputs,
): PayrollCalculation {
  if (scheme.commissionPercent === null) {
    throw missingField(PayrollSchemeType.COMMISSION, 'commissionPercent');
  }

  const amount = percentOfMoney(
    Math.max(0, inputs.completedOrdersAmount),
    scheme.commissionPercent,
  );

  return {
    amount,
    kpiPercent: null,
    breakdown: [
      {
        label: `${scheme.commissionPercent.toString()} % от ${inputs.completedOrders.toString()} заказов`,
        amount,
      },
    ],
  };
}

/**
 * Диспетчер по типу схемы.
 *
 * Switch без `default`: при добавлении нового типа в
 * `PAYROLL_SCHEME_TYPES` компилятор укажет на эту функцию, и новый тип
 * не сможет молча посчитаться нулём.
 */
export function calculatePayroll(
  scheme: PayrollSchemeParams,
  inputs: PayrollInputs,
): PayrollCalculation {
  switch (scheme.type) {
    case PayrollSchemeType.FIXED:
      return calculateFixed(scheme);
    case PayrollSchemeType.HOURLY:
      return calculateHourly(scheme, inputs);
    case PayrollSchemeType.KPI:
      return calculateKpi(scheme, inputs);
    case PayrollSchemeType.COMMISSION:
      return calculateCommission(scheme, inputs);
  }
}

/** Приводит строку схемы из БД к числовым параметрам расчёта. */
export function toSchemeParams(scheme: PayrollScheme): PayrollSchemeParams {
  const toNumber = (value: string | null): number | null =>
    value === null ? null : Number.parseFloat(value);

  return {
    type: scheme.type,
    baseAmount: scheme.baseAmount === null ? null : parseMoney(scheme.baseAmount),
    rate: scheme.rate === null ? null : parseMoney(scheme.rate),
    kpiTarget: toNumber(scheme.kpiTarget),
    commissionPercent: toNumber(scheme.commissionPercent),
  };
}

/* -------------------------------------------------------------------------- */
/*                            Сбор исходных данных                            */
/* -------------------------------------------------------------------------- */

/**
 * Колонка заказа, по которой сотруднику засчитывается участие в роли.
 * Для ролей вне списка (админ, директор, SMM) персональной привязки нет —
 * см. допущение 5.
 */
const ORDER_ROLE_COLUMN = {
  seller: orders.createdBy,
  master: orders.masterId,
  sewer: orders.sewerId,
  qc: orders.qcId,
  installer: orders.installerId,
} as const satisfies Partial<Record<RoleName, unknown>>;

const hasOrderAttribution = (role: RoleName): role is keyof typeof ORDER_ROLE_COLUMN =>
  role in ORDER_ROLE_COLUMN;

/** Закрытые за период заказы, засчитанные сотруднику в данной роли. */
export async function calculateCompletedOrders(
  executor: DbExecutor,
  userId: number,
  role: RoleName,
  bounds: PeriodBounds,
): Promise<{ readonly count: number; readonly amount: MoneyMinor }> {
  const periodFilter = and(
    eq(orders.status, OrderStatus.COMPLETED),
    isNotNull(orders.completedAt),
    gte(orders.completedAt, bounds.start),
    lt(orders.completedAt, bounds.end),
  );

  const where = hasOrderAttribution(role)
    ? and(periodFilter, eq(ORDER_ROLE_COLUMN[role], userId))
    : periodFilter;

  const [row] = await executor
    .select({
      count: sql<string>`count(*)`,
      amount: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
    })
    .from(orders)
    .where(where);

  return {
    count: Number.parseInt(row?.count ?? '0', 10),
    amount: parseMoney(row?.amount ?? '0'),
  };
}

/** Собирает все исходные данные для расчёта. */
export async function gatherPayrollInputs(
  executor: DbExecutor,
  userId: number,
  role: RoleName,
  period: Period,
): Promise<PayrollInputs> {
  const bounds = periodBounds(period);

  const [workedHours, completed] = await Promise.all([
    calculateWorkedHours(executor, userId, bounds),
    calculateCompletedOrders(executor, userId, role, bounds),
  ]);

  return {
    workedHours,
    completedOrders: completed.count,
    completedOrdersAmount: completed.amount,
  };
}

/* -------------------------------------------------------------------------- */
/*                            Расчёт и сохранение                             */
/* -------------------------------------------------------------------------- */

/** Действующая схема начисления для роли. */
export async function findActiveScheme(
  executor: DbExecutor,
  role: RoleName,
): Promise<PayrollScheme> {
  const scheme = await executor.query.payrollSchemes.findFirst({
    where: and(eq(payrollSchemes.role, role), eq(payrollSchemes.isActive, true)),
  });

  if (scheme === undefined) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Для роли «${role}» не задана схема начисления зарплаты`,
    });
  }

  return scheme;
}

export interface CalculatedPayroll {
  readonly userId: number;
  readonly role: RoleName;
  readonly period: Period;
  readonly calculation: PayrollCalculation;
  readonly snapshot: PayrollSchemeSnapshot;
}

/** Считает начисление сотруднику по одной его роли за период. */
export async function calculateForUserRole(
  executor: DbExecutor,
  userId: number,
  role: RoleName,
  period: Period,
): Promise<CalculatedPayroll> {
  const scheme = await findActiveScheme(executor, role);
  const inputs = await gatherPayrollInputs(executor, userId, role, period);
  const calculation = calculatePayroll(toSchemeParams(scheme), inputs);

  return {
    userId,
    role,
    period,
    calculation,
    snapshot: {
      schemeId: scheme.id,
      role: scheme.role,
      type: scheme.type,
      baseAmount: scheme.baseAmount,
      rate: scheme.rate,
      kpiTarget: scheme.kpiTarget,
      commissionPercent: scheme.commissionPercent,
      effectiveFrom: scheme.effectiveFrom,
      inputs: {
        workedHours: inputs.workedHours,
        completedOrders: inputs.completedOrders,
        completedOrdersAmount: moneyToDecimalString(inputs.completedOrdersAmount),
      },
    },
  };
}

/**
 * Сохраняет черновик расчёта.
 *
 * Утверждённые и выплаченные записи НЕ пересчитываются: снимок параметров
 * схемы в `scheme_snapshot` существует именно для того, чтобы изменение ставок
 * не переписывало задним числом уже закрытые месяцы.
 *
 * @returns `true`, если запись создана или обновлена; `false`, если она уже
 *   утверждена и пересчёт пропущен.
 */
export async function saveDraft(
  executor: DbExecutor,
  calculated: CalculatedPayroll,
): Promise<boolean> {
  const existing = await executor.query.payrollRecords.findFirst({
    where: and(
      eq(payrollRecords.userId, calculated.userId),
      eq(payrollRecords.role, calculated.role),
      eq(payrollRecords.periodYear, calculated.period.year),
      eq(payrollRecords.periodMonth, calculated.period.month),
    ),
  });

  if (existing !== undefined && existing.status !== PayrollRecordStatus.DRAFT) return false;

  const values = {
    userId: calculated.userId,
    role: calculated.role,
    periodYear: calculated.period.year,
    periodMonth: calculated.period.month,
    schemeSnapshot: calculated.snapshot,
    calculatedAmount: moneyToDecimalString(calculated.calculation.amount),
    kpiPercent:
      calculated.calculation.kpiPercent === null
        ? null
        : calculated.calculation.kpiPercent.toFixed(2),
  };

  if (existing === undefined) {
    await executor.insert(payrollRecords).values(values);
  } else {
    await executor
      .update(payrollRecords)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(payrollRecords.id, existing.id));
  }

  return true;
}

/** Роли, по которым сотруднику начисляется зарплата. */
export function payableRoles(roles: readonly RoleName[]): readonly RoleName[] {
  // SMM пока не участвует в расчёте: функционал роли не определён,
  // и придумывать для неё метрику мы намеренно не стали.
  return roles.filter((role) => role !== Role.SMM);
}

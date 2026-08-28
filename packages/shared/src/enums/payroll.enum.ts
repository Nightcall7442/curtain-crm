import { z } from 'zod';

/**
 * Типы схем начисления зарплаты.
 *
 * Схема привязана к роли, а не к сотруднику: у мастера-замерщика может быть
 * процент от заказа, у швеи — сдельная ставка, у админа — оклад. Один сотрудник
 * с несколькими ролями получает начисление по каждой своей схеме.
 *
 * Набор обязательных полей зависит от типа — см. `payroll.service.ts`, где на
 * каждый тип написана отдельная чистая функция расчёта.
 */
export const PAYROLL_SCHEME_TYPES = ['fixed', 'hourly', 'kpi', 'commission'] as const;

export type PayrollSchemeType = (typeof PAYROLL_SCHEME_TYPES)[number];

export const PayrollSchemeType = {
  /** Оклад: `base_amount` за период целиком. */
  FIXED: 'fixed',
  /** Почасовая: `rate` * отработанные часы (из смен). */
  HOURLY: 'hourly',
  /** Оклад + премия за выполнение KPI: `base_amount` + `rate` * (факт / `kpi_target`). */
  KPI: 'kpi',
  /** Процент от суммы закрытых заказов: `commission_percent`. */
  COMMISSION: 'commission',
} as const satisfies Record<string, PayrollSchemeType>;

export const payrollSchemeTypeSchema = z.enum(PAYROLL_SCHEME_TYPES);

export const PAYROLL_SCHEME_TYPE_LABELS_RU: Readonly<Record<PayrollSchemeType, string>> = {
  fixed: 'Оклад',
  hourly: 'Почасовая',
  kpi: 'Оклад + KPI',
  commission: 'Процент от заказов',
};

/**
 * Поля схемы, обязательные для каждого типа начисления.
 * Используется и в валидации входных данных, и в проверке схемы перед расчётом.
 */
export const PAYROLL_SCHEME_REQUIRED_FIELDS: Readonly<
  Record<PayrollSchemeType, readonly ('baseAmount' | 'rate' | 'kpiTarget' | 'commissionPercent')[]>
> = {
  fixed: ['baseAmount'],
  hourly: ['rate'],
  kpi: ['baseAmount', 'rate', 'kpiTarget'],
  commission: ['commissionPercent'],
};

/* -------------------------------------------------------------------------- */

/** Статус расчёта зарплаты за период. */
export const PAYROLL_RECORD_STATUSES = ['draft', 'approved', 'paid'] as const;

export type PayrollRecordStatus = (typeof PAYROLL_RECORD_STATUSES)[number];

export const PayrollRecordStatus = {
  /** Черновик: пересчитывается автоматически, редактируется. */
  DRAFT: 'draft',
  /** Утверждён руководством: сумма зафиксирована, пересчёт запрещён. */
  APPROVED: 'approved',
  /** Выплачен. */
  PAID: 'paid',
} as const satisfies Record<string, PayrollRecordStatus>;

export const payrollRecordStatusSchema = z.enum(PAYROLL_RECORD_STATUSES);

export const PAYROLL_RECORD_STATUS_LABELS_RU: Readonly<Record<PayrollRecordStatus, string>> = {
  draft: 'Черновик',
  approved: 'Утверждён',
  paid: 'Выплачен',
};

/** Допустимые переходы статуса расчёта. Возврат из `paid` запрещён. */
export const PAYROLL_STATUS_TRANSITIONS: Readonly<
  Record<PayrollRecordStatus, readonly PayrollRecordStatus[]>
> = {
  draft: [PayrollRecordStatus.APPROVED],
  approved: [PayrollRecordStatus.PAID, PayrollRecordStatus.DRAFT],
  paid: [],
};

export function canTransitionPayrollStatus(
  from: PayrollRecordStatus,
  to: PayrollRecordStatus,
): boolean {
  return PAYROLL_STATUS_TRANSITIONS[from].includes(to);
}

/* -------------------------------------------------------------------------- */

/** Единицы измерения закупочных материалов. */
export const PURCHASE_UNITS = ['m', 'm2', 'pcs', 'set', 'kg', 'roll'] as const;

export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

export const PurchaseUnit = {
  METER: 'm',
  SQUARE_METER: 'm2',
  PIECE: 'pcs',
  SET: 'set',
  KILOGRAM: 'kg',
  ROLL: 'roll',
} as const satisfies Record<string, PurchaseUnit>;

export const purchaseUnitSchema = z.enum(PURCHASE_UNITS);

export const PURCHASE_UNIT_LABELS_RU: Readonly<Record<PurchaseUnit, string>> = {
  m: 'м',
  m2: 'м²',
  pcs: 'шт',
  set: 'компл',
  kg: 'кг',
  roll: 'рулон',
};

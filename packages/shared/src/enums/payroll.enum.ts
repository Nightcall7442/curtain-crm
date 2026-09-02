import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Типы схем начисления зарплаты.
 *
 * Схема принадлежит КОНКРЕТНОМУ сотруднику в конкретной его роли: у опытной
 * швеи ставка выше, чем у новенькой, хотя роль одна. Раньше схема была одна
 * на всю роль, и разница в опыте не выражалась вовсе.
 *
 * Роль в схеме остаётся: у человека с двумя ролями две схемы, и в расчёте
 * видно, сколько принесла каждая — замер отдельно, пошив отдельно.
 *
 * Набор обязательных полей зависит от типа — см. `payroll.service.ts`, где на
 * каждый тип написана отдельная чистая функция расчёта.
 */
export const PAYROLL_SCHEME_TYPES = [
  'fixed',
  'hourly',
  'kpi',
  'commission',
  'per_order',
] as const;

export type PayrollSchemeType = (typeof PAYROLL_SCHEME_TYPES)[number];

export const PayrollSchemeType = {
  /** Оклад: `base_amount` за период целиком. */
  FIXED: 'fixed',
  /** Почасовая: `rate` * отработанные часы (из смен). */
  HOURLY: 'hourly',
  /** Оклад + премия за выполнение KPI: `base_amount` + `rate` * (факт / `kpi_target`). */
  KPI: 'kpi',
  /**
   * Процент от суммы закрытых заказов: `commission_percent`.
   *
   * Оставлен как возможность, но продавцу по решению владельца назначается
   * `per_order`: процент от суммы заставлял торговаться за крупный заказ,
   * а не за каждый.
   */
  COMMISSION: 'commission',
  /** Фиксированная сумма (`rate`) за каждый закрытый заказ сотрудника. */
  PER_ORDER: 'per_order',
} as const satisfies Record<string, PayrollSchemeType>;

export const payrollSchemeTypeSchema = z.enum(PAYROLL_SCHEME_TYPES);

export const PAYROLL_SCHEME_TYPE_LABELS: Translated<PayrollSchemeType> = {
  ru: {
    fixed: 'Оклад',
    hourly: 'Почасовая',
    kpi: 'Оклад + KPI',
    commission: 'Процент от заказов',
    per_order: 'Фикс за заказ',
  },
  uz: {
    fixed: 'Maosh',
    hourly: 'Soatbay',
    kpi: 'Maosh + KPI',
    commission: 'Buyurtmalardan foiz',
    per_order: 'Har buyurtma uchun belgilangan summa',
  },
};

export const PAYROLL_SCHEME_TYPE_LABELS_RU = PAYROLL_SCHEME_TYPE_LABELS.ru;

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
  per_order: ['rate'],
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

export const PAYROLL_RECORD_STATUS_LABELS: Translated<PayrollRecordStatus> = {
  ru: { draft: 'Черновик', approved: 'Утверждён', paid: 'Выплачен' },
  uz: { draft: 'Qoralama', approved: 'Tasdiqlangan', paid: "To'langan" },
};

export const PAYROLL_RECORD_STATUS_LABELS_RU = PAYROLL_RECORD_STATUS_LABELS.ru;

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

export const PURCHASE_UNIT_LABELS: Translated<PurchaseUnit> = {
  ru: { m: 'м', m2: 'м²', pcs: 'шт', set: 'компл', kg: 'кг', roll: 'рулон' },
  uz: { m: 'm', m2: 'm²', pcs: 'dona', set: 'komplekt', kg: 'kg', roll: 'rulon' },
};

export const PURCHASE_UNIT_LABELS_RU = PURCHASE_UNIT_LABELS.ru;

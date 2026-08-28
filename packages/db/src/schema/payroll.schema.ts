import type { PayrollSchemeType, Role } from '@curtain-crm/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { payrollRecordStatusEnum, payrollSchemeTypeEnum, roleEnum } from './enums';
import { users } from './users.schema';

/**
 * Схемы начисления зарплаты — по одной активной на роль.
 *
 * Схема настраивается данными, а не кодом: добавить новую модель оплаты для
 * роли можно из веб-панели, не трогая `payroll.service.ts`. Сотрудник с
 * несколькими ролями получает начисление по каждой своей схеме отдельно.
 *
 * Набор обязательных полей зависит от `type` — все поля nullable, а
 * согласованность обеспечивают check-констрейнт ниже и
 * `PAYROLL_SCHEME_REQUIRED_FIELDS` из `@curtain-crm/shared`.
 */
export const payrollSchemes = pgTable(
  'payroll_schemes',
  {
    id: serial('id').primaryKey(),

    role: roleEnum('role').notNull(),
    type: payrollSchemeTypeEnum('type').notNull(),

    /** Оклад за период (`fixed`, `kpi`). */
    baseAmount: numeric('base_amount', { precision: 14, scale: 2 }),
    /** Ставка: за час (`hourly`) или максимальная премия за 100 % KPI (`kpi`). */
    rate: numeric('rate', { precision: 14, scale: 2 }),
    /** Плановое значение KPI за период (`kpi`): например, число закрытых заказов. */
    kpiTarget: numeric('kpi_target', { precision: 14, scale: 4 }),
    /** Процент от суммы закрытых заказов (`commission`). */
    commissionPercent: numeric('commission_percent', { precision: 6, scale: 3 }),

    isActive: boolean('is_active').notNull().default(true),
    /** Дата, с которой схема действует. Нужна для расчёта прошлых периодов. */
    effectiveFrom: date('effective_from').notNull(),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Активная схема у роли ровно одна — иначе расчёт стал бы недетерминированным.
    uniqueIndex('payroll_schemes_single_active_per_role')
      .on(table.role)
      .where(sql`${table.isActive}`),
    index('payroll_schemes_role_idx').on(table.role, table.effectiveFrom),

    check(
      'payroll_schemes_fields_match_type',
      sql`(${table.type} = 'fixed' and ${table.baseAmount} is not null)
       or (${table.type} = 'hourly' and ${table.rate} is not null)
       or (${table.type} = 'kpi' and ${table.baseAmount} is not null
            and ${table.rate} is not null
            and ${table.kpiTarget} is not null and ${table.kpiTarget} > 0)
       or (${table.type} = 'commission' and ${table.commissionPercent} is not null)`,
    ),
    check(
      'payroll_schemes_amounts_non_negative',
      sql`coalesce(${table.baseAmount}, 0) >= 0
          and coalesce(${table.rate}, 0) >= 0
          and coalesce(${table.commissionPercent}, 0) between 0 and 100`,
    ),
  ],
);

/**
 * Снимок параметров схемы на момент расчёта.
 *
 * Хранится в `payroll_records.scheme_snapshot`, чтобы изменение схемы не
 * пересчитывало задним числом уже закрытые месяцы.
 */
export interface PayrollSchemeSnapshot {
  readonly schemeId: number;
  readonly role: Role;
  readonly type: PayrollSchemeType;
  readonly baseAmount: string | null;
  readonly rate: string | null;
  readonly kpiTarget: string | null;
  readonly commissionPercent: string | null;
  readonly effectiveFrom: string;
  /** Исходные данные расчёта: отработанные часы, число заказов, их сумма. */
  readonly inputs: {
    readonly workedHours: number;
    readonly completedOrders: number;
    readonly completedOrdersAmount: string;
  };
}

/**
 * Начисления за период (месяц).
 *
 * Запись создаётся на пару «сотрудник + роль»: у человека с двумя ролями будет
 * две строки за месяц, и в отчёте видно, сколько принесла каждая роль.
 */
export const payrollRecords = pgTable(
  'payroll_records',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Роль, по схеме которой сделано начисление. */
    role: roleEnum('role').notNull(),

    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),

    schemeSnapshot: jsonb('scheme_snapshot').$type<PayrollSchemeSnapshot>().notNull(),

    calculatedAmount: numeric('calculated_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    /** Процент выполнения KPI, если схема типа `kpi`. */
    kpiPercent: numeric('kpi_percent', { precision: 6, scale: 2 }),

    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),

    status: payrollRecordStatusEnum('status').notNull().default('draft'),

    approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    comment: text('comment'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('payroll_records_period_unique').on(
      table.userId,
      table.role,
      table.periodYear,
      table.periodMonth,
    ),
    index('payroll_records_period_idx').on(table.periodYear, table.periodMonth, table.status),
    index('payroll_records_user_idx').on(table.userId),

    check('payroll_records_month_range', sql`${table.periodMonth} between 1 and 12`),
    check('payroll_records_year_range', sql`${table.periodYear} between 2020 and 2100`),
    check('payroll_records_amounts_non_negative', sql`${table.calculatedAmount} >= 0 and ${table.paidAmount} >= 0`),
    check(
      'payroll_records_approval_metadata',
      sql`${table.status} = 'draft'
          or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    check(
      'payroll_records_paid_metadata',
      sql`${table.status} <> 'paid' or ${table.paidAt} is not null`,
    ),
  ],
);

export type PayrollScheme = typeof payrollSchemes.$inferSelect;
export type NewPayrollScheme = typeof payrollSchemes.$inferInsert;
export type PayrollRecord = typeof payrollRecords.$inferSelect;
export type NewPayrollRecord = typeof payrollRecords.$inferInsert;

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
 * Схемы начисления зарплаты — по одной активной на пару «сотрудник + роль».
 *
 * Схема принадлежит человеку, а не должности: опытная швея и новенькая
 * работают в одной роли, но на разных условиях, и раньше эта разница
 * не выражалась ничем — схема была одна на всю роль.
 *
 * Роль в схеме осталась: у сотрудника с двумя ролями две схемы, и в расчёте
 * видно, сколько принесла каждая. Схема настраивается данными, а не кодом:
 * условия конкретного человека меняются из веб-панели, `payroll.service.ts`
 * при этом не трогают.
 *
 * Набор обязательных полей зависит от `type` — все поля nullable, а
 * согласованность обеспечивают check-констрейнт ниже и
 * `PAYROLL_SCHEME_REQUIRED_FIELDS` из `@curtain-crm/shared`.
 */
export const payrollSchemes = pgTable(
  'payroll_schemes',
  {
    id: serial('id').primaryKey(),

    // restrict: схема — первичный документ расчёта, и сотрудников система
    // не удаляет (увольнение — это деактивация).
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

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
    /*
      Активная схема у пары «сотрудник + роль» ровно одна.

      Раньше индекс стоял на одной роли, и это было то же правило, только
      для всей роли сразу. Теперь у каждого свои условия, но двух активных
      схем на одну его роль по-прежнему быть не может — иначе расчёт стал бы
      недетерминированным: неизвестно, по какой ставке считать.
    */
    uniqueIndex('payroll_schemes_single_active_per_user_role')
      .on(table.userId, table.role)
      .where(sql`${table.isActive}`),
    index('payroll_schemes_user_idx').on(table.userId, table.effectiveFrom),
    index('payroll_schemes_role_idx').on(table.role, table.effectiveFrom),

    /*
      Ветка `per_order` сравнивает тип КАК ТЕКСТ, остальные — как значение
      перечисления. Это не небрежность: `per_order` добавлен в тип отдельной
      миграцией, а PostgreSQL запрещает использовать свежее значение enum в
      той же транзакции, где оно заведено (55P04). Drizzle применяет все
      миграции одной транзакцией, поэтому литерал здесь пришлось увести
      из-под проверки типа — приведение к тексту делает ровно это.
    */
    check(
      'payroll_schemes_fields_match_type',
      sql`(${table.type} = 'fixed' and ${table.baseAmount} is not null)
       or (${table.type} = 'hourly' and ${table.rate} is not null)
       or (${table.type} = 'kpi' and ${table.baseAmount} is not null
            and ${table.rate} is not null
            and ${table.kpiTarget} is not null and ${table.kpiTarget} > 0)
       or (${table.type} = 'commission' and ${table.commissionPercent} is not null)
       or (${table.type}::text = 'per_order' and ${table.rate} is not null)`,
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
    /**
     * Сдельные расценки за этапы этих заказов.
     *
     * Необязательное: в ведомостях, посчитанных до появления расценок, поля
     * физически нет. Подставлять туда ноль при чтении честнее, чем менять
     * старые снимки — снимок на то и снимок, что описывает расчёт таким,
     * каким он был.
     */
    readonly stageFeesAmount?: string;
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

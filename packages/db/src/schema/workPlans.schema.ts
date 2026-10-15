import { PLAN_ROLES } from '@curtain-crm/shared';
import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, serial, timestamp, unique } from 'drizzle-orm/pg-core';

import { roleEnum } from './enums';
import { users } from './users.schema';

/**
 * План на месяц: норма роли и личные поправки.
 *
 * Строка действует с первого числа своего месяца и до следующей строки того
 * же адресата — правило в `resolvePlan` (`@curtain-crm/shared`). Поэтому
 * смена нормы не переписывает прошлые месяцы: они считаются по строкам,
 * которые тогда действовали.
 *
 * `user_id = null` — норма роли. Личная строка с `target = null` — «с этого
 * месяца вернуться к норме»; у нормы роли цель обязательна.
 */
export const workPlans = pgTable(
  'work_plans',
  {
    id: serial('id').primaryKey(),
    role: roleEnum('role').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'restrict' }),
    /** Первое число месяца, `YYYY-MM-01`. */
    effectiveFrom: date('effective_from').notNull(),
    /** Штуки у швей, заказы у выездных (`PLAN_UNIT`). */
    target: integer('target'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Повторная запись в тот же месяц обновляет строку; норма роли (user_id
    // null) тоже должна быть одна на месяц — отсюда NULLS NOT DISTINCT.
    unique('work_plans_role_user_month_unique')
      .on(table.role, table.userId, table.effectiveFrom)
      .nullsNotDistinct(),
    check(
      'work_plans_role_planned',
      sql`${table.role} in (${sql.raw(PLAN_ROLES.map((role) => `'${role}'`).join(', '))})`,
    ),
    check('work_plans_effective_from_first_day', sql`extract(day from ${table.effectiveFrom}) = 1`),
    check('work_plans_target_positive', sql`${table.target} > 0`),
    check('work_plans_norm_has_target', sql`${table.userId} is not null or ${table.target} is not null`),
  ],
);

import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { dayOffStatusEnum } from './enums';
import { users } from './users.schema';

/**
 * Запросы на выходные.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену,
 * руководитель (директор или админ) одобряет или отклоняет. Записи не
 * удаляются — решённый запрос остаётся историей: кто, когда и почему
 * отсутствовал по согласованию, а не просто не вышел.
 */
export const dayOffRequests = pgTable(
  'day_off_requests',
  {
    id: serial('id').primaryKey(),

    // restrict: сотрудников система не удаляет (увольнение = деактивация),
    // а запрос без автора не имеет смысла как запись истории.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),

    /** Причина запроса — по желанию сотрудника, не обязательна. */
    reason: text('reason'),

    status: dayOffStatusEnum('status').notNull().default('pending'),

    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Причина отказа. Обязательность связки «отклонён ⇒ причина» держит БД. */
    rejectionReason: text('rejection_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Основной запрос: запросы сотрудника, свежие сверху.
    index('day_off_requests_user_idx').on(table.userId, table.status),
    // Очередь руководителя: непринятые запросы.
    index('day_off_requests_status_idx').on(table.status),

    check('day_off_requests_period_valid', sql`${table.endDate} >= ${table.startDate}`),

    /*
      Инварианты статуса — в БД, а не только в коде, как у поручений.

      Отозванный запрос (`cancelled`) руководство не рассматривало — это
      решение самого сотрудника, поэтому у него, как и у `pending`, нет ни
      рецензента, ни даты решения. Рецензент появляется РОВНО у решённых
      руководством статусов — `approved` и `rejected`.
    */
    check(
      'day_off_requests_reviewed_matches_status',
      sql`(${table.status} in ('approved', 'rejected')) = (${table.reviewedBy} is not null)`,
    ),
    check(
      'day_off_requests_reviewed_at_matches_reviewer',
      sql`(${table.reviewedBy} is null) = (${table.reviewedAt} is null)`,
    ),
    check(
      'day_off_requests_rejection_reason_matches_status',
      sql`(${table.status} = 'rejected') = (${table.rejectionReason} is not null)`,
    ),
  ],
);

export type DayOffRequest = typeof dayOffRequests.$inferSelect;
export type NewDayOffRequest = typeof dayOffRequests.$inferInsert;

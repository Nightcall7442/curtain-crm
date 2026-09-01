import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { taskStatusEnum } from './enums';
import { users } from './users.schema';

/**
 * Поручения — дополнительная работа мимо конвейера заказов.
 *
 * Руководитель выдаёт поручение конкретному сотруднику («съезди за тканью»,
 * «подмени на замере»), сотрудник видит его во вкладке «Работа» и отмечает
 * выполнение. Это НЕ дубль заказов: у этапов заказа своя таблица переходов
 * и свои исполнители, а поручение — свободный текст с адресатом и сроком.
 *
 * Записи не удаляются: выполненное поручение — часть истории работы, а
 * ошибочное отменяется с причиной, как заказ.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),

    title: varchar('title', { length: 300 }).notNull(),
    details: text('details'),

    // restrict: сотрудников система не удаляет (увольнение = деактивация),
    // и поручение без адресата или автора не имеет смысла как запись истории.
    assigneeId: integer('assignee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Срок — календарный день; поручениям точность до минуты не нужна. */
    dueDate: date('due_date'),

    status: taskStatusEnum('status').notNull().default('open'),

    /** Причина отмены. Обязательность связки «отменено ⇒ причина» держит БД. */
    cancelReason: text('cancel_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    // Основной запрос: открытые поручения сотрудника.
    index('tasks_assignee_status_idx').on(table.assigneeId, table.status),
    index('tasks_created_by_idx').on(table.createdBy),

    // Инварианты статуса — в БД, а не только в коде: ручной UPDATE или
    // будущий скрипт не смогут получить «выполнено без даты» или
    // «отменено без причины».
    check(
      'tasks_completed_at_matches_status',
      sql`(${table.status} = 'done') = (${table.completedAt} is not null)`,
    ),
    check(
      'tasks_cancel_reason_matches_status',
      sql`(${table.status} = 'cancelled') = (${table.cancelReason} is not null)`,
    ),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

import { boolean, date, index, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { disciplineKindEnum } from './enums';
import { users } from './users.schema';

/**
 * События дисциплины: нарушения и поощрения с баллами.
 *
 * Балл хранится в записи, а не выводится из категории при чтении: таблица
 * баллов может поменяться после тестового месяца, а история должна остаться
 * такой, какой её видел сотрудник в момент записи. Признак повтора — по той
 * же причине: он посчитан на момент фиксации.
 *
 * Объяснение сотрудника (`employee_comment`) — обязательная часть правил:
 * перед дисциплинарным решением человеку дают возможность объяснить ситуацию.
 */
export const disciplineEvents = pgTable(
  'discipline_events',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    kind: disciplineKindEnum('kind').notNull(),
    /** Итоговый балл со знаком, с учётом повтора: −0,5 … +3. */
    points: numeric('points', { precision: 4, scale: 1 }).notNull(),
    isRepeat: boolean('is_repeat').notNull().default(false),

    occurredOn: date('occurred_on').notNull(),
    /** Конкретный факт: дата, время, заказ, ситуация — как просит правило. */
    description: text('description'),

    employeeComment: text('employee_comment'),
    employeeCommentAt: timestamp('employee_comment_at', { withTimezone: true }),

    recordedBy: integer('recorded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Месяц сотрудника — основной запрос и для сводки, и для повторов.
    index('discipline_events_user_day_idx').on(table.userId, table.occurredOn),
  ],
);

export type DisciplineEvent = typeof disciplineEvents.$inferSelect;
export type NewDisciplineEvent = typeof disciplineEvents.$inferInsert;

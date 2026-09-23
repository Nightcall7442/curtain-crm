import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { users } from './users.schema';

/**
 * Мероприятия мастерской: собрание, выезд, обучение, праздник.
 *
 * Дни рождения и одобренные выходные система выводит сама из данных, а это
 * — то, о чём она знать не может: их заводит руководство. Владелец просил
 * добавлять такие события с картинкой, чтобы карточка на главной была не
 * только про именинников.
 *
 * Своя таблица, а не «задача» (`tasks`): у задачи есть исполнитель и она
 * требует ответа, а мероприятие никому не поручается — оно просто будет.
 */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),

    title: text('title').notNull(),
    description: text('description'),

    /** День мероприятия; многодневное — до `end_date` включительно. */
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),

    /** Картинка в хранилище; `null` — карточка покажет инициалы автора. */
    photoKey: text('photo_key'),

    /** Филиал, если событие касается одного цеха; `null` — общее. */
    branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_start_idx').on(table.startDate),

    check('events_dates_ordered', sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`),
  ],
);

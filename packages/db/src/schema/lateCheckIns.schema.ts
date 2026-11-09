import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { clockTime } from './clockTime';
import { shifts } from './shifts.schema';
import { users } from './users.schema';

/**
 * Факты опоздания: первая отметка дня позже графика — что было на самом деле.
 *
 * Записи дисциплины об опоздании система больше не правит по цепочке
 * решений: она выводит их заново из состояния (`evaluateMonthLateness` в
 * `@curtain-crm/shared`), а состояние — это факты отсюда плюс решения
 * руководства (одобренные запросы, ручные записи, прощение). Факт пишется
 * один раз, при первой настоящей отметке дня, и дальше не меняется:
 *  - время отметки и начало по графику — как их увидела отметка. Ручная
 *    правка или удаление смены и смена графика задним числом факт не
 *    трогают — ручная правка смены опоздание не питает, и потому снятие
 *    согласования возвращает ровно ту отметку, что была;
 *  - пишется и тогда, когда одобренное «приду к» делает отметку вовремя:
 *    факт — что было, одобрение учитывает оценка. Снимут согласование —
 *    опоздание появится из этого же факта.
 *
 * Здесь же два следа решений, которые принадлежат дню, а не записи:
 *  - `forgiven_*` — руководитель простил опоздание дня, убрав запись
 *    системы руками: больше её не будет, что бы ни решали потом;
 *  - `stashed_comment*` — объяснение сотрудника снятой оценкой записи: если
 *    запись вернётся (сняли согласование), объяснение вернётся вместе с
 *    ней, а не пропадёт с удалённой строкой.
 */
export const lateCheckIns = pgTable(
  'late_check_ins',
  {
    id: serial('id').primaryKey(),

    // restrict: сотрудников не удаляют (увольнение = деактивация).
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** День мастерской (по Ташкенту), за который отметка. */
    day: date('day').notNull(),
    /** Время отметки по часам мастерской: «09:22». */
    checkInTime: clockTime('check_in_time').notNull(),
    /** Начало смены по графику, действовавшему в этот день в момент отметки. */
    scheduleStart: clockTime('schedule_start').notNull(),

    /**
     * Смена, открытая отметкой, — для справки. `set null`: руководитель
     * вправе удалить смену, а факт отметки от этого не исчезает.
     */
    shiftId: integer('shift_id').references(() => shifts.id, { onDelete: 'set null' }),

    forgivenAt: timestamp('forgiven_at', { withTimezone: true }),
    forgivenBy: integer('forgiven_by').references(() => users.id, { onDelete: 'restrict' }),

    stashedComment: text('stashed_comment'),
    stashedCommentAt: timestamp('stashed_comment_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Факт за день один: вторая отметка того же дня (после удалённой смены) его не переписывает.
    uniqueIndex('late_check_ins_user_day').on(table.userId, table.day),
    // Факт — это опоздание: отметку вовремя не записывают.
    check('late_check_ins_late', sql`${table.checkInTime} > ${table.scheduleStart}`),
    // Прощение — кто и когда, вместе: как решение по запросу (`late_requests`).
    check('late_check_ins_forgiven_pair', sql`(${table.forgivenAt} is null) = (${table.forgivenBy} is null)`),
  ],
);

export type LateCheckIn = typeof lateCheckIns.$inferSelect;
export type NewLateCheckIn = typeof lateCheckIns.$inferInsert;

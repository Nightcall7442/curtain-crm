import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { shifts } from './shifts.schema';

/**
 * Личная отлучка — сотрудник ненадолго отходит по своим делам, не закрывая
 * смену. Заявляет срок сам (потолок держит check-констрейнт), а факт
 * возврата отмечает сам же — второй стороны, которая бы это подтверждала,
 * в системе нет и не нужно: отлучка — вопрос доверия, а не согласования.
 *
 * Живёт внутри смены (`shift_id`), а не привязана к сотруднику напрямую:
 * без открытой смены отлучке не из чего начаться, а `user_id` и так
 * достаётся присоединением к `shifts`.
 */
export const personalBreaks = pgTable(
  'personal_breaks',
  {
    id: serial('id').primaryKey(),

    // cascade: отлучка не существует отдельно от смены, внутри которой она
    // случилась, — как позиция заказа не существует отдельно от заказа.
    shiftId: integer('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),

    /** Срок, который заявил сотрудник, минуты. Потолок — общий для всех. */
    plannedMinutes: integer('planned_minutes').notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** `null` — отлучка ещё не закрыта, сотрудник не отметил возврат. */
    returnedAt: timestamp('returned_at', { withTimezone: true }),
  },
  (table) => [
    index('personal_breaks_shift_idx').on(table.shiftId),

    /**
     * Не более одной открытой отлучки на смену.
     *
     * Частичный уникальный индекс, а не проверка в коде — по той же причине,
     * что и у `shifts_single_open_per_user`: параллельный повторный запрос
     * не должен породить вторую отлучку поверх первой.
     */
    uniqueIndex('personal_breaks_single_active_per_shift')
      .on(table.shiftId)
      .where(sql`${table.returnedAt} is null`),

    // Потолок совпадает с MAX_PERSONAL_BREAK_MINUTES в @curtain-crm/shared.
    check('personal_breaks_planned_minutes_range', sql`${table.plannedMinutes} between 1 and 30`),
    check(
      'personal_breaks_returned_after_started',
      sql`${table.returnedAt} is null or ${table.returnedAt} >= ${table.startedAt}`,
    ),
  ],
);

export type PersonalBreak = typeof personalBreaks.$inferSelect;
export type NewPersonalBreak = typeof personalBreaks.$inferInsert;

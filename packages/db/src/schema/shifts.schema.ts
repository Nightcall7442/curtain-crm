import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { users } from './users.schema';

/**
 * Смены сотрудников (чек-ин / чек-аут).
 *
 * Смена — один непрерывный блок без учёта перерывов, как в `curtain-bot`.
 * При старте координаты сверяются с филиалами сотрудника: расстояние считает
 * `haversineDistanceMeters()`, порог берётся из `branches.radius_meters`.
 *
 * Руководство (CEO/админ) может скорректировать время задним числом через
 * `shifts.adjustManually`. Такая смена помечается `is_manually_adjusted`,
 * а сам факт коррекции дополнительно пишется в `audit_log`.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: serial('id').primaryKey(),

    // restrict: смены — первичный документ для расчёта почасовой зарплаты.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Филиал, у которого сотрудник отметился (или который указал админ вручную). */
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    /**
     * Координаты чек-ина. Nullable: у смены, целиком созданной админом
     * задним числом, геометки нет — и это законный случай, а не потеря данных.
     */
    startLatitude: doublePrecision('start_latitude'),
    startLongitude: doublePrecision('start_longitude'),
    /** Фактическое расстояние до филиала в момент чек-ина, метры. */
    startDistanceMeters: integer('start_distance_meters'),

    endLatitude: doublePrecision('end_latitude'),
    endLongitude: doublePrecision('end_longitude'),
    endDistanceMeters: integer('end_distance_meters'),

    /* --- Ручная корректировка ---------------------------------------------- */

    isManuallyAdjusted: boolean('is_manually_adjusted').notNull().default(false),

    adjustedBy: integer('adjusted_by').references(() => users.id, { onDelete: 'restrict' }),
    adjustedAt: timestamp('adjusted_at', { withTimezone: true }),
    /** Обязательное обоснование корректировки. */
    adjustmentReason: text('adjustment_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('shifts_user_started_idx').on(table.userId, table.startedAt),
    index('shifts_branch_idx').on(table.branchId),
    index('shifts_started_at_idx').on(table.startedAt),

    /**
     * Не более одной открытой смены на сотрудника.
     *
     * Частичный уникальный индекс, а не проверка в коде: две параллельные
     * попытки чек-ина с телефона и из веб-панели иначе создали бы две смены,
     * и почасовая зарплата удвоилась бы.
     */
    uniqueIndex('shifts_single_open_per_user')
      .on(table.userId)
      .where(sql`${table.endedAt} is null`),

    check(
      'shifts_ended_after_started',
      sql`${table.endedAt} is null or ${table.endedAt} > ${table.startedAt}`,
    ),
    check(
      'shifts_adjustment_metadata_required',
      sql`not ${table.isManuallyAdjusted}
          or (${table.adjustedBy} is not null
              and ${table.adjustedAt} is not null
              and ${table.adjustmentReason} is not null)`,
    ),
  ],
);

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;

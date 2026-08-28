import { DEFAULT_CHECK_IN_RADIUS_METERS } from '@curtain-crm/shared';
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

/**
 * Филиалы (цеха).
 *
 * Сейчас цех один, но модель мультифилиальна с самого начала: сотрудники
 * привязываются к филиалам через `user_branches`, а радиус чек-ина хранится
 * у филиала, а не в коде и не в переменной окружения (как было в `curtain-bot`,
 * где `ALLOWED_RADIUS_METERS` был глобальным на всю систему).
 *
 * Филиалы НИКОГДА не удаляются физически — только `is_active = false`.
 * Поэтому все внешние ключи на `branches` объявлены с `onDelete: 'restrict'`.
 */
export const branches = pgTable(
  'branches',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),

    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),

    /** Радиус допустимого чек-ина, метры. Редактируется CEO/админом из веб-панели. */
    radiusMeters: integer('radius_meters').notNull().default(DEFAULT_CHECK_IN_RADIUS_METERS),

    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Название филиала уникально без учёта регистра — чтобы не появились
    // «Цех №1» и «цех №1» как две разные записи.
    uniqueIndex('branches_name_unique').on(sql`lower(${table.name})`),
    index('branches_is_active_idx').on(table.isActive),

    // Инварианты продублированы в БД намеренно: Zod защищает только тот путь,
    // что идёт через tRPC, а миграции, сиды и ручные правки идут мимо него.
    check('branches_latitude_range', sql`${table.latitude} between -90 and 90`),
    check('branches_longitude_range', sql`${table.longitude} between -180 and 180`),
    check('branches_radius_range', sql`${table.radiusMeters} between 20 and 5000`),
  ],
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

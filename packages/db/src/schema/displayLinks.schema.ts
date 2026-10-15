import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { users } from './users.schema';

/**
 * Ссылки, по которым телевизор в цехе открывает табло без входа в панель.
 *
 * В базе лежит только SHA-256 токена: утечка дампа не даёт открыть ни одно
 * табло, а сам токен директор видит один раз — при создании ссылки.
 *
 * Ссылка не удаляется, а отзывается: по `revoked_at` в настройках видно,
 * какой телевизор и когда отключили, а `last_seen_at` — какой ещё работает.
 */
export const displayLinks = pgTable(
  'display_links',
  {
    id: serial('id').primaryKey(),

    /** «ТВ в цеху Ургенч» — чтобы в списке было понятно, какой это экран. */
    label: text('label').notNull(),

    /** `null` — все филиалы. Филиал ТВ задаёт ссылка, а не запрос с экрана. */
    branchId: integer('branch_id').references(() => branches.id, { onDelete: 'restrict' }),

    showWorkshop: boolean('show_workshop').notNull(),
    showInstallation: boolean('show_installation').notNull(),

    /** Язык подписей на экране: цех может читать по-узбекски. */
    locale: text('locale').notNull().default('ru'),

    tokenHash: text('token_hash').notNull().unique(),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Пишется не чаще раза в минуту — табло опрашивает сервер каждые 20 с. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [
    index('display_links_created_at_idx').on(table.createdAt),
    check('display_links_label_length', sql`char_length(${table.label}) between 1 and 60`),
    check('display_links_shows_something', sql`${table.showWorkshop} or ${table.showInstallation}`),
    check('display_links_locale', sql`${table.locale} in ('ru', 'uz')`),
  ],
);

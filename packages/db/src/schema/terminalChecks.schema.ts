import { index, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { users } from './users.schema';

/**
 * Терминальные чеки.
 *
 * Фото чека, пробитого на платёжном терминале, — обязанность продавцов:
 * минимум `TERMINAL_CHECKS_DAILY_TARGET` в день на всех. Отдельно от
 * `payments` и `cash_collections` намеренно: владелец сказал, что чек к
 * кассе приложения не привязан. Сумма — своим полем, а не в комментарии:
 * цель считается штуками, но сколько прошло через терминал, руководству
 * тоже нужно видеть цифрой, а не с фото.
 */
export const terminalChecks = pgTable(
  'terminal_checks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    branchId: integer('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    photoKey: text('photo_key').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // «Сколько сегодня» — единственный тяжёлый запрос: по дню.
    index('terminal_checks_created_idx').on(table.createdAt),
  ],
);

export type TerminalCheck = typeof terminalChecks.$inferSelect;

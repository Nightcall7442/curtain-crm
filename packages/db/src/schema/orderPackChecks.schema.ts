import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { orders } from './orders.schema';
import { users } from './users.schema';

/**
 * Отметки сборки на выезд: что установщик уже положил в машину.
 *
 * Сам список строк здесь не хранится — он собирается из позиций заказа
 * (`buildPackList` в `@curtain-crm/shared`), потому что заказ до выезда ещё
 * правят, и сохранённая копия разошлась бы с тем, что действительно нужно
 * везти. В таблице лежат только отметки, по ключу строки.
 *
 * Снятая отметка — удалённая строка, а не колонка `is_packed`: «не брал» и
 * «ещё не смотрел» для сборки одно и то же, а вот кто и когда положил вещь
 * в машину — вопрос, который задают после забытого держателя.
 */
export const orderPackChecks = pgTable(
  'order_pack_checks',
  {
    id: serial('id').primaryKey(),

    // cascade: отметки не переживают заказ.
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** Ключ строки сборочного листа: `item:<id>:goods`, `item:<id>:acc:0`. */
    key: text('key').notNull(),

    // restrict, как и у всех «кто сделал»: сотрудников система не удаляет.
    checkedBy: integer('checked_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('order_pack_checks_order_key_unique').on(table.orderId, table.key),
    index('order_pack_checks_order_idx').on(table.orderId),
    check('order_pack_checks_key_not_blank', sql`length(btrim(${table.key})) > 0`),
  ],
);

export type OrderPackCheck = typeof orderPackChecks.$inferSelect;
export type NewOrderPackCheck = typeof orderPackChecks.$inferInsert;

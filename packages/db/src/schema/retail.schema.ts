import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { purchaseCategoryEnum, purchaseUnitEnum } from './enums';
import { users } from './users.schema';

/**
 * Розничный прайс — то, что продавец пробивает на кассе.
 *
 * Отдельно от `purchase_items`, хотя товары те же самые. Там ЗАКУПОЧНАЯ
 * цена — сколько мастерская платит поставщику; здесь РОЗНИЧНАЯ — сколько
 * платит клиент. Одна колонка на обе роли означала бы, что продавец видит
 * себестоимость, а изменение цены поставщика молча меняло бы ценник на
 * витрине.
 *
 * Остаток хранится здесь же, а не в отдельной таблице движений: движение
 * записывает `audit_log` (кто, когда, сколько оприходовал), и вторая
 * таблица повторяла бы его, добавив риск разойтись с этим числом.
 */
export const retailItems = pgTable(
  'retail_items',
  {
    id: serial('id').primaryKey(),

    name: varchar('name', { length: 200 }).notNull(),
    unit: purchaseUnitEnum('unit').notNull().default('pcs'),
    category: purchaseCategoryEnum('category').notNull().default('other'),

    /** Цена для клиента за одну единицу. */
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),

    /**
     * Остаток на витрине.
     *
     * Дробный: тюль и ткань продаются метрами, и «2.5 м» — обычная покупка.
     */
    stockQuantity: numeric('stock_quantity', { precision: 12, scale: 3 }).notNull().default('0'),

    isActive: boolean('is_active').notNull().default(true),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Две позиции с одинаковым названием на витрине — верный способ продать
    // не то и не по той цене. Индекс частичный: снятый с продажи товар
    // название не занимает.
    uniqueIndex('retail_items_active_name_unique')
      .on(sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
    index('retail_items_category_idx').on(table.category),

    check('retail_items_price_non_negative', sql`${table.price} >= 0`),
    // Отрицательный остаток означал бы, что продали больше, чем есть, и
    // никто этого не заметил. Продажа проверяет остаток заранее, но
    // последнее слово за базой — параллельные кассы её не обойдут.
    check('retail_items_stock_non_negative', sql`${table.stockQuantity} >= 0`),
  ],
);

/**
 * Чек: одна продажа с кассы, в ней одна или несколько позиций.
 *
 * Итог НЕ хранится. Он равен сумме строк, а строки после пробития не
 * меняются — хранить рядом второе число значило бы завести место, где оно
 * может разойтись с первым. В `curtain-bot` так и случилось с остатком по
 * заказу, поэтому здесь итог считается запросом.
 */
export const retailSales = pgTable(
  'retail_sales',
  {
    id: serial('id').primaryKey(),

    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Клиент необязателен: за тюлем заходят без имени и телефона. */
    clientName: text('client_name'),
    clientPhone: text('client_phone'),

    comment: text('comment'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('retail_sales_created_idx').on(table.createdAt),
    index('retail_sales_seller_idx').on(table.sellerId, table.createdAt),
    index('retail_sales_branch_idx').on(table.branchId, table.createdAt),

    check(
      'retail_sales_client_phone_e164',
      sql`${table.clientPhone} is null or ${table.clientPhone} ~ '^\\+998[0-9]{9}$'`,
    ),
  ],
);

/**
 * Строка чека.
 *
 * Название, единица и цена — СНИМОК на момент продажи, а не ссылка на
 * текущий прайс. Иначе подорожавший через месяц тюль переписал бы чек
 * задним числом, и выручка за прошлый месяц изменилась бы сама собой.
 */
export const retailSaleItems = pgTable(
  'retail_sale_items',
  {
    id: serial('id').primaryKey(),

    // cascade: строка не существует отдельно от чека.
    saleId: integer('sale_id')
      .notNull()
      .references(() => retailSales.id, { onDelete: 'cascade' }),

    // restrict: позиция прайса, по которой что-то продано, не удаляется —
    // её снимают с продажи (`is_active = false`).
    itemId: integer('item_id')
      .notNull()
      .references(() => retailItems.id, { onDelete: 'restrict' }),

    itemName: text('item_name').notNull(),
    unit: purchaseUnitEnum('unit').notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),

    /**
     * Сумма строки. Вычисляемая колонка: считать её в приложении означало бы
     * допустить чек, где сумма не равна цене, умноженной на количество.
     */
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).generatedAlwaysAs(
      sql`round(unit_price * quantity, 2)`,
    ),
  },
  (table) => [
    index('retail_sale_items_sale_idx').on(table.saleId),
    index('retail_sale_items_item_idx').on(table.itemId),

    check('retail_sale_items_quantity_positive', sql`${table.quantity} > 0`),
    check('retail_sale_items_price_non_negative', sql`${table.unitPrice} >= 0`),
  ],
);

export type RetailItem = typeof retailItems.$inferSelect;
export type NewRetailItem = typeof retailItems.$inferInsert;
export type RetailSale = typeof retailSales.$inferSelect;
export type NewRetailSale = typeof retailSales.$inferInsert;
export type RetailSaleItem = typeof retailSaleItems.$inferSelect;
export type NewRetailSaleItem = typeof retailSaleItems.$inferInsert;

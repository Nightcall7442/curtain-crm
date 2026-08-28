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
} from 'drizzle-orm/pg-core';

import { purchaseCategoryEnum, purchaseUnitEnum } from './enums';
import { orders } from './orders.schema';
import { users } from './users.schema';

/**
 * Каталог закупочных товаров с ценами.
 *
 * Наполняют CEO и админ. Товары не удаляются, а деактивируются: по ним может
 * быть посчитана себестоимость закрытых заказов.
 */
export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: serial('id').primaryKey(),

    name: text('name').notNull(),
    unit: purchaseUnitEnum('unit').notNull(),

    /** Текущая закупочная цена за единицу. Историю фиксируют сами закупки. */
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),

    category: purchaseCategoryEnum('category').notNull().default('other'),

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
    uniqueIndex('purchase_items_name_unique').on(sql`lower(${table.name})`),
    index('purchase_items_category_idx').on(table.category, table.isActive),
    check('purchase_items_price_non_negative', sql`${table.price} >= 0`),
  ],
);

/**
 * Закупки по конкретному заказу.
 *
 * Себестоимость заказа = сумма `total_price` его закупок. Именно поэтому здесь
 * хранится СНИМОК цены (`unit_price`), а не ссылка на текущую цену товара:
 * повышение закупочной цены не должно задним числом менять маржу по закрытым
 * заказам.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: serial('id').primaryKey(),

    // cascade: закупка не существует отдельно от заказа.
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    // restrict: удалить товар, по которому уже были закупки, нельзя —
    // иначе потеряется расшифровка себестоимости.
    itemId: integer('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'restrict' }),

    /** Количество в единицах товара; дробное — например 2.5 м ткани. */
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),

    /** Цена за единицу на момент закупки (снимок `purchase_items.price`). */
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),

    /** Итог по строке. Вычисляемая колонка — рассинхрон с количеством невозможен. */
    totalPrice: numeric('total_price', { precision: 14, scale: 2 }).generatedAlwaysAs(
      sql`round(quantity * unit_price, 2)`,
    ),

    comment: text('comment'),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('purchases_order_idx').on(table.orderId),
    index('purchases_item_idx').on(table.itemId),
    index('purchases_created_at_idx').on(table.createdAt),

    check('purchases_quantity_positive', sql`${table.quantity} > 0`),
    check('purchases_unit_price_non_negative', sql`${table.unitPrice} >= 0`),
  ],
);

export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;
export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

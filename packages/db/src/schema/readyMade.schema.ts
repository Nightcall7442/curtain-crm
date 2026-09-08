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
  varchar,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { users } from './users.schema';

/**
 * Готовые шторы на витрине — сшитые заранее, лежат и ждут покупателя.
 *
 * Отдельно от `retail_items`, хотя обе таблицы — «то, что есть в наличии».
 * На витрине кассы товар безликий: тюль метрами, держатели штуками, и одной
 * строки «Тюль, 12 000 сум/м» достаточно. Готовая штора — вещь: у неё модель,
 * размер и снимок. Две шторы одной модели разного размера — разные товары,
 * и продать вместо одной другую нельзя.
 *
 * Кода ткани и цвета здесь нет намеренно: их завели при первом наброске, а
 * владелец, увидев форму, убрал оба. Готовую штору выбирают глазами по
 * снимку и по размеру, а код с этикетки нужен закройщику при пошиве — на
 * полке он не спрашивается ни разу.
 *
 * Отдельно и от `order_items`: те описывают, что ЗАКАЗАЛИ сшить, и живут
 * внутри заказа. Здесь — что уже сшито и лежит на складе, вне всякого заказа,
 * пока его не купят.
 */
export const readyMadeItems = pgTable(
  'ready_made_items',
  {
    id: serial('id').primaryKey(),

    /*
      Филиал обязателен: готовая штора лежит в конкретном цехе, и остаток
      «три штуки» без ответа на вопрос «где» продавцу другого филиала
      обещает товар, которого у него нет.
    */
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    /** Модель — из справочника `catalog_items` (вид `curtain_model`). */
    model: varchar('model', { length: 200 }).notNull(),

    /*
      Размер в сантиметрах — та же пара, что у позиции заказа. Обязателен:
      готовая штора без размера не подходит ни к одному окну, и продавец,
      который его не знает, всё равно спросит у клиента размер и полезет
      мерить сам.
    */
    widthCm: numeric('width_cm', { precision: 6, scale: 1 }).notNull(),
    heightCm: numeric('height_cm', { precision: 6, scale: 1 }).notNull(),

    /** Цена за одну штору. */
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),

    /** Сколько таких штук лежит. Целое: готовые шторы считают вещами. */
    quantity: integer('quantity').notNull().default(0),

    /** Ключ снимка в хранилище — продавец показывает штору клиенту. */
    photoKey: text('photo_key'),

    comment: text('comment'),

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
    /*
      Основной запрос: «что есть по этой модели в моём цехе». Модель
      сравнивается в нижнем регистре — её вводят и выбирают из справочника,
      и «Римские» с «римские» должны попадать в один список.
    */
    index('ready_made_items_branch_model_idx').on(table.branchId, sql`lower(${table.model})`),
    index('ready_made_items_active_idx').on(table.isActive),

    check('ready_made_items_price_non_negative', sql`${table.price} >= 0`),
    // Отрицательный остаток означал бы, что продали больше, чем сшили, и
    // никто этого не заметил. Продажа проверяет остаток заранее, но
    // последнее слово за базой — параллельные продавцы её не обойдут.
    check('ready_made_items_quantity_non_negative', sql`${table.quantity} >= 0`),
    check(
      'ready_made_items_dimensions_positive',
      sql`${table.widthCm} > 0 and ${table.heightCm} > 0`,
    ),
  ],
);

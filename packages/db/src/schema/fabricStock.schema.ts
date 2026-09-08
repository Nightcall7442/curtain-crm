import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { catalogKindEnum } from './enums';
import { users } from './users.schema';

/**
 * Склад тканей: сколько метров какого кода лежит в цехе.
 *
 * До этой таблицы складского учёта в системе не было вовсе: закупки
 * фиксировались по заказу и давали себестоимость, но на вопрос «сколько
 * метров П-31 осталось» ответить было нечем — считали рулоны глазами.
 *
 * Строка — это код на конкретном складе, а не рулон. Рулоны одного кода
 * сливаются в один остаток намеренно: раскройщик берёт «три метра П-31», а
 * не «рулон №4», и учёт по рулонам заставил бы отмечать, из какого именно
 * отрезали, ради числа, которое всё равно складывается.
 *
 * Вид (`kind`) — один из справочников кодов (`portiere_code`, `tulle_code`,
 * ...): один и тот же код у портьеры и у трубы означает разные вещи, и общий
 * остаток на них смешал бы ткань с металлом.
 *
 * Движения отдельной таблицей не ведутся — их пишет `audit_log` (кто, когда,
 * сколько и по какому заказу). То же решение и по той же причине, что у
 * остатков витрины (`retail_items`): вторая таблица повторяла бы журнал и
 * однажды разошлась бы с этим числом.
 */
export const fabricStock = pgTable(
  'fabric_stock',
  {
    id: serial('id').primaryKey(),

    /*
      Филиал обязателен: ткань лежит в конкретном цехе, и «осталось два
      метра» без ответа на вопрос «где» отправляет раскройщика за рулоном,
      которого у него нет.
    */
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    /** Справочник кода: портьеры, тюль, защита, карниз, пластик, труба. */
    kind: catalogKindEnum('kind').notNull(),

    /** Код с этикетки рулона — тот же, что продавец вводит в заказе. */
    code: varchar('code', { length: 100 }).notNull(),

    /**
     * Остаток в метрах.
     *
     * Может уйти в минус, и это не ошибка: ткань, которую забыли оприходовать,
     * всё равно раскроили. Минус в остатке — видимый долг учёта, а обрезанное
     * до нуля списание молча превратило бы его в потерянные метры.
     */
    meters: numeric('meters', { precision: 12, scale: 3 }).notNull().default('0'),

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
      Код уникален внутри пары «филиал + вид», без учёта регистра: его
      переписывают с этикетки руками, и «п-31» с «П-31» обязаны попадать в
      один остаток, иначе склад раздваивается на второй же поставке.
    */
    uniqueIndex('fabric_stock_branch_kind_code_unique').on(
      table.branchId,
      table.kind,
      sql`lower(${table.code})`,
    ),
    index('fabric_stock_branch_kind_idx').on(table.branchId, table.kind),
    check('fabric_stock_code_not_blank', sql`length(btrim(${table.code})) > 0`),
  ],
);

export type FabricStock = typeof fabricStock.$inferSelect;
export type NewFabricStock = typeof fabricStock.$inferInsert;

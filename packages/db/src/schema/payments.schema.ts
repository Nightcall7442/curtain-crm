import { sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { paymentKindEnum, paymentMethodEnum } from './enums';
import { orders } from './orders.schema';
import { retailSales } from './retail.schema';
import { users } from './users.schema';

/**
 * Касса: каждый приход денег от клиента.
 *
 * Заказ и чек витрины — первичные документы: что продано и почём. Платёж —
 * запись о деньгах: сколько, чем (наличные, карта, QR, Click) и за что
 * (предоплата, остаток, готовые шторы, прочее). Из этих строк складывается
 * дневной отчёт кассы; без них было не ответить, сколько наличных лежит
 * в ящике к вечеру.
 *
 * Сумма по заказу здесь не дублирует `orders.deposit` вслепую: приём
 * платежа по заказу и прибавляет его к `deposit` (оттуда считается
 * остаток), и пишет строку сюда. Две записи об одном — потому что у них
 * разные вопросы: «сколько клиент должен» и «что легло в кассу».
 */
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),

    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    kind: paymentKindEnum('kind').notNull(),
    method: paymentMethodEnum('method').notNull(),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),

    // Заказ или чек — что оплачено; для прочих продаж оба пусты.
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    retailSaleId: integer('retail_sale_id').references(() => retailSales.id, {
      onDelete: 'restrict',
    }),

    comment: text('comment'),

    // restrict: кто принял деньги — часть истории кассы.
    receivedBy: integer('received_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_received_at_idx').on(table.receivedAt),
    index('payments_order_idx').on(table.orderId),
    index('payments_received_by_idx').on(table.receivedBy, table.method),
    check('payments_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

/**
 * Инкассация: сотрудник сдал наличные в кассу.
 *
 * Наличные, принятые продавцом у прилавка или установщиком у двери, до
 * инкассации лежат у него, а не в кассе. Сколько у кого на руках — разница
 * между принятыми наличными и сданными. Сумму при сдаче сотрудник пишет
 * сам, а не система по чекам: сдаёт он то, что лежит в кармане, и если
 * оно разошлось с чеками — это должно быть видно, а не спрятано.
 */
export const cashCollections = pgTable(
  'cash_collections',
  {
    id: serial('id').primaryKey(),

    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    /** Кто сдал. */
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    comment: text('comment'),
    /**
     * Снимок фискального чека, пробитого на онлайн-кассе при сдаче.
     *
     * Инкассация без чека для налоговой — просто перекладывание денег; так
     * решил владелец, и API без снимка сдачу не принимает. Колонка nullable
     * ради записей, сделанных до этого правила, — переписывать их нечем.
     */
    receiptKey: text('receipt_key'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cash_collections_user_idx').on(table.userId, table.createdAt),
    index('cash_collections_created_at_idx').on(table.createdAt),
    check('cash_collections_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type CashCollection = typeof cashCollections.$inferSelect;

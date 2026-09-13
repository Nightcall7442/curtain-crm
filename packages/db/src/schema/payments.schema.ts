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

    /**
     * Наличные, принятые у клиента установщиком, до вечера лежат у него в
     * кармане, а не в кассе. Сдача в кассу — отдельная отметка директора:
     * пока её нет, в отчёте эти деньги «на руках», а не «в кассе». Карта,
     * QR и Click сдачи не требуют — их и так нет в кармане; у них отметка
     * ставится сразу при приёме.
     */
    handedOverAt: timestamp('handed_over_at', { withTimezone: true }),
    handedOverTo: integer('handed_over_to').references(() => users.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('payments_received_at_idx').on(table.receivedAt),
    index('payments_order_idx').on(table.orderId),
    index('payments_pending_handover_idx').on(table.receivedBy).where(sql`${table.handedOverAt} is null`),
    check('payments_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

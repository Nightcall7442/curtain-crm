import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { paymentKindEnum, paymentMethodEnum } from './enums';
import { orders } from './orders.schema';
import { payrollRecords } from './payroll.schema';
import { retailSales } from './retail.schema';
import { users } from './users.schema';

/**
 * Книга проводок — единственный источник правды о деньгах.
 *
 * Одна строка — одно движение: приход от клиента (первая оплата, остаток,
 * готовые шторы, прочие продажи), инкассация (наличные с рук в кассу),
 * выплата сотруднику по расчёту зарплаты, возврат клиенту. Что приход, что
 * расход и что перекладывание — говорит `kind`; чем двигали — `method`.
 *
 * Всё производное считается отсюда и только отсюда: «оплачено по заказу»
 * (`orders.paid_amount` поддерживает триггер `payments_sync_order_paid`),
 * «на руках» у сотрудника, «в кассе», «на счёте», норма терминальных чеков.
 * Раньше про одни деньги было четыре учёта, и они расходились.
 *
 * `received_by` — чьи руки: кто принял приход, кто сдал инкассацию, кто
 * выдал выплату или возврат. Для выплат руководство — это касса.
 *
 * Книга append-only по замыслу: ошибку исправляют возвратом или встречной
 * проводкой, а не правкой строки — иначе история кассы перестаёт сходиться.
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

    /** Всегда положительная; знак движения задаёт `kind`. */
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),

    // За что: заказ, чек витрины или расчёт зарплаты. У инкассации и прочих
    // продаж все три пусты.
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    retailSaleId: integer('retail_sale_id').references(() => retailSales.id, {
      onDelete: 'restrict',
    }),
    payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id, {
      onDelete: 'restrict',
    }),
    /** У выплаты — за какой день выдано (ежедневный расчёт); иначе пусто. */
    day: date('day'),

    /** Фото чека терминала — у приходов по карте; по ним считается норма дня продавцов. */
    photoKey: text('photo_key'),

    comment: text('comment'),

    // restrict: чьи руки — часть истории кассы.
    receivedBy: integer('received_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_received_at_idx').on(table.receivedAt),
    index('payments_order_idx').on(table.orderId),
    index('payments_received_by_idx').on(table.receivedBy, table.method),
    index('payments_payroll_record_idx').on(table.payrollRecordId),
    index('payments_method_received_at_idx').on(table.method, table.receivedAt),
    check('payments_amount_positive', sql`${table.amount} > 0`),
    // Выплата всегда привязана к расчёту, всё остальное — нет.
    check(
      'payments_payroll_link',
      sql`(${table.kind} = 'payroll') = (${table.payrollRecordId} is not null)`,
    ),
    // День «за что выдано» бывает только у выплат.
    check('payments_day_only_payroll', sql`${table.day} is null or ${table.kind} = 'payroll'`),
    // Инкассация — только наличными: безнал через руки не проходит.
    check(
      'payments_collection_cash',
      sql`${table.kind} <> 'collection' or ${table.method} = 'cash'`,
    ),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

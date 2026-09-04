import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { notificationTypeEnum } from './enums';
import { orders } from './orders.schema';
import { payrollRecords } from './payroll.schema';
import { users } from './users.schema';

/**
 * Внутренние уведомления сотрудников.
 *
 * В этой версии уведомляем только персонал и только о его собственных задачах:
 * назначен заказ, сменился статус его этапа, скорректирована смена. Клиентские
 * SMS/пуши не реализуются, но схема их не блокирует — достаточно добавить
 * значение в `NOTIFICATION_TYPES` и канал доставки в `notifications.service.ts`.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),

    // cascade: уведомление не имеет ценности в отрыве от адресата.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: notificationTypeEnum('type').notNull(),

    title: text('title').notNull(),
    body: text('body').notNull(),

    // cascade: уведомление ведёт на заказ; без заказа переход некуда сделать.
    relatedOrderId: integer('related_order_id').references(() => orders.id, {
      onDelete: 'cascade',
    }),

    /**
     * Расчёт зарплаты, к которому относится уведомление.
     *
     * Нужен не для перехода, а для ДЕЙСТВИЯ: получив «зарплата выплачена»,
     * сотрудник подтверждает получение прямо из уведомления, и кнопке надо
     * знать, какой именно расчёт подтверждать. Без этой ссылки пришлось бы
     * угадывать по периоду в тексте.
     *
     * cascade по той же причине, что и у заказа: подтверждать удалённый
     * расчёт нечего.
     */
    relatedPayrollRecordId: integer('related_payroll_record_id').references(
      () => payrollRecords.id,
      { onDelete: 'cascade' },
    ),

    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Основной запрос: лента сотрудника, свежие сверху.
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    // Счётчик непрочитанных на бейдже таба.
    index('notifications_user_unread_idx')
      .on(table.userId)
      .where(sql`not ${table.isRead}`),
    index('notifications_order_idx').on(table.relatedOrderId),

    check(
      'notifications_read_at_matches_flag',
      sql`(${table.isRead} and ${table.readAt} is not null)
          or (not ${table.isRead} and ${table.readAt} is null)`,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

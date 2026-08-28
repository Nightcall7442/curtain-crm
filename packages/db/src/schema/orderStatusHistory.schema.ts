import { index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { orderStatusEnum } from './enums';
import { orders } from './orders.schema';
import { users } from './users.schema';

/**
 * История переходов статуса заказа.
 *
 * Таблица строго append-only: записи НИКОГДА не обновляются и не удаляются.
 * Откат заказа на предыдущий этап — это такая же новая строка, где
 * `to_status` меньше `from_status` по шкале `ORDER_STATUS_STAGE_INDEX`,
 * с обязательным `comment` (причиной возврата).
 *
 * Единственная точка записи — `orderWorkflow.service.ts`; ни один роутер не
 * пишет сюда напрямую, иначе переход мог бы состояться без следа в истории.
 */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: serial('id').primaryKey(),

    // cascade: история — часть агрегата «заказ». Заказы не удаляются
    // (отмена — это статус), но висячая история при ручной чистке базы не нужна.
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** `null` только у самой первой записи — момента создания заказа. */
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),

    // restrict: «кто перевёл заказ» — часть аудита и не должно обезличиваться.
    changedBy: integer('changed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Комментарий. Обязателен для откатов, отклонений и отмен — это проверяет
     * `requiresComment()` из `@curtain-crm/shared` в сервисе. На уровне БД
     * не проверяем: правило зависит от пары статусов и легко меняется,
     * а check-констрейнт пришлось бы переписывать миграцией.
     */
    comment: text('comment'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_status_history_order_idx').on(table.orderId, table.createdAt),
    index('order_status_history_changed_by_idx').on(table.changedBy),
    index('order_status_history_to_status_idx').on(table.toStatus),
  ],
);

export type OrderStatusHistoryEntry = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistoryEntry = typeof orderStatusHistory.$inferInsert;

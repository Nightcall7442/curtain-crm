import { index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

/**
 * Журнал значимых действий.
 *
 * Пишем сюда то, что затрагивает деньги, права и учёт рабочего времени:
 * выдачу и отзыв ролей, ручную корректировку смен, отмену заказа, изменение
 * цены закупочного товара, утверждение и выплату зарплаты.
 *
 * Таблица append-only: записи не обновляются и не удаляются.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),

    // restrict: журнал без автора действия бесполезен.
    actorId: integer('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Код действия, например `user.role_granted` или `shift.adjusted`.
     *
     * Хранится текстом, а не pg-энумом, осознанно: список действий пополняется
     * вместе с каждым новым сценарием, и держать его в типе БД означало бы
     * миграцию на каждую такую правку. Допустимые значения перечислены
     * в `AUDIT_ACTIONS` (`apps/api/src/lib/constants.ts`) и проверяются Zod'ом.
     */
    action: text('action').notNull(),

    /** Тип сущности: `user`, `order`, `shift`, `payroll_record`, `branch`, ... */
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),

    /** Произвольные детали: старое и новое значение, причина, вход процедуры. */
    details: jsonb('details').$type<Record<string, unknown>>(),

    /** IP клиента — помогает разбирать спорные корректировки смен. */
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_actor_idx').on(table.actorId, table.createdAt),
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_action_idx').on(table.action, table.createdAt),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

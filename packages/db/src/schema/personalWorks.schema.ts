import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { personalWorkStatusEnum } from './enums';
import { users } from './users.schema';

/**
 * Личные работы — то, что сотрудник шьёт себе или знакомым в цеху.
 *
 * Не заказ и не доп. работа: клиента у компании нет, деньги не идут, в
 * конвейере вещь не участвует. Но станок она занимает и ткань расходует,
 * поэтому руководство должно видеть загрузку цеха, а не узнавать о ней по
 * остаткам на складе.
 *
 * Запись заводит САМ сотрудник — отсюда единственная ссылка на человека.
 * Автора и исполнителя тут не различают намеренно: у поручения это разные
 * люди (руководитель выдал, сотрудник делает), а здесь всегда один и тот
 * же, и вторая колонка только создавала бы иллюзию, что бывает иначе.
 *
 * Записи не удаляются: закрытая работа — часть истории загрузки цеха.
 * Ошибочную отменяют, как заказ.
 */
export const personalWorks = pgTable(
  'personal_works',
  {
    id: serial('id').primaryKey(),

    // restrict: сотрудников система не удаляет (увольнение — деактивация),
    // а запись без человека не значит ничего.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Что именно шьётся: «Шторы в спальню, себе». */
    title: varchar('title', { length: 200 }).notNull(),
    details: text('details'),

    status: personalWorkStatusEnum('status').notNull().default('in_progress'),

    /**
     * Причина отмены. Обязательна при отмене — проверяется констрейнтом,
     * как у заказа: «отменено без объяснения» через полгода не разобрать.
     */
    cancellationReason: text('cancellation_reason'),

    /**
     * Когда работу закрыли — выполнением или отменой.
     *
     * Одна отметка на оба исхода, а не две: цех она перестаёт занимать в
     * обоих случаях, и «сколько времени станок был под личной работой»
     * считается по одной колонке.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Основной запрос: свои работы сотрудника, свежие сверху.
    index('personal_works_user_idx').on(table.userId, table.createdAt),
    // Сводка руководства «что сейчас занимает цех».
    index('personal_works_status_idx').on(table.status),

    check(
      'personal_works_cancellation_reason_required',
      sql`${table.status} <> 'cancelled' or ${table.cancellationReason} is not null`,
    ),
    // Закрытая работа обязана нести отметку времени, открытая — не должна:
    // иначе «в работе» с датой закрытия попадёт в отчёт как завершённая.
    check(
      'personal_works_closed_at_matches_status',
      sql`(${table.status} = 'in_progress') = (${table.closedAt} is null)`,
    ),
  ],
);

export type PersonalWork = typeof personalWorks.$inferSelect;
export type NewPersonalWork = typeof personalWorks.$inferInsert;

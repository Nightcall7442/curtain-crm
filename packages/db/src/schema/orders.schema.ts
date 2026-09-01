import { sql } from 'drizzle-orm';
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { orderItemKindEnum, orderStatusEnum, orderTypeEnum, priorityEnum } from './enums';
import { users } from './users.schema';

/**
 * Заказы — центральная сущность системы.
 *
 * Отменённые и выполненные заказы НЕ удаляются и не переносятся в отдельную
 * таблицу: раздел «Архив» веб-панели — это фильтр по `status in ('completed',
 * 'cancelled')` (см. `ARCHIVED_ORDER_STATUSES` в `@curtain-crm/shared`).
 *
 * Политики `onDelete`:
 *  - `branch_id`, `created_by` — `restrict`: заказ не должен «повиснуть» без
 *    филиала и без автора, а филиалы и сотрудники деактивируются, а не удаляются;
 *  - назначения исполнителей — тоже `restrict` по той же причине: снять
 *    исполнителя с заказа нужно явным действием, а не удалением его учётки.
 *    История назначений при этом всё равно остаётся в `order_status_history`.
 */
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),

    /**
     * Человекочитаемый номер заказа: `DH-000123`.
     *
     * Вычисляемая колонка, а не поле, которое заполняет сервис: так номер
     * физически не может разъехаться с `id` и не требует отдельного счётчика
     * с гонками при параллельном создании заказов.
     */
    orderNumber: text('order_number').generatedAlwaysAs(
      sql`'DH-' || lpad(id::text, 6, '0')`,
    ),

    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    status: orderStatusEnum('status').notNull().default('new'),
    /**
     * Пошив на заказ или продажа готовых штор. Задаётся при создании и не
     * меняется: у типов разные жизненные циклы (см. `ORDER_TRANSITIONS`).
     */
    orderType: orderTypeEnum('order_type').notNull().default('custom'),
    priority: priorityEnum('priority').notNull().default('normal'),

    /* --- Клиент ----------------------------------------------------------- */

    clientName: text('client_name').notNull(),
    /** Телефон клиента в E.164 — нормализуется `normalizePhone()` до записи. */
    clientPhone: text('client_phone').notNull(),
    clientComment: text('client_comment'),

    /* --- Адрес установки --------------------------------------------------- */

    installAddress: text('install_address'),
    installLatitude: doublePrecision('install_latitude'),
    installLongitude: doublePrecision('install_longitude'),

    deadline: date('deadline'),

    /* --- Деньги ------------------------------------------------------------ */

    /** Стоимость работ для клиента. Себестоимость считается по `purchases`. */
    workPrice: numeric('work_price', { precision: 14, scale: 2 }).notNull().default('0'),
    deposit: numeric('deposit', { precision: 14, scale: 2 }).notNull().default('0'),

    /**
     * Остаток к оплате. Вычисляемая колонка: в `curtain-bot` это было обычное
     * поле, которое рассинхронизировалось при правке цены задним числом.
     * Значение может быть отрицательным — это переплата, а не ошибка.
     */
    remainingPayment: numeric('remaining_payment', { precision: 14, scale: 2 })
      .generatedAlwaysAs(sql`work_price - deposit`),

    /* --- Участники --------------------------------------------------------- */

    /** Продавец или админ, создавший заказ. */
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    masterId: integer('master_id').references(() => users.id, { onDelete: 'restrict' }),
    sewerId: integer('sewer_id').references(() => users.id, { onDelete: 'restrict' }),
    qcId: integer('qc_id').references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Ответственный установщик — один. Физически на объекте может работать
     * бригада, её состав (опционально) фиксируется в `order_installation_team`.
     */
    installerId: integer('installer_id').references(() => users.id, { onDelete: 'restrict' }),

    /* --- Отметки времени ---------------------------------------------------- */

    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** Причина отмены обязательна — проверяется и в сервисе, и check-констрейнтом. */
    cancellationReason: text('cancellation_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('orders_order_number_unique').on(table.orderNumber),

    index('orders_status_idx').on(table.status),
    index('orders_branch_idx').on(table.branchId),
    index('orders_created_by_idx').on(table.createdBy),
    index('orders_master_idx').on(table.masterId),
    index('orders_sewer_idx').on(table.sewerId),
    index('orders_qc_idx').on(table.qcId),
    index('orders_installer_idx').on(table.installerId),
    index('orders_deadline_idx').on(table.deadline),
    index('orders_client_phone_idx').on(table.clientPhone),
    index('orders_created_at_idx').on(table.createdAt),
    // Основной запрос списка: активные заказы филиала, свежие сверху.
    index('orders_branch_status_created_idx').on(table.branchId, table.status, table.createdAt),

    check('orders_client_phone_e164', sql`${table.clientPhone} ~ '^\\+998[0-9]{9}$'`),
    check('orders_work_price_non_negative', sql`${table.workPrice} >= 0`),
    check('orders_deposit_non_negative', sql`${table.deposit} >= 0`),
    // Отменённый заказ обязан нести причину отмены.
    check(
      'orders_cancellation_reason_required',
      sql`${table.status} <> 'cancelled' or ${table.cancellationReason} is not null`,
    ),
  ],
);

/**
 * Позиции заказа: окна, двери и прочие изделия.
 *
 * В `curtain-bot` заказ состоял ровно из двух жёстко заданных блоков — основного
 * и дверного (колонки `door_*`), — поэтому заказ на три окна приходилось заводить
 * тремя заказами. Здесь это обобщено до списка позиций; исходное различие
 * сохранено в `kind`, так что старая структура полностью выражается новой.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),

    // cascade: позиция не существует отдельно от заказа.
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    kind: orderItemKindEnum('kind').notNull().default('window'),
    /** Порядок отображения позиции внутри заказа. */
    position: integer('position').notNull().default(0),

    model: text('model'),
    /** Материалы — множественный выбор, поэтому массив, а не одно поле. */
    materials: text('materials').array().notNull().default(sql`'{}'::text[]`),
    materialOptions: text('material_options').array().notNull().default(sql`'{}'::text[]`),
    color: text('color'),
    characteristics: text('characteristics'),

    /** Размеры в сантиметрах, площадь в м² — разбираются `parseDimensions()`. */
    widthCm: numeric('width_cm', { precision: 7, scale: 1 }),
    heightCm: numeric('height_cm', { precision: 7, scale: 1 }),
    areaM2: numeric('area_m2', { precision: 10, scale: 4 }),

    cornice: text('cornice'),
    corniceRotation: text('cornice_rotation'),
    tulle: text('tulle'),
    sachak: text('sachak'),
    accessory: text('accessory'),

    quantity: integer('quantity').notNull().default(1),
    comment: text('comment'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId, table.position),
    check('order_items_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'order_items_width_range',
      sql`${table.widthCm} is null or ${table.widthCm} between 1 and 2000`,
    ),
    check(
      'order_items_height_range',
      sql`${table.heightCm} is null or ${table.heightCm} between 1 and 2000`,
    ),
  ],
);

/**
 * Состав бригады установщиков (опционально).
 *
 * Ответственный установщик — это `orders.installer_id`; эта таблица лишь
 * фиксирует, кто ещё физически был на объекте. Она НЕ участвует в проверках
 * прав и переходах статусов, поэтому её отсутствие не блокирует MVP.
 */
export const orderInstallationTeam = pgTable(
  'order_installation_team',
  {
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    addedBy: integer('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.userId] }),
    index('order_installation_team_user_idx').on(table.userId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderInstallationTeamMember = typeof orderInstallationTeam.$inferSelect;
export type NewOrderInstallationTeamMember = typeof orderInstallationTeam.$inferInsert;

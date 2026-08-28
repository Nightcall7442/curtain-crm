import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { catalogKindEnum } from './enums';
import { users } from './users.schema';

/**
 * Справочники характеристик заказа: модели штор, материалы, цвета, карнизы и т. д.
 *
 * В `curtain-bot` эти списки задавались переменными окружения и требовали
 * перезапуска для правки. Здесь они живут в БД и редактируются CEO/админом
 * из веб-панели; начальное наполнение берётся из `DEFAULT_CATALOG_ITEMS`
 * (`@curtain-crm/shared`) при сидировании.
 *
 * Позиции заказа (`order_items`) хранят выбранные значения текстом, а не FK:
 * переименование или удаление справочной позиции не должно задним числом менять
 * состав уже принятого заказа.
 */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: serial('id').primaryKey(),

    kind: catalogKindEnum('kind').notNull(),
    name: text('name').notNull(),

    /** Порядок в выпадающем списке; при равенстве — сортировка по названию. */
    sortOrder: integer('sort_order').notNull().default(0),

    isActive: boolean('is_active').notNull().default(true),

    /**
     * Кто завёл значение справочника.
     *
     * `restrict`, как и у всех колонок «кто сделал» в схеме (`orders.created_by`,
     * `audit_log.actor_id`, `purchases.created_by`): сотрудников система не
     * удаляет вовсе — увольнение это `setActive(false)`, — и запрет на удаление
     * здесь лишь подкрепляет это правило на уровне БД. Колонка при этом
     * nullable: значение справочника переживает автора, если строку когда-нибудь
     * заведут в обход приложения.
     */
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Внутри одного справочника название уникально без учёта регистра.
    uniqueIndex('catalog_items_kind_name_unique').on(table.kind, sql`lower(${table.name})`),
    index('catalog_items_kind_active_idx').on(table.kind, table.isActive, table.sortOrder),
  ],
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;

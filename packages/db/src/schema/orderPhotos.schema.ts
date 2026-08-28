import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { photoStageEnum } from './enums';
import { orders } from './orders.schema';
import { users } from './users.schema';

/**
 * Фотофиксация этапов заказа.
 *
 * В БД лежит только ссылка на файл (`storage_key`), сам файл — в хранилище
 * за абстракцией `apps/api/src/services/storage.service.ts` (в разработке —
 * локальный диск, в проде — S3-совместимое хранилище). Публичный URL никогда
 * не хранится: он подписанный и живёт минуты.
 *
 * Загрузка фото стадии `install_after` автоматически переводит заказ в
 * `completed` — см. `AUTO_COMPLETE_PHOTO_STAGE` в `@curtain-crm/shared`.
 */
export const orderPhotos = pgTable(
  'order_photos',
  {
    id: serial('id').primaryKey(),

    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    stage: photoStageEnum('stage').notNull().default('general'),

    /** Ключ объекта в хранилище, например `orders/123/qc/uuid.jpg`. */
    storageKey: text('storage_key').notNull(),

    /** Имя файла, как его назвал пользователь, — только для отображения. */
    originalFileName: text('original_file_name'),

    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),

    // restrict: автор фотофиксации — часть доказательной базы по заказу.
    uploadedBy: integer('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('order_photos_storage_key_unique').on(table.storageKey),
    index('order_photos_order_stage_idx').on(table.orderId, table.stage),
    index('order_photos_uploaded_by_idx').on(table.uploadedBy),

    check('order_photos_size_positive', sql`${table.sizeBytes} > 0`),
    check('order_photos_mime_is_image', sql`${table.mimeType} like 'image/%'`),
  ],
);

export type OrderPhoto = typeof orderPhotos.$inferSelect;
export type NewOrderPhoto = typeof orderPhotos.$inferInsert;

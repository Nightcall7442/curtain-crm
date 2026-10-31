import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { boardPhotoKindEnum } from './enums';
import { users } from './users.schema';

/**
 * Фото человека для табло — по одному на статус.
 *
 * Заказчик (переписка 25.10): швея за машинкой, швея без работы, швея с
 * чашкой — и табло показывает то, что соответствует статусу. Эти фото
 * «только для табло»: профиль, шапка и списки сотрудников по-прежнему берут
 * `users.avatar*`, поэтому фото живут отдельной таблицей, а не колонками
 * пользователя, которые читает вся система.
 *
 * Как и у аватарки — оригинал и превью: на ТВ уходит только превью
 * (оригинал с телефона несёт метаданные места съёмки и весит мегабайты).
 * Ключи известны уборке хранилища (`storage-gc.ts`).
 */
export const boardPhotos = pgTable(
  'board_photos',
  {
    id: serial('id').primaryKey(),

    // restrict: сотрудников система не удаляет, увольнение — деактивация.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    kind: boardPhotoKindEnum('kind').notNull(),

    storageKey: text('storage_key').notNull(),
    /** `null` — превью сделать не вышло; ТВ тогда покажет аватарку. */
    previewKey: text('preview_key'),

    uploadedBy: integer('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Одно фото на статус: новое заменяет прежнее, а не копится рядом.
    uniqueIndex('board_photos_user_kind_uniq').on(table.userId, table.kind),
    index('board_photos_uploaded_by_idx').on(table.uploadedBy),
  ],
);

export type BoardPhoto = typeof boardPhotos.$inferSelect;

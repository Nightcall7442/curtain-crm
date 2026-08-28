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
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { orders } from './orders.schema';
import { users } from './users.schema';

/**
 * Комментарии к заказу — текстовые и голосовые.
 *
 * Доступны всем, кто участвует в заказе на любом этапе: продавец видит, что
 * написала швея, установщик — что отметил контроль качества. Ограничение
 * доступа реализовано в `orderComments.router.ts` (участник заказа либо
 * руководство), а не на уровне схемы.
 */
export const orderComments = pgTable(
  'order_comments',
  {
    id: serial('id').primaryKey(),

    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    // restrict: автор комментария не должен обезличиваться.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Текст комментария. Для голосового — расшифровка, если она есть. */
    body: text('body'),

    isVoice: boolean('is_voice').notNull().default(false),

    /** Ключ аудиофайла в хранилище — заполняется только для голосовых. */
    voiceStorageKey: text('voice_storage_key'),
    voiceDurationSeconds: integer('voice_duration_seconds'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_comments_order_idx').on(table.orderId, table.createdAt),
    index('order_comments_user_idx').on(table.userId),
    uniqueIndex('order_comments_voice_key_unique').on(table.voiceStorageKey),

    // Комментарий обязан нести содержимое: либо текст, либо запись.
    check(
      'order_comments_payload_required',
      sql`(${table.isVoice} and ${table.voiceStorageKey} is not null)
          or (not ${table.isVoice} and ${table.body} is not null and length(btrim(${table.body})) > 0)`,
    ),
    check(
      'order_comments_voice_duration_positive',
      sql`${table.voiceDurationSeconds} is null or ${table.voiceDurationSeconds} > 0`,
    ),
  ],
);

export type OrderComment = typeof orderComments.$inferSelect;
export type NewOrderComment = typeof orderComments.$inferInsert;

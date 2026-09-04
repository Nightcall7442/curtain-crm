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

import { tasks } from './tasks.schema';
import { users } from './users.schema';

/**
 * Переписка по поручению: и то, что приложил руководитель, и ответ исполнителя.
 *
 * Одна таблица на обе стороны, а не «вложения руководителя» плюс «отчёт
 * сотрудника». Разговор по поручению идёт в обе стороны и не по одному разу:
 * «перешей ламбрекен, вот фото брака» — «перешила, вот результат» — «здесь
 * ещё складка». Две таблицы заставили бы склеивать это в ленту при каждом
 * чтении и разошлись бы по правилам доступа.
 *
 * Сообщение несёт текст, файл или и то и другое — но не пустоту: проверка
 * ниже не даёт записать строку без единого содержимого. Пустая реплика в
 * переписке означала бы сбой, а не сообщение.
 *
 * Файл хранится так же, как фото заказа: ключ в объектном хранилище, а не
 * сам файл в базе. Ссылка на скачивание подписывается на лету.
 */
export const taskMessages = pgTable(
  'task_messages',
  {
    id: serial('id').primaryKey(),

    // cascade: переписка живёт ровно столько же, сколько поручение. Само
    // поручение система не удаляет — отменённое остаётся историей.
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),

    // restrict: автор реплики — часть истории поручения, как и автор фото
    // заказа. Сотрудников система не удаляет, увольнение это деактивация.
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    body: text('body'),

    /* --- Вложение. Либо все поля заполнены, либо ни одно ------------------ */
    storageKey: text('storage_key'),
    originalFileName: text('original_file_name'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('task_messages_task_idx').on(table.taskId, table.createdAt),
    index('task_messages_author_idx').on(table.authorId),

    // Частичный уникальный: ключ хранилища не повторяется, но пустых
    // (у сообщений без файла) может быть сколько угодно.
    uniqueIndex('task_messages_storage_key_unique')
      .on(table.storageKey)
      .where(sql`${table.storageKey} is not null`),

    /*
      Вложение — всё или ничего.

      Полуфабрикат вида «ключ есть, типа нет» невозможно ни показать, ни
      скачать: подпись ссылки строится по ключу, а отдать файл без MIME
      браузер не сможет. Такую строку проще не пустить в базу, чем потом
      разбираться, откуда она взялась.
    */
    check(
      'task_messages_attachment_complete',
      sql`(${table.storageKey} is null and ${table.mimeType} is null
           and ${table.sizeBytes} is null)
          or (${table.storageKey} is not null and ${table.mimeType} is not null
              and ${table.sizeBytes} is not null)`,
    ),
    check(
      'task_messages_size_positive',
      sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`,
    ),
    // Пустая реплика — сбой, а не сообщение.
    check(
      'task_messages_not_empty',
      sql`${table.body} is not null or ${table.storageKey} is not null`,
    ),
  ],
);

export type TaskMessage = typeof taskMessages.$inferSelect;
export type NewTaskMessage = typeof taskMessages.$inferInsert;

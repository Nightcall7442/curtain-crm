/**
 * Уборка осиротевших файлов в хранилище.
 *
 * Файлы и строки БД живут порознь. Процедуры удаления фото, комментария и
 * аватара убирают файл сами, но есть пути, где строка исчезает мимо них:
 *  - каскад `ON DELETE CASCADE` от `orders` на `order_photos` и
 *    `order_comments` — срабатывает при удалении заказа напрямую в БД;
 *  - прерванная загрузка: файл кладётся ДО записи в БД, и если процесс упал
 *    между ними, объект остаётся без ссылки.
 * В обоих случаях в хранилище копится то, на что никто не ссылается.
 *
 * Скрипт сверяет содержимое каталога со всеми колонками, где хранятся ключи,
 * и удаляет лишнее. По умолчанию только показывает, что нашёл; удаляет
 * с флагом `--apply`.
 *
 * Запуск:
 *   pnpm --filter @curtain-crm/api gc
 *   pnpm --filter @curtain-crm/api gc -- --apply
 */
import {
  closeDatabase,
  createDatabase,
  orderComments,
  orderPhotos,
  users,
} from '@curtain-crm/db';
import { config as loadEnv } from 'dotenv';
import { isNotNull } from 'drizzle-orm';

import { getEnv } from '../lib/constants';
import { getStorage, listDiskStorageKeys } from '../services/storage.service';

loadEnv({ path: ['.env', '../../.env'] });

/**
 * Насколько свежие файлы не трогаем.
 *
 * Загрузка кладёт файл в хранилище раньше, чем строку в БД. Между этими
 * шагами объект выглядит осиротевшим, хотя через долю секунды перестанет им
 * быть. Час запаса делает гонку невозможной на практике.
 */
const MIN_AGE_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const env = getEnv();

  if (env.STORAGE_DRIVER !== 'disk') {
    process.stdout.write(
      'Уборка написана для STORAGE_DRIVER=disk. У S3 для этого есть правила ' +
        'жизненного цикла объектов на стороне бакета.\n',
    );
    return;
  }

  const shouldApply = process.argv.includes('--apply');
  const { db, client } = createDatabase(env.DATABASE_URL, { maxConnections: 2 });

  try {
    /* --- Все ключи, на которые кто-то ссылается ---------------------------- */
    const [photos, voices, avatars] = await Promise.all([
      db.select({ key: orderPhotos.storageKey }).from(orderPhotos),
      db
        .select({ key: orderComments.voiceStorageKey })
        .from(orderComments)
        .where(isNotNull(orderComments.voiceStorageKey)),
      db
        .select({ key: users.avatarStorageKey })
        .from(users)
        .where(isNotNull(users.avatarStorageKey)),
    ]);

    const referenced = new Set<string>();
    for (const row of [...photos, ...voices, ...avatars]) {
      if (row.key !== null) referenced.add(row.key);
    }

    /* --- Что лежит на диске ------------------------------------------------ */
    const onDisk = await listDiskStorageKeys(env.STORAGE_DISK_PATH);
    const now = Date.now();

    const orphans = onDisk.filter(
      (entry) => !referenced.has(entry.key) && now - entry.modifiedAt.getTime() >= MIN_AGE_MS,
    );
    const tooFresh = onDisk.filter(
      (entry) => !referenced.has(entry.key) && now - entry.modifiedAt.getTime() < MIN_AGE_MS,
    );

    process.stdout.write(
      `Файлов в хранилище: ${onDisk.length.toString()}\n` +
        `Ссылок в БД:        ${referenced.size.toString()}\n` +
        `Без ссылок:         ${orphans.length.toString()}` +
        (tooFresh.length > 0
          ? ` (+${tooFresh.length.toString()} свежих, пропущены — возможно, грузятся прямо сейчас)\n`
          : '\n'),
    );

    if (orphans.length === 0) {
      process.stdout.write('Убирать нечего.\n');
      return;
    }

    for (const entry of orphans) {
      process.stdout.write(`  ${shouldApply ? 'удаляю' : 'нашёл '} ${entry.key}\n`);
    }

    if (!shouldApply) {
      process.stdout.write('\nНичего не удалено. Повторите с флагом --apply.\n');
      return;
    }

    const storage = getStorage();
    let removed = 0;
    for (const entry of orphans) {
      await storage.delete(entry.key).then(
        () => {
          removed += 1;
        },
        (error: unknown) => {
          process.stderr.write(
            `  не удалось удалить ${entry.key}: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        },
      );
    }

    process.stdout.write(`\nУдалено файлов: ${removed.toString()}\n`);
  } finally {
    await closeDatabase(client);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

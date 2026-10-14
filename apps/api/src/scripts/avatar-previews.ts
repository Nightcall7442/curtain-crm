/**
 * Превью для фото сотрудников, загруженных до появления табло.
 *
 * Новые фото получают превью при загрузке (`users.setAvatar`). Этот скрипт
 * один раз догоняет старые: читает оригинал, делает превью и записывает его
 * ключ. Повторный запуск безопасен — обрабатываются только фото без превью.
 * Нечитаемые как картинка файлы пропускаются: табло покажет оригинал.
 *
 * Запуск: `pnpm --filter @curtain-crm/api avatars:previews`
 */
import { buildStorageKey, getStorage } from '../services/storage.service';
import { makeAvatarPreview } from '../services/avatarPreview.service';
import { createDatabase, closeDatabase, users } from '@curtain-crm/db';
import { config as loadEnv } from 'dotenv';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { getEnv } from '../lib/constants';

loadEnv({ path: ['.env', '../../.env'] });

async function main(): Promise<void> {
  const env = getEnv();
  const { db, client } = createDatabase(env.DATABASE_URL, { maxConnections: 2 });
  const storage = getStorage();

  let made = 0;
  let skipped = 0;

  try {
    const pending = await db
      .select({ id: users.id, key: users.avatarStorageKey })
      .from(users)
      .where(and(isNotNull(users.avatarStorageKey), isNull(users.avatarPreviewKey)));

    for (const row of pending) {
      if (row.key === null) continue;

      const original = await storage.read(row.key).catch(() => null);
      const preview = original === null ? null : await makeAvatarPreview(original);
      if (preview === null) {
        skipped += 1;
        continue;
      }

      const stored = await storage.upload({
        key: buildStorageKey(['avatars', row.id.toString(), 'preview'], 'image/webp'),
        body: preview,
        mimeType: 'image/webp',
      });
      // Условие на старый ключ: если фото успели заменить, пока скрипт
      // работал, новое уже со своим превью, и это — лишнее.
      const updated = await db
        .update(users)
        .set({ avatarPreviewKey: stored.key })
        .where(and(eq(users.id, row.id), eq(users.avatarStorageKey, row.key), isNull(users.avatarPreviewKey)))
        .returning({ id: users.id });

      if (updated.length === 0) {
        await storage.delete(stored.key).catch(() => undefined);
        skipped += 1;
        continue;
      }
      made += 1;
    }
  } finally {
    await closeDatabase(client);
  }

  process.stdout.write(`Превью сделано: ${made.toString()}, пропущено: ${skipped.toString()}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Ошибка: ${String(error)}\n`);
  process.exitCode = 1;
});

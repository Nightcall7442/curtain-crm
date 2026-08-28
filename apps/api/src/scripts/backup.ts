/**
 * Резервная копия развёрнутой системы.
 *
 * Копируется ДВОЕ, потому что данные лежат в двух местах и по отдельности
 * бесполезны:
 *  - база: заказы, сотрудники, смены, зарплаты, история и журнал аудита;
 *  - хранилище файлов при `STORAGE_DRIVER=disk`: фотографии этапов, голосовые
 *    комментарии, аватары. В БД от них только ключи — без файлов галерея
 *    заказа пуста, а восстановить их неоткуда.
 * При `STORAGE_DRIVER=s3` файлы не копируются: у бакета для этого есть
 * версионирование и правила жизненного цикла на своей стороне.
 *
 * Дамп делается в формате `custom` (`-Fc`): он сжат, восстанавливается
 * выборочно и не ломается от несовпадения версий так, как простой SQL-текст.
 *
 * Запуск:
 *   pnpm --filter @curtain-crm/api backup
 *   BACKUP_DIR=/var/backups/curtain pnpm --filter @curtain-crm/api backup
 *
 * Восстановление печатается в конце каждого прогона — команду не нужно
 * вспоминать в тот момент, когда она понадобится.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

import { getEnv } from '../lib/constants';

loadEnv({ path: ['.env', '../../.env'] });

/** Сколько копий хранить. Старые удаляются после успешного создания новой. */
const KEEP_COPIES = Number.parseInt(process.env['BACKUP_KEEP'] ?? '14', 10);

/** Куда складывать. По умолчанию — рядом с проектом. */
const BACKUP_ROOT = resolve(process.env['BACKUP_DIR'] ?? './backups');

/**
 * Где искать `pg_dump`.
 *
 * В PATH он есть не всегда: на Windows установщик PostgreSQL кладёт его
 * в `Program Files` и в PATH не добавляет. Порядок поиска — переменная,
 * потом PATH, потом типичные места установки.
 */
function resolvePgDump(): string {
  const explicit = process.env['PG_DUMP_PATH'];
  if (explicit !== undefined && explicit.length > 0) return explicit;

  const candidates = [
    'C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',
    'C:/Program Files/PostgreSQL/16/bin/pg_dump.exe',
    'C:/Program Files/PostgreSQL/15/bin/pg_dump.exe',
    '/usr/bin/pg_dump',
    '/usr/local/bin/pg_dump',
  ];

  return candidates.find((path) => existsSync(path)) ?? 'pg_dump';
}

/** Метка вида `2026-08-28T03-15-42` — годится и для имени файла, и для сортировки. */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Разбирает `DATABASE_URL` на аргументы `pg_dump` и переменные окружения.
 *
 * Пароль передаётся через `PGPASSWORD`, а не в строке подключения: аргументы
 * командной строки видны в списке процессов любому пользователю машины,
 * а переменные окружения процесса — нет.
 */
function connectionArgs(databaseUrl: string): {
  readonly args: readonly string[];
  readonly env: Record<string, string>;
} {
  const url = new URL(databaseUrl);

  return {
    args: [
      `--host=${url.hostname}`,
      `--port=${url.port === '' ? '5432' : url.port}`,
      `--username=${decodeURIComponent(url.username)}`,
      `--dbname=${url.pathname.replace(/^\//, '')}`,
    ],
    env: url.password === '' ? {} : { PGPASSWORD: decodeURIComponent(url.password) },
  };
}

function run(
  command: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', (error: Error) => {
      rejectPromise(
        new Error(
          `Не удалось запустить «${command}»: ${error.message}. ` +
            'Укажите путь переменной PG_DUMP_PATH.',
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`«${command}» завершился с кодом ${String(code)}`));
    });
  });
}

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/** Суммарный размер каталога, рекурсивно. */
async function directorySize(path: string): Promise<number> {
  let total = 0;
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += (await stat(full).catch(() => null))?.size ?? 0;
  }

  return total;
}

/**
 * Удаляет копии сверх лимита.
 *
 * Строго ПОСЛЕ успешного создания новой: иначе неудачный прогон сначала
 * освободил бы место, а потом не создал замену — и копий стало бы меньше.
 */
async function rotate(): Promise<void> {
  const entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
  const copies = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const extra = copies.slice(0, Math.max(0, copies.length - KEEP_COPIES));

  for (const name of extra) {
    await rm(join(BACKUP_ROOT, name), { recursive: true, force: true });
    process.stdout.write(`  удалена старая копия: ${name}\n`);
  }
}

async function main(): Promise<void> {
  const env = getEnv();
  const target = join(BACKUP_ROOT, stamp());

  await mkdir(target, { recursive: true });
  process.stdout.write(`Копия: ${target}\n\n`);

  /* --- База --------------------------------------------------------------- */
  const dumpPath = join(target, 'database.dump');
  process.stdout.write('База данных…\n');

  const connection = connectionArgs(env.DATABASE_URL);

  await run(
    resolvePgDump(),
    // Опции идут ДО имени базы: `pg_dump` перестаёт разбирать флаги, встретив
    // первый позиционный аргумент, и `--format=custom` после строки подключения
    // считается лишним аргументом.
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${dumpPath}`,
      ...connection.args,
    ],
    connection.env,
  );

  const dumpSize = (await stat(dumpPath)).size;
  if (dumpSize === 0) throw new Error('Дамп пуст — копия непригодна');
  process.stdout.write(`  database.dump — ${megabytes(dumpSize)}\n`);

  /* --- Файлы -------------------------------------------------------------- */
  if (env.STORAGE_DRIVER === 'disk' && existsSync(env.STORAGE_DISK_PATH)) {
    process.stdout.write('\nХранилище файлов…\n');
    const filesTarget = join(target, 'storage');
    await cp(env.STORAGE_DISK_PATH, filesTarget, { recursive: true });
    process.stdout.write(`  storage/ — ${megabytes(await directorySize(filesTarget))}\n`);
  } else if (env.STORAGE_DRIVER === 's3') {
    process.stdout.write('\nХранилище S3 — копируется на стороне бакета, здесь пропущено.\n');
  }

  /* --- Ротация ------------------------------------------------------------ */
  process.stdout.write('\nРотация…\n');
  await rotate();

  const kept = (await readdir(BACKUP_ROOT)).filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name));
  process.stdout.write(`  копий хранится: ${kept.length.toString()} из ${KEEP_COPIES.toString()}\n`);

  process.stdout.write(
    '\nВосстановление:\n' +
      `  createdb curtain_crm_restored\n` +
      `  pg_restore --dbname=curtain_crm_restored --no-owner --clean --if-exists "${dumpPath}"\n` +
      (env.STORAGE_DRIVER === 'disk'
        ? `  скопировать «${join(target, 'storage')}» в STORAGE_DISK_PATH\n`
        : ''),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

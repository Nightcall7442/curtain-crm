import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export * as schema from './schema';
export * from './schema';

/**
 * Хеширование паролей: формат `users.password_hash` — часть контракта таблицы,
 * поэтому реализация живёт здесь, а `apps/api` её импортирует.
 */
export * from './lib/password';

/** Тип подключения к БД, который принимают все сервисы `apps/api`. */
export type Database = ReturnType<typeof createDatabase>['db'];

/**
 * Тип транзакции. Сервисы принимают `Database | Transaction`, чтобы их можно
 * было вызывать как самостоятельно, так и внутри `db.transaction(...)`.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Исполнитель запросов: обычное подключение либо транзакция. */
export type DbExecutor = Database | Transaction;

export interface CreateDatabaseOptions {
  /** Логировать SQL. По умолчанию — только в разработке. */
  readonly logQueries?: boolean;
  /** Размер пула подключений. */
  readonly maxConnections?: number;
}

/**
 * Создаёт подключение к PostgreSQL.
 *
 * Фабрика, а не готовый экспортируемый инстанс: тестам и скриптам миграции
 * нужны отдельные подключения к другим базам, а API — ровно одно на процесс.
 * postgres.js подключается лениво, поэтому вызов сам по себе не открывает сокет.
 */
export function createDatabase(connectionString: string, options: CreateDatabaseOptions = {}) {
  if (connectionString.trim().length === 0) {
    throw new Error('Строка подключения к БД (DATABASE_URL) не задана');
  }

  const client = postgres(connectionString, {
    max: options.maxConnections ?? 10,
    // Явно фиксируем UTC: сервер, разработчик и Postgres могут быть в разных
    // зонах, а смены и дедлайны сравниваются по абсолютному времени.
    types: {},
    onnotice: () => undefined,
  });

  const db = drizzle(client, {
    schema,
    logger: options.logQueries ?? false,
  });

  return { db, client } as const;
}

/**
 * Закрывает подключение. Нужна тестам и graceful shutdown API-сервера:
 * без неё процесс не завершится, пока пул держит сокеты.
 */
export async function closeDatabase(client: postgres.Sql): Promise<void> {
  await client.end({ timeout: 5 });
}

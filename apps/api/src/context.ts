import { randomUUID } from 'node:crypto';

import { createDatabase, users, type Database, type DbExecutor } from '@curtain-crm/db';
import type { Role } from '@curtain-crm/shared';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { eq } from 'drizzle-orm';

import { getEnv } from './lib/constants';
import { extractBearerToken, verifyAccessToken } from './lib/jwt';
import type { AuthenticatedUser } from './types';

/**
 * Контекст tRPC-запроса.
 *
 * `user` равен `null` для неаутентифицированных запросов — сам факт наличия
 * пользователя проверяет `isAuthenticated` из `middleware/auth.middleware.ts`,
 * а не каждая процедура вручную.
 */
export interface AppContext {
  readonly db: Database;
  readonly user: AuthenticatedUser | null;
  /** Идентификатор запроса — попадает в логи и в ответ об ошибке. */
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/* -------------------------------------------------------------------------- */
/*                             Подключение к БД                               */
/* -------------------------------------------------------------------------- */

let cachedDb: Database | null = null;
let cachedClient: ReturnType<typeof createDatabase>['client'] | null = null;

/**
 * Единственное подключение к БД на процесс.
 *
 * Создаётся лениво: так модуль можно импортировать в тестах чистых функций,
 * не поднимая пул подключений.
 */
export function getDb(): Database {
  if (cachedDb === null) {
    const env = getEnv();
    const { db, client } = createDatabase(env.DATABASE_URL, {
      logQueries: env.NODE_ENV === 'development',
    });
    cachedDb = db;
    cachedClient = client;
  }
  return cachedDb;
}

/** Закрывает пул подключений. Вызывается при graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (cachedClient === null) return;
  await cachedClient.end({ timeout: 5 });
  cachedClient = null;
  cachedDb = null;
}

/* -------------------------------------------------------------------------- */
/*                          Загрузка пользователя                             */
/* -------------------------------------------------------------------------- */

/**
 * Загружает сотрудника вместе с ролями и филиалами.
 *
 * Возвращает `null` для несуществующего или деактивированного сотрудника:
 * увольнение должно закрывать доступ немедленно, даже если на руках остался
 * действующий access-токен.
 */
export async function loadAuthenticatedUser(
  executor: DbExecutor,
  userId: number,
): Promise<AuthenticatedUser | null> {
  const row = await executor.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, fullName: true, phone: true, isActive: true },
    with: {
      roles: { columns: { role: true } },
      branches: { columns: { branchId: true, isPrimary: true } },
    },
  });

  if (row === undefined || !row.isActive) return null;

  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    isActive: row.isActive,
    roles: row.roles.map((entry) => entry.role satisfies Role),
    branchIds: row.branches.map((entry) => entry.branchId),
    primaryBranchId: row.branches.find((entry) => entry.isPrimary)?.branchId ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Создание контекста                                */
/* -------------------------------------------------------------------------- */

/**
 * Адрес клиента. Экспортируется, потому что тот же адрес нужен ограничителю
 * обращений к `auth.*` в `index.ts` — до создания контекста tRPC.
 */
export const readClientIp = (headers: Headers): string | null => {
  // За обратным прокси реальный адрес приходит в X-Forwarded-For;
  // первым в списке идёт клиент, дальше — цепочка прокси.
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded.length > 0) {
    const [first] = forwarded.split(',');
    if (first !== undefined && first.trim().length > 0) return first.trim();
  }
  return headers.get('x-real-ip');
};

/**
 * Собирает контекст запроса: подключение к БД и, если предъявлен корректный
 * access-токен, аутентифицированного сотрудника.
 *
 * Невалидный или истёкший токен НЕ приводит к ошибке здесь — контекст просто
 * остаётся анонимным. Отказ выдаёт `isAuthenticated`, чтобы публичные
 * процедуры (например `auth.login`) работали с любым заголовком.
 */
export async function createContext(opts: FetchCreateContextFnOptions): Promise<AppContext> {
  const db = getDb();
  const { headers } = opts.req;

  const token = extractBearerToken(headers.get('authorization') ?? undefined);
  const claims = token === null ? null : await verifyAccessToken(token);
  const user = claims === null ? null : await loadAuthenticatedUser(db, claims.userId);

  return {
    db,
    user,
    requestId: randomUUID(),
    ipAddress: readClientIp(headers),
    userAgent: headers.get('user-agent'),
  };
}

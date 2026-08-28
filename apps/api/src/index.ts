import { mkdirSync } from 'node:fs';

import { serve, type HttpBindings } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { closeDb, createContext, readClientIp } from './context';
import { getEnv } from './lib/constants';
import { installRussianZodMessages } from './lib/zodMessages';
import { appRouter } from './routers';
import { consumeAuthRequestBudget } from './services/loginThrottle.service';
import {
  FILE_EXPIRES_PARAM,
  FILE_SIGNATURE_PARAM,
  verifyFileUrl,
} from './services/storage.service';

export { appRouter, type AppRouter } from './routers';
export type { AppContext } from './context';

/**
 * HTTP-сервер API.
 *
 * Hono отдаёт только транспорт: единственная содержательная точка входа —
 * `/trpc`, вся бизнес-логика живёт в процедурах и сервисах. REST-эндпойнтов
 * нет намеренно — контракт между сервером и клиентами задаётся типом
 * `AppRouter`, а не документацией.
 */
const env = getEnv();

// До первого запроса: сообщения валидации по умолчанию должны быть русскими
// уже на старте, иначе сотрудник увидит «Number must be less than or equal to 90».
installRussianZodMessages();

/**
 * `HttpBindings` открывает доступ к исходному запросу Node (`c.env.incoming`).
 * Нужен ровно в одном месте — чтобы взять адрес сокета для ограничителя
 * обращений; заголовкам там верить нельзя.
 */
const app = new Hono<{ Bindings: HttpBindings }>();

app.use('*', logger());
app.use('*', secureHeaders());

/**
 * CORS нужен только веб-панели: React Native ходит без источника.
 * Список источников задаётся `CORS_ORIGINS`; звёздочки нет намеренно —
 * запросы идут с заголовком Authorization, и открывать их всему миру нельзя.
 */
app.use(
  '/trpc/*',
  cors({
    origin: env.CORS_ORIGINS,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    maxAge: 600,
  }),
);

/**
 * Адрес, по которому ограничитель различает клиентов.
 *
 * При прямом подключении это адрес сокета: заголовкам верить нельзя, их
 * подделает и обойдёт лимит кто угодно. За прокси сокет у всех запросов один
 * (сам прокси), поэтому там берём `X-Forwarded-For` — но только если
 * `TRUST_PROXY_HEADERS=true` явно сказано, что прокси действительно стоит
 * и заголовок перезаписывает.
 */
const rateLimitKey = (headers: Headers, socketAddress: string | null): string | null => {
  if (env.TRUST_PROXY_HEADERS) {
    const forwarded = readClientIp(headers);
    if (forwarded !== null) return forwarded;
  }
  return socketAddress;
};

/**
 * Потолок обращений к `auth.*` с одного адреса.
 *
 * Ставится ДО tRPC намеренно: смысл ограничителя в том, чтобы отбитый запрос
 * не дошёл ни до базы, ни до проверки пароля — именно они и стоят дорого.
 *
 * Ответ здесь не в формате tRPC: клиент увидит сетевую ошибку, а не
 * типизированный отказ. Это сознательно — 429 отдаётся раньше, чем запрос
 * вообще разобран как вызов процедуры, и подделывать под него оболочку tRPC
 * значило бы дублировать её формат в транспорте.
 *
 * Подбор пароля закрывает не этот потолок, а счётчик неудач по номеру
 * в `loginThrottle.service.ts`; здесь — защита процессора.
 */
app.use('/trpc/*', async (c, next) => {
  // Пакетный запрос tRPC складывает процедуры в путь через запятую
  // (`/trpc/auth.login,auth.me`), поэтому сравниваем по префиксу.
  if (!c.req.path.startsWith('/trpc/auth.')) return next();

  const retryAfter = consumeAuthRequestBudget(
    rateLimitKey(c.req.raw.headers, c.env.incoming.socket.remoteAddress ?? null),
  );
  if (retryAfter === 0) return next();

  c.header('Retry-After', retryAfter.toString());
  return c.json(
    {
      error: `Слишком много обращений. Повторите через ${retryAfter.toString()} с.`,
    },
    429,
  );
});

/** Проверка живости для мониторинга: без БД и без токена. */
app.get('/health', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

/**
 * Точка входа tRPC.
 *
 * Используется штатный fetch-адаптер tRPC, а не обёртка `@hono/trpc-server`:
 * обёртка требует, чтобы контекст был `Record<string, unknown>`, из-за чего
 * типизированный `AppContext` пришлось бы размывать индексной сигнатурой.
 */
app.all('/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        process.stderr.write(`tRPC ${path ?? '<no-path>'}: ${error.message}\n${error.stack ?? ''}\n`);
      }
    },
  }),
);

/**
 * Раздача файлов disk-драйвера хранилища.
 *
 * Только для разработки: в проде `STORAGE_DRIVER=s3`, и файлы отдаёт само
 * хранилище по подписанным ссылкам, а не Node-процесс.
 *
 * Адрес должен быть подписан (`?expires=…&sig=…`) — ссылку выдаёт `getUrl()`
 * при каждом запросе заново. Без подписи файл раздавался бы любому, кто
 * увидел ключ: в истории браузера, в логах прокси, в пересланном сообщении.
 * Токен здесь проверить нельзя — `<img src>` и `<audio src>` не отправляют
 * заголовок Authorization.
 */
if (env.STORAGE_DRIVER === 'disk') {
  // Каталог создаём при старте: `serveStatic` предупреждает об отсутствующем
  // корне, а до первой загрузки файла его никто не создаст.
  mkdirSync(env.STORAGE_DISK_PATH, { recursive: true });

  app.use('/files/*', async (c, next) => {
    const key = c.req.path.replace(/^\/files\//, '');

    const isValid = verifyFileUrl({
      key,
      expires: c.req.query(FILE_EXPIRES_PARAM) ?? null,
      signature: c.req.query(FILE_SIGNATURE_PARAM) ?? null,
      secret: env.JWT_SECRET,
    });

    if (!isValid) {
      // 403, а не 404: по коду ответа не должно быть видно, существует файл
      // или нет, — иначе перебор ключей превращается в способ это выяснить.
      return c.json({ error: 'Ссылка недействительна или истекла' }, 403);
    }

    return next();
  });

  app.use(
    '/files/*',
    serveStatic({
      root: env.STORAGE_DISK_PATH,
      rewriteRequestPath: (path) => path.replace(/^\/files/, ''),
    }),
  );
}
app.notFound((c) => c.json({ error: 'Маршрут не найден' }, 404));

app.onError((error, c) => {
  process.stderr.write(`Необработанная ошибка: ${error.message}\n${error.stack ?? ''}\n`);
  return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  process.stdout.write(
    `API запущен: http://${env.HOST}:${info.port.toString()}/trpc (${env.NODE_ENV})\n`,
  );
});

/**
 * Корректное завершение.
 *
 * Без закрытия пула подключений процесс не завершится: postgres.js держит
 * сокеты открытыми, и контейнер пришлось бы убивать по таймауту.
 */
const shutdown = (signal: string): void => {
  process.stdout.write(`\nПолучен ${signal}, останавливаю сервер...\n`);

  server.close(() => {
    void closeDb().then(() => {
      process.stdout.write('Сервер остановлен\n');
      process.exit(0);
    });
  });

  // Страховка: если соединения не закрылись за 10 секунд, выходим принудительно.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });

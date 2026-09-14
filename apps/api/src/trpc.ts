import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import type { AppContext } from './context';
import { translateErrorMessage } from './lib/errorTranslations';

/**
 * Инициализация tRPC.
 *
 * Здесь только базовые строительные блоки. Готовые процедуры с проверками
 * собраны в `middleware/`: `protectedProcedure` — в `auth.middleware.ts`,
 * `roleProcedure`/`ceoProcedure`/`managementProcedure` — в
 * `roleGuard.middleware.ts`. Порядок импортов односторонний
 * (`trpc.ts` -> `middleware/` -> `routers/`), циклов нет.
 */
const t = initTRPC.context<AppContext>().create({
  // superjson: без него `Date` в ответах превращался бы в строку, и клиенту
  // пришлось бы вручную разбирать даты смен и дедлайнов.
  transformer: superjson,

  errorFormatter({ shape, error, ctx }) {
    /**
     * Стек наружу не уходит нигде, кроме разработки.
     *
     * tRPC добавляет `stack` в `shape.data` сам, ориентируясь на `NODE_ENV`.
     * Полагаться на то, что при запуске в проде переменная выставлена, нельзя:
     * цена ошибки — абсолютные пути файловой системы в ответе даже
     * неаутентифицированному запросу. Поэтому убираем явно.
     */
    /*
      Язык клиента — из заголовка `x-locale`, см. `createContext`. Тексты
      ошибок в коде русские; для узбекского они переводятся здесь, на
      выходе, по таблице в `lib/errorTranslations.ts`. Контекста может не
      быть, если упало его создание, — тогда русский.
    */
    const locale = ctx?.locale ?? 'ru';
    const translate = (text: string): string => translateErrorMessage(text, locale);

    const zodError =
      error.cause instanceof ZodError
        ? Object.fromEntries(
            Object.entries(error.cause.flatten().fieldErrors).map(([field, messages]) => [
              field,
              messages?.map(translate),
            ]),
          )
        : null;

    const data = {
      ...shape.data,
      /** Ошибки валидации — по полям, чтобы форма подсветила нужный ввод. */
      zodError,
      requestId: ctx?.requestId ?? null,
    };

    if (process.env['NODE_ENV'] === 'production') {
      delete data.stack;
    }

    /*
      У ошибки валидации `shape.message` — JSON со списком проблем: в
      приложении он показывался как есть, в `Alert`. Первая проблема словами
      понятнее, а форма в панели всё равно берёт ошибки по полям из `data`.
    */
    const message =
      error.cause instanceof ZodError
        ? translate(error.cause.issues[0]?.message ?? shape.message)
        : translate(shape.message);

    return { ...shape, message, data };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

/**
 * Процедура без аутентификации.
 *
 * Использовать только там, где это действительно оправдано: `auth.login`,
 * `auth.refresh`, healthcheck. Всё остальное — от `protectedProcedure`.
 */
export const publicProcedure = t.procedure;

/**
 * Логирование неожиданных ошибок.
 *
 * `INTERNAL_SERVER_ERROR` означает, что упало что-то, чего мы не предусмотрели,
 * и наружу такая ошибка уходит без подробностей. Чтобы её вообще можно было
 * разобрать, пишем стек в лог вместе с `requestId`, который клиент видит
 * в ответе.
 */
export const errorLoggingMiddleware = middleware(async ({ ctx, path, type, next }) => {
  const result = await next();

  if (!result.ok && result.error.code === 'INTERNAL_SERVER_ERROR') {
    process.stderr.write(
      `[${ctx.requestId}] ${type} ${path} — ${result.error.message}\n${result.error.stack ?? ''}\n`,
    );
  }

  return result;
});

/** Базовая процедура: публичная, но с логированием внутренних ошибок. */
export const baseProcedure = publicProcedure.use(errorLoggingMiddleware);

export { TRPCError };

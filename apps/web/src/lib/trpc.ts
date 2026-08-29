'use client';

import type { AppRouter } from '@curtain-crm/api';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';

/**
 * Типизированный клиент tRPC для веб-панели.
 *
 * `AppRouter` импортируется как ТИП: при `verbatimModuleSyntax` такой импорт
 * гарантированно стирается компилятором, поэтому серверный код (Hono, Drizzle,
 * драйвер postgres) в браузерный бандл не попадает.
 *
 * Практическое следствие контракта: если на бэкенде переименовать процедуру
 * или изменить её входные данные, сборка веб-панели упадёт здесь же,
 * а не в проде при первом клике.
 */
export const trpc = createTRPCReact<AppRouter>();

/* -------------------------------------------------------------------------- */
/*                             Хранение токенов                               */
/* -------------------------------------------------------------------------- */

const ACCESS_TOKEN_KEY = 'curtain-crm.access-token';
const REFRESH_TOKEN_KEY = 'curtain-crm.refresh-token';

/**
 * Токены во внутренней панели хранятся в `localStorage`.
 *
 * Осознанный компромисс: httpOnly-cookie надёжнее против XSS, но API
 * token-based (этого требует мобильное приложение), и вводить второй,
 * параллельный механизм авторизации ради веба означало бы удвоить
 * поверхность аутентификации. Панель внутренняя, доступна только сотрудникам,
 * а access-токен живёт 15 минут.
 *
 * Все обращения обёрнуты в try/catch: в приватном окне и при запрете
 * хранения данных сайта сам доступ к `localStorage` бросает исключение,
 * и панель не должна падать белым экраном из-за этого.
 */
const readItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeItem = (key: string, value: string | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно — сессия проживёт до перезагрузки страницы.
  }
};

export const tokenStorage = {
  getAccessToken: (): string | null => readItem(ACCESS_TOKEN_KEY),
  getRefreshToken: (): string | null => readItem(REFRESH_TOKEN_KEY),

  save(tokens: { readonly accessToken: string; readonly refreshToken: string }): void {
    writeItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    writeItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },

  clear(): void {
    writeItem(ACCESS_TOKEN_KEY, null);
    writeItem(REFRESH_TOKEN_KEY, null);
  },
};

/** Адрес API. Задаётся `NEXT_PUBLIC_API_URL`. */
export const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000/trpc';

/**
 * Типы ответов процедур: `RouterOutputs['rating']['board']`.
 *
 * Нужен там, где данные с сервера передаются в компонент пропсом. Ручное
 * описание такой формы неизбежно разъезжается с бэкендом — причём молча,
 * потому что структурная типизация принимает объект с лишними полями.
 * Здесь же переименование поля в процедуре ломает сборку панели.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

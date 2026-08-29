import { TRPCClientError } from '@trpc/client';

import { resolveApiUrl } from './trpc';
import { tokenStorage } from './storage';

/**
 * `fetch` с автоматическим обновлением access-токена.
 *
 * Сотрудник открывает приложение в начале смены и не закрывает его весь день,
 * а access-токен живёт 15 минут. Без этой обёртки он получал бы «требуется
 * вход» посреди отметки чек-ина.
 *
 * Обновление идёт ОДНИМ запросом на все параллельные вызовы: refresh-токен
 * на сервере ротируется, и второй одновременный запрос предъявил бы уже
 * отозванный токен — сервер расценил бы это как кражу и погасил все сессии.
 */

let refreshInFlight: Promise<boolean> | null = null;

/** Вызывается, когда сессию восстановить не удалось: приложение уходит на вход. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (refreshToken === null) return false;

  try {
    const response = await fetch(`${resolveApiUrl()}/auth.refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { refreshToken } }),
    });

    if (!response.ok) return false;

    const payload: unknown = await response.json();
    const tokens = extractTokens(payload);
    if (tokens === null) return false;

    await tokenStorage.save(tokens);
    return true;
  } catch {
    return false;
  }
}

/**
 * Достаёт токены из ответа tRPC.
 *
 * Разбор ручной: обёртка работает ниже клиента tRPC, до его десериализатора,
 * поэтому ответ приходит в «сыром» формате superjson.
 */
function extractTokens(payload: unknown): { accessToken: string; refreshToken: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const result = (payload as { result?: { data?: { json?: unknown } } }).result?.data?.json;
  if (typeof result !== 'object' || result === null) return null;

  const { accessToken, refreshToken } = result as Record<string, unknown>;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;

  return { accessToken, refreshToken };
}

export const authFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status !== 401) return response;
  if ((await tokenStorage.getRefreshToken()) === null) return response;

  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });

  const refreshed = await refreshInFlight;

  if (!refreshed) {
    await tokenStorage.clear();
    onSessionExpired?.();
    return response;
  }

  const headers = new Headers(init?.headers);
  const token = tokenStorage.getAccessTokenSync();
  if (token !== null) headers.set('authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
};

/**
 * Отвечает ли ошибка «сессия недействительна».
 *
 * Отличить отказ сервера от сетевого сбоя важнее, чем кажется: обе ситуации
 * приходят одним исключением, но реакция на них противоположна. На 401 нужно
 * стереть токены и показать вход, на обрыв связи — не трогать ничего и
 * попробовать позже.
 *
 * Проверяется код из полезной нагрузки tRPC и HTTP-статус, а не текст
 * сообщения: сообщения переводятся и меняются, коды — нет. У сетевой ошибки
 * ни того, ни другого нет вовсе, поэтому она честно возвращает `false`.
 */
export function isUnauthorized(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;

  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null) return false;

  const { code, httpStatus } = data as { code?: unknown; httpStatus?: unknown };

  return code === 'UNAUTHORIZED' || httpStatus === 401;
}

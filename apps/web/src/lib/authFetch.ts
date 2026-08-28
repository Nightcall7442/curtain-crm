import { apiUrl, tokenStorage } from './trpc';

/**
 * `fetch` с автоматическим обновлением access-токена.
 *
 * Access-токен живёт 15 минут, а панель обычно открыта весь рабочий день.
 * Без этой обёртки сотрудник получал бы «Требуется вход в систему» каждые
 * четверть часа, теряя незаполненную форму заказа.
 *
 * Обновление выполняется ОДИН раз на цепочку: если после повторной попытки
 * снова приходит 401, значит refresh-токен тоже недействителен — сессия
 * очищается и приложение уводит на экран входа.
 */

/**
 * Общий промис обновления.
 *
 * Панель делает несколько параллельных запросов при загрузке страницы, и без
 * этой блокировки каждый из них запустил бы своё обновление. Из-за ротации
 * refresh-токенов на сервере второй запрос предъявил бы уже отозванный токен,
 * что сервер расценивает как кражу и гасит все сессии.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (refreshToken === null) return false;

  try {
    const response = await fetch(`${apiUrl}/auth.refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { refreshToken } }),
    });

    if (!response.ok) return false;

    const payload: unknown = await response.json();
    const tokens = extractTokens(payload);
    if (tokens === null) return false;

    tokenStorage.save(tokens);
    return true;
  } catch {
    return false;
  }
}

/**
 * Достаёт токены из ответа tRPC.
 *
 * Ответ приходит в формате superjson (`result.data.json`), но разбирается он
 * здесь вручную: обёртка работает ниже клиента tRPC и его десериализатора.
 */
function extractTokens(payload: unknown): { accessToken: string; refreshToken: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const result = (payload as { result?: { data?: { json?: unknown } } }).result?.data?.json;
  if (typeof result !== 'object' || result === null) return null;

  const { accessToken, refreshToken } = result as Record<string, unknown>;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;

  return { accessToken, refreshToken };
}

/** Обработчик выхода из системы — задаётся `AuthProvider`. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export const authFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status !== 401) return response;

  // Запрос без токена (например, сам вход) обновлять нечем.
  if (tokenStorage.getRefreshToken() === null) return response;

  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });

  const refreshed = await refreshInFlight;

  if (!refreshed) {
    tokenStorage.clear();
    onSessionExpired?.();
    return response;
  }

  // Повторяем запрос уже с новым токеном. Заголовок пересобирается
  // ссылкой tRPC на каждый вызов, поэтому здесь его правит только `init`.
  const retryInit: RequestInit = {
    ...init,
    headers: withAuthorization(init?.headers, tokenStorage.getAccessToken()),
  };

  return fetch(input, retryInit);
};

function withAuthorization(headers: HeadersInit | undefined, token: string | null): Headers {
  const merged = new Headers(headers);
  if (token !== null) merged.set('authorization', `Bearer ${token}`);
  return merged;
}

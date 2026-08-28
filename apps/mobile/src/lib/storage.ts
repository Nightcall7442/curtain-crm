import * as SecureStore from 'expo-secure-store';

/**
 * Хранение токенов на устройстве.
 *
 * Используется `expo-secure-store` (Keychain на iOS, EncryptedSharedPreferences
 * на Android), а не `AsyncStorage`: телефоны сотрудников — личные, и токен,
 * лежащий в открытом виде, при потере устройства даёт доступ ко всем заказам
 * и персональным данным клиентов.
 *
 * Ошибки чтения и записи не пробрасываются: если защищённое хранилище
 * недоступно (устройство без пароля экрана на старых Android, отозванные
 * права), приложение должно попросить войти заново, а не падать при старте.
 *
 * Отдельного сохранения только access-токена здесь НЕТ намеренно. Сервер
 * ротирует refresh-токен при каждом обновлении и считает повторное
 * предъявление старого признаком кражи — записав новый access рядом со
 * СТАРЫМ refresh, приложение при следующем обновлении погасило бы сотруднику
 * все сессии. Пара токенов всегда пишется целиком, через `save()`.
 */

const ACCESS_TOKEN_KEY = 'curtain_crm_access_token';
const REFRESH_TOKEN_KEY = 'curtain_crm_refresh_token';

/**
 * Access-токен, продублированный в памяти.
 *
 * Чтение из Keychain асинхронное, а ссылка tRPC должна подставить заголовок
 * синхронно. Кеш заполняется при входе и при восстановлении сессии.
 */
let cachedAccessToken: string | null = null;

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Защищённое хранилище недоступно — сессия проживёт до перезапуска приложения.
  }
}

export const tokenStorage = {
  /** Access-токен из памяти. Синхронно, для заголовка Authorization. */
  getAccessTokenSync: (): string | null => cachedAccessToken,

  /** Восстанавливает сессию при запуске приложения. */
  async restore(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const [accessToken, refreshToken] = await Promise.all([
      readSecure(ACCESS_TOKEN_KEY),
      readSecure(REFRESH_TOKEN_KEY),
    ]);

    cachedAccessToken = accessToken;

    // Без refresh-токена восстанавливать нечего: access истечёт через
    // 15 минут и обновить его будет нечем.
    if (refreshToken === null) return null;

    return { accessToken: accessToken ?? '', refreshToken };
  },

  async save(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    cachedAccessToken = tokens.accessToken;
    await Promise.all([
      writeSecure(ACCESS_TOKEN_KEY, tokens.accessToken),
      writeSecure(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
  },

  getRefreshToken: (): Promise<string | null> => readSecure(REFRESH_TOKEN_KEY),

  async clear(): Promise<void> {
    cachedAccessToken = null;
    await Promise.all([
      writeSecure(ACCESS_TOKEN_KEY, null),
      writeSecure(REFRESH_TOKEN_KEY, null),
    ]);
  },
};

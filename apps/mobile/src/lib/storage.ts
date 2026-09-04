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

/** Чья сейчас сессия. Нужен, чтобы обновлять его запись в списке аккаунтов. */
const CURRENT_USER_KEY = 'curtain_crm_current_user_id';

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

    /*
      Запись в списке аккаунтов идёт следом — обязательно.

      Токены меняются не только при входе: `authFetch` сам обновляет их,
      когда access истёк, и refresh при этом РОТИРУЕТСЯ. Без этой строки
      сохранённая запись осталась бы со старым токеном, а сервер считает
      повторное предъявление старого кражей и гасит человеку все
      устройства. То есть быстрый вход, полежав сутки, выкидывал бы
      сотрудника отовсюду.

      Обновляется именно тот аккаунт, под которым сейчас работают: его id
      лежит рядом с токенами и переживает перезапуск приложения.
    */
    await syncCurrentAccountToken(tokens.refreshToken);
  },

  /** Запоминает, чья это сессия: нужно, чтобы обновлять его запись в списке. */
  async setCurrentUserId(userId: number): Promise<void> {
    await writeSecure(CURRENT_USER_KEY, userId.toString());
  },

  getRefreshToken: (): Promise<string | null> => readSecure(REFRESH_TOKEN_KEY),

  async clear(): Promise<void> {
    cachedAccessToken = null;
    await Promise.all([
      writeSecure(ACCESS_TOKEN_KEY, null),
      writeSecure(REFRESH_TOKEN_KEY, null),
      writeSecure(CURRENT_USER_KEY, null),
    ]);
  },
};

/* -------------------------------------------------------------------------- */
/*                         Сохранённые учётные записи                         */
/* -------------------------------------------------------------------------- */

/**
 * Аккаунты, которыми уже входили с этого телефона.
 *
 * Нужны директору: он держит один рабочий телефон и должен уметь встать за
 * место продавца или проверить, что видит швея, не вспоминая паролей.
 * Долгое нажатие на вкладку «Профиль» показывает этот список, и вход
 * происходит по сохранённому refresh-токену — мгновенно.
 *
 * Лежит в том же защищённом хранилище, что и токен текущей сессии. Это
 * сознательный компромисс: телефон с несколькими живыми сессиями опаснее
 * телефона с одной. Ограничения, которые делают его приемлемым:
 *  - список пополняется ТОЛЬКО с явного согласия: после входа паролем
 *    приложение спрашивает «сохранить этот вход?», и молчание значит «нет».
 *    Чужой аккаунт сюда не попадёт, и свой — тоже не против воли;
 *  - выход из аккаунта убирает его из списка: сервер гасит refresh-токен,
 *    и хранить мёртвую запись незачем;
 *  - паролей здесь нет вовсе, только токены, которые сервер умеет отозвать.
 *
 * ВАЖНО про ротацию. Сервер меняет refresh-токен при каждом обновлении и
 * считает повторное предъявление старого признаком кражи — гасит СЕССИИ
 * СОТРУДНИКУ ЦЕЛИКОМ. Поэтому после каждого переключения новую пару
 * обязательно записывают сюда обратно: сохранённый однажды токен —
 * одноразовый.
 */

const ACCOUNTS_KEY = 'curtain_crm_saved_accounts';

export interface SavedAccount {
  readonly userId: number;
  readonly fullName: string;
  readonly phone: string;
  /** Одноразовый: сервер выдаёт новый при каждом использовании. */
  readonly refreshToken: string;
}

const readAccounts = async (): Promise<readonly SavedAccount[]> => {
  const raw = await readSecure(ACCOUNTS_KEY);
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Хранилище переживает обновления приложения, и формат записи мог
    // измениться. Строки без обязательных полей молча отбрасываются:
    // «сломанный список аккаунтов» не повод не пустить человека в приложение.
    return parsed.filter((item): item is SavedAccount => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Partial<SavedAccount>;
      return (
        typeof candidate.userId === 'number' &&
        typeof candidate.fullName === 'string' &&
        typeof candidate.phone === 'string' &&
        typeof candidate.refreshToken === 'string'
      );
    });
  } catch {
    return [];
  }
};

/**
 * Обновляет токен текущего аккаунта в списке.
 *
 * Вызывается из `tokenStorage.save()` — единственного места, через которое
 * проходит любая новая пара токенов, откуда бы она ни пришла: вход паролем,
 * переключение аккаунта или молчаливое обновление в `authFetch`. Держать эту
 * синхронизацию в трёх местах значило бы однажды забыть про одно из них.
 */
async function syncCurrentAccountToken(refreshToken: string): Promise<void> {
  const raw = await readSecure(CURRENT_USER_KEY);
  if (raw === null) return;

  const userId = Number.parseInt(raw, 10);
  if (!Number.isInteger(userId)) return;

  const accounts = await readAccounts();
  const current = accounts.find((item) => item.userId === userId);
  // Аккаунта в списке нет — значит из него вышли; воскрешать не нужно.
  if (current === undefined) return;

  const updated = accounts.map((item) =>
    item.userId === userId ? { ...item, refreshToken } : item,
  );
  await writeSecure(ACCOUNTS_KEY, JSON.stringify(updated));
}

export const accountStorage = {
  list: readAccounts,

  /** Запоминает аккаунт или обновляет его токен после переключения. */
  async remember(account: SavedAccount): Promise<void> {
    const rest = (await readAccounts()).filter((item) => item.userId !== account.userId);
    // Последний вошедший — первым в списке: к нему возвращаются чаще всего.
    await writeSecure(ACCOUNTS_KEY, JSON.stringify([account, ...rest]));
  },

  /** Убирает аккаунт: вышли из него или его токен больше не принимают. */
  async forget(userId: number): Promise<void> {
    const rest = (await readAccounts()).filter((item) => item.userId !== userId);
    await writeSecure(ACCOUNTS_KEY, rest.length === 0 ? null : JSON.stringify(rest));
  },
};

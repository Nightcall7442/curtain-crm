import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE, isLocale, type Locale, type Translated } from '@curtain-crm/shared';

import { useQueryClient } from '@tanstack/react-query';

import { MESSAGES, type MessageKey } from '../i18n/messages';
import { setRequestLocale } from '../lib/authFetch';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * Язык интерфейса приложения.
 *
 * Хранится в `AsyncStorage`, а НЕ в `SecureStore`, где лежат токены: язык —
 * не секрет, а защищённое хранилище на Android каждый раз обращается к
 * системному keystore. Платить за это на настройке, которая читается при
 * каждом запуске, незачем.
 *
 * Язык устройства не определяется намеренно. Для этого нужен
 * `expo-localization` — ещё одна нативная зависимость и пересборка клиента, —
 * а на Android без полного ICU определение всё равно врёт и часто отдаёт
 * `en-US`. Поэтому по умолчанию русский, как и в панели, а выбор сотрудник
 * делает один раз в профиле.
 */

const LOCALE_STORAGE_KEY = 'curtain-crm.locale';

interface LocaleContextValue {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  /** Значение из переведённого словаря на текущем языке. */
  readonly t: <TKey extends string>(dictionary: Translated<TKey>, key: TKey) => string;
  /** Строка интерфейса из `i18n/messages.ts`; `{name}` заменяется на `params.name`. */
  readonly m: (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;
}

function format(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Тип `m` — для вспомогательных функций вне компонентов, которым передают переводчик. */
export type Translate = LocaleContextValue['m'];

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    /*
      Чтение асинхронное, поэтому первый кадр приложение показывает на языке
      по умолчанию и через мгновение переключается. Экрана загрузки ради
      одной строки настройки здесь не ставим: подписи меняются, а разметка
      нет — «прыжка» интерфейса не происходит.
    */
    let cancelled = false;

    void AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isLocale(stored)) setLocaleState(stored);
      })
      .catch(() => {
        // Недоступное хранилище не должно ронять запуск: останется русский.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const queryClient = useQueryClient();

  // Сервер тоже должен знать язык: на нём приходят ошибки и уведомления.
  useEffect(() => {
    setRequestLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale): void => {
    setLocaleState(next);
    // Заголовок — до сброса кэша, иначе первые перезапросы ушли бы ещё на
    // прежнем языке: эффект выше сработает только после рендера.
    setRequestLocale(next);
    // Уведомления переводит сервер по языку запроса: в кэше лежит лента на
    // прежнем языке, и без сброса она сменилась бы только при следующем
    // обновлении экрана.
    void queryClient.invalidateQueries();
    void AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {
      // Выбор проживёт до перезапуска приложения — это лучше, чем падение.
    });
  }, [queryClient]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (dictionary, key) => dictionary[locale][key],
      m: (key, params) => format(MESSAGES[locale][key], params),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Язык и словари.
 *
 * Бросает исключение вне провайдера, а не подставляет русский молча: экран,
 * оказавшийся вне дерева провайдеров, — ошибка сборки навигации, и видеть её
 * надо сразу, а не по тому, что часть приложения перестала переводиться.
 */
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error('useLocale вызван вне LocaleProvider');
  }
  return value;
}

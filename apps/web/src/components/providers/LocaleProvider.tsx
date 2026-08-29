'use client';

import { DEFAULT_LOCALE, type Locale, type Translated } from '@curtain-crm/shared';
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

import { applyLocale, readStoredLocale, storeLocale } from '@/lib/locale';

/**
 * Язык интерфейса.
 *
 * Провайдер хранит выбор и раздаёт две вещи: сам язык (для функций из общего
 * пакета, принимающих локаль) и `t` — доступ к переведённым словарям.
 *
 * Почему не готовая библиотека вроде `next-intl`. Основная масса текста в
 * этой панели — не свободные фразы, а ПОДПИСИ ПЕРЕЧИСЛЕНИЙ: статусы заказа,
 * роли, этапы, единицы измерения. Они уже лежат в общем пакете рядом с
 * самими перечислениями, и это правильное для них место: добавляя статус,
 * невозможно забыть подпись — компилятор потребует её для каждого языка.
 * Библиотека потребовала бы вынести их в отдельные json-файлы, оторвав от
 * типов, и взамен дала бы то, чего здесь почти нет, — интерполяцию и
 * склонения в свободном тексте.
 */

interface LocaleContextValue {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  /** Значение из переведённого словаря на текущем языке. */
  readonly t: <TKey extends string>(dictionary: Translated<TKey>, key: TKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { readonly children: ReactNode }): ReactElement {
  /**
   * Начальное значение — язык по умолчанию, а не из хранилища.
   *
   * Сервер про `localStorage` не знает, и чтение здесь развело бы разметку
   * сервера и клиента. Настоящий выбор подставляется эффектом.
   */
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    applyLocale(stored);
  }, []);

  const setLocale = useCallback((next: Locale): void => {
    setLocaleState(next);
    applyLocale(next);
    storeLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (dictionary, key) => dictionary[locale][key],
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Язык и словари текущего пользователя.
 *
 * Бросает исключение вне провайдера, а не подставляет русский молча:
 * компонент, оказавшийся вне дерева провайдеров, — это ошибка сборки
 * страницы, и она должна быть видна сразу, а не проявиться позже тем,
 * что половина панели вдруг перестала переводиться.
 */
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error('useLocale вызван вне LocaleProvider');
  }
  return value;
}

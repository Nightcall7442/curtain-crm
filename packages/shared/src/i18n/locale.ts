/**
 * Языки интерфейса.
 *
 * Русский и узбекский на латинице — та письменность, на которой учат в школе
 * и ведут документы. Кириллический узбекский в проект не заводится: два
 * набора одного языка пришлось бы держать синхронными вручную, а
 * автоматическая транслитерация ошибается на заимствованиях и именах
 * собственных ровно там, где текст читают внимательнее всего.
 *
 * Русский остаётся языком по умолчанию: на нём заведены данные мастерской и
 * им пользуется руководство. Узбекский выбирается сотрудником и хранится
 * на его устройстве.
 *
 * Локаль НЕ хранится в профиле на сервере намеренно. Она нужна раньше, чем
 * известен пользователь: экран входа и сообщения об ошибках авторизации
 * тоже должны быть на понятном языке, а в этот момент профиля ещё нет.
 */

export const LOCALES = ['ru', 'uz'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

/**
 * Подписи языков — всегда НА САМОМ ЯЗЫКЕ, а не в переводе.
 *
 * Человек, ищущий узбекский в списке, ищет слово «O'zbekcha», а не
 * «Узбекский»: если интерфейс сейчас на языке, которого он не знает,
 * переведённое название языка ему не поможет.
 */
export const LOCALE_INFO: Readonly<
  Record<Locale, { readonly label: string; readonly englishName: string }>
> = {
  ru: { label: 'Русский', englishName: 'Russian' },
  uz: { label: "O'zbekcha", englishName: 'Uzbek' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Словарь, переведённый на все языки.
 *
 * Тип обязывает: добавить язык в `LOCALES` и не перевести словарь не выйдет —
 * компилятор потребует ключ для каждой локали, а внутри неё — значение для
 * каждого элемента перечисления. Забытый статус заказа не доживёт до экрана.
 */
export type Translated<TKey extends string> = Readonly<
  Record<Locale, Readonly<Record<TKey, string>>>
>;

/**
 * Значение из переведённого словаря.
 *
 * Отдельная функция, а не `dict[locale][key]` по месту: обращение по двум
 * индексам подряд легко написать в неверном порядке, и `ORDER_STATUS_LABELS`
 * с перепутанными аргументами вернёт `undefined`, а не ошибку компиляции.
 */
export function translate<TKey extends string>(
  dictionary: Translated<TKey>,
  key: TKey,
  locale: Locale,
): string {
  return dictionary[locale][key];
}

/**
 * Приводит произвольную строку языка к поддерживаемой локали.
 *
 * Принимает то, что отдают браузер и телефон: `uz`, `uz-UZ`, `uz-Latn-UZ`,
 * `ru-RU`. Всё незнакомое — русский, а не ошибка: язык интерфейса не тот
 * случай, когда стоит падать.
 */
export function resolveLocale(value: string | null | undefined): Locale {
  if (value === null || value === undefined) return DEFAULT_LOCALE;

  const primary = value.toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) ? primary : DEFAULT_LOCALE;
}

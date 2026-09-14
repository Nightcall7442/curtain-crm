import type { Locale } from '../i18n/locale';

/**
 * Названия месяцев.
 *
 * Лежат в общем пакете, а не в компоненте страницы: выбор периода есть и в
 * отчётах, и в рейтинге, и в мобильном приложении, а `Intl.DateTimeFormat`
 * в React Native на Android без полного ICU возвращает английские названия.
 *
 * У узбекского падежей в русском смысле нет: и в списке, и внутри фразы
 * месяц называется одинаково («avgust»), поэтому родительный падеж для него
 * совпадает с именительным. Две таблицы всё равно заведены обе — чтобы код,
 * выбирающий форму, не разбирался, для какого языка выбор осмыслен.
 */

/**
 * Часовой пояс мастерской.
 *
 * Смены, выходные и табель — про местный день, а не про UTC: смена, начатая
 * в восемь утра в Ургенче, должна попадать в тот же день, каким её называет
 * человек. Пояс один на всю мастерскую: филиалы в одном городе.
 */
export const WORKSHOP_TIME_ZONE = 'Asia/Tashkent';

/**
 * День недели по ISO: 1 — понедельник … 7 — воскресенье.
 *
 * Так хранится фиксированный выходной сотрудника (`users.weekly_day_off`):
 * «у Дилноры выходной по пятницам» — одно число, а не список дат.
 */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

/** «Каждый понедельник», «каждую пятницу» — подписи для выбора выходного. */
export const WEEKDAY_NAMES_RU: Readonly<Record<IsoWeekday, string>> = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};

export const WEEKDAY_NAMES_UZ: Readonly<Record<IsoWeekday, string>> = {
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
  7: 'Yakshanba',
};

/** Подпись дня из БД, где он приходит просто числом: «Пятница». */
export const weekdayName = (day: number, locale: Locale = 'ru'): string =>
  (locale === 'uz' ? WEEKDAY_NAMES_UZ : WEEKDAY_NAMES_RU)[day as IsoWeekday] ?? '';

/** ISO-день недели даты в UTC: `Date.getUTCDay()` считает с воскресенья. */
export const isoWeekdayOf = (date: Date): IsoWeekday =>
  (((date.getUTCDay() + 6) % 7) + 1) as IsoWeekday;

/** Именительный падеж — для выпадающих списков: «Август». */
export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

/** Родительный падеж — для дат внутри фразы: «за 12 августа». */
export const MONTH_NAMES_GENITIVE_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/** Именительный падеж по-узбекски — для выпадающих списков: «Avgust». */
export const MONTH_NAMES_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
] as const;

/**
 * То же со строчной буквы — узбекский аналог родительного падежа.
 * Форма слова не меняется, меняется только регистр внутри фразы.
 */
export const MONTH_NAMES_GENITIVE_UZ = MONTH_NAMES_UZ.map((name) =>
  name.toLowerCase(),
) as readonly string[];

const MONTHS_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  ru: MONTH_NAMES_RU,
  uz: MONTH_NAMES_UZ,
};

const MONTHS_GENITIVE_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  ru: MONTH_NAMES_GENITIVE_RU,
  uz: MONTH_NAMES_GENITIVE_UZ,
};

/**
 * Название месяца по его номеру (1–12).
 *
 * Номер, а не индекс: в базе и в API месяц везде человеческий, и перевод
 * «минус один» размазанный по вызовам — источник ошибок на границе года.
 */
export function monthName(month: number, locale: Locale = 'ru'): string {
  return MONTHS_BY_LOCALE[locale][month - 1] ?? '—';
}

/** Название месяца внутри фразы: «12 августа», «12 avgust». */
export function monthNameGenitive(month: number, locale: Locale = 'ru'): string {
  return MONTHS_GENITIVE_BY_LOCALE[locale][month - 1] ?? '—';
}

/** Подпись периода: «Август 2026», «Avgust 2026». */
export function formatMonthPeriod(year: number, month: number, locale: Locale = 'ru'): string {
  return `${monthName(month, locale)} ${year.toString()}`;
}

/** Подпись диапазона дат: «24 — 30 августа». */
export function formatDayRange(start: Date, end: Date): string {
  // Конец периода — полуинтервал (первый день СЛЕДУЮЩЕЙ недели), поэтому
  // для подписи берём предыдущий день: иначе неделя выглядела бы восьмидневной.
  const last = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const startDay = start.getUTCDate().toString();
  const lastDay = last.getUTCDate().toString();
  const lastMonth = MONTH_NAMES_GENITIVE_RU[last.getUTCMonth()] ?? '';

  if (start.getUTCMonth() === last.getUTCMonth()) {
    return `${startDay} — ${lastDay} ${lastMonth}`;
  }

  const startMonth = MONTH_NAMES_GENITIVE_RU[start.getUTCMonth()] ?? '';

  return `${startDay} ${startMonth} — ${lastDay} ${lastMonth}`;
}

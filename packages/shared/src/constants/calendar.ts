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

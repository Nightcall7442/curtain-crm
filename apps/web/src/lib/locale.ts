import { DEFAULT_LOCALE, isLocale, type Locale } from '@curtain-crm/shared';

/**
 * Хранение выбранного языка в браузере.
 *
 * Тот же приём, что у оформления и схемы: настройка рабочего места, а не
 * учётной записи. За общим компьютером в цехе и за ноутбуком в кабинете
 * могут сидеть разные люди, и язык у них разный.
 *
 * Сам список языков и словари живут в `@curtain-crm/shared`: их видят и
 * панель, и мобильное приложение, и сервер.
 */

export const LOCALE_STORAGE_KEY = 'curtain-crm.locale';

/**
 * Применяет язык к документу.
 *
 * Пишет `lang` на `<html>`, а не только запоминает значение. Атрибут читают
 * программы чтения экрана (чтобы выбрать голос и правила чтения), браузерная
 * проверка орфографии и правила переносов. Без него узбекский текст
 * озвучивается по-русски.
 */
export function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

/** Сохранённый выбор; язык по умолчанию, если выбора нет или хранилище недоступно. */
export function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    // В приватном окне сам доступ к хранилищу бросает исключение.
    return DEFAULT_LOCALE;
  }
}

export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Выбор проживёт до перезагрузки — лучше, чем падение.
  }
}

/**
 * Код, выставляющий `lang` ДО первой отрисовки.
 *
 * В отличие от схемы и оформления, вспышки здесь не бывает: язык меняет
 * текст, а не цвет, и текст всё равно приходит с сервера на языке по
 * умолчанию. Скрипт нужен ради атрибута `lang` — чтобы программа чтения
 * экрана не начала читать страницу чужим языком ещё до гидратации.
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `
try {
  var l = localStorage.getItem('${LOCALE_STORAGE_KEY}');
  if (l === 'ru' || l === 'uz') document.documentElement.lang = l;
} catch (e) {}
`.trim();

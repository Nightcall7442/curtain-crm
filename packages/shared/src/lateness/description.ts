import { DisciplineKind, LATE_DISCIPLINE_KINDS, type LateDisciplineKind } from '../enums/discipline.enum';
import type { Locale } from '../i18n/locale';

/**
 * Опоздание словами и ступенью: пояснение записи, его разбор, вид по минутам.
 *
 * Здесь, а не в сервере: эти правила нужны и чистой оценке месяца
 * (`evaluateMonthLateness`), и серверу, и разбор сохранённой строки обязан
 * совпадать с её сборкой — две копии разошлись бы при первой правке текста.
 */

/**
 * Пояснение к опозданию: «Смена с 09:00, отметка в 11:52 — опоздание 172 мин».
 *
 * В базу пишется по-русски — как и всё, что руководитель вводит в
 * дисциплину руками: язык читателя сервер в момент записи не знает. На
 * узбекский пояснение переводится при показе (`localizeLatenessDescription`).
 */
export function latenessDescription(
  shiftStart: string,
  actual: string,
  lateMinutes: number,
  locale: Locale = 'ru',
): string {
  const minutes = lateMinutes.toString();
  return locale === 'uz'
    ? `Smena boshlanishi ${shiftStart}, belgi ${actual} da — ${minutes} daqiqa kechikish`
    : `Смена с ${shiftStart}, отметка в ${actual} — опоздание ${minutes} мин`;
}

/**
 * Сохранённое русское пояснение — ровно та строка, что собирает `latenessDescription`.
 *
 * Время — только настоящее (00:00–23:59), тем же шаблоном, что и перенос
 * фактов в миграции 0077: запись, которую миграция не перенесла, не должна
 * считаться записью системы — иначе первая сверка месяца стёрла бы её как
 * запись без факта.
 */
const CLOCK = '((?:[01]?\\d|2[0-3]):[0-5]\\d)';
const STORED_LATENESS = new RegExp(`^Смена с ${CLOCK}, отметка в ${CLOCK} — опоздание (\\d+) мин$`);

/** Что записала система в пояснении: от какого начала считали, когда отметился и сколько минут. */
export interface StoredLateness {
  readonly shiftStart: string;
  readonly checkIn: string;
  readonly minutes: number;
}

/**
 * Разбор пояснения, которое собрала система; чужой текст — `null`.
 *
 * По нему же сервер отличает запись системы от ручной: руководитель пишет
 * своё пояснение (или никакого), и такую запись проекция месяца не трогает.
 */
export function parseStoredLateness(description: string | null): StoredLateness | null {
  if (description === null) return null;
  const match = STORED_LATENESS.exec(description);
  if (match === null) return null;
  const [, shiftStart = '', checkIn = '', minutes = '0'] = match;
  return { shiftStart, checkIn, minutes: Number.parseInt(minutes, 10) };
}

/**
 * Пояснение к событию дисциплины — на языке читателя.
 *
 * Переводится только то, что записала сама система; текст, который
 * руководитель ввёл руками, показывается как есть.
 */
export function localizeLatenessDescription(description: string, locale: Locale): string {
  if (locale === 'ru') return description;
  const stored = parseStoredLateness(description);
  return stored === null ? description : latenessDescription(stored.shiftStart, stored.checkIn, stored.minutes, locale);
}

/**
 * Вид опоздания по минутам: до 15, 15–30, больше 30 (границы включительно).
 *
 * Одна функция на все пути: две копии порогов однажды разошлись бы, и одно
 * и то же опоздание попадало бы в разные ступени.
 */
export function latenessKind(lateBy: number): LateDisciplineKind {
  if (lateBy <= 15) return DisciplineKind.LATE_UNDER_15;
  return lateBy <= 30 ? DisciplineKind.LATE_15_30 : DisciplineKind.LATE_OVER_30;
}

/** Вид — опоздание: такие записи система ведёт сама (`LATE_DISCIPLINE_KINDS`). */
export function isLateDisciplineKind(kind: string): kind is LateDisciplineKind {
  return LATE_DISCIPLINE_KINDS.some((late) => late === kind);
}

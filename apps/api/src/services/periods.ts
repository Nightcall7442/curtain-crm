/**
 * Периоды мастерской по Ташкенту.
 *
 * Вынесено из `reports.router.ts`: те же границы нужны табло, и две копии
 * одной арифметики рано или поздно разошлись бы на одну полночь.
 */

/** Ташкент живёт в UTC+5 круглый год, перевода часов нет. */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Начала суток, недели и месяцев по Ташкенту — как моменты UTC.
 *
 * Главная считала «сегодня» и «этот месяц» от полуночи по UTC, то есть с
 * пяти утра по Ташкенту: заказ, принятый в полпервого ночи, числился
 * вчерашним, а первые пять часов первого числа — прошлым месяцем.
 *
 * Неделя — календарная, с понедельника: так её считают в мастерской.
 */
export function workshopPeriodStarts(now: Date): {
  readonly today: Date;
  readonly tomorrow: Date;
  readonly week: Date;
  readonly month: Date;
  readonly prevMonth: Date;
} {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const date = local.getUTCDate();
  // getUTCDay: воскресенье — 0; сколько дней прошло с понедельника.
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const at = (utcMidnight: number): Date => new Date(utcMidnight - TASHKENT_OFFSET_MS);
  return {
    today: at(Date.UTC(year, month, date)),
    tomorrow: at(Date.UTC(year, month, date + 1)),
    // Date.UTC сам переносит отрицательные дни и месяцы через границу.
    week: at(Date.UTC(year, month, date - sinceMonday)),
    month: at(Date.UTC(year, month, 1)),
    prevMonth: at(Date.UTC(year, month - 1, 1)),
  };
}

/** Календарный день по Ташкенту `YYYY-MM-DD` для момента начала периода. */
export const workshopDay = (at: Date): string =>
  new Date(at.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Границы месяца `YYYY-MM` по Ташкенту: `[start, end)` — моменты UTC.
 * Для планов: выработка месяца считается в тех же сутках, что и табло.
 */
export function workshopMonthBounds(month: string): { readonly start: Date; readonly end: Date } {
  const [year = 1970, monthNumber = 1] = month.split('-').map((part) => Number.parseInt(part, 10));
  const at = (utcMidnight: number): Date => new Date(utcMidnight - TASHKENT_OFFSET_MS);
  return { start: at(Date.UTC(year, monthNumber - 1, 1)), end: at(Date.UTC(year, monthNumber, 1)) };
}

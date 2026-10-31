import { multiplyMoney, roundMoneyToWhole, type MoneyMinor } from '../utils/money';

/**
 * Оплата почасовика — по сменам.
 *
 * Заказчик считает так (переписка 25.10): «100 000 за смену 9:00–18:00»,
 * смена 8,5 ч — 94 444, 13 ч — 144 444. То есть ставка за час — сумма за
 * смену по графику, делённая на её длину, а каждая смена оплачивается
 * отдельно и целыми сумами. Сумма за месяц — сумма смен: ровно то, что
 * сотрудник видит построчно в таблице и может сложить сам.
 *
 * Правило общее для сервера (расчёт) и панели (ввод ставки «за смену»),
 * поэтому живёт здесь.
 */

const MINUTES_IN_DAY = 24 * 60;

/** Минуты от полуночи для `HH:MM`; иначе `null`. */
function minutesOfDay(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hours = Number.parseInt(match[1] ?? '', 10);
  const minutes = Number.parseInt(match[2] ?? '', 10);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Длина смены по графику в минутах.
 *
 * Конец раньше начала — смена через полночь (22:00–06:00 — 8 ч). Равные
 * или битые значения — `null`: «ставка за смену» без длины смены не
 * переводится в часовую, и молча поделить на ноль хуже, чем отказать.
 */
export function scheduleMinutes(shiftStart: string | null, shiftEnd: string | null): number | null {
  const start = minutesOfDay(shiftStart);
  const end = minutesOfDay(shiftEnd);
  if (start === null || end === null || start === end) return null;

  return end > start ? end - start : end + MINUTES_IN_DAY - start;
}

/** Часовая ставка из суммы за смену по графику, до тийина: 100 000 / 9 ч → 11 111,11. */
export function hourlyRateFromShift(shiftAmount: MoneyMinor, minutes: number): MoneyMinor {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new RangeError(`Некорректная длина смены: ${String(minutes)}`);
  }

  return multiplyMoney(shiftAmount, 60 / minutes);
}

/** Сотая часа — 36 секунд: столько точности у часов в таблице смен. */
const SECONDS_IN_HUNDREDTH = 36;

/** Отработанные сотые часа: 30 600 с → 850 (8,50 ч). Отрицательное — ноль. */
function workedHundredths(seconds: number): number {
  return Math.round(Math.max(0, seconds) / SECONDS_IN_HUNDREDTH);
}

/**
 * Оплата одной смены: ставка × часы смены, до целого сума.
 *
 * Часы — ТЕ ЖЕ, что в таблице смен, до сотых: отметки прихода и ухода
 * секундные, и плати мы от точных секунд, строку «9,09 ч — 101 034» нельзя
 * было бы проверить калькулятором (9,09 × 11 111,11 = 101 000). Таблица
 * существует, чтобы сотрудник мог сверить начисление, — значит, сумма
 * считается от показанного.
 *
 * Округление одно, от точного произведения, в целых числах: ставка в
 * тийинах × сотые часа — целое, и половина сума округляется вверх без
 * погрешности плавающей точки. 11 111,11 × 8,50 = 94 444,435 → 94 444.
 */
export function shiftPay(rate: MoneyMinor, workedSeconds: number): MoneyMinor {
  return roundMoneyToWhole((rate * workedHundredths(workedSeconds)) / 100);
}

/** Часы для показа, до сотых: 30 600 с → 8,5. От них же считается оплата смены. */
export function workedHoursOf(seconds: number): number {
  return workedHundredths(seconds) / 100;
}

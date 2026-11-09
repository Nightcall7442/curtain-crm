import {
  MAX_DAY_OFF_REASON_LENGTH,
  MAX_DAY_OFF_REJECTION_REASON_LENGTH,
} from '../enums/dayOff.enum';

/**
 * Запрос на опоздание: «12.11 приду к 10:30».
 *
 * Сотрудник заранее просит прийти позже графика в конкретный день,
 * руководство одобряет или отклоняет — как выходной, но это не выходной:
 * человек в этот день работает, просто начинает позже. Поэтому запрос
 * живёт отдельно от выходных (`late_requests`), а не строкой в
 * `day_off_requests`: те читают табель, зарплата, рейтинг и табло, и
 * опоздание там посчиталось бы прогулом.
 *
 * Статусы — те же, что у выходных (`DAY_OFF_STATUSES`), с теми же
 * подписями: «ждёт решения», «одобрен», «отклонён», «отозван» значат одно
 * и то же, и второй словарь разошёлся бы с первым при первой правке.
 */

/** Причина просьбы — как у выходного: экран один, и поле одно. */
export const MAX_LATE_REQUEST_REASON_LENGTH = MAX_DAY_OFF_REASON_LENGTH;
export const MAX_LATE_REQUEST_REJECTION_REASON_LENGTH = MAX_DAY_OFF_REJECTION_REASON_LENGTH;

/**
 * Время дня `ЧЧ:ММ`: две цифры часа (00–23) и две минуты.
 *
 * Строго две цифры — так время хранится и в графике смены
 * (`payroll_schemes.shift_start`), и строки сравниваются как строки.
 */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERN.test(value);
}

/** Минуты от полуночи: `10:30` → 630. Вход — уже проверенный `ЧЧ:ММ`. */
export function clockMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
}

/**
 * С какого времени в этот день считается опоздание.
 *
 * Одобренное «приду к 10:30» при смене с 09:00 сдвигает начало на 10:30:
 * отметка в 10:20 — не опоздание, в 10:45 — опоздание на 15 минут, а не
 * на 105. «Приду к 08:30» при смене с 09:00 начало раньше не делает —
 * просьба была опоздать, а не прийти пораньше.
 */
export function effectiveShiftStart(shiftStart: string, approvedArriveBy: string | null): string {
  if (approvedArriveBy === null) return shiftStart;
  return clockMinutes(approvedArriveBy) > clockMinutes(shiftStart) ? approvedArriveBy : shiftStart;
}

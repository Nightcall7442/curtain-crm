import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Утилиты представления.
 *
 * Здесь НЕ должно быть бизнес-логики: форматирование денег, телефонов,
 * размеров и подписи статусов живут в `@curtain-crm/shared`, чтобы
 * веб-панель и мобильное приложение показывали одно и то же.
 */

/**
 * Склейка классов Tailwind с разрешением конфликтов.
 * Без `twMerge` пара `px-2 px-4` оставила бы оба класса, и результат
 * зависел бы от порядка правил в собранном CSS.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Дата в формате `26.08.2026`. */
export function formatDate(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Дата и время в формате `26.08.2026, 14:30`. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Продолжительность в часах и минутах: `7 ч 30 мин`. */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (wholeHours === 0) return `${minutes.toString()} мин`;
  if (minutes === 0) return `${wholeHours.toString()} ч`;
  return `${wholeHours.toString()} ч ${minutes.toString()} мин`;
}

/**
 * Дробное число по-русски: `197,9`, `1,4`.
 *
 * `toFixed()` печатает точку независимо от языка, и на дашборде рядом
 * оказывались «115 100 000 сум» (запятая — из `formatMoney`) и «197.9 м²»
 * (точка), то есть два разных десятичных разделителя на одном экране.
 *
 * Только для ТЕКСТА. В значениях CSS (`width: 33.3%`) и координатах SVG
 * разделителем обязана оставаться точка — там `toFixed()` трогать нельзя.
 */
export function formatNumber(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return '—';

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Количество: `4`, `10,449`, `5,83`.
 *
 * В отличие от `formatNumber`, дробная часть печатается только если она есть:
 * закупают и «4 м», и «10,449 м», и «4,0 м» в накладной выглядело бы как
 * ложная точность. Верхний предел — три знака: столько хранит `numeric`
 * в колонке количества.
 */
export function formatQuantity(value: number, maxFractionDigits = 3): string {
  if (!Number.isFinite(value)) return '—';

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

/**
 * Доля в процентах: `94,2%`, `+109,3%`.
 *
 * `signed` печатает знак у положительных значений — он нужен там, где число
 * читается как изменение, а не как величина.
 */
export function formatPercent(
  value: number,
  options?: { readonly fractionDigits?: number; readonly signed?: boolean },
): string {
  if (!Number.isFinite(value)) return '—';

  const formatted = formatNumber(value, options?.fractionDigits ?? 1);
  const sign = options?.signed === true && value > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

/** Инициалы для аватара-заглушки: «Иванов Иван» -> «ИИ». */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

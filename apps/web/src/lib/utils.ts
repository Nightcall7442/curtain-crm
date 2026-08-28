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

/** Инициалы для аватара-заглушки: «Иванов Иван» -> «ИИ». */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

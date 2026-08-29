/**
 * Работа с календарными датами.
 *
 * Здесь именно КАЛЕНДАРНЫЕ даты — срок заказа, день смены, — а не моменты
 * времени. Разница принципиальная и была источником ошибки, ради которой
 * этот модуль и появился.
 *
 * Колонка `orders.deadline` имеет тип `date` и приходит на клиент строкой
 * `"2026-08-29"`. Выражение `new Date("2026-08-29")` разбирает её как
 * полночь UTC — то есть как 05:00 по Ташкенту. Сравнение
 * `new Date(deadline) < new Date()` начинало давать «просрочен» с пяти утра
 * ТОГО ЖЕ дня, на который назначен срок: заказ краснел в списке, попадал в
 * плитку «Просрочено» и в раздел просроченных, хотя рабочий день ещё
 * не начался.
 *
 * Правильное сравнение календарных дат — строковое, в формате `YYYY-MM-DD`,
 * с локальной сегодняшней датой. Никаких `Date` в сравнении не участвует,
 * поэтому и часовому поясу нечего сдвигать.
 */

/**
 * Сегодняшняя дата в формате `YYYY-MM-DD` по ЛОКАЛЬНОМУ времени устройства.
 *
 * Через шведскую локаль: `toLocaleDateString('sv')` даёт ровно ISO-подобный
 * `2026-08-29`, но, в отличие от `toISOString()`, в местном поясе, а не в UTC.
 * Приём известный и держится на том, что шведский формат даты совпал с ISO;
 * альтернатива — вручную склеивать `getFullYear`/`getMonth`/`getDate` с
 * ведущими нулями, что длиннее и ошибается на единицу в месяце.
 */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString('sv');
}

/**
 * Просрочен ли срок.
 *
 * Срок СЕГОДНЯ просроченным не считается: у сотрудника есть весь рабочий
 * день, чтобы его закрыть. Просрочка начинается со следующего дня.
 *
 * `null` — срок не назначали, это не просрочка.
 */
export function isOverdueDate(deadline: string | null, now: Date = new Date()): boolean {
  if (deadline === null) return false;

  return deadline < todayIso(now);
}

/** Наступает ли срок сегодня. */
export function isDueToday(deadline: string | null, now: Date = new Date()): boolean {
  if (deadline === null) return false;

  return deadline === todayIso(now);
}

/**
 * Дата для показа: `29.08.2026`.
 *
 * Принимает календарную строку и НЕ превращает её в момент времени —
 * переставляет части сама. `new Date(deadline).toLocaleDateString()` в
 * поясах западнее UTC показал бы предыдущий день.
 */
export function formatIsoDate(value: string | null): string {
  if (value === null) return '—';

  const [year, month, day] = value.split('-');
  if (year === undefined || month === undefined || day === undefined) return '—';

  return `${day}.${month}.${year}`;
}

/** Короткая дата без года: `29.08`. Для списков, где год очевиден. */
export function formatIsoDateShort(value: string | null): string {
  if (value === null) return '—';

  const [, month, day] = value.split('-');
  if (month === undefined || day === undefined) return '—';

  return `${day}.${month}`;
}

/**
 * Вчерашняя дата в формате `YYYY-MM-DD`.
 *
 * Нужна, чтобы попросить у сервера просроченные заказы: фильтр `deadlineTo`
 * сравнивает включительно (`<=`), а срок «сегодня» просрочкой не считается —
 * значит, верхняя граница это вчера, а не сегодня.
 */
export function yesterdayIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return todayIso(shifted);
}

import { z } from 'zod';

/**
 * Приоритет заказа. Перенесён из `curtain-bot` (`class Priority`) без изменений —
 * бизнес-смысл тот же: влияет на сортировку в списках и на подсветку в интерфейсе.
 */
export const PRIORITIES = ['normal', 'urgent', 'critical'] as const;

export type Priority = (typeof PRIORITIES)[number];

export const Priority = {
  NORMAL: 'normal',
  URGENT: 'urgent',
  CRITICAL: 'critical',
} as const satisfies Record<string, Priority>;

export const prioritySchema = z.enum(PRIORITIES);

export const PRIORITY_LABELS_RU: Readonly<Record<Priority, string>> = {
  normal: 'Обычный',
  urgent: 'Срочный',
  critical: 'Критический',
};

/**
 * Вес приоритета для сортировки: чем больше, тем выше заказ в списке.
 * Используется в `ORDER BY` на бэкенде, чтобы не хардкодить CASE в SQL в каждом роутере.
 */
export const PRIORITY_WEIGHT: Readonly<Record<Priority, number>> = {
  normal: 0,
  urgent: 1,
  critical: 2,
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/** Сравнение приоритетов для сортировки по убыванию важности. */
export function comparePriorityDesc(a: Priority, b: Priority): number {
  return PRIORITY_WEIGHT[b] - PRIORITY_WEIGHT[a];
}

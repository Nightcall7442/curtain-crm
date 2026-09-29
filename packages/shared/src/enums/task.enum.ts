import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Доп работы (в коде — tasks) — дополнительная работа мимо конвейера заказов.
 *
 * «Съезди за тканью», «подмени на замере», «прибери склад» — руководитель
 * (директор или админ) выдаёт поручение конкретному сотруднику, тот видит
 * его во вкладке «Работа» рядом со своими заказами и отмечает выполнение.
 *
 * Первый домен из плана достройки (решение заказчика от 28.08.2026):
 * «задачи» здесь — именно поручения от руководства, а НЕ дубль заказов.
 * Этапы заказа поручениями не дублируются: у них своя таблица переходов
 * и свои исполнители.
 *
 * Выполнение принимает руководство. Сотрудник отмечает «Выполнено» — и
 * поручение ждёт подтверждения: директор или админ либо принимает его,
 * либо возвращает в работу с причиной. Раньше отметка сотрудника сразу
 * закрывала работу, и проверить, сделано ли на самом деле, было негде.
 * Руководитель, закрывающий поручение сам, подтверждения не ждёт.
 */

export const TASK_STATUSES = ['open', 'pending_review', 'done', 'cancelled'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TaskStatus = {
  OPEN: 'open',
  /** Сотрудник отметил выполнение, руководство ещё не приняло. */
  PENDING_REVIEW: 'pending_review',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, TaskStatus>;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_STATUS_LABELS: Translated<TaskStatus> = {
  ru: {
    open: 'В работе',
    pending_review: 'Ждёт подтверждения',
    done: 'Выполнено',
    cancelled: 'Отменено',
  },
  uz: {
    open: 'Bajarilmoqda',
    pending_review: 'Tasdiq kutilmoqda',
    done: 'Bajarildi',
    cancelled: 'Bekor qilindi',
  },
};

/** Поручение ещё не закрыто: в работе или ждёт подтверждения. */
export function isTaskActive(status: TaskStatus): boolean {
  return status === TaskStatus.OPEN || status === TaskStatus.PENDING_REVIEW;
}

export const TASK_STATUS_LABELS_RU = TASK_STATUS_LABELS.ru;

/** Максимальная длина текста поручения — совпадает с проверкой сервера. */
export const MAX_TASK_TITLE_LENGTH = 300;
export const MAX_TASK_DETAILS_LENGTH = 2000;

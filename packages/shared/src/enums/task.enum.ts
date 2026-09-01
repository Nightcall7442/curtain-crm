import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Поручения — дополнительная работа мимо конвейера заказов.
 *
 * «Съезди за тканью», «подмени на замере», «прибери склад» — руководитель
 * (директор или админ) выдаёт поручение конкретному сотруднику, тот видит
 * его во вкладке «Работа» рядом со своими заказами и отмечает выполнение.
 *
 * Первый домен из плана достройки (решение заказчика от 28.08.2026):
 * «задачи» здесь — именно поручения от руководства, а НЕ дубль заказов.
 * Этапы заказа поручениями не дублируются: у них своя таблица переходов
 * и свои исполнители.
 */

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TaskStatus = {
  OPEN: 'open',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, TaskStatus>;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_STATUS_LABELS: Translated<TaskStatus> = {
  ru: {
    open: 'В работе',
    done: 'Выполнено',
    cancelled: 'Отменено',
  },
  uz: {
    open: 'Bajarilmoqda',
    done: 'Bajarildi',
    cancelled: 'Bekor qilindi',
  },
};

export const TASK_STATUS_LABELS_RU = TASK_STATUS_LABELS.ru;

/** Максимальная длина текста поручения — совпадает с проверкой сервера. */
export const MAX_TASK_TITLE_LENGTH = 300;
export const MAX_TASK_DETAILS_LENGTH = 2000;

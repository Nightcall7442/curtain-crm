import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Запросы на выходные.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену,
 * руководитель (директор или админ) одобряет или отклоняет запрос.
 *
 * Отдельно от смен (`shifts`) намеренно: смена — факт присутствия по чек-ину,
 * запрос — заранее согласованное отсутствие. Само согласование ни на что не
 * влияет автоматически — это решение принимает руководитель, глядя на список
 * запросов, а не расписание, которое перестраивает себя само.
 */

export const DAY_OFF_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export type DayOffStatus = (typeof DAY_OFF_STATUSES)[number];

export const DayOffStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  /** Сотрудник сам отозвал ещё не рассмотренный запрос — не то же, что отказ. */
  CANCELLED: 'cancelled',
} as const satisfies Record<string, DayOffStatus>;

export const dayOffStatusSchema = z.enum(DAY_OFF_STATUSES);

export const DAY_OFF_STATUS_LABELS: Translated<DayOffStatus> = {
  ru: {
    pending: 'Ждёт решения',
    approved: 'Одобрен',
    rejected: 'Отклонён',
    cancelled: 'Отозван',
  },
  uz: {
    pending: 'Qaror kutilmoqda',
    approved: 'Tasdiqlangan',
    rejected: 'Rad etildi',
    cancelled: 'Qaytarib olindi',
  },
};

export const DAY_OFF_STATUS_LABELS_RU = DAY_OFF_STATUS_LABELS.ru;

export const MAX_DAY_OFF_REASON_LENGTH = 500;
export const MAX_DAY_OFF_REJECTION_REASON_LENGTH = 500;

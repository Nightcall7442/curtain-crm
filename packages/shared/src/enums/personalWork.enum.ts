import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Личные работы — то, что сотрудник шьёт себе или знакомым на оборудовании
 * мастерской.
 *
 * Это не заказ и не доп. работа: клиента нет, деньги компании не идут, в
 * конвейере такая вещь не участвует. Но станок она занимает, ткань
 * расходует, и время на неё уходит рабочее — поэтому руководство должно
 * видеть, чем занят цех, а не узнавать об этом по остаткам на складе.
 *
 * Учёт открытый намеренно: запрет тут не работает — люди всё равно шьют
 * себе, просто молча. Гораздо полезнее, когда это записано: видно
 * загрузку, видно расход, и не нужно выяснять, почему машинка занята.
 *
 * Заводит такую запись САМ сотрудник, любой роли. Руководство её не
 * выдаёт — оно только видит и, если надо, закрывает.
 */

export const PERSONAL_WORK_STATUSES = ['in_progress', 'done', 'cancelled'] as const;

export type PersonalWorkStatus = (typeof PERSONAL_WORK_STATUSES)[number];

export const PersonalWorkStatus = {
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, PersonalWorkStatus>;

export const personalWorkStatusSchema = z.enum(PERSONAL_WORK_STATUSES);

export const PERSONAL_WORK_STATUS_LABELS: Translated<PersonalWorkStatus> = {
  ru: {
    in_progress: 'В работе',
    done: 'Готово',
    cancelled: 'Отменена',
  },
  uz: {
    in_progress: 'Bajarilmoqda',
    done: 'Tayyor',
    cancelled: 'Bekor qilindi',
  },
};

export const PERSONAL_WORK_STATUS_LABELS_RU = PERSONAL_WORK_STATUS_LABELS.ru;

/** Открытые работы — те, что ещё занимают цех. */
export const isOpenPersonalWork = (status: PersonalWorkStatus): boolean =>
  status === PersonalWorkStatus.IN_PROGRESS;

/** Длина описания: одна строка о том, что именно шьётся. */
export const MAX_PERSONAL_WORK_TITLE_LENGTH = 200;
export const MAX_PERSONAL_WORK_DETAILS_LENGTH = 1000;

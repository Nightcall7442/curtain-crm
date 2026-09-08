import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Ход работы по карнизу.
 *
 * Карниз — отдельная работа, идущая ПАРАЛЛЕЛЬНО цеху, а не шагом в общей
 * цепочке. После проверки админом заказ уходит и в пошив, и карнизчикам
 * сразу: карниз вешают до того, как привезут шторы, и ждать пошива ему
 * незачем. Поэтому это своё поле заказа, а не четыре новых статуса в
 * `ORDER_STATUSES` — иначе таблица переходов раздвоилась бы на два пути,
 * которые нужно проходить одновременно.
 *
 * `not_required` — в позициях заказа нет ни карниза, ни пластика, ни трубы:
 * вешать нечего. Это не «ещё не начали», а «работы нет вовсе», и в очереди
 * карнизчиков такой заказ не появляется.
 */
export const CORNICE_STATUSES = ['not_required', 'pending', 'in_progress', 'done'] as const;

export type CorniceStatus = (typeof CORNICE_STATUSES)[number];

export const CorniceStatus = {
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
} as const satisfies Record<string, CorniceStatus>;

export const corniceStatusSchema = z.enum(CORNICE_STATUSES);

export const CORNICE_STATUS_LABELS: Translated<CorniceStatus> = {
  ru: {
    not_required: 'Карниз не нужен',
    pending: 'Ждёт карнизчика',
    in_progress: 'Карниз ставят',
    done: 'Карниз готов',
  },
  uz: {
    not_required: 'Karniz kerak emas',
    pending: 'Karnizchini kutmoqda',
    in_progress: "Karniz o'rnatilmoqda",
    done: 'Karniz tayyor',
  },
};

export const CORNICE_STATUS_LABELS_RU = CORNICE_STATUS_LABELS.ru;

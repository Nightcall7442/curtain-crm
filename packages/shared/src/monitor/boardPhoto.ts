import { z } from 'zod';

import { LiveStatus, type LiveStatus as LiveStatusName } from '../enums/monitor.enum';
import type { Translated } from '../i18n/locale';

/**
 * Фото человека для табло — по статусу.
 *
 * Заказчик (переписка 25.10): «фото каждого сотрудника для табло, ставится
 * по статусам: работает / без заказа / на перерыве; это фото не
 * отображается в других разделах, как мой профиль, — только для табло».
 * Пример — швея за машинкой, швея без работы, швея с чашкой.
 *
 * Фото три, статусов табло больше. Выезд — тоже работа; закрывший смену,
 * выходной и не отметившийся — «без заказа»: карточка у них приглушена, и
 * нейтральное фото подходит лучше рабочего.
 */
export const BOARD_PHOTO_KINDS = ['working', 'idle', 'break'] as const;

export type BoardPhotoKind = (typeof BOARD_PHOTO_KINDS)[number];

export const BoardPhotoKind = {
  WORKING: 'working',
  IDLE: 'idle',
  BREAK: 'break',
} as const satisfies Record<string, BoardPhotoKind>;

export const boardPhotoKindSchema = z.enum(BOARD_PHOTO_KINDS);

export const BOARD_PHOTO_KIND_LABELS: Translated<BoardPhotoKind> = {
  ru: { working: 'Работает', idle: 'Без заказа', break: 'На перерыве' },
  uz: { working: 'Ishlamoqda', idle: 'Buyurtmasiz', break: 'Tanaffusda' },
};

/** Какое фото показать при этом статусе. */
export function boardPhotoKindOf(status: LiveStatusName): BoardPhotoKind {
  switch (status) {
    case LiveStatus.WORKING:
    case LiveStatus.TRIP:
      return BoardPhotoKind.WORKING;
    case LiveStatus.BREAK:
      return BoardPhotoKind.BREAK;
    case LiveStatus.IDLE:
    case LiveStatus.FINISHED:
    case LiveStatus.DAY_OFF:
    case LiveStatus.ABSENT:
      return BoardPhotoKind.IDLE;
  }
}

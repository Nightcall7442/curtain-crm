import { z } from 'zod';

import { Role, ROLES } from './role.enum';

/**
 * Стадии фотофиксации заказа.
 *
 * Отличие от `curtain-bot`: стадия `ready` переименована в `qc` — фото делает
 * контроль качества, а не швея, и стадия соответствует статусу `pending_qc`.
 */
export const PHOTO_STAGES = [
  'measurement',
  'fabric',
  'cutting',
  'sewing_process',
  'qc',
  'install_before',
  'install_after',
  'general',
] as const;

export type PhotoStage = (typeof PHOTO_STAGES)[number];

export const PhotoStage = {
  MEASUREMENT: 'measurement',
  FABRIC: 'fabric',
  CUTTING: 'cutting',
  SEWING_PROCESS: 'sewing_process',
  QC: 'qc',
  INSTALL_BEFORE: 'install_before',
  INSTALL_AFTER: 'install_after',
  GENERAL: 'general',
} as const satisfies Record<string, PhotoStage>;

export const photoStageSchema = z.enum(PHOTO_STAGES);

export const PHOTO_STAGE_LABELS_RU: Readonly<Record<PhotoStage, string>> = {
  measurement: 'Замеры',
  fabric: 'Ткань',
  cutting: 'Раскрой',
  sewing_process: 'Пошив',
  qc: 'Контроль качества',
  install_before: 'До установки',
  install_after: 'После установки',
  general: 'Общее',
};

/**
 * Кто может загружать фото на каждой стадии.
 *
 * CEO и админ намеренно включены во все стадии: руководство должно иметь
 * возможность закрыть пробел, если сотрудник не загрузил фото сам.
 * Проверка выполняется в `orderPhotos.router.ts`.
 */
export const PHOTO_STAGE_UPLOADER_ROLES: Readonly<Record<PhotoStage, readonly Role[]>> = {
  measurement: [Role.CEO, Role.ADMIN, Role.MASTER],
  fabric: [Role.CEO, Role.ADMIN, Role.SEWER],
  cutting: [Role.CEO, Role.ADMIN, Role.SEWER],
  sewing_process: [Role.CEO, Role.ADMIN, Role.SEWER],
  qc: [Role.CEO, Role.ADMIN, Role.QC],
  install_before: [Role.CEO, Role.ADMIN, Role.INSTALLER],
  install_after: [Role.CEO, Role.ADMIN, Role.INSTALLER],
  // `general` — свободная стадия: приложить фото может любой участник заказа.
  general: ROLES,
};

/**
 * Стадия, загрузка фото на которой автоматически закрывает заказ
 * (`installation_done` -> `completed`). Подтверждение клиента не требуется.
 */
export const AUTO_COMPLETE_PHOTO_STAGE: PhotoStage = PhotoStage.INSTALL_AFTER;

export function isPhotoStage(value: unknown): value is PhotoStage {
  return typeof value === 'string' && (PHOTO_STAGES as readonly string[]).includes(value);
}

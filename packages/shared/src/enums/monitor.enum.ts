import { z } from 'zod';

import type { Translated } from '../i18n/locale';
import { Role } from './role.enum';

/**
 * Табло — живая картина производства для руководства и телевизора в цехе.
 *
 * Групп две, а не по одной на роль: карнизчик тоже ездит на объекты, и
 * руководителю нужен один экран «кто сейчас где из выездных», а не два.
 */
export const MONITOR_GROUPS = ['workshop', 'installation'] as const;

export type MonitorGroup = (typeof MONITOR_GROUPS)[number];

export const MonitorGroup = {
  WORKSHOP: 'workshop',
  INSTALLATION: 'installation',
} as const satisfies Record<string, MonitorGroup>;

export const monitorGroupSchema = z.enum(MONITOR_GROUPS);

/** Кто попадает на табло группы. Человек с двумя ролями группы — одна карточка. */
export const MONITOR_GROUP_ROLES: Readonly<Record<MonitorGroup, readonly Role[]>> = {
  workshop: [Role.SEWER],
  installation: [Role.INSTALLER, Role.CORNICE_INSTALLER],
};

export const MONITOR_GROUP_LABELS: Translated<MonitorGroup> = {
  ru: { workshop: 'Цех', installation: 'Установщики' },
  uz: { workshop: 'Sex', installation: "O'rnatuvchilar" },
};

/**
 * Что человек делает прямо сейчас.
 *
 * Порядок — приоритет: выезд говорит, где человек физически, поэтому он
 * важнее отлучки, а отлучка — важнее «работает». Открытая смена важнее
 * выходного: вышел в свой выходной — значит работает.
 */
export const LIVE_STATUSES = [
  'trip',
  'break',
  'working',
  'idle',
  'finished',
  'day_off',
  'absent',
] as const;

export type LiveStatus = (typeof LIVE_STATUSES)[number];

export const LiveStatus = {
  TRIP: 'trip',
  BREAK: 'break',
  WORKING: 'working',
  IDLE: 'idle',
  FINISHED: 'finished',
  DAY_OFF: 'day_off',
  ABSENT: 'absent',
} as const satisfies Record<string, LiveStatus>;

export const liveStatusSchema = z.enum(LIVE_STATUSES);

export const LIVE_STATUS_LABELS: Translated<LiveStatus> = {
  ru: {
    trip: 'На выезде',
    break: 'Отлучка',
    working: 'Работает',
    idle: 'Без заказа',
    finished: 'Смена закрыта',
    day_off: 'Выходной',
    absent: 'Нет отметки',
  },
  uz: {
    trip: 'Chiqishda',
    break: 'Vaqtincha chiqib ketgan',
    working: 'Ishlamoqda',
    idle: 'Buyurtmasiz',
    finished: 'Smena yopilgan',
    day_off: 'Dam olish kuni',
    absent: 'Belgilanmagan',
  },
};

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

/**
 * Чей труд меряется планом месяца. У швей — штуки, у выездных — заказы
 * (`PLAN_UNIT`). Менеджеры и цех без швей плана не имеют.
 */
export const PLAN_ROLES = [Role.SEWER, Role.INSTALLER, Role.CORNICE_INSTALLER] as const;

export type PlanRole = (typeof PLAN_ROLES)[number];

export const planRoleSchema = z.enum(PLAN_ROLES);

export function isPlanRole(role: Role): role is PlanRole {
  return (PLAN_ROLES as readonly Role[]).includes(role);
}

/** Откуда план человека: личный план важнее нормы роли. */
export const PLAN_SOURCES = ['personal', 'role'] as const;

export type PlanSource = (typeof PLAN_SOURCES)[number];

/**
 * Темп выполнения плана: сравнение доли плана с долей прошедших рабочих
 * дней месяца. Правило — `planPace`.
 */
export const PLAN_PACES = ['ahead', 'on_track', 'behind'] as const;

export type PlanPace = (typeof PLAN_PACES)[number];

export const PLAN_PACE_LABELS: Translated<PlanPace> = {
  ru: { ahead: 'Опережает', on_track: 'В графике', behind: 'Отстаёт' },
  uz: { ahead: 'Oldinda', on_track: 'Grafikda', behind: 'Ortda' },
};

/** Где установка из расписания дня. Правило — `installSlotState`. */
export const INSTALL_SLOT_STATES = ['done', 'in_progress', 'late', 'upcoming'] as const;

export type InstallSlotState = (typeof INSTALL_SLOT_STATES)[number];

export const INSTALL_SLOT_STATE_LABELS: Translated<InstallSlotState> = {
  ru: { done: 'Сделано', in_progress: 'Идёт', late: 'Опаздывает', upcoming: 'Впереди' },
  uz: { done: 'Bajarildi', in_progress: 'Davom etmoqda', late: 'Kechikmoqda', upcoming: 'Oldinda' },
};

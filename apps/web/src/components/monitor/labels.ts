import {
  LIVE_STATUS_LABELS,
  LiveStatus,
  MonitorGroup,
  type LiveStatus as LiveStatusName,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';

import type { RouterOutputs } from '@/lib/trpc';

/** Снимок табло руководителя и его части. */
export type BoardData = RouterOutputs['monitor']['board'];
export type BoardPerson = BoardData['people'][number];
export type BoardWork = BoardPerson['current'][number];
export type BoardUnit = BoardData['unit'];

/** Единица выработки после числа: «212 шт», «48 зак.». */
export const UNIT_SHORT: Readonly<Record<BoardUnit, string>> = { pieces: 'шт', orders: 'зак.' };

/** Статусы, которые бывают у группы: на выезд ездят только выездные. */
export const GROUP_STATUSES: Readonly<Record<MonitorGroupName, readonly LiveStatusName[]>> = {
  [MonitorGroup.WORKSHOP]: [
    LiveStatus.WORKING,
    LiveStatus.IDLE,
    LiveStatus.BREAK,
    LiveStatus.FINISHED,
    LiveStatus.ABSENT,
    LiveStatus.DAY_OFF,
  ],
  [MonitorGroup.INSTALLATION]: [
    LiveStatus.TRIP,
    LiveStatus.WORKING,
    LiveStatus.IDLE,
    LiveStatus.BREAK,
    LiveStatus.FINISHED,
    LiveStatus.ABSENT,
    LiveStatus.DAY_OFF,
  ],
};

/**
 * Цвет статуса — один на точку, чип и плашку.
 *
 * Выезд — цветом этапа «Установка», как в остальной панели: человек на
 * объекте и заказ на установке читаются одним цветом.
 */
export const STATUS_DOT: Readonly<Record<LiveStatusName, string>> = {
  [LiveStatus.TRIP]: 'bg-stage-installation',
  [LiveStatus.BREAK]: 'bg-warning',
  [LiveStatus.WORKING]: 'bg-positive',
  [LiveStatus.IDLE]: 'bg-info',
  [LiveStatus.FINISHED]: 'bg-secondary',
  [LiveStatus.DAY_OFF]: 'bg-muted',
  [LiveStatus.ABSENT]: 'bg-danger',
};

export const STATUS_TEXT: Readonly<Record<LiveStatusName, string>> = {
  [LiveStatus.TRIP]: 'text-stage-installation',
  [LiveStatus.BREAK]: 'text-warning',
  [LiveStatus.WORKING]: 'text-positive',
  [LiveStatus.IDLE]: 'text-info',
  [LiveStatus.FINISHED]: 'text-secondary',
  [LiveStatus.DAY_OFF]: 'text-muted',
  [LiveStatus.ABSENT]: 'text-danger',
};

/** Не на работе: фото на карточке приглушается, чтобы взгляд шёл к тем, кто здесь. */
export const AWAY_STATUSES: ReadonlySet<LiveStatusName> = new Set([LiveStatus.DAY_OFF, LiveStatus.ABSENT]);

export const statusLabel = (status: LiveStatusName): string => LIVE_STATUS_LABELS.ru[status];

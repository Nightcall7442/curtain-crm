import {
  formatInstallSlot,
  LIVE_STATUS_LABELS,
  LiveStatus,
  type Locale,
  type LiveStatus as LiveStatusName,
  type PlanPace,
} from '@curtain-crm/shared';

import type { RouterOutputs } from '../../lib/trpc';
import { colors, stageColors } from '../../theme';

export type MonitorBoardData = RouterOutputs['monitor']['board'];
export type MonitorPersonData = MonitorBoardData['people'][number];
export type MonitorDetail = RouterOutputs['monitor']['person'];

/** Цвет статуса — тот же смысл, что в панели: выезд — цветом этапа «Установка». */
export const STATUS_COLOR: Readonly<Record<LiveStatusName, string>> = {
  [LiveStatus.TRIP]: stageColors.installation,
  [LiveStatus.BREAK]: colors.warning,
  [LiveStatus.WORKING]: colors.positive,
  [LiveStatus.IDLE]: colors.info,
  [LiveStatus.FINISHED]: colors.textMuted,
  [LiveStatus.DAY_OFF]: colors.textMuted,
  [LiveStatus.ABSENT]: colors.danger,
};

/** Темп: опережает — хвоя, в графике — янтарь, отстаёт — терракота. */
export const PACE_COLOR: Readonly<Record<PlanPace, string>> = {
  ahead: colors.accentBright,
  on_track: colors.warning,
  behind: colors.danger,
};

/** Не на работе: фото приглушается, взгляд идёт к тем, кто здесь. */
export const isAway = (status: LiveStatusName): boolean =>
  status === LiveStatus.DAY_OFF || status === LiveStatus.ABSENT;

/** «На выезде с 10:12», «Отлучка до 14:30» — время по Ташкенту. */
export function statusText(
  person: Pick<MonitorPersonData, 'status' | 'statusSince' | 'statusUntil'>,
  locale: Locale,
  m: (key: 'monitor.tripSince' | 'monitor.breakUntil', values: { time: string }) => string,
): string {
  if (person.status === LiveStatus.TRIP && person.statusSince !== null) {
    return m('monitor.tripSince', { time: formatInstallSlot(person.statusSince).time });
  }
  if (person.status === LiveStatus.BREAK && person.statusUntil !== null) {
    return m('monitor.breakUntil', { time: formatInstallSlot(person.statusUntil).time });
  }
  return LIVE_STATUS_LABELS[locale][person.status];
}

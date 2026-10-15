import { WORKSHOP_TIME_ZONE } from '../constants/calendar';
import { INSTALLATION_LATE_GRACE_MINUTES } from '../constants/monitor';
import type { InstallSlotState } from '../enums/monitor.enum';
import { OrderStatus } from '../enums/orderStatus.enum';

const DONE_STATUSES: readonly OrderStatus[] = [OrderStatus.INSTALLATION_DONE, OrderStatus.COMPLETED];

/**
 * Где установка из расписания дня. Опоздание — только после
 * `INSTALLATION_LATE_GRACE_MINUTES`: ровно на границе установка ещё «впереди».
 * Выезд по заказу уже идёт — значит установщик в пути или на месте.
 */
export function installSlotState(params: {
  readonly status: OrderStatus;
  readonly installationAt: Date;
  readonly tripInProgress: boolean;
  readonly now: Date;
}): InstallSlotState {
  const { status, installationAt, tripInProgress, now } = params;
  if (DONE_STATUSES.includes(status)) return 'done';
  if (status === OrderStatus.INSTALLATION_IN_PROGRESS || tripInProgress) return 'in_progress';
  const lateAfter = installationAt.getTime() + INSTALLATION_LATE_GRACE_MINUTES * 60_000;
  return now.getTime() > lateAfter ? 'late' : 'upcoming';
}

const SLOT_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: WORKSHOP_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Дата и время установки по Ташкенту: `{ date: '15.10', time: '10:30' }`.
 * Склеивается из частей, а не из строки локали: на телефонах без данных
 * локалей `toLocaleString` выдал бы другой формат.
 */
export function formatInstallSlot(at: Date): { date: string; time: string } {
  const parts = SLOT_FORMAT.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${part('day')}.${part('month')}`, time: `${part('hour')}:${part('minute')}` };
}

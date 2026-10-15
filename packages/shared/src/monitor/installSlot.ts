import { WORKSHOP_TIME_ZONE } from '../constants/calendar';
import { INSTALLATION_LATE_GRACE_MINUTES } from '../constants/monitor';
import type { InstallSlotState } from '../enums/monitor.enum';
import { OrderStatus } from '../enums/orderStatus.enum';

const DONE_STATUSES: readonly OrderStatus[] = [OrderStatus.INSTALLATION_DONE, OrderStatus.COMPLETED];

/** Пока установщик не выехал, время установки можно поставить и перенести. */
export const INSTALLATION_SCHEDULABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.QC_PASSED,
  OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
  OrderStatus.INSTALLATION_ASSIGNED,
];

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

/** Ташкент живёт в UTC+5 круглый год, перевода часов нет. */
const TASHKENT_OFFSET = '+05:00';

const INPUT_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: WORKSHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Значение поля `datetime-local` для момента — по Ташкенту: руководитель,
 * открывший панель в командировке, видит то же время, что и цех.
 */
export function installSlotInputValue(at: Date): string {
  const parts = INPUT_FORMAT.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Момент из значения `datetime-local`, понятого как ташкентское время; пусто или мусор — `null`. */
export function parseInstallSlotInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(`${value}:00${TASHKENT_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

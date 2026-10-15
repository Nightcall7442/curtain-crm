import { SHIFT_FORGOTTEN_AFTER_HOURS } from '../constants/shift';
import { LiveStatus } from '../enums/monitor.enum';

export interface LiveStatusInput {
  readonly now: Date;
  /** Смена, начатая сегодня (по Ташкенту), либо ещё открытая. Самая поздняя. */
  readonly shift: { readonly startedAt: Date; readonly endedAt: Date | null } | null;
  readonly openBreak: { readonly startedAt: Date; readonly plannedMinutes: number } | null;
  readonly openTrip: { readonly startedAt: Date } | null;
  readonly dayOff: boolean;
  readonly hasCurrentWork: boolean;
}

export interface LiveStatusResult {
  readonly status: LiveStatus;
  readonly since: Date | null;
  /** Только для отлучки: начало + заявленные минуты. */
  readonly until: Date | null;
}

/**
 * Статус человека на табло.
 *
 * Открытая смена старше `SHIFT_FORGOTTEN_AFTER_HOURS` — не работа, а
 * забытая отметка: человек ушёл и не закрыл смену. Показать его
 * «работающим» значило бы соврать на весь цех.
 */
export function deriveLiveStatus(input: LiveStatusInput): LiveStatusResult {
  const { shift, now } = input;
  const running =
    shift !== null &&
    shift.endedAt === null &&
    now.getTime() - shift.startedAt.getTime() < SHIFT_FORGOTTEN_AFTER_HOURS * 60 * 60 * 1000;

  if (running) {
    if (input.openTrip !== null) {
      return { status: LiveStatus.TRIP, since: input.openTrip.startedAt, until: null };
    }
    if (input.openBreak !== null) {
      const { startedAt, plannedMinutes } = input.openBreak;
      return {
        status: LiveStatus.BREAK,
        since: startedAt,
        until: new Date(startedAt.getTime() + plannedMinutes * 60 * 1000),
      };
    }
    return {
      status: input.hasCurrentWork ? LiveStatus.WORKING : LiveStatus.IDLE,
      since: shift.startedAt,
      until: null,
    };
  }

  if (shift?.endedAt != null) {
    return { status: LiveStatus.FINISHED, since: shift.endedAt, until: null };
  }

  return { status: input.dayOff ? LiveStatus.DAY_OFF : LiveStatus.ABSENT, since: null, until: null };
}

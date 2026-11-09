import { workshopClockTime } from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SLOT_STATE,
  SHIFT_REMINDER_TEXT,
  SHIFT_REMINDER_TIMES,
  shiftReminderKind,
  stepSlots,
  TERMINAL_CHECK_REMINDER_TIMES,
  type SlotState,
} from './reminders.service';

/**
 * Напоминания о смене — по словам владельца (09.11): в 09:00, 09:10, 09:15
 * «Smenani yoqishni unutmang!», в 17:20, 17:25, 17:30 и 22:00 — «Smenani
 * yopishni unutmang!». Часы — ташкентские.
 */
describe('shiftReminderKind', () => {
  it('утренние слоты — открыть смену', () => {
    for (const clock of ['09:00', '09:10', '09:15']) {
      expect(shiftReminderKind(clock), clock).toBe('open');
    }
  });

  it('вечерние слоты — закрыть смену', () => {
    for (const clock of ['17:20', '17:25', '17:30', '22:00']) {
      expect(shiftReminderKind(clock), clock).toBe('close');
    }
  });

  it('между слотами и около них — ничего', () => {
    for (const clock of ['08:59', '09:01', '09:05', '09:11', '09:14', '09:16', '09:20', '17:00', '17:21', '17:35', '21:59', '22:01', '00:00', '10:00', '15:00']) {
      expect(shiftReminderKind(clock), clock).toBeNull();
    }
  });

  it('слот считается по Ташкенту, а не по UTC сервера', () => {
    // 04:00 UTC — 09:00 в Ташкенте; 09:00 UTC — 14:00, не слот.
    expect(shiftReminderKind(workshopClockTime(new Date('2026-11-09T04:00:00Z')))).toBe('open');
    expect(shiftReminderKind(workshopClockTime(new Date('2026-11-09T17:00:00Z')))).toBe('close');
    expect(shiftReminderKind(workshopClockTime(new Date('2026-11-09T09:00:00Z')))).toBeNull();
  });
});

describe('SHIFT_REMINDER_TEXT', () => {
  it('в группу — ровно слова владельца', () => {
    expect(SHIFT_REMINDER_TEXT.open.uz).toBe('Smenani yoqishni unutmang!');
    expect(SHIFT_REMINDER_TEXT.close.uz).toBe('Smenani yopishni unutmang!');
  });
});

/**
 * Прогон тиков: что отправлено на каждом. Время — по Ташкенту, с секундами:
 * таймер раз в минуту плывёт, и тик приходится не на начало минуты.
 */
function runTicks(slots: readonly string[], ticks: readonly string[]): (readonly string[])[] {
  let state: SlotState = EMPTY_SLOT_STATE;
  return ticks.map((at) => {
    const step = stepSlots(slots, new Date(`${at}+05:00`), state);
    state = step.state;
    return step.due;
  });
}

describe('stepSlots — слот срабатывает с допуском и один раз', () => {
  it('тик в 09:10:59, следующий в 09:12:01 — 09:10 отправлен один раз, на первом', () => {
    expect(runTicks(SHIFT_REMINDER_TIMES, ['2026-11-09T09:10:59', '2026-11-09T09:12:01'])).toEqual([['09:10'], []]);
  });

  it('таймер перешагнул минуту слота (09:09:59 → 09:11:01) — слот не потерян', () => {
    expect(runTicks(SHIFT_REMINDER_TIMES, ['2026-11-09T09:09:59', '2026-11-09T09:11:01'])).toEqual([[], ['09:10']]);
  });

  it('первый тик после слота в 09:12:01 — ещё в окне допуска', () => {
    expect(runTicks(SHIFT_REMINDER_TIMES, ['2026-11-09T09:09:30', '2026-11-09T09:12:01'])).toEqual([[], ['09:10']]);
  });

  it('в 09:13 уже поздно — слот пропущен, а не отправлен с опозданием', () => {
    expect(runTicks(SHIFT_REMINDER_TIMES, ['2026-11-09T09:09:30', '2026-11-09T09:13:00'])).toEqual([[], []]);
  });

  it('тики каждую минуту — каждый слот ровно один раз', () => {
    const ticks = Array.from({ length: 30 }, (_, index) => {
      const minute = (59 + index) % 60;
      const hour = index === 0 ? '08' : '09';
      return `2026-11-09T${hour}:${minute.toString().padStart(2, '0')}:30`;
    });

    expect(runTicks(SHIFT_REMINDER_TIMES, ticks).flat()).toEqual(['09:00', '09:10', '09:15']);
  });

  it('на следующий день тот же слот отправляется снова', () => {
    expect(runTicks(SHIFT_REMINDER_TIMES, ['2026-11-09T09:00:30', '2026-11-10T09:00:30'])).toEqual([['09:00'], ['09:00']]);
  });

  it('день — по Ташкенту: 22:00 по Ташкенту — это 17:00 UTC того же дня', () => {
    const step = stepSlots(SHIFT_REMINDER_TIMES, new Date('2026-11-09T17:01:10Z'), EMPTY_SLOT_STATE);

    expect(step.due).toEqual(['22:00']);
    expect(step.state.day).toBe('2026-11-09');
  });

  it('терминальные чеки — по тому же правилу', () => {
    expect(
      runTicks(TERMINAL_CHECK_REMINDER_TIMES, ['2026-11-09T09:59:58', '2026-11-09T10:01:02', '2026-11-09T10:02:03', '2026-11-09T15:03:00']),
    ).toEqual([[], ['10:00'], [], []]);
  });
});

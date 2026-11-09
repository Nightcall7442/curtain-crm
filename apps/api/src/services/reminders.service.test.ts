import { workshopClockTime } from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import { SHIFT_REMINDER_TEXT, shiftReminderKind } from './reminders.service';

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

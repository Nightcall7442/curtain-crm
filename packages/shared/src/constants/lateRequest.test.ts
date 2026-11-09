import { describe, expect, it } from 'vitest';

import { MAX_DAY_OFF_REASON_LENGTH } from '../enums/dayOff.enum';

import {
  clockMinutes,
  effectiveShiftStart,
  isClockTime,
  MAX_LATE_REQUEST_REASON_LENGTH,
} from './lateRequest';

describe('isClockTime', () => {
  it('принимает ЧЧ:ММ в пределах суток', () => {
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('09:05')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
  });

  it('отбивает всё, что не время дня', () => {
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('9:05')).toBe(false);
    expect(isClockTime('10:60')).toBe(false);
    expect(isClockTime('10:30:00')).toBe(false);
    expect(isClockTime('')).toBe(false);
  });
});

describe('clockMinutes', () => {
  it('минуты от полуночи', () => {
    expect(clockMinutes('00:00')).toBe(0);
    expect(clockMinutes('10:30')).toBe(630);
    expect(clockMinutes('23:59')).toBe(1439);
  });
});

describe('effectiveShiftStart', () => {
  it('без согласованного опоздания — смена по графику', () => {
    expect(effectiveShiftStart('09:00', null)).toBe('09:00');
  });

  it('согласованное опоздание сдвигает начало на «приду к»', () => {
    expect(effectiveShiftStart('09:00', '10:30')).toBe('10:30');
  });

  it('«приду к» раньше графика смену не сдвигает раньше', () => {
    expect(effectiveShiftStart('09:00', '08:30')).toBe('09:00');
  });
});

describe('MAX_LATE_REQUEST_REASON_LENGTH', () => {
  it('такая же, как у причины выходного', () => {
    expect(MAX_LATE_REQUEST_REASON_LENGTH).toBe(MAX_DAY_OFF_REASON_LENGTH);
  });
});

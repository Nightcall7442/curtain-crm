import { describe, expect, it } from 'vitest';

import { workshopPeriodStarts } from './reports.router';

const iso = (value: Date): string => value.toISOString();

describe('workshopPeriodStarts', () => {
  it('сутки начинаются в полночь по Ташкенту, а не по UTC', () => {
    // Среда, 30 сентября, 01:30 по Ташкенту — по UTC ещё 29-е.
    const starts = workshopPeriodStarts(new Date('2026-09-29T20:30:00Z'));

    expect(iso(starts.today)).toBe('2026-09-29T19:00:00.000Z');
    expect(iso(starts.tomorrow)).toBe('2026-09-30T19:00:00.000Z');
    // Понедельник, 28 сентября, 00:00 по Ташкенту.
    expect(iso(starts.week)).toBe('2026-09-27T19:00:00.000Z');
    expect(iso(starts.month)).toBe('2026-08-31T19:00:00.000Z');
    expect(iso(starts.prevMonth)).toBe('2026-07-31T19:00:00.000Z');
  });

  it('первое января — новый год, неделя с понедельника прошлого года', () => {
    // Четверг, 1 января 2026, 07:00 по Ташкенту.
    const starts = workshopPeriodStarts(new Date('2026-01-01T02:00:00Z'));

    expect(iso(starts.today)).toBe('2025-12-31T19:00:00.000Z');
    expect(iso(starts.week)).toBe('2025-12-28T19:00:00.000Z');
    expect(iso(starts.month)).toBe('2025-12-31T19:00:00.000Z');
    expect(iso(starts.prevMonth)).toBe('2025-11-30T19:00:00.000Z');
  });

  it('в воскресенье неделя ещё та же — с понедельника', () => {
    // Воскресенье, 4 октября, 12:00 по Ташкенту.
    const starts = workshopPeriodStarts(new Date('2026-10-04T07:00:00Z'));

    expect(iso(starts.week)).toBe('2026-09-27T19:00:00.000Z');
    expect(iso(starts.month)).toBe('2026-09-30T19:00:00.000Z');
  });
});

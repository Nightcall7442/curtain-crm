import { describe, expect, it } from 'vitest';

import { workshopPeriodStarts } from './reports.router';

describe('workshopPeriodStarts', () => {
  it('сутки начинаются в полночь по Ташкенту, а не по UTC', () => {
    // 30 сентября, 01:30 по Ташкенту — по UTC ещё 29-е.
    const starts = workshopPeriodStarts(new Date('2026-09-29T20:30:00Z'));

    expect(starts.today.toISOString()).toBe('2026-09-29T19:00:00.000Z');
    expect(starts.month.toISOString()).toBe('2026-08-31T19:00:00.000Z');
    expect(starts.prevMonth.toISOString()).toBe('2026-07-31T19:00:00.000Z');
  });

  it('первое января — новый год и декабрь прошлого как прошлый месяц', () => {
    const starts = workshopPeriodStarts(new Date('2026-01-01T02:00:00Z'));

    expect(starts.today.toISOString()).toBe('2025-12-31T19:00:00.000Z');
    expect(starts.month.toISOString()).toBe('2025-12-31T19:00:00.000Z');
    expect(starts.prevMonth.toISOString()).toBe('2025-11-30T19:00:00.000Z');
  });
});

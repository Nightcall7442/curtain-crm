import { describe, expect, it } from 'vitest';

import { formatDayRange, isoWeekdayOf, weekdayName } from './calendar';

describe('isoWeekdayOf', () => {
  it('считает неделю с понедельника, а не с воскресенья', () => {
    expect(isoWeekdayOf(new Date('2026-09-14T00:00:00Z'))).toBe(1); // Пн
    expect(isoWeekdayOf(new Date('2026-09-11T00:00:00Z'))).toBe(5); // Пт
    expect(isoWeekdayOf(new Date('2026-09-13T00:00:00Z'))).toBe(7); // Вс
  });
});

describe('weekdayName', () => {
  it('подписывает день из БД и молчит на мусор', () => {
    expect(weekdayName(5)).toBe('Пятница');
    expect(weekdayName(0)).toBe('');
  });
});

describe('formatDayRange', () => {
  // Конец — полуинтервал: понедельник следующей недели.
  const start = new Date('2026-11-02T00:00:00Z');
  const end = new Date('2026-11-09T00:00:00Z');

  it('подписывает неделю на языке клиента', () => {
    expect(formatDayRange(start, end)).toBe('2 — 8 ноября');
    expect(formatDayRange(start, end, 'uz')).toBe('2 — 8 noyabr');
  });

  it('называет оба месяца, если неделя на стыке', () => {
    const edge = new Date('2026-10-26T00:00:00Z');
    expect(formatDayRange(edge, new Date('2026-11-02T00:00:00Z'), 'uz')).toBe('26 oktabr — 1 noyabr');
  });
});

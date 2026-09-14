import { describe, expect, it } from 'vitest';

import { isoWeekdayOf, weekdayName } from './calendar';

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

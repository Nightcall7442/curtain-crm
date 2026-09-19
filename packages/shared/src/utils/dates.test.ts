import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatIsoDate,
  formatIsoDateShort,
  formatTime,
  isDueToday,
  isOverdueDate,
  todayIso,
  workshopToday,
  yesterdayIso,
} from './dates';

/**
 * Момент в конкретный час ташкентского времени (UTC+5).
 *
 * Смещение задаётся в самой строке, поэтому тест не зависит от часового
 * пояса машины, на которой запущен, — а именно на этой зависимости и
 * держалась исходная ошибка.
 */
const atTashkent = (iso: string): Date => new Date(iso);

describe('isOverdueDate', () => {
  it('НЕ считает просроченным срок, наступающий сегодня', () => {
    // Ровно тот случай, ради которого написан модуль: `new Date('2026-08-29')`
    // — это полночь UTC, то есть 05:00 в Ташкенте, и прежнее сравнение
    // объявляло заказ просроченным с пяти утра дня его же срока.
    expect(isOverdueDate('2026-08-29', atTashkent('2026-08-29T04:59:00+05:00'))).toBe(false);
    expect(isOverdueDate('2026-08-29', atTashkent('2026-08-29T10:00:00+05:00'))).toBe(false);
    expect(isOverdueDate('2026-08-29', atTashkent('2026-08-29T23:59:00+05:00'))).toBe(false);
  });

  it('считает просроченным вчерашний срок', () => {
    expect(isOverdueDate('2026-08-28', atTashkent('2026-08-29T00:05:00+05:00'))).toBe(true);
  });

  it('не считает просроченным будущий срок', () => {
    expect(isOverdueDate('2026-09-01', atTashkent('2026-08-29T23:00:00+05:00'))).toBe(false);
  });

  it('пустой срок — не просрочка', () => {
    expect(isOverdueDate(null)).toBe(false);
  });

  it('переживает границу года', () => {
    expect(isOverdueDate('2025-12-31', atTashkent('2026-01-01T09:00:00+05:00'))).toBe(true);
    expect(isOverdueDate('2026-01-01', atTashkent('2026-01-01T09:00:00+05:00'))).toBe(false);
  });
});

describe('isDueToday', () => {
  it('узнаёт сегодняшний срок в любой час суток', () => {
    expect(isDueToday('2026-08-29', atTashkent('2026-08-29T00:30:00+05:00'))).toBe(true);
    expect(isDueToday('2026-08-29', atTashkent('2026-08-29T23:30:00+05:00'))).toBe(true);
  });

  it('отличает соседние дни', () => {
    expect(isDueToday('2026-08-28', atTashkent('2026-08-29T10:00:00+05:00'))).toBe(false);
    expect(isDueToday(null)).toBe(false);
  });
});

describe('todayIso', () => {
  it('отдаёт дату в формате YYYY-MM-DD', () => {
    expect(todayIso(atTashkent('2026-08-29T10:00:00+05:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatIsoDate', () => {
  it('переставляет части, а не разбирает строку как момент времени', () => {
    expect(formatIsoDate('2026-08-29')).toBe('29.08.2026');
    expect(formatIsoDateShort('2026-08-29')).toBe('29.08');
  });

  it('отдаёт прочерк на пустом и на мусоре', () => {
    expect(formatIsoDate(null)).toBe('—');
    expect(formatIsoDate('не дата')).toBe('—');
    expect(formatIsoDateShort(null)).toBe('—');
  });
});

describe('yesterdayIso', () => {
  it('отдаёт день перед сегодняшним', () => {
    expect(yesterdayIso(new Date('2026-08-29T10:00:00+05:00'))).toBe('2026-08-28');
  });

  it('переходит через границу месяца и года', () => {
    expect(yesterdayIso(new Date('2026-09-01T10:00:00+05:00'))).toBe('2026-08-31');
    expect(yesterdayIso(new Date('2026-01-01T10:00:00+05:00'))).toBe('2025-12-31');
  });
});

describe('workshopToday', () => {
  it('считает день по Ташкенту, а не по UTC', () => {
    // 22:30 UTC 19-го — это уже 03:30 20-го в мастерской.
    expect(workshopToday(new Date('2026-09-19T22:30:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 20,
    });
    expect(workshopToday(new Date('2026-09-19T18:00:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 19,
    });
  });
});

describe('formatTime / formatDateTime', () => {
  const at = new Date(2026, 8, 20, 14, 5);

  it('время двумя парами цифр', () => {
    expect(formatTime(at)).toBe('14:05');
  });

  it('дата с годом и без', () => {
    expect(formatDate(at)).toBe('20.09.2026');
    expect(formatDateTime(at)).toBe('20.09.2026, 14:05');
    expect(formatDateTime(at, false)).toBe('20.09, 14:05');
  });
});

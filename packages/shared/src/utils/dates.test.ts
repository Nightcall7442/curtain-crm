import { describe, expect, it } from 'vitest';

import {
  formatIsoDate,
  formatIsoDateShort,
  isDueToday,
  isOverdueDate,
  todayIso,
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

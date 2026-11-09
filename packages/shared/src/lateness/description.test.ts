import { describe, expect, it } from 'vitest';

import {
  isLateDisciplineKind,
  latenessDescription,
  latenessKind,
  localizeLatenessDescription,
  parseStoredLateness,
} from './description';

describe('latenessKind', () => {
  it('пороги — до 15, 15–30, больше 30 минут, границы включительно', () => {
    expect(latenessKind(1)).toBe('late_under_15');
    expect(latenessKind(15)).toBe('late_under_15');
    expect(latenessKind(16)).toBe('late_15_30');
    expect(latenessKind(30)).toBe('late_15_30');
    expect(latenessKind(31)).toBe('late_over_30');
  });
});

describe('пояснение системы', () => {
  const stored = latenessDescription('09:00', '11:52', 172);

  it('собирается и разбирается одним шаблоном', () => {
    expect(stored).toBe('Смена с 09:00, отметка в 11:52 — опоздание 172 мин');
    expect(parseStoredLateness(stored)).toEqual({ shiftStart: '09:00', checkIn: '11:52', minutes: 172 });
  });

  it('текст руководителя и пустое пояснение — не пояснение системы', () => {
    expect(parseStoredLateness('Опоздал, со слов бригадира')).toBeNull();
    expect(parseStoredLateness(null)).toBeNull();
  });

  it('невозможное время — не пояснение системы, как и в переносе фактов (0077)', () => {
    // Иначе запись считалась бы записью системы без факта, и первая же
    // сверка месяца её стёрла бы; миграция такое время не переносит.
    expect(parseStoredLateness('Смена с 24:00, отметка в 24:10 — опоздание 10 мин')).toBeNull();
    expect(parseStoredLateness('Смена с 09:00, отметка в 09:75 — опоздание 75 мин')).toBeNull();
    expect(parseStoredLateness('Смена с 9:00, отметка в 9:22 — опоздание 22 мин')).toEqual({
      shiftStart: '9:00',
      checkIn: '9:22',
      minutes: 22,
    });
  });

  it('на узбекском — переводится только пояснение системы', () => {
    expect(localizeLatenessDescription(stored, 'uz')).toBe('Smena boshlanishi 09:00, belgi 11:52 da — 172 daqiqa kechikish');
    expect(localizeLatenessDescription(stored, 'ru')).toBe(stored);
    expect(localizeLatenessDescription('Со слов бригадира', 'uz')).toBe('Со слов бригадира');
  });
});

describe('isLateDisciplineKind', () => {
  it('опоздания — да, остальное в дисциплине — нет', () => {
    expect(isLateDisciplineKind('late_15_30')).toBe(true);
    expect(isLateDisciplineKind('absence')).toBe(false);
  });
});

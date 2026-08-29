import { describe, expect, it } from 'vitest';

import { PLURAL_POINTS, plural, pluralize } from './plural';

describe('plural', () => {
  it.each([
    [1, 'балл'],
    [2, 'балла'],
    [3, 'балла'],
    [4, 'балла'],
    [5, 'баллов'],
    [10, 'баллов'],
    [21, 'балл'],
    [22, 'балла'],
    [25, 'баллов'],
    [100, 'баллов'],
    [101, 'балл'],
  ])('склоняет %i', (value, expected) => {
    expect(plural(value, PLURAL_POINTS)).toBe(expected);
  });

  it('одиннадцать — четырнадцать берут форму многих вопреки последней цифре', () => {
    // Ровно та ловушка, ради которой функция и нужна: по последней цифре
    // 11 просилось бы в «балл», а 12–14 — в «балла».
    for (const value of [11, 12, 13, 14, 111, 112]) {
      expect(plural(value, PLURAL_POINTS)).toBe('баллов');
    }
  });

  it('ноль — форма многих', () => {
    expect(plural(0, PLURAL_POINTS)).toBe('баллов');
  });

  it('не зависит от знака и дробной части', () => {
    expect(plural(-1, PLURAL_POINTS)).toBe('балл');
    expect(plural(2.7, PLURAL_POINTS)).toBe('балла');
  });
});

describe('pluralize', () => {
  it('склеивает число со словом', () => {
    expect(pluralize(1, PLURAL_POINTS)).toBe('1 балл');
    expect(pluralize(11, PLURAL_POINTS)).toBe('11 баллов');
  });
});

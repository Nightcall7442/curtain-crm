import { describe, expect, it } from 'vitest';

import { areaM2FromCm, parseDimensions } from './dimensions';

describe('parseDimensions', () => {
  it.each([
    ['150x200', 150, 200],
    ['150х200', 150, 200], // кириллическая «х»
    ['150×200', 150, 200],
    ['150*200', 150, 200],
    ['150 200', 150, 200],
    ['150-200', 150, 200],
    ['150 см х 200 см', 150, 200],
    ['150см200см', 150, 200],
  ])('разбирает «%s»', (input, width, height) => {
    const result = parseDimensions(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.widthCm).toBe(width);
    expect(result.value.heightCm).toBe(height);
  });

  it('понимает десятичную запятую и не разбивает по ней число', () => {
    const result = parseDimensions('1,5 x 2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.widthCm).toBe(1.5);
    expect(result.value.heightCm).toBe(2);
  });

  it('считает площадь в м² с округлением до 4 знаков', () => {
    const result = parseDimensions('150x200');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.areaM2).toBe(3);
    expect(result.value.normalized).toBe('150x200');
  });

  it('берёт первые два числа, игнорируя лишние', () => {
    const result = parseDimensions('150x200x3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.widthCm).toBe(150);
    expect(result.value.heightCm).toBe(200);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['150', 'not_enough_numbers'],
    ['ширина большая', 'not_enough_numbers'],
    ['0x200', 'out_of_range'],
    ['150x2001', 'out_of_range'],
  ])('отклоняет «%s» с кодом %s', (input, error) => {
    const result = parseDimensions(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(error);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('areaM2FromCm', () => {
  it('переводит сантиметры в квадратные метры', () => {
    expect(areaM2FromCm(100, 100)).toBe(1);
    expect(areaM2FromCm(150, 200)).toBe(3);
  });
});

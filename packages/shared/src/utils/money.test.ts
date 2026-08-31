import { describe, expect, it } from 'vitest';

import { formatMoneyShort, parseMoney } from './money';

/**
 * Компактный формат сумм — только он: остальная денежная арифметика
 * покрыта смоук-проверками на живой базе (генерируемые колонки) и
 * тестами расчёта зарплаты, которые ходят через те же функции.
 *
 * Пробелы в ожиданиях — НЕРАЗРЫВНЫЕ (U+00A0), как и в `formatMoney`:
 * сумма не должна рваться переносом строки. В тестах они записаны
 * escape-последовательностью — невидимый символ легко потерять при правке.
 */
describe('formatMoneyShort', () => {
  it('миллионы — с одним знаком после запятой', () => {
    expect(formatMoneyShort(parseMoney('13800000'))).toBe('13,8 млн сум');
  });

  it('круглые значения — без хвостового нуля', () => {
    expect(formatMoneyShort(parseMoney('14000000'))).toBe('14 млн сум');
  });

  it('десятки тысяч — в тысячах', () => {
    expect(formatMoneyShort(parseMoney('850000'))).toBe('850 тыс. сум');
  });

  it('мелкие суммы не сокращаются', () => {
    expect(formatMoneyShort(parseMoney('9500'))).toBe('9 500 сум');
  });

  it('миллиарды', () => {
    expect(formatMoneyShort(parseMoney('1250000000'))).toBe('1,3 млрд сум');
  });

  it('отрицательные суммы сохраняют знак', () => {
    expect(formatMoneyShort(parseMoney('-2500000'))).toBe('-2,5 млн сум');
  });

  it('узбекская локаль — свои единицы и валюта', () => {
    expect(formatMoneyShort(parseMoney('13800000'), { locale: 'uz' })).toBe(
      "13,8 mln so'm",
    );
  });
});

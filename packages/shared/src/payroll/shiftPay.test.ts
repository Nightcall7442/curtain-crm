import { describe, expect, it } from 'vitest';

import { parseMoney } from '../utils/money';
import {
  hourlyRateFromShift,
  scheduleMinutes,
  shiftPay,
  workedHoursOf,
} from './shiftPay';

const HOUR = 3600;

/**
 * Цифры — из таблицы заказчика (переписка 25.10): «100 000 за смену 9 ч»,
 * значит ставка 11 111,11 в час, и каждая смена — целыми сумами.
 */
describe('shiftPay', () => {
  const rate = parseMoney('11111.11');

  it('смены из примера заказчика', () => {
    expect(shiftPay(rate, 9 * HOUR)).toBe(parseMoney('100000'));
    expect(shiftPay(rate, 8.5 * HOUR)).toBe(parseMoney('94444'));
    expect(shiftPay(rate, 7 * HOUR)).toBe(parseMoney('77778'));
    expect(shiftPay(rate, 13 * HOUR)).toBe(parseMoney('144444'));
  });

  it('целая ставка за час не меняется', () => {
    expect(shiftPay(parseMoney('35000'), 7.33 * HOUR)).toBe(parseMoney('256550'));
  });

  it('платится от показанных часов: строку можно проверить калькулятором', () => {
    // 08:58:12–18:03:47 — 32 735 с, в таблице «9,09 ч»; 9,09 × 11 111,11 = 100 999,99 → 101 000.
    expect(workedHoursOf(32_735)).toBe(9.09);
    expect(shiftPay(rate, 32_735)).toBe(parseMoney('101000'));
  });

  it('округление одно, ровно на половине сума — вверх', () => {
    // 0,07 ч × 35 000 = 2 450; 0,01 ч × 150 = 1,5 → 2.
    expect(shiftPay(parseMoney('35000'), 261)).toBe(parseMoney('2450'));
    expect(shiftPay(parseMoney('150'), 36)).toBe(parseMoney('2'));
  });

  it('битые отрицательные секунды — ноль, а не минус', () => {
    expect(shiftPay(rate, -HOUR)).toBe(0);
  });
});

describe('scheduleMinutes', () => {
  it('длина смены по графику', () => {
    expect(scheduleMinutes('09:00', '18:00')).toBe(540);
    expect(scheduleMinutes('09:30', '18:00')).toBe(510);
  });

  it('смена через полночь', () => {
    expect(scheduleMinutes('22:00', '06:00')).toBe(480);
  });

  it('графика нет или он битый — null', () => {
    expect(scheduleMinutes('09:00', '09:00')).toBeNull();
    expect(scheduleMinutes(null, '18:00')).toBeNull();
    expect(scheduleMinutes('9:00', '18:00')).toBeNull();
    expect(scheduleMinutes('25:00', '18:00')).toBeNull();
  });
});

describe('hourlyRateFromShift', () => {
  it('100 000 за 9 ч — 11 111,11 в час', () => {
    expect(hourlyRateFromShift(parseMoney('100000'), 540)).toBe(parseMoney('11111.11'));
  });

  it('и смена по графику даёт ровно сумму за смену', () => {
    const rate = hourlyRateFromShift(parseMoney('100000'), 420);
    expect(shiftPay(rate, 7 * HOUR)).toBe(parseMoney('100000'));
  });
});

describe('workedHoursOf', () => {
  it('часы до сотых', () => {
    expect(workedHoursOf(30_600)).toBe(8.5);
    expect(workedHoursOf(26_400)).toBe(7.33);
    expect(workedHoursOf(0)).toBe(0);
  });
});

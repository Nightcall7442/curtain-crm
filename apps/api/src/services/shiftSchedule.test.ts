import { describe, expect, it } from 'vitest';

import { shiftStartInForce } from './shiftSchedule';

/**
 * График смены на день: какая схема оплаты действовала. Выборку схем по
 * дате (SQL) проверяет смоук; здесь — правило выбора среди них.
 */
describe('shiftStartInForce', () => {
  it('одна схема с графиком — её начало смены', () => {
    expect(shiftStartInForce([{ id: 33, role: 'sewer', shiftStart: '09:00' }])).toBe('09:00');
  });

  it('схему в роли заменили — действует заведённая последней из уже вступивших', () => {
    // 09:00 погашена и заменена 08:00; на день, когда обе уже вступили, — 08:00.
    const schemes = [
      { id: 10, role: 'sewer', shiftStart: '09:00' },
      { id: 12, role: 'sewer', shiftStart: '08:00' },
    ];
    expect(shiftStartInForce(schemes)).toBe('08:00');
    // Новая ещё не вступила (её нет на входе) — прежний график.
    expect(shiftStartInForce(schemes.slice(0, 1))).toBe('09:00');
  });

  it('схему на 15-е исправили схемой с 1-го — с 15-го действует исправление, а не погашенная', () => {
    // id 20 — с 15-го, 10:00; id 21 — исправление с 1-го, 08:30. На 20-е вступили обе.
    expect(
      shiftStartInForce([
        { id: 20, role: 'sewer', shiftStart: '10:00' },
        { id: 21, role: 'sewer', shiftStart: '08:30' },
      ]),
    ).toBe('08:30');
  });

  it('новая схема без графика отменяет график своей роли, а не воскрешает прежний', () => {
    expect(
      shiftStartInForce([
        { id: 10, role: 'sewer', shiftStart: '09:00' },
        { id: 12, role: 'sewer', shiftStart: null },
      ]),
    ).toBeNull();
  });

  it('роли — по отдельности: схема другой роли без графика график не отменяет', () => {
    expect(
      shiftStartInForce([
        { id: 10, role: 'sewer', shiftStart: '09:00' },
        { id: 12, role: 'master', shiftStart: null },
      ]),
    ).toBe('09:00');
  });

  it('схем нет — графика нет', () => {
    expect(shiftStartInForce([])).toBeNull();
  });
});

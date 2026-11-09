import { Role } from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import { shiftEndInForce, shiftStartInForce, type ScheduleSchemeRow } from './shiftSchedule';

/** Схема на входе правила: роль — из общего списка, конец смены — по умолчанию 18:00. */
const scheme = (
  id: number,
  role: Role,
  shiftStart: string | null,
  shiftEnd: string | null = shiftStart === null ? null : '18:00',
): ScheduleSchemeRow => ({ id, role, shiftStart, shiftEnd });

/**
 * График смены на день: какая схема оплаты действовала. Выборку схем по
 * дате (SQL) проверяет смоук; здесь — правило выбора среди них.
 */
describe('shiftStartInForce', () => {
  it('одна схема с графиком — её начало смены', () => {
    expect(shiftStartInForce([scheme(33, Role.SEWER, '09:00')])).toBe('09:00');
  });

  it('схему в роли заменили — действует заведённая последней из уже вступивших', () => {
    // 09:00 погашена и заменена 08:00; на день, когда обе уже вступили, — 08:00.
    const schemes = [scheme(10, Role.SEWER, '09:00'), scheme(12, Role.SEWER, '08:00')];
    expect(shiftStartInForce(schemes)).toBe('08:00');
    // Новая ещё не вступила (её нет на входе) — прежний график.
    expect(shiftStartInForce(schemes.slice(0, 1))).toBe('09:00');
  });

  it('схему на 15-е исправили схемой с 1-го — с 15-го действует исправление, а не погашенная', () => {
    // id 20 — с 15-го, 10:00; id 21 — исправление с 1-го, 08:30. На 20-е вступили обе.
    expect(shiftStartInForce([scheme(20, Role.SEWER, '10:00'), scheme(21, Role.SEWER, '08:30')])).toBe('08:30');
  });

  it('новая схема без графика отменяет график своей роли, а не воскрешает прежний', () => {
    expect(shiftStartInForce([scheme(10, Role.SEWER, '09:00'), scheme(12, Role.SEWER, null)])).toBeNull();
  });

  it('роли — по отдельности: схема другой роли без графика график не отменяет', () => {
    expect(shiftStartInForce([scheme(10, Role.SEWER, '09:00'), scheme(12, Role.MASTER, null)])).toBe('09:00');
  });

  it('схем нет — графика нет', () => {
    expect(shiftStartInForce([])).toBeNull();
  });
});

/**
 * Конец смены для закрытия забытой смены — тем же правилом, что и начало:
 * смена за прошлый день закрывается по графику того дня, а не по нынешнему.
 */
describe('shiftEndInForce', () => {
  it('одна схема с графиком — её конец смены', () => {
    expect(shiftEndInForce([scheme(33, Role.SEWER, '09:00', '18:00')])).toBe('18:00');
  });

  it('график сменили с более поздней даты — на день до неё действует прежний конец', () => {
    // На вход приходят только схемы, вступившие к дню: новая (17:00) ещё нет.
    const before = [scheme(10, Role.SEWER, '09:00', '18:00')];
    const after = [...before, scheme(12, Role.SEWER, '08:00', '17:00')];
    expect(shiftEndInForce(before)).toBe('18:00');
    expect(shiftEndInForce(after)).toBe('17:00');
  });

  it('схему на 15-е исправили схемой с 1-го — конец по исправлению, а не по погашенной', () => {
    expect(
      shiftEndInForce([scheme(20, Role.SEWER, '10:00', '19:00'), scheme(21, Role.SEWER, '08:30', '17:30')]),
    ).toBe('17:30');
  });

  it('новая схема без графика отменяет конец своей роли, а не воскрешает прежний', () => {
    expect(shiftEndInForce([scheme(10, Role.SEWER, '09:00', '18:00'), scheme(12, Role.SEWER, null)])).toBeNull();
  });

  it('роли — по отдельности: схема другой роли без графика конец не отменяет', () => {
    expect(shiftEndInForce([scheme(10, Role.SEWER, '09:00', '18:00'), scheme(12, Role.MASTER, null)])).toBe('18:00');
  });

  it('график сменили целиком — и начало, и конец берутся из новой схемы, а не вперемешку', () => {
    const schemes = [scheme(10, Role.SEWER, '09:00', '18:00'), scheme(12, Role.SEWER, '07:00', '15:00')];
    expect([shiftStartInForce(schemes), shiftEndInForce(schemes)]).toEqual(['07:00', '15:00']);
  });
});

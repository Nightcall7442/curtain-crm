import { describe, expect, it } from 'vitest';

import { notificationTone } from '../enums/notificationType.enum';
import { OrderStatus } from '../enums/orderStatus.enum';
import { Role } from '../enums/role.enum';
import { sortPeople } from './board';
import {
  formatInstallSlot,
  installSlotInputValue,
  installSlotState,
  parseInstallSlotInput,
} from './installSlot';
import {
  planPace,
  planPercent,
  resolveCombinedPlan,
  resolvePlan,
  workdaysInMonth,
  type WorkPlanRow,
} from './plan';

describe('resolvePlan', () => {
  const rows: WorkPlanRow[] = [
    { role: Role.SEWER, userId: null, effectiveFrom: '2026-09-01', target: 150 },
    { role: Role.SEWER, userId: null, effectiveFrom: '2026-10-01', target: 180 },
    { role: Role.SEWER, userId: 7, effectiveFrom: '2026-08-01', target: 200 },
    { role: Role.SEWER, userId: 7, effectiveFrom: '2026-10-01', target: null },
    { role: Role.SEWER, userId: 9, effectiveFrom: '2026-11-01', target: 220 },
  ];

  it('норма роли', () =>
    expect(resolvePlan(rows, 1, Role.SEWER, '2026-10')).toEqual({
      target: 180,
      source: 'role',
      effectiveFrom: '2026-10-01',
    }));
  it('личный план', () =>
    expect(resolvePlan(rows, 7, Role.SEWER, '2026-09')).toEqual({
      target: 200,
      source: 'personal',
      effectiveFrom: '2026-08-01',
    }));
  it('возврат к норме', () =>
    expect(resolvePlan(rows, 7, Role.SEWER, '2026-10')).toEqual({
      target: 180,
      source: 'role',
      effectiveFrom: '2026-10-01',
    }));
  it('будущий месяц не действует', () => expect(resolvePlan(rows, 9, Role.SEWER, '2026-10')?.target).toBe(180));
  it('плана нет', () => expect(resolvePlan(rows, 1, Role.INSTALLER, '2026-10')).toBeNull());
});

describe('план человека с двумя ролями', () => {
  const rows: WorkPlanRow[] = [
    { role: Role.INSTALLER, userId: null, effectiveFrom: '2026-09-01', target: 10 },
    { role: Role.CORNICE_INSTALLER, userId: null, effectiveFrom: '2026-09-01', target: 6 },
    { role: Role.CORNICE_INSTALLER, userId: 5, effectiveFrom: '2026-10-01', target: 8 },
  ];
  const roles = [Role.INSTALLER, Role.CORNICE_INSTALLER];

  it('сумма норм обеих ролей', () =>
    expect(resolveCombinedPlan(rows, 4, roles, '2026-10')).toEqual({
      target: 16,
      source: 'role',
      effectiveFrom: '2026-09-01',
    }));
  it('личный план одной роли — источник личный, дата — самая поздняя', () =>
    expect(resolveCombinedPlan(rows, 5, roles, '2026-10')).toEqual({
      target: 18,
      source: 'personal',
      effectiveFrom: '2026-10-01',
    }));
  it('без плана по ролям — null', () => expect(resolveCombinedPlan(rows, 4, roles, '2026-08')).toBeNull());
});

describe('темп плана', () => {
  it('рабочие дни без постоянного выходного', () =>
    // октябрь 2026: 31 день, воскресений 4 (4, 11, 18, 25); 15-е включительно
    expect(workdaysInMonth('2026-10', 7, '2026-10-15')).toEqual({ elapsed: 13, total: 27 }));
  it('месяц в прошлом и в будущем', () => {
    expect(workdaysInMonth('2026-09', null, '2026-10-15')).toEqual({ elapsed: 30, total: 30 });
    expect(workdaysInMonth('2026-11', null, '2026-10-15')).toEqual({ elapsed: 0, total: 30 });
  });
  it('темп', () => {
    expect(planPace({ done: 90, target: 180, elapsed: 13, total: 27 })).toBe('ahead'); // 50 % ≥ 48 %
    expect(planPace({ done: 70, target: 180, elapsed: 13, total: 27 })).toBe('on_track'); // 39 %, ниже на 9 п.п.
    expect(planPace({ done: 60, target: 180, elapsed: 13, total: 27 })).toBe('behind'); // 33 %
  });
  it('процент плана', () => expect(planPercent(96, 180)).toBe(53));
});

describe('слот установки', () => {
  const at = new Date('2026-10-15T05:30:00Z'); // 10:30 по Ташкенту
  const base = { status: OrderStatus.INSTALLATION_ASSIGNED, installationAt: at, tripInProgress: false };

  it('граница опоздания', () => {
    expect(installSlotState({ ...base, now: new Date('2026-10-15T06:00:00Z') })).toBe('upcoming');
    expect(installSlotState({ ...base, now: new Date('2026-10-15T06:01:00Z') })).toBe('late');
    expect(installSlotState({ ...base, tripInProgress: true, now: new Date('2026-10-15T07:00:00Z') })).toBe(
      'in_progress',
    );
    expect(
      installSlotState({ ...base, status: OrderStatus.INSTALLATION_DONE, now: new Date('2026-10-15T09:00:00Z') }),
    ).toBe('done');
  });
  it('время установки по Ташкенту', () => {
    expect(formatInstallSlot(at)).toEqual({ date: '15.10', time: '10:30' });
    expect(formatInstallSlot(new Date('2026-10-14T19:30:00Z'))).toEqual({ date: '15.10', time: '00:30' });
  });
});

describe('поле времени установки — по Ташкенту, а не по часам браузера', () => {
  it('значение поля из момента', () => {
    expect(installSlotInputValue(new Date('2026-10-15T05:30:00Z'))).toBe('2026-10-15T10:30');
    expect(installSlotInputValue(new Date('2026-10-14T19:30:00Z'))).toBe('2026-10-15T00:30');
  });
  it('момент из значения поля', () => {
    expect(parseInstallSlotInput('2026-10-15T10:30')?.toISOString()).toBe('2026-10-15T05:30:00.000Z');
    expect(parseInstallSlotInput('2026-10-15T00:30')?.toISOString()).toBe('2026-10-14T19:30:00.000Z');
  });
  it('пусто и мусор — null', () => {
    expect(parseInstallSlotInput('')).toBeNull();
    expect(parseInstallSlotInput('15.10 10:30')).toBeNull();
  });
});

describe('уведомление нового типа в старом приложении', () => {
  it('известный тип — свой тон', () => expect(notificationTone('order_qc_failed')).toBe('danger'));
  it('незнакомый тип — нейтральный тон, а не падение экрана', () =>
    expect(notificationTone('type_from_the_future')).toBe('info'));
});

describe('сортировка с планом и машинкой', () => {
  const people = [
    { fullName: 'А', place: 1, plan: { percent: 80 }, workstation: 3 },
    { fullName: 'Б', place: 2, plan: null, workstation: null },
    { fullName: 'В', place: 3, plan: { percent: 120 }, workstation: 1 },
  ];

  it('сортировка по плану', () => expect(sortPeople(people, 'plan').map((p) => p.fullName)).toEqual(['В', 'А', 'Б']));
  it('сортировка по машинке', () =>
    expect(sortPeople(people, 'workstation').map((p) => p.fullName)).toEqual(['В', 'А', 'Б']));
});

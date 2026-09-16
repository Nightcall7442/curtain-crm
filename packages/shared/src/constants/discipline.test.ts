import { describe, expect, it } from 'vitest';

import { DisciplineKind, DisciplineLevel } from '../enums/discipline.enum';

import { disciplineLevel, disciplinePoints, formatDisciplinePoints } from './discipline';

describe('disciplinePoints', () => {
  it('берёт балл из таблицы', () => {
    expect(disciplinePoints(DisciplineKind.LATE_UNDER_15, false)).toBe(-0.5);
    expect(disciplinePoints(DisciplineKind.PLAN_DONE, false)).toBe(3);
  });

  it('повтор нарушения — на балл строже, повтор поощрения — без изменений', () => {
    expect(disciplinePoints(DisciplineKind.LATE_15_30, true)).toBe(-2);
    expect(disciplinePoints(DisciplineKind.HELPED_TEAM, true)).toBe(1);
  });
});

describe('disciplineLevel', () => {
  it('ступени по презентации: 0–2, 3–4, 5–6, 7+', () => {
    expect(disciplineLevel(0)).toBe(DisciplineLevel.CONTROL);
    expect(disciplineLevel(-2.5)).toBe(DisciplineLevel.CONTROL);
    expect(disciplineLevel(-3)).toBe(DisciplineLevel.VERBAL);
    expect(disciplineLevel(-4.5)).toBe(DisciplineLevel.VERBAL);
    expect(disciplineLevel(-5)).toBe(DisciplineLevel.WRITTEN);
    expect(disciplineLevel(-7)).toBe(DisciplineLevel.MANAGEMENT);
    expect(disciplineLevel(-12)).toBe(DisciplineLevel.MANAGEMENT);
  });
});

describe('formatDisciplinePoints', () => {
  it('всегда со знаком', () => {
    expect(formatDisciplinePoints(-0.5)).toBe('−0,5');
    expect(formatDisciplinePoints(3)).toBe('+3');
    expect(formatDisciplinePoints(0)).toBe('0');
  });
});

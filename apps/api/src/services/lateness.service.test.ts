import { describe, expect, it } from 'vitest';

import {
  latenessDescription,
  latenessKind,
  recountRepeats,
  storedLateMinutes,
  type RepeatRow,
} from './lateness.service';

/**
 * Пересчёт опоздания после решения по запросу: ступени, разбор пояснения и
 * повторы месяца. SQL проверяет смоук; здесь — правила, на которых он стоит.
 */
describe('latenessKind', () => {
  it('пороги — до 15, 15–30, больше 30 минут, границы включительно', () => {
    expect(latenessKind(1)).toBe('late_under_15');
    expect(latenessKind(15)).toBe('late_under_15');
    expect(latenessKind(16)).toBe('late_15_30');
    expect(latenessKind(30)).toBe('late_15_30');
    expect(latenessKind(31)).toBe('late_over_30');
  });
});

describe('storedLateMinutes', () => {
  it('читает минуты из пояснения, которое собрала система', () => {
    expect(storedLateMinutes(latenessDescription('09:00', '10:25', 85))).toBe(85);
  });

  it('текст руководителя и пустое пояснение — не минуты', () => {
    expect(storedLateMinutes('опоздание со слов бригадира')).toBeNull();
    expect(storedLateMinutes(null)).toBeNull();
  });
});

describe('recountRepeats', () => {
  const USER = 243;
  const MANAGER = 20;
  const row = (patch: Partial<RepeatRow> & Pick<RepeatRow, 'id' | 'occurredOn'>): RepeatRow => ({
    userId: USER,
    kind: 'late_over_30',
    isRepeat: false,
    points: -2,
    recordedBy: USER,
    ...patch,
  });

  it('простили первое опоздание месяца — второе уже не повтор, балл обычный', () => {
    // 05.11 снято согласованием; 09.11 осталось с повтором и −3.
    const changes = recountRepeats([row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })]);
    expect(changes).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: true, points: -3 },
        to: { isRepeat: false, points: -2 },
      },
    ]);
  });

  it('первое вернулось — второе снова повтор', () => {
    const changes = recountRepeats([
      row({ id: 9, occurredOn: '2026-11-09' }),
      row({ id: 12, occurredOn: '2026-11-05' }),
    ]);
    expect(changes).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: false, points: -2 },
        to: { isRepeat: true, points: -3 },
      },
    ]);
  });

  it('ручная запись руководителя считается более ранним событием, но сама не меняется', () => {
    const changes = recountRepeats([
      row({ id: 3, occurredOn: '2026-11-03', recordedBy: MANAGER, isRepeat: true, points: -3 }),
      row({ id: 9, occurredOn: '2026-11-09' }),
    ]);
    expect(changes.map((change) => change.id)).toEqual([9]);
    expect(changes[0]?.to).toEqual({ isRepeat: true, points: -3 });
  });

  it('в один день порядок — по id; верные признаки и баллы не переписываются', () => {
    const changes = recountRepeats([
      row({ id: 7, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
      row({ id: 5, occurredOn: '2026-11-09' }),
    ]);
    expect(changes).toEqual([]);
  });
});

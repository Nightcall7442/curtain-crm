import { describe, expect, it } from 'vitest';

import {
  approvalWorsens,
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

describe('approvalWorsens', () => {
  it('смену передвинули после отметки: от «приду к» выходит больше минут и балл строже — хуже', () => {
    // Отметка 09:10 (−0,5), смена перенесена на 10:00, одобрение «приду к 09:20» — 40 мин, −2.
    expect(approvalWorsens({ minutes: 10, points: -0.5 }, { minutes: 40, points: -2 })).toBe(true);
  });

  it('больше минут в той же ступени — тоже хуже, хотя балл тот же', () => {
    expect(approvalWorsens({ minutes: 35, points: -2 }, { minutes: 50, points: -2 })).toBe(true);
  });

  it('меньше минут и не строже — смягчение, его делаем', () => {
    expect(approvalWorsens({ minutes: 100, points: -2 }, { minutes: 10, points: -0.5 })).toBe(false);
    // Ступенью ниже, но повтор в ней: −2 → −2 — не строже.
    expect(approvalWorsens({ minutes: 60, points: -2 }, { minutes: 20, points: -2 })).toBe(false);
  });

  it('меньше минут, но балл строже (повтор в новой ступени) — хуже', () => {
    expect(approvalWorsens({ minutes: 20, points: -1 }, { minutes: 10, points: -1.5 })).toBe(true);
  });

  it('минут в пояснении нет — судим только по баллу', () => {
    expect(approvalWorsens({ minutes: null, points: -1 }, { minutes: 90, points: -1 })).toBe(false);
    expect(approvalWorsens({ minutes: null, points: -1 }, { minutes: 90, points: -2 })).toBe(true);
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

  /*
    Одобрение никогда не утяжеляет другой день — это не следует само собой.
    Снятая запись или та же ступень с меньшими минутами только снимают
    повторы с более поздних дней. Но запись, ушедшая ступенью ниже, в новой
    ступени — более раннее событие: 05.11 было 20 мин (−1), одобрили — 10 мин
    (−0,5); 09.11 — 10 мин (−0,5) — по порядку месяца стало бы повтором,
    −1,5. Одобрение сэкономило 0,5, а стоило бы 1.
  */
  it('после одобрения запись ушла ступенью ниже: строгий пересчёт сделал бы повтором более поздний день', () => {
    const rows = [
      row({ id: 5, occurredOn: '2026-11-05', kind: 'late_under_15', points: -0.5 }),
      row({ id: 9, occurredOn: '2026-11-09', kind: 'late_under_15', points: -0.5 }),
    ];
    expect(recountRepeats(rows)).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: false, points: -0.5 },
        to: { isRepeat: true, points: -1.5 },
      },
    ]);
  });

  it('lower_only (после одобрения): строже не делает, смягчение проходит', () => {
    const stricter = [
      row({ id: 5, occurredOn: '2026-11-05', kind: 'late_under_15', points: -0.5 }),
      row({ id: 9, occurredOn: '2026-11-09', kind: 'late_under_15', points: -0.5 }),
    ];
    expect(recountRepeats(stricter, 'lower_only')).toEqual([]);

    // Первое опоздание сняли — со второго повтор снимается и при lower_only.
    const milder = [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })];
    expect(recountRepeats(milder, 'lower_only')).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: true, points: -3 },
        to: { isRepeat: false, points: -2 },
      },
    ]);
  });

  it('пропуск одной правки не сдвигает остальные: «раньше» — по наличию записей, а не по их признакам', () => {
    // 09.11 при lower_only не становится повтором, а 12.11 повтором остаётся (раньше него — две записи).
    const rows = [
      row({ id: 5, occurredOn: '2026-11-05', kind: 'late_under_15', points: -0.5 }),
      row({ id: 9, occurredOn: '2026-11-09', kind: 'late_under_15', points: -0.5 }),
      row({ id: 12, occurredOn: '2026-11-12', kind: 'late_under_15', isRepeat: true, points: -1.5 }),
    ];
    expect(recountRepeats(rows, 'lower_only')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  approvalWorsens,
  checkInStartFromFirstEdit,
  latenessDescription,
  latenessKind,
  recountRepeats,
  storedCheckInTime,
  storedLateMinutes,
  type RepeatPosition,
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

describe('storedCheckInTime', () => {
  it('время отметки — из пояснения системы, а не из начала смены', () => {
    expect(storedCheckInTime(latenessDescription('09:00', '09:05', 5))).toBe('09:05');
  });

  it('пересчёт переписывает начало и минуты, но время отметки в пояснении остаётся', () => {
    // Отметка 09:40; одобрили «приду к 09:30» — пояснение уже от 09:30, отметка та же.
    expect(storedCheckInTime(latenessDescription('09:30', '09:40', 10))).toBe('09:40');
  });

  it('текст руководителя и пустое пояснение — времени нет', () => {
    expect(storedCheckInTime('опоздание со слов бригадира')).toBeNull();
    expect(storedCheckInTime(null)).toBeNull();
  });
});

describe('checkInStartFromFirstEdit', () => {
  const USER = 243;
  // Так `shifts.adjustManually` пишет правку в журнал: Date в jsonb — строкой ISO.
  const edit = (before: unknown): Record<string, unknown> => ({
    created: false,
    reason: 'пришла позже, чем отметилась',
    before,
    after: { startedAt: '2026-11-08T05:30:00.000Z', endedAt: '2026-11-08T13:00:00.000Z', userId: USER },
  });

  it('начало до первой правки — время отметки, даже если правка перенесла начало', () => {
    const details = edit({ startedAt: '2026-11-08T04:05:00.000Z', endedAt: null, userId: USER });
    expect(checkInStartFromFirstEdit(details, USER)?.toISOString()).toBe('2026-11-08T04:05:00.000Z');
  });

  it('смена, переданная правкой от другого сотрудника, — не его отметка', () => {
    const details = edit({ startedAt: '2026-11-08T04:05:00.000Z', endedAt: null, userId: USER + 1 });
    expect(checkInStartFromFirstEdit(details, USER)).toBeNull();
  });

  it('без `before` (смену завёл руководитель, автозакрытие) или в чужом формате — не восстановить', () => {
    expect(checkInStartFromFirstEdit(edit(null), USER)).toBeNull();
    expect(checkInStartFromFirstEdit({ auto: true, endedAt: '2026-11-08T13:00:00.000Z' }, USER)).toBeNull();
    expect(checkInStartFromFirstEdit(edit({ startedAt: 'вчера утром', userId: USER }), USER)).toBeNull();
    expect(checkInStartFromFirstEdit(null, USER)).toBeNull();
  });
});

describe('approvalWorsens', () => {
  it('график сдвинули после отметки: от «приду к» выходит больше минут и балл строже — хуже', () => {
    // Отметка 09:10 при смене с 09:00 (−0,5), смену переназначили с 08:00, одобрение «приду к 08:30» — 40 мин, −2.
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
  /** Строгий обход после места правки — так пересчитывают снятие согласования и ручная правка. */
  const strictAfter = (after: RepeatPosition) => ({ after, policy: 'any' as const });
  /** Бережный обход после места правки — так пересчитывает одобрение. */
  const lowerOnlyAfter = (after: RepeatPosition) => ({ after, policy: 'lower_only' as const });

  it('простили первое опоздание месяца — второе уже не повтор, балл обычный', () => {
    // 05.11 (id 5) снято согласованием; 09.11 осталось с повтором и −3.
    const changes = recountRepeats(
      [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })],
      strictAfter({ occurredOn: '2026-11-05', id: 5 }),
    );
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
    const changes = recountRepeats(
      [row({ id: 9, occurredOn: '2026-11-09' }), row({ id: 12, occurredOn: '2026-11-05' })],
      strictAfter({ occurredOn: '2026-11-05', id: 12 }),
    );
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
    const changes = recountRepeats(
      [
        row({ id: 3, occurredOn: '2026-11-03', recordedBy: MANAGER, isRepeat: true, points: -3 }),
        row({ id: 9, occurredOn: '2026-11-09' }),
      ],
      strictAfter({ occurredOn: '2026-11-01', id: 0 }),
    );
    expect(changes.map((change) => change.id)).toEqual([9]);
    expect(changes[0]?.to).toEqual({ isRepeat: true, points: -3 });
  });

  it('в один день порядок — по id; верные признаки и баллы не переписываются', () => {
    const changes = recountRepeats(
      [row({ id: 7, occurredOn: '2026-11-09', isRepeat: true, points: -3 }), row({ id: 5, occurredOn: '2026-11-09' })],
      strictAfter({ occurredOn: '2026-11-01', id: 0 }),
    );
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
    expect(recountRepeats(rows, strictAfter({ occurredOn: '2026-11-05', id: 5 }))).toEqual([
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
    expect(recountRepeats(stricter, lowerOnlyAfter({ occurredOn: '2026-11-05', id: 5 }))).toEqual([]);

    // Первое опоздание сняли — со второго повтор снимается и при lower_only.
    const milder = [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })];
    expect(recountRepeats(milder, lowerOnlyAfter({ occurredOn: '2026-11-05', id: 5 }))).toEqual([
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
    expect(recountRepeats(rows, lowerOnlyAfter({ occurredOn: '2026-11-05', id: 5 }))).toEqual([]);
  });

  /*
    Пример проверки: одобрение увело 03-е ступенью ниже и оставило 06-е не
    повтором (lower_only). Руководитель потом записал руками опоздание до
    15 мин за 08-е. Обход всего месяца строго сделал бы 06-е повтором — от
    имени руководителя, с причиной «ручная правка» и днём 08-е, хотя запись
    за 08-е на 06-е повлиять не может. Меняется только то, что после 08-го.
  */
  it('правка меняет только записи после своего места; более ранние не трогает, но считает бывшими раньше', () => {
    const rows = [
      row({ id: 3, occurredOn: '2026-11-03', kind: 'late_under_15', points: -0.5 }),
      row({ id: 6, occurredOn: '2026-11-06', kind: 'late_under_15', points: -0.5 }),
      row({ id: 20, occurredOn: '2026-11-08', kind: 'late_under_15', recordedBy: MANAGER, isRepeat: true, points: -1.5 }),
      row({ id: 10, occurredOn: '2026-11-10', kind: 'late_under_15', points: -0.5 }),
    ];
    expect(recountRepeats(rows, strictAfter({ occurredOn: '2026-11-08', id: 20 }))).toEqual([
      {
        id: 10,
        occurredOn: '2026-11-10',
        from: { isRepeat: false, points: -0.5 },
        to: { isRepeat: true, points: -1.5 },
      },
    ]);
  });

  it('убрали запись — место убранной: раньше неё ничего не меняется, позже — пересчитано', () => {
    // Убрана ручная запись за 05.11 (id 30). 04.11 не трогаем, хотя строгий обход снял бы с неё повтор.
    const rows = [
      row({ id: 4, occurredOn: '2026-11-04', isRepeat: true, points: -3 }),
      row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
    ];
    expect(recountRepeats(rows, strictAfter({ occurredOn: '2026-11-05', id: 30 }))).toEqual([]);
  });

  it('в один день «после» — по id: меньший id раньше места правки, больший — после', () => {
    const rows = [
      row({ id: 5, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
      row({ id: 8, occurredOn: '2026-11-09' }),
    ];
    // Место правки — id 7 того же дня: id 5 до него и остаётся как есть, id 8 после — повтор.
    expect(recountRepeats(rows, strictAfter({ occurredOn: '2026-11-09', id: 7 }))).toEqual([
      {
        id: 8,
        occurredOn: '2026-11-09',
        from: { isRepeat: false, points: -2 },
        to: { isRepeat: true, points: -3 },
      },
    ]);
  });
});

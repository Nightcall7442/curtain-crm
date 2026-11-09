import { describe, expect, it } from 'vitest';

import {
  approvalWorsens,
  comparePosition,
  latenessDescription,
  latenessKind,
  recountRepeats,
  storedCheckInTime,
  storedLateMinutes,
  withdrawalRaises,
  type RepeatEdit,
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

describe('approvalWorsens', () => {
  it('график дня сменили после отметки: от «приду к» выходит больше минут и балл строже — хуже', () => {
    // Отметка 09:10 при смене с 09:00 (−0,5), график дня переназначили на 08:00, «приду к 08:30» — 40 мин, −2.
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

/**
 * Снятие согласования, когда отметку оценивали уже от «приду к»: запись
 * может только потяжелеть — снятие убирает уступку, а не снижает штраф.
 */
describe('withdrawalRaises', () => {
  it('от графика больше минут и балл строже — тяжелее, поднимаем', () => {
    // «Приду к 10:00», отметка 10:20 (20 мин, −1); от графика 09:00 — 80 мин, −2.
    expect(withdrawalRaises({ minutes: 20, points: -1 }, { minutes: 80, points: -2 })).toBe(true);
  });

  it('та же ступень и балл, но минут больше — тяжелее: пояснение должно назвать настоящие минуты', () => {
    expect(withdrawalRaises({ minutes: 35, points: -2 }, { minutes: 95, points: -2 })).toBe(true);
  });

  it('больше минут, но балл мягче (запись была повтором в прежней ступени) — не поднимаем', () => {
    expect(withdrawalRaises({ minutes: 10, points: -1.5 }, { minutes: 20, points: -1 })).toBe(false);
  });

  it('столько же или меньше минут при том же балле — не трогаем', () => {
    expect(withdrawalRaises({ minutes: 20, points: -1 }, { minutes: 20, points: -1 })).toBe(false);
    // График дня задним числом сдвинули позже — от него выходит меньше: снятие штраф не снижает.
    expect(withdrawalRaises({ minutes: 20, points: -1 }, { minutes: 5, points: -0.5 })).toBe(false);
  });

  it('минут в пояснении нет — судим только по баллу', () => {
    expect(withdrawalRaises({ minutes: null, points: -1 }, { minutes: 90, points: -1 })).toBe(false);
    expect(withdrawalRaises({ minutes: null, points: -1 }, { minutes: 90, points: -2 })).toBe(true);
  });
});

describe('comparePosition', () => {
  it('сначала день, в один день — id', () => {
    const ordered = [
      { occurredOn: '2026-11-09', id: 3 },
      { occurredOn: '2026-11-05', id: 40 },
      { occurredOn: '2026-11-09', id: 1 },
    ].sort(comparePosition);
    expect(ordered).toEqual([
      { occurredOn: '2026-11-05', id: 40 },
      { occurredOn: '2026-11-09', id: 1 },
      { occurredOn: '2026-11-09', id: 3 },
    ]);
    expect(comparePosition({ occurredOn: '2026-11-09', id: 7 }, { occurredOn: '2026-11-09', id: 7 })).toBe(0);
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
  /** Запись добавили (вид `to`). */
  const added = (occurredOn: string, id: number, to: RepeatRow['kind'] = 'late_over_30'): RepeatEdit => ({
    occurredOn,
    id,
    from: null,
    to,
  });
  /** Запись убрали (была вида `from`). */
  const removed = (occurredOn: string, id: number, from: RepeatRow['kind'] = 'late_over_30'): RepeatEdit => ({
    occurredOn,
    id,
    from,
    to: null,
  });
  /** Строгий пересчёт — так пересчитывают снятие согласования и ручная правка. */
  const strict = (...edits: RepeatEdit[]) => ({ edits, policy: 'any' as const });
  /** Бережный пересчёт — так пересчитывает одобрение. */
  const lowerOnly = (...edits: RepeatEdit[]) => ({ edits, policy: 'lower_only' as const });

  it('простили первое опоздание месяца — второе уже не повтор, балл обычный', () => {
    // 05.11 (id 5) снято согласованием; 09.11 осталось с повтором и −3.
    const changes = recountRepeats(
      [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })],
      strict(removed('2026-11-05', 5)),
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

  it('первое вернулось (новая запись, id больше) — второе снова повтор: порядок по дню, а не по id', () => {
    const changes = recountRepeats(
      [row({ id: 9, occurredOn: '2026-11-09' }), row({ id: 12, occurredOn: '2026-11-05' })],
      strict(added('2026-11-05', 12)),
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
    // Убрали системное 05.11 — но раньше 09.11 остаётся ручное 03.11: 09.11 по-прежнему повтор.
    expect(
      recountRepeats(
        [
          row({ id: 3, occurredOn: '2026-11-03', recordedBy: MANAGER, isRepeat: true, points: -3 }),
          row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
        ],
        strict(removed('2026-11-05', 5)),
      ),
    ).toEqual([]);
    // Добавили 05.11 — ручная 07.11 «стала повтором», но её балл — решение руководителя.
    expect(
      recountRepeats(
        [row({ id: 12, occurredOn: '2026-11-05' }), row({ id: 7, occurredOn: '2026-11-07', recordedBy: MANAGER })],
        strict(added('2026-11-05', 12)),
      ),
    ).toEqual([]);
  });

  it('правленую запись пересчёт не трогает: её посчитал тот, кто правил', () => {
    // 09.11 поправили на месте (было 15–30, стало больше 30) и записали без повтора — это решение правки.
    expect(
      recountRepeats(
        [row({ id: 5, occurredOn: '2026-11-05' }), row({ id: 9, occurredOn: '2026-11-09' })],
        strict({ occurredOn: '2026-11-09', id: 9, from: 'late_15_30', to: 'late_over_30' }),
      ),
    ).toEqual([]);
  });

  /*
    Одобрение никогда не утяжеляет другой день — это не следует само собой.
    Снятая запись или та же ступень с меньшими минутами только снимают
    повторы с более поздних дней. Но запись, ушедшая ступенью ниже, в новой
    ступени — более раннее событие: 05.11 было 20 мин (−1), одобрили — 10 мин
    (−0,5); 09.11 — 10 мин (−0,5) — по порядку месяца стало бы повтором,
    −1,5. Одобрение сэкономило 0,5, а стоило бы 1.
  */
  const stepDown: RepeatEdit = { occurredOn: '2026-11-05', id: 5, from: 'late_15_30', to: 'late_under_15' };

  it('запись ушла ступенью ниже — для позднего дня той ступени она первая такая: строгий пересчёт даёт повтор', () => {
    const rows = [
      row({ id: 5, occurredOn: '2026-11-05', kind: 'late_under_15', points: -0.5 }),
      row({ id: 9, occurredOn: '2026-11-09', kind: 'late_under_15', points: -0.5 }),
    ];
    expect(recountRepeats(rows, strict(stepDown))).toEqual([
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
    expect(recountRepeats(stricter, lowerOnly(stepDown))).toEqual([]);

    // Первое опоздание сняли — со второго повтор снимается и при lower_only.
    const milder = [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })];
    expect(recountRepeats(milder, lowerOnly(removed('2026-11-05', 5)))).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: true, points: -3 },
        to: { isRepeat: false, points: -2 },
      },
    ]);
  });

  it('пропуск одной правки не сдвигает остальные: «раньше» — по наличию записей, а не по их признакам', () => {
    // 09.11 при lower_only не становится повтором, а 12.11 повтором остаётся (раньше него — 09.11).
    const rows = [
      row({ id: 5, occurredOn: '2026-11-05', kind: 'late_under_15', points: -0.5 }),
      row({ id: 9, occurredOn: '2026-11-09', kind: 'late_under_15', points: -0.5 }),
      row({ id: 12, occurredOn: '2026-11-12', kind: 'late_under_15', isRepeat: true, points: -1.5 }),
    ];
    expect(recountRepeats(rows, lowerOnly(stepDown))).toEqual([]);
  });

  /*
    Пример проверки (E4): 02-го 40 мин (−2), 03-го 25 мин (−1), 06-го
    10 мин (−0,5). Одобрение 03-го «до 09:20» увело его в «до 15 мин», 06-е
    бережно осталось не повтором; одобрение 02-го «до 09:35» — тоже в «до
    15 мин». Снятие согласования 02-го вернуло его в «больше 30». Строгий
    обход после 02-го делал 06-е повтором (−1,5), хотя «до 15 мин» раньше
    06-го было и до снятия, и после (03-е): снятие на 06-е не влияло.
  */
  it('E4: снятие согласования 02-го не поднимает 06-е — «до 15 мин» раньше него было и до, и после снятия', () => {
    const rows = [
      row({ id: 2, occurredOn: '2026-10-02', kind: 'late_over_30', points: -2 }),
      row({ id: 3, occurredOn: '2026-10-03', kind: 'late_under_15', points: -0.5 }),
      row({ id: 6, occurredOn: '2026-10-06', kind: 'late_under_15', points: -0.5 }),
    ];
    const withdrawn: RepeatEdit = { occurredOn: '2026-10-02', id: 2, from: 'late_under_15', to: 'late_over_30' };
    expect(recountRepeats(rows, strict(withdrawn))).toEqual([]);
  });

  it('добавленная запись меняет только тех, для кого она стала первой такой раньше', () => {
    // Ручное «до 15 мин» за 08-е: для 10-го раньше уже было 03-е — 10-е (бережно не повтор) не трогаем.
    const manualOn8th = row({
      id: 20,
      occurredOn: '2026-11-08',
      kind: 'late_under_15',
      recordedBy: MANAGER,
      isRepeat: true,
      points: -1.5,
    });
    const on10th = row({ id: 10, occurredOn: '2026-11-10', kind: 'late_under_15', points: -0.5 });
    const rows = [
      row({ id: 3, occurredOn: '2026-11-03', kind: 'late_under_15', points: -0.5 }),
      row({ id: 6, occurredOn: '2026-11-06', kind: 'late_under_15', points: -0.5 }),
      manualOn8th,
      on10th,
    ];
    expect(recountRepeats(rows, strict(added('2026-11-08', 20, 'late_under_15')))).toEqual([]);
    // Раньше 10-го ничего такого не было — ручная запись за 08-е делает его повтором.
    expect(recountRepeats([manualOn8th, on10th], strict(added('2026-11-08', 20, 'late_under_15')))).toEqual([
      {
        id: 10,
        occurredOn: '2026-11-10',
        from: { isRepeat: false, points: -0.5 },
        to: { isRepeat: true, points: -1.5 },
      },
    ]);
  });

  it('убрали запись — раньше её места ничего не меняется, даже неверное', () => {
    // Убрана ручная запись за 05.11 (id 30). 04.11 не трогаем, хотя строгий обход снял бы с неё повтор.
    const rows = [
      row({ id: 4, occurredOn: '2026-11-04', isRepeat: true, points: -3 }),
      row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
    ];
    expect(recountRepeats(rows, strict(removed('2026-11-05', 30)))).toEqual([]);
  });

  it('в один день порядок — по id: меньший id раньше места правки, больший — после', () => {
    // Добавили id 7 за 09.11: id 8 того же дня — после него и становится повтором.
    expect(
      recountRepeats(
        [row({ id: 7, occurredOn: '2026-11-09' }), row({ id: 8, occurredOn: '2026-11-09' })],
        strict(added('2026-11-09', 7)),
      ),
    ).toEqual([
      {
        id: 8,
        occurredOn: '2026-11-09',
        from: { isRepeat: false, points: -2 },
        to: { isRepeat: true, points: -3 },
      },
    ]);
    // А с id 5 того же дня раньше места правки id 8 уже был повтором — правка его не трогает.
    expect(
      recountRepeats(
        [
          row({ id: 5, occurredOn: '2026-11-09' }),
          row({ id: 7, occurredOn: '2026-11-09' }),
          row({ id: 8, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
        ],
        strict(added('2026-11-09', 7)),
      ),
    ).toEqual([]);
  });

  it('несколько правок одного дня (снятые дубли) считаются вместе', () => {
    // За 05.11 сняли и запись, и её дубль; 09.11 больше не повтор.
    expect(
      recountRepeats(
        [row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 })],
        strict(removed('2026-11-05', 5), removed('2026-11-05', 6)),
      ),
    ).toEqual([
      {
        id: 9,
        occurredOn: '2026-11-09',
        from: { isRepeat: true, points: -3 },
        to: { isRepeat: false, points: -2 },
      },
    ]);
    // Сняли только дубль — 05.11 осталось раньше 09.11, повтор на месте.
    expect(
      recountRepeats(
        [
          row({ id: 5, occurredOn: '2026-11-05' }),
          row({ id: 9, occurredOn: '2026-11-09', isRepeat: true, points: -3 }),
        ],
        strict(removed('2026-11-05', 6)),
      ),
    ).toEqual([]);
  });
});

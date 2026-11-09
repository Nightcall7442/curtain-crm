import {
  disciplinePoints,
  isDisciplineViolation,
  LATE_DISCIPLINE_KINDS,
  type LateDisciplineKind,
} from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import {
  approvalWorsens,
  comparePosition,
  latenessDescription,
  latenessKind,
  recountHeldRepeats,
  recountRepeats,
  storedCheckInTime,
  storedLateMinutes,
  withdrawalRaises,
  type RepeatEdit,
  type RepeatEntry,
  type RepeatRow,
  type RepeatRecountPolicy,
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

/*
  Запись в снимке одобрения, которое в силе: снятие согласования вернёт её
  как есть, поэтому её повтор месяц пересчитывает так же, как пересчитал бы
  живую запись на этом месте. Три случая проверки — ровно здесь.
*/
describe('recountHeldRepeats', () => {
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
  const held = (patch: Partial<RepeatEntry> & Pick<RepeatEntry, 'id' | 'occurredOn'>): RepeatEntry => ({
    kind: 'late_over_30',
    isRepeat: false,
    points: -2,
    ...patch,
  });

  it('(1) 02-е вернулось в «больше 30», пока 06-е снято одобрением, — 06-е в снимке снова повтор −3', () => {
    // Одобрение 02-го увело его в «до 15 мин» и бережно сняло повтор с 06-го; потом одобрили 06-е.
    const changes = recountHeldRepeats(
      [row({ id: 2, occurredOn: '2026-10-02' })],
      [held({ id: 6, occurredOn: '2026-10-06' })],
      { edits: [{ occurredOn: '2026-10-02', id: 2, from: 'late_under_15', to: 'late_over_30' }], policy: 'any' },
    );
    expect(changes).toEqual([
      { id: 6, occurredOn: '2026-10-06', from: { isRepeat: false, points: -2 }, to: { isRepeat: true, points: -3 } },
    ]);
  });

  it('(2) руководитель записал «больше 30» за 03-е, пока 06-е снято одобрением, — 06-е в снимке повтор', () => {
    const changes = recountHeldRepeats(
      [row({ id: 30, occurredOn: '2026-10-03', recordedBy: MANAGER })],
      [held({ id: 6, occurredOn: '2026-10-06' })],
      { edits: [{ occurredOn: '2026-10-03', id: 30, from: null, to: 'late_over_30' }], policy: 'any' },
    );
    expect(changes).toEqual([
      { id: 6, occurredOn: '2026-10-06', from: { isRepeat: false, points: -2 }, to: { isRepeat: true, points: -3 } },
    ]);
  });

  it('(3) 02-е простили руками или сняли его одобрением — 06-е в снимке больше не повтор', () => {
    const was = held({ id: 6, occurredOn: '2026-10-06', isRepeat: true, points: -3 });
    const forgiven: RepeatEdit = { occurredOn: '2026-10-02', id: 2, from: 'late_over_30', to: null };
    const milder = { id: 6, occurredOn: '2026-10-06', from: { isRepeat: true, points: -3 }, to: { isRepeat: false, points: -2 } };
    expect(recountHeldRepeats([], [was], { edits: [forgiven], policy: 'any' })).toEqual([milder]);
    // Одобрение 02-го — `lower_only`: смягчение проходит и в снимке.
    expect(recountHeldRepeats([], [was], { edits: [forgiven], policy: 'lower_only' })).toEqual([milder]);
  });

  it('одобрение другого дня снимок не утяжеляет — как не утяжелило бы и живую запись', () => {
    // 06-е «до 15 мин» снято одобрением; одобрение 02-го увело его из «15–30» в «до 15 мин».
    const edits: RepeatEdit[] = [{ occurredOn: '2026-10-02', id: 2, from: 'late_15_30', to: 'late_under_15' }];
    const rows = [row({ id: 2, occurredOn: '2026-10-02', kind: 'late_under_15', points: -0.5 })];
    const entry = held({ id: 6, occurredOn: '2026-10-06', kind: 'late_under_15', points: -0.5 });
    expect(recountHeldRepeats(rows, [entry], { edits, policy: 'lower_only' })).toEqual([]);
  });

  it('правка самой записи снимок не пересчитывает, а снимки друг для друга — не более ранние события', () => {
    // Одобрение 06-го — правка его же записи; снимок только что записан из неё.
    expect(
      recountHeldRepeats([], [held({ id: 6, occurredOn: '2026-10-06', isRepeat: true, points: -3 })], {
        edits: [{ occurredOn: '2026-10-06', id: 6, from: 'late_over_30', to: null }],
        policy: 'lower_only',
      }),
    ).toEqual([]);
    // 03-е и 06-е сняты одобрениями; руками добавили 08-е. 03-е в снимке для 06-го не считается.
    expect(
      recountHeldRepeats(
        [row({ id: 40, occurredOn: '2026-10-08', recordedBy: MANAGER })],
        [held({ id: 3, occurredOn: '2026-10-03' }), held({ id: 6, occurredOn: '2026-10-06' })],
        { edits: [{ occurredOn: '2026-10-08', id: 40, from: null, to: 'late_over_30' }], policy: 'any' },
      ),
    ).toEqual([]);
  });
});

/*
  Свойство, ради которого живёт снимок: снятие согласования возвращает
  запись дня такой, какой она была бы без этого одобрения. Проверяется
  моделью месяца на тех же чистых правилах, что и сервер: одобрение
  (смягчить или снять, снимок, повторы `lower_only`), снятие (вернуть
  снимок, повторы `any`), ручная запись и прощение (повторы `any`). Мир A
  проходит всю последовательность; мир B — ту же без одобрения и снятия
  дня X. Сразу после снятия X его запись в A должна совпасть с записью в B
  видом, повтором и баллом. Случайные последовательности — с
  воспроизводимым зерном.
*/
describe('снятие согласования — день, каким он был бы без одобрения', () => {
  const USER = 243;
  const MANAGER = 20;
  const DAYS = 8;
  const SEVERITY: Readonly<Record<LateDisciplineKind, number>> = { late_under_15: 0, late_15_30: 1, late_over_30: 2 };
  const dayOf = (n: number): string => `2026-10-${n.toString().padStart(2, '0')}`;

  /** Детерминированный генератор (mulberry32): упавший случай воспроизводится по зерну. */
  const randomFrom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  };
  const pick = <T,>(random: () => number, items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error('пустой выбор');
    return item;
  };

  type Op =
    | { readonly type: 'approve'; readonly day: string; readonly target: LateDisciplineKind | null }
    | { readonly type: 'withdraw'; readonly day: string }
    | { readonly type: 'record'; readonly day: string; readonly kind: LateDisciplineKind }
    | { readonly type: 'forgive'; readonly day: string };

  interface Held {
    readonly change: 'adjusted' | 'removed';
    entry: RepeatEntry;
  }

  interface World {
    rows: RepeatRow[];
    nextId: number;
    readonly held: Map<string, Held>;
    /** Пересчитывать ли повторы в снимках — `false` воспроизводит ошибку проверки. */
    readonly liveSnapshots: boolean;
  }

  const systemRowOn = (world: World, day: string): RepeatRow | undefined =>
    world.rows.find((row) => row.occurredOn === day && row.recordedBy === USER);

  /** `hasEarlierSameKind`: с местом — раньше него; без места — все записи по этот день включительно. */
  const hasEarlier = (world: World, kind: LateDisciplineKind, day: string, beforeId?: number): boolean =>
    world.rows.some(
      (row) =>
        row.kind === kind &&
        (beforeId === undefined ? row.occurredOn <= day : comparePosition(row, { occurredOn: day, id: beforeId }) < 0),
    );

  /** `recountMonthRepeats`: записи месяца и снимки — по видам, которые правка добавила или убрала. */
  const recount = (world: World, edits: readonly RepeatEdit[], policy: RepeatRecountPolicy): void => {
    const kinds = new Set(edits.flatMap((edit) => [edit.from, edit.to]).filter((kind) => kind !== null));
    for (const kind of kinds) {
      const rows = world.rows.filter((row) => row.kind === kind);
      for (const change of recountRepeats(rows, { edits, policy })) {
        world.rows = world.rows.map((row) => (row.id === change.id ? { ...row, ...change.to } : row));
      }
      if (!world.liveSnapshots) continue;
      const heldOfKind = [...world.held.values()].filter((held) => held.entry.kind === kind);
      for (const change of recountHeldRepeats(rows, heldOfKind.map((held) => held.entry), { edits, policy })) {
        const held = heldOfKind.find((candidate) => candidate.entry.id === change.id);
        if (held !== undefined) held.entry = { ...held.entry, ...change.to };
      }
    }
  };

  const apply = (world: World, op: Op): void => {
    switch (op.type) {
      case 'approve': {
        // `applyApproval`: смягчить или снять запись системы; хуже — не трогать (`approvalWorsens`).
        const kept = systemRowOn(world, op.day);
        if (kept === undefined) return;
        let to: Pick<RepeatEntry, 'kind' | 'isRepeat' | 'points'> | null = null;
        if (op.target !== null) {
          const isRepeat = isDisciplineViolation(op.target) && hasEarlier(world, op.target, op.day, kept.id);
          const points = disciplinePoints(op.target, isRepeat);
          // Минут при одобрении всегда меньше; хуже — только балл.
          if (points < kept.points) return;
          to = { kind: op.target, isRepeat, points };
        }
        world.held.set(op.day, { change: to === null ? 'removed' : 'adjusted', entry: { ...kept } });
        world.rows =
          to === null
            ? world.rows.filter((row) => row.id !== kept.id)
            : world.rows.map((row) => (row.id === kept.id ? { ...row, ...to } : row));
        recount(world, [{ occurredOn: op.day, id: kept.id, from: kept.kind, to: to?.kind ?? null }], 'lower_only');
        return;
      }
      case 'withdraw': {
        // `applyWithdrawal`: снимок гаснет вместе с одобрением, запись возвращается из него.
        const held = world.held.get(op.day);
        world.held.delete(op.day);
        if (held === undefined) return;
        const { entry } = held;
        if (held.change === 'adjusted') {
          const current = world.rows.find((row) => row.id === entry.id);
          if (current === undefined) return;
          world.rows = world.rows.map((row) =>
            row.id === entry.id ? { ...row, kind: entry.kind, isRepeat: entry.isRepeat, points: entry.points } : row,
          );
          recount(world, [{ occurredOn: op.day, id: entry.id, from: current.kind, to: entry.kind }], 'any');
          return;
        }
        if (world.rows.some((row) => row.occurredOn === op.day)) return;
        const id = world.nextId++;
        world.rows = [...world.rows, { ...entry, id, userId: USER, recordedBy: USER }];
        recount(world, [{ occurredOn: op.day, id, from: null, to: entry.kind }], 'any');
        return;
      }
      case 'record': {
        // `discipline.record`: повтор — по всем записям по этот день включительно.
        const isRepeat = isDisciplineViolation(op.kind) && hasEarlier(world, op.kind, op.day);
        const id = world.nextId++;
        world.rows = [
          ...world.rows,
          { id, userId: USER, recordedBy: MANAGER, kind: op.kind, occurredOn: op.day, isRepeat, points: disciplinePoints(op.kind, isRepeat) },
        ];
        recount(world, [{ occurredOn: op.day, id, from: null, to: op.kind }], 'any');
        return;
      }
      case 'forgive': {
        const forgiven = systemRowOn(world, op.day);
        if (forgiven === undefined) return;
        world.rows = world.rows.filter((row) => row.id !== forgiven.id);
        recount(world, [{ occurredOn: op.day, id: forgiven.id, from: forgiven.kind, to: null }], 'any');
        return;
      }
    }
  };

  /** Месяц, как его записали отметки: по дню, повтор — по более ранним дням. */
  const initialRows = (random: () => number): RepeatRow[] => {
    const rows: RepeatRow[] = [];
    for (let n = 1; n <= DAYS; n += 1) {
      if (random() < 0.2) continue;
      const kind = pick(random, LATE_DISCIPLINE_KINDS);
      const isRepeat = rows.some((row) => row.kind === kind);
      rows.push({ id: n, userId: USER, recordedBy: USER, kind, occurredOn: dayOf(n), isRepeat, points: disciplinePoints(kind, isRepeat) });
    }
    return rows;
  };

  /**
   * Последовательность: одобрения нескольких дней и их снятия (`fifo` — в
   * том же порядке, иначе — в случайном), вперемешку с ручными записями за
   * дни без опоздания и прощениями дней, которые не одобряют.
   */
  const sequenceFor = (random: () => number, rows: readonly RepeatRow[], fifo: boolean): Op[] => {
    const lateDays = rows.map((row) => row.occurredOn);
    const approved = lateDays.filter(() => random() < 0.6).sort(() => random() - 0.5);
    const withdrawn = fifo ? [...approved] : [...approved].sort(() => random() - 0.5);
    const kindOn = new Map(rows.map((row) => [row.occurredOn, row.kind]));
    const ops: Op[] = [];
    const done = new Set<string>();
    while (ops.length < approved.length * 2) {
      const nextApproval = approved[done.size];
      const nextWithdrawal = withdrawn.find((day) => !ops.some((op) => op.type === 'withdraw' && op.day === day));
      const canWithdraw = nextWithdrawal !== undefined && done.has(nextWithdrawal);
      if (nextApproval !== undefined && (!canWithdraw || random() < 0.5)) {
        const original = LATE_DISCIPLINE_KINDS.find((kind) => kind === kindOn.get(nextApproval)) ?? 'late_under_15';
        const lower = LATE_DISCIPLINE_KINDS.filter((kind) => SEVERITY[kind] <= SEVERITY[original]);
        ops.push({ type: 'approve', day: nextApproval, target: random() < 0.4 ? null : pick(random, lower) });
        done.add(nextApproval);
      } else if (canWithdraw) {
        ops.push({ type: 'withdraw', day: nextWithdrawal });
      }
    }
    const freeDays = Array.from({ length: DAYS }, (_, index) => dayOf(index + 1)).filter((day) => !lateDays.includes(day));
    const untouched = lateDays.filter((day) => !approved.includes(day));
    for (let extra = Math.floor(random() * 4); extra > 0; extra -= 1) {
      const at = Math.floor(random() * (ops.length + 1));
      const manual: Op | null =
        random() < 0.5
          ? freeDays.length === 0
            ? null
            : { type: 'record', day: pick(random, freeDays), kind: pick(random, LATE_DISCIPLINE_KINDS) }
          : untouched.length === 0
            ? null
            : { type: 'forgive', day: pick(random, untouched) };
      if (manual !== null) ops.splice(at, 0, manual);
    }
    return ops;
  };

  /** Расхождения: снятие X дало в A не то, что в B, где X не одобряли. */
  const mismatches = (rows: readonly RepeatRow[], ops: readonly Op[], liveSnapshots: boolean): string[] => {
    const run = (skipDay: string | null, upTo: number): World => {
      const world: World = { rows: rows.map((row) => ({ ...row })), nextId: 100, held: new Map(), liveSnapshots };
      for (const op of ops.slice(0, upTo + 1)) {
        if (skipDay !== null && (op.type === 'approve' || op.type === 'withdraw') && op.day === skipDay) continue;
        apply(world, op);
      }
      return world;
    };
    const found: string[] = [];
    ops.forEach((op, index) => {
      if (op.type !== 'withdraw') return;
      const a = systemRowOn(run(null, index), op.day);
      const b = systemRowOn(run(op.day, index), op.day);
      // Запись не вернулась (руководитель сам записал опоздание за день) — сравнивать нечего.
      if (a === undefined || b === undefined) return;
      if (a.kind !== b.kind || a.isRepeat !== b.isRepeat || a.points !== b.points) {
        found.push(`${op.day}: A ${JSON.stringify(a)} ≠ B ${JSON.stringify(b)}`);
      }
    });
    return found;
  };

  const casesFrom = (seed: number, count: number, fifo: boolean): { readonly seed: number; readonly rows: RepeatRow[]; readonly ops: Op[] }[] =>
    Array.from({ length: count }, (_, index) => {
      const random = randomFrom(seed + index);
      const rows = initialRows(random);
      return { seed: seed + index, rows, ops: sequenceFor(random, rows, fifo) };
    });

  /** Сценарий проверки (1): 02-е −2, 06-е −3 с повтором; одобрили 02-е, потом 06-е; сняли в том же порядке. */
  const testerFifo: { readonly rows: RepeatRow[]; readonly ops: Op[] } = {
    rows: [
      { id: 2, userId: USER, recordedBy: USER, kind: 'late_over_30', occurredOn: dayOf(2), isRepeat: false, points: -2 },
      { id: 6, userId: USER, recordedBy: USER, kind: 'late_over_30', occurredOn: dayOf(6), isRepeat: true, points: -3 },
    ],
    ops: [
      { type: 'approve', day: dayOf(2), target: 'late_under_15' },
      { type: 'approve', day: dayOf(6), target: null },
      { type: 'withdraw', day: dayOf(2) },
      { type: 'withdraw', day: dayOf(6) },
    ],
  };

  it('сценарий проверки (FIFO): 06-е возвращается −3 с повтором, как без своего одобрения', () => {
    expect(mismatches(testerFifo.rows, testerFifo.ops, true)).toEqual([]);
    // Застывший снимок — ошибка проверки: 06-е вернулось −2 без повтора.
    expect(mismatches(testerFifo.rows, testerFifo.ops, false)).toHaveLength(1);
  });

  it('снятия в порядке одобрений (FIFO) — 600 случайных месяцев', () => {
    const failures = casesFrom(1_000, 600, true).flatMap(({ seed, rows, ops }) =>
      mismatches(rows, ops, true).map((found) => `зерно ${seed.toString()}: ${found}`),
    );
    expect(failures).toEqual([]);
  });

  it('снятия в любом порядке — 600 случайных месяцев', () => {
    const failures = casesFrom(50_000, 600, false).flatMap(({ seed, rows, ops }) =>
      mismatches(rows, ops, true).map((found) => `зерно ${seed.toString()}: ${found}`),
    );
    expect(failures).toEqual([]);
  });

  it('модель ловит застывший снимок: без пересчёта повторов в снимке случайные месяцы расходятся', () => {
    const broken = casesFrom(1_000, 600, true).filter(({ rows, ops }) => mismatches(rows, ops, false).length > 0);
    expect(broken.length).toBeGreaterThan(0);
  });
});

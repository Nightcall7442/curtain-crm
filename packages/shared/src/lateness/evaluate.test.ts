import { describe, expect, it } from 'vitest';

import { LATE_DISCIPLINE_KINDS, type LateDisciplineKind } from '../enums/discipline.enum';

import { latenessKind, parseStoredLateness } from './description';
import {
  evaluateMonthLateness,
  type DesiredLateness,
  type LateCheckInFact,
  type ManualLateRow,
  type MonthLatenessInput,
} from './evaluate';

const dayOf = (n: number): string => `2026-10-${n.toString().padStart(2, '0')}`;
const fact = (n: number, checkIn: string, scheduleStart = '09:00', forgiven = false): LateCheckInFact => ({
  day: dayOf(n),
  checkIn,
  scheduleStart,
  forgiven,
});
const manual = (n: number, kind: LateDisciplineKind, id = 1000 + n): ManualLateRow => ({ day: dayOf(n), id, kind });
const input = (parts: Partial<MonthLatenessInput>): MonthLatenessInput => ({
  facts: parts.facts ?? [],
  manualLateRows: parts.manualLateRows ?? [],
  approvals: parts.approvals ?? new Map(),
});
/** Запись дня коротко: «late_over_30 -3 повтор». */
const short = (row: DesiredLateness | undefined): string =>
  row === undefined ? '—' : `${row.kind} ${row.points.toString()}${row.isRepeat ? ' повтор' : ''}`;
const month = (rows: ReadonlyMap<string, DesiredLateness>, days: readonly number[]): string[] =>
  days.map((n) => short(rows.get(dayOf(n))));

describe('evaluateMonthLateness — день', () => {
  it('опоздание от графика: вид, балл и пояснение в формате системы', () => {
    const rows = evaluateMonthLateness(input({ facts: [fact(3, '09:22')] }));
    expect(rows.get(dayOf(3))).toEqual({
      day: dayOf(3),
      kind: 'late_15_30',
      isRepeat: false,
      points: -1,
      minutes: 22,
      shiftStart: '09:00',
      checkIn: '09:22',
      description: 'Смена с 09:00, отметка в 09:22 — опоздание 22 мин',
      approvedArriveBy: null,
    });
  });

  it('повтор — только если такой же вид был в более ранний день', () => {
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '09:40'), fact(5, '09:10'), fact(9, '10:00')] }));
    expect(month(rows, [2, 5, 9])).toEqual(['late_over_30 -2', 'late_under_15 -0.5', 'late_over_30 -3 повтор']);
  });

  it('одобрение: опоздание от «приду к», вовремя по нему — записи нет', () => {
    const approvals = new Map([
      [dayOf(2), '09:30'],
      [dayOf(4), '10:00'],
    ]);
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '09:40'), fact(4, '09:50')], approvals }));
    expect(rows.get(dayOf(2))?.description).toBe('Смена с 09:30, отметка в 09:40 — опоздание 10 мин');
    expect(rows.get(dayOf(2))?.approvedArriveBy).toBe('09:30');
    expect(rows.has(dayOf(4))).toBe(false);
  });

  it('«приду к» раньше графика порог не сдвигает: ступень и пояснение — как без одобрения', () => {
    const approvals = new Map([[dayOf(6), '08:30']]);
    const rows = evaluateMonthLateness(input({ facts: [fact(6, '09:10')], approvals }));
    expect(rows.get(dayOf(6))?.description).toBe('Смена с 09:00, отметка в 09:10 — опоздание 10 мин');
    expect(rows.get(dayOf(6))?.points).toBe(-0.5);
  });

  it('одобренный день — мягче из двух ступеней: ступенью ниже он стал бы повтором, и остаётся по факту', () => {
    // 02-го «до 15 мин»; 05-го 25 мин (−1), от «приду к 09:15» — 10 мин, повтор −1,5. Мягче — по факту.
    const approvals = new Map([[dayOf(5), '09:15']]);
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '09:05'), fact(5, '09:25')], approvals }));
    expect(rows.get(dayOf(5))).toMatchObject({
      kind: 'late_15_30',
      points: -1,
      isRepeat: false,
      description: 'Смена с 09:00, отметка в 09:25 — опоздание 25 мин',
      approvedArriveBy: '09:15',
    });
  });

  it('равные баллы — ступень от «приду к»: о ней и договорились', () => {
    // 01-го «15–30» не одобрено; 07-го 40 мин (−2), от «приду к 09:15» — 25 мин, повтор (−2).
    const approvals = new Map([[dayOf(7), '09:15']]);
    const rows = evaluateMonthLateness(input({ facts: [fact(1, '09:20'), fact(7, '09:40')], approvals }));
    expect(rows.get(dayOf(7))).toMatchObject({ kind: 'late_15_30', isRepeat: true, points: -2, minutes: 25 });
  });

  it('прощённый день записи не получает и повтором следующий не делает', () => {
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '09:40', '09:00', true), fact(6, '09:40')] }));
    expect(month(rows, [2, 6])).toEqual(['—', 'late_over_30 -2']);
  });

  it('ручное опоздание за день сильнее факта: записи системы нет; для следующих дней оно — более раннее событие', () => {
    const rows = evaluateMonthLateness(
      input({ facts: [fact(3, '09:05'), fact(6, '09:40')], manualLateRows: [manual(3, 'late_over_30')] }),
    );
    expect(month(rows, [3, 6])).toEqual(['—', 'late_over_30 -3 повтор']);
  });

  it('ручное опоздание в день без факта тоже делает более поздний день повтором, но не более ранний', () => {
    const rows = evaluateMonthLateness(
      input({ facts: [fact(2, '09:05'), fact(8, '09:05')], manualLateRows: [manual(5, 'late_under_15')] }),
    );
    expect(month(rows, [2, 8])).toEqual(['late_under_15 -0.5', 'late_under_15 -1.5 повтор']);
  });

  it('одобренный день повтором следующий не делает — даже если запись у него осталась', () => {
    const approvals = new Map([[dayOf(2), '09:30']]);
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '09:40'), fact(6, '09:05')], approvals }));
    expect(month(rows, [2, 6])).toEqual(['late_under_15 -0.5', 'late_under_15 -0.5']);
  });

  it('график — тот, что записан в факте: свой у каждого дня', () => {
    const rows = evaluateMonthLateness(input({ facts: [fact(2, '08:20', '08:00'), fact(3, '09:20', '09:30')] }));
    expect(rows.get(dayOf(2))?.description).toBe('Смена с 08:00, отметка в 08:20 — опоздание 20 мин');
    // Отметка не позже графика — не опоздание (так факт не пишется, но вход это переживает).
    expect(rows.has(dayOf(3))).toBe(false);
  });
});

describe('evaluateMonthLateness — сценарии проверки', () => {
  /** Состояние месяца, к которому приводит последовательность решений; оценивается оно, а не путь. */
  interface State {
    readonly facts: LateCheckInFact[];
    readonly manualLateRows: ManualLateRow[];
    readonly approvals: Map<string, string>;
  }
  const approve = (state: State, n: number, arriveBy: string): void => {
    state.approvals.set(dayOf(n), arriveBy);
  };
  const withdraw = (state: State, n: number): void => {
    state.approvals.delete(dayOf(n));
  };

  it('07/10/11: 07-е 09:55, 10-е и 11-е 09:05; A(11) W(11) A(10) A(07) W(10) W(07) — 11-е снова −1,5 с повтором', () => {
    const state: State = {
      facts: [fact(7, '09:55'), fact(10, '09:05'), fact(11, '09:05')],
      manualLateRows: [],
      approvals: new Map(),
    };
    const initial = month(evaluateMonthLateness(state), [7, 10, 11]);
    expect(initial).toEqual(['late_over_30 -2', 'late_under_15 -0.5', 'late_under_15 -1.5 повтор']);

    const trail: string[][] = [];
    const steps: (() => void)[] = [
      () => approve(state, 11, '09:25'),
      () => withdraw(state, 11),
      () => approve(state, 10, '09:20'),
      () => approve(state, 7, '09:45'),
      () => withdraw(state, 10),
      () => withdraw(state, 7),
    ];
    for (const step of steps) {
      step();
      trail.push(month(evaluateMonthLateness(state), [7, 10, 11]));
    }
    expect(trail).toEqual([
      ['late_over_30 -2', 'late_under_15 -0.5', '—'],
      initial,
      ['late_over_30 -2', '—', 'late_under_15 -0.5'],
      ['late_under_15 -0.5', '—', 'late_under_15 -0.5'],
      ['late_under_15 -0.5', 'late_under_15 -0.5', 'late_under_15 -1.5 повтор'],
      initial,
    ]);
  });

  it('02/06 и ручное «больше 30» за 03-е, пока 06-е одобрено: после снятия 06-е −3 с повтором', () => {
    const state: State = { facts: [fact(6, '09:40')], manualLateRows: [], approvals: new Map() };
    approve(state, 6, '09:45');
    expect(evaluateMonthLateness(state).has(dayOf(6))).toBe(false);
    state.manualLateRows.push(manual(3, 'late_over_30'));
    withdraw(state, 6);
    expect(month(evaluateMonthLateness(state), [3, 6])).toEqual(['—', 'late_over_30 -3 повтор']);
  });

  it('02/06: 02-е простили, пока 06-е одобрено, — после снятия 06-е −2 без повтора', () => {
    const state: State = { facts: [fact(2, '09:40'), fact(6, '09:40')], manualLateRows: [], approvals: new Map() };
    expect(month(evaluateMonthLateness(state), [2, 6])).toEqual(['late_over_30 -2', 'late_over_30 -3 повтор']);
    approve(state, 6, '09:45');
    state.facts[0] = fact(2, '09:40', '09:00', true);
    withdraw(state, 6);
    expect(month(evaluateMonthLateness(state), [2, 6])).toEqual(['—', 'late_over_30 -2']);
  });

  it('E4: 02-е 40 мин, 03-е 25, 06-е 10; одобрения 03-го и 02-го, снятие 02-го — 06-е не повтор ни на одном шаге', () => {
    const state: State = {
      facts: [fact(2, '09:40'), fact(3, '09:25'), fact(6, '09:10')],
      manualLateRows: [],
      approvals: new Map(),
    };
    expect(month(evaluateMonthLateness(state), [2, 3, 6])).toEqual([
      'late_over_30 -2',
      'late_15_30 -1',
      'late_under_15 -0.5',
    ]);
    approve(state, 3, '09:20');
    approve(state, 2, '09:35');
    expect(month(evaluateMonthLateness(state), [2, 3, 6])).toEqual([
      'late_under_15 -0.5',
      'late_under_15 -0.5',
      'late_under_15 -0.5',
    ]);
    withdraw(state, 2);
    expect(month(evaluateMonthLateness(state), [2, 3, 6])).toEqual([
      'late_over_30 -2',
      'late_under_15 -0.5',
      'late_under_15 -0.5',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Свойства — на тысячах случайных месяцев с воспроизводимым зерном          */
/* -------------------------------------------------------------------------- */

/** Детерминированный генератор (mulberry32): упавший случай воспроизводится по зерну. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('пустой выбор');
  return item;
}

/** `ЧЧ:ММ` из минут от полуночи. */
const clock = (minutes: number): string =>
  `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

const SCHEDULES = ['08:00', '09:00', '09:30'] as const;
const DAYS = 14;

/** «Приду к» — от 08:00 до 11:00 с шагом 5 минут: и раньше графика, и сильно позже. */
const randomArriveBy = (random: () => number): string => clock(8 * 60 + 5 * Math.floor(random() * 37));

function randomMonth(random: () => number): MonthLatenessInput {
  const facts: LateCheckInFact[] = [];
  const manualLateRows: ManualLateRow[] = [];
  const approvals = new Map<string, string>();
  for (let n = 1; n <= DAYS; n += 1) {
    if (random() < 0.7) {
      const scheduleStart = pick(random, SCHEDULES);
      const [hours = 0, minutes = 0] = scheduleStart.split(':').map(Number);
      facts.push(fact(n, clock(hours * 60 + minutes + 1 + Math.floor(random() * 90)), scheduleStart, random() < 0.1));
    }
    if (random() < 0.15) manualLateRows.push(manual(n, pick(random, LATE_DISCIPLINE_KINDS), 500 + n));
    if (random() < 0.35) approvals.set(dayOf(n), randomArriveBy(random));
  }
  return { facts, manualLateRows, approvals };
}

const SEEDS = Array.from({ length: 3_000 }, (_, index) => 7_000 + index);

describe('evaluateMonthLateness — свойства', () => {
  it('(1) добавленное одобрение не делает строже ни один день и не создаёт записей', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const random = randomFrom(seed);
      const base = randomMonth(random);
      const free = Array.from({ length: DAYS }, (_, index) => dayOf(index + 1)).filter((day) => !base.approvals.has(day));
      if (free.length === 0) continue;
      const day = pick(random, free);
      const approved = { ...base, approvals: new Map([...base.approvals, [day, randomArriveBy(random)]]) };
      const before = evaluateMonthLateness(base);
      const after = evaluateMonthLateness(approved);
      for (const [rowDay, row] of after) {
        const was = before.get(rowDay);
        if (was === undefined || row.points < was.points) {
          failures.push(`зерно ${seed.toString()}, одобрение ${day}: ${rowDay} ${short(was)} → ${short(row)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('(2) итог — функция состояния: порядок фактов, ручных записей и одобрений во входе не важен', () => {
    const failures: number[] = [];
    for (const seed of SEEDS) {
      const random = randomFrom(seed);
      const base = randomMonth(random);
      const shuffle = <T,>(items: readonly T[]): T[] =>
        items
          .map((item) => ({ item, key: random() }))
          .sort((a, b) => a.key - b.key)
          .map(({ item }) => item);
      const shuffled: MonthLatenessInput = {
        facts: shuffle(base.facts),
        manualLateRows: shuffle(base.manualLateRows),
        approvals: new Map(shuffle([...base.approvals])),
      };
      const a = [...evaluateMonthLateness(base)].sort(([x], [y]) => x.localeCompare(y));
      const b = [...evaluateMonthLateness(shuffled)].sort(([x], [y]) => x.localeCompare(y));
      if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(seed);
    }
    expect(failures).toEqual([]);
  });

  it('(3) любые одобрения и снятия: после снятия всех — ровно месяц без одобрений; на каждом шаге — оценка нынешнего набора', () => {
    const failures: string[] = [];
    for (const seed of SEEDS.slice(0, 1_000)) {
      const random = randomFrom(seed);
      const base = { ...randomMonth(random), approvals: new Map<string, string>() };
      const plain = JSON.stringify([...evaluateMonthLateness(base)]);
      const approvals = new Map<string, string>();
      const days = base.facts.map((row) => row.day);
      // Одобрения в случайном порядке, снятия — в другом случайном; между ними снятия и повторные одобрения.
      for (let step = 0; step < 12; step += 1) {
        const day = pick(random, days.length === 0 ? [dayOf(1)] : days);
        if (approvals.has(day) && random() < 0.6) approvals.delete(day);
        else approvals.set(day, randomArriveBy(random));
        // Тот же набор одобрений, собранный с нуля в другом порядке, — та же оценка.
        const rebuilt = new Map([...approvals].reverse());
        if (
          JSON.stringify([...evaluateMonthLateness({ ...base, approvals })]) !==
          JSON.stringify([...evaluateMonthLateness({ ...base, approvals: rebuilt })])
        ) {
          failures.push(`зерно ${seed.toString()}, шаг ${step.toString()}`);
        }
      }
      approvals.clear();
      if (JSON.stringify([...evaluateMonthLateness({ ...base, approvals })]) !== plain) {
        failures.push(`зерно ${seed.toString()}: после снятия всех одобрений месяц не тот`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('(4) ручные записи не трогаются: в день с ручным опозданием записи системы нет никогда', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const month = randomMonth(randomFrom(seed));
      const rows = evaluateMonthLateness(month);
      for (const row of month.manualLateRows) {
        if (rows.has(row.day)) failures.push(`зерно ${seed.toString()}: ${row.day}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('одобренный день никогда не строже того же дня без одобрения', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const month = randomMonth(randomFrom(seed));
      const withApprovals = evaluateMonthLateness(month);
      for (const day of month.approvals.keys()) {
        const without = evaluateMonthLateness({ ...month, approvals: new Map([...month.approvals].filter(([d]) => d !== day)) });
        const approvedRow = withApprovals.get(day);
        const plainRow = without.get(day);
        if (approvedRow !== undefined && (plainRow === undefined || approvedRow.points < plainRow.points)) {
          failures.push(`зерно ${seed.toString()}: ${day} ${short(plainRow)} → ${short(approvedRow)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('пояснение каждой записи разбирается обратно в её начало, отметку и минуты, а вид — по этим минутам', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (const row of evaluateMonthLateness(randomMonth(randomFrom(seed))).values()) {
        const parsed = parseStoredLateness(row.description);
        if (
          parsed?.shiftStart !== row.shiftStart ||
          parsed.checkIn !== row.checkIn ||
          parsed.minutes !== row.minutes ||
          latenessKind(row.minutes) !== row.kind
        ) {
          failures.push(`зерно ${seed.toString()}: ${row.description}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

import {
  evaluateMonthLateness,
  LATE_DISCIPLINE_KINDS,
  latenessDescription,
  type DesiredLateness,
  type LateCheckInFact,
  type LateDisciplineKind,
  type ManualLateRow,
} from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import { isAutomaticLateness, planLatenessSync, type StoredAutoLateness } from './lateness.service';

/*
  Сверка месяца: план (`planLatenessSync`) по тому, что лежит, и оценке
  (`evaluateMonthLateness`). Здесь — модель базы в памяти: записи системы,
  факты с отложенным объяснением, ручные записи и одобрения. После каждого
  решения месяц сверяется так же, как на сервере, и проверяется главное:
  записи равны оценке нынешнего состояния, сколько бы решений и в каком бы
  порядке ни было до него. SQL и журнал проверяет смоук.
*/

const USER = 243;
const MANAGER = 20;
const dayOf = (n: number): string => `2026-10-${n.toString().padStart(2, '0')}`;

describe('isAutomaticLateness', () => {
  const system = latenessDescription('09:00', '09:22', 22);

  it('запись системы — от имени сотрудника, вид опоздания и пояснение системы', () => {
    expect(isAutomaticLateness({ userId: USER, recordedBy: USER, kind: 'late_15_30', description: system })).toBe(true);
  });

  it('ручная запись руководителя — даже с пояснением в формате системы', () => {
    expect(isAutomaticLateness({ userId: USER, recordedBy: MANAGER, kind: 'late_15_30', description: system })).toBe(false);
  });

  it('руководитель записал опоздание сам себе своими словами — тоже ручная', () => {
    expect(isAutomaticLateness({ userId: MANAGER, recordedBy: MANAGER, kind: 'late_15_30', description: 'Пробка' })).toBe(false);
    expect(isAutomaticLateness({ userId: MANAGER, recordedBy: MANAGER, kind: 'late_15_30', description: null })).toBe(false);
  });

  it('не опоздание — не запись системы', () => {
    expect(isAutomaticLateness({ userId: USER, recordedBy: USER, kind: 'absence', description: system })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Модель базы                                                               */
/* -------------------------------------------------------------------------- */

interface Row extends StoredAutoLateness {
  readonly comment: string | null;
}

/** Факт в модели: прощение и отложенное объяснение меняются, остальное — как записала отметка. */
interface Fact extends Omit<LateCheckInFact, 'forgiven'> {
  forgiven: boolean;
  stash: string | null;
}

interface World {
  readonly facts: Map<string, Fact>;
  manual: ManualLateRow[];
  readonly approvals: Map<string, string>;
  rows: Row[];
  nextId: number;
}

const emptyWorld = (): World => ({ facts: new Map(), manual: [], approvals: new Map(), rows: [], nextId: 1 });

const desiredOf = (world: World): ReadonlyMap<string, DesiredLateness> =>
  evaluateMonthLateness({ facts: [...world.facts.values()], manualLateRows: world.manual, approvals: world.approvals });

/** Сверка — как `syncMonthLateness`: снятая запись откладывает объяснение в факт, вернувшаяся забирает его. */
function sync(world: World): void {
  for (const step of planLatenessSync(world.rows, desiredOf(world))) {
    switch (step.type) {
      case 'remove_duplicate':
        world.rows = world.rows.filter((row) => row.id !== step.row.id);
        break;
      case 'remove': {
        const fact = world.facts.get(step.row.day);
        if (fact !== undefined) fact.stash = step.row.comment;
        world.rows = world.rows.filter((row) => row.id !== step.row.id);
        break;
      }
      case 'create': {
        const fact = world.facts.get(step.desired.day);
        const { day, kind, isRepeat, points, description } = step.desired;
        world.rows = [...world.rows, { id: world.nextId++, day, kind, isRepeat, points, description, comment: fact?.stash ?? null }];
        if (fact !== undefined) fact.stash = null;
        break;
      }
      case 'adjust': {
        const { kind, isRepeat, points, description } = step.desired;
        world.rows = world.rows.map((row) => (row.id === step.row.id ? { ...row, kind, isRepeat, points, description } : row));
        break;
      }
    }
  }
}

type Op =
  | { readonly type: 'check_in'; readonly day: string; readonly checkIn: string }
  | { readonly type: 'approve'; readonly day: string; readonly arriveBy: string }
  | { readonly type: 'withdraw'; readonly day: string }
  | { readonly type: 'record'; readonly day: string; readonly kind: LateDisciplineKind }
  | { readonly type: 'remove_manual'; readonly day: string }
  | { readonly type: 'forgive'; readonly day: string }
  | { readonly type: 'explain'; readonly day: string; readonly comment: string };

/** Решение — как роутер: меняет состояние и сверяет месяц. Неприменимое решение — ничего. */
function apply(world: World, op: Op): void {
  switch (op.type) {
    case 'check_in':
      // Факт за день один: вторая отметка его не переписывает.
      if (!world.facts.has(op.day)) world.facts.set(op.day, { day: op.day, checkIn: op.checkIn, scheduleStart: '09:00', forgiven: false, stash: null });
      break;
    case 'approve':
      if (world.approvals.has(op.day)) return;
      world.approvals.set(op.day, op.arriveBy);
      break;
    case 'withdraw':
      if (!world.approvals.delete(op.day)) return;
      break;
    case 'record':
      world.manual = [...world.manual, { day: op.day, id: 10_000 + world.nextId++, kind: op.kind }];
      break;
    case 'remove_manual': {
      const target = world.manual.find((row) => row.day === op.day);
      if (target === undefined) return;
      world.manual = world.manual.filter((row) => row.id !== target.id);
      break;
    }
    case 'forgive': {
      // `discipline.remove` записи системы: строка уходит, день помечается прощённым.
      const target = world.rows.find((row) => row.day === op.day);
      const fact = world.facts.get(op.day);
      if (target === undefined || fact === undefined) return;
      world.rows = world.rows.filter((row) => row.id !== target.id);
      fact.forgiven = true;
      break;
    }
    case 'explain':
      // `discipline.explain` меняет только объяснение; сверка ему не нужна.
      world.rows = world.rows.map((row) => (row.day === op.day ? { ...row, comment: op.comment } : row));
      return;
  }
  sync(world);
}

/** Записи месяца без id — то, что видит сотрудник: день, вид, повтор, балл, пояснение, объяснение. */
const visible = (world: World): string[] =>
  [...world.rows]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => `${row.day} ${row.kind} ${row.points.toString()}${row.isRepeat ? ' R' : ''} | ${row.description ?? ''} | ${row.comment ?? ''}`);

/** Записи месяца как оценка: без объяснения. */
const graded = (rows: Iterable<Pick<Row, 'day' | 'kind' | 'isRepeat' | 'points' | 'description'>>): string[] =>
  [...rows]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => `${row.day} ${row.kind} ${row.points.toString()}${row.isRepeat ? ' R' : ''} | ${row.description ?? ''}`);

describe('planLatenessSync', () => {
  const desired = (day: string, checkIn: string): DesiredLateness => {
    const rows = evaluateMonthLateness({
      facts: [{ day, checkIn, scheduleStart: '09:00', forgiven: false }],
      manualLateRows: [],
      approvals: new Map(),
    });
    const row = rows.get(day);
    if (row === undefined) throw new Error('нет записи');
    return row;
  };
  const stored = (id: number, row: DesiredLateness): StoredAutoLateness => ({
    id,
    day: row.day,
    kind: row.kind,
    isRepeat: row.isRepeat,
    points: row.points,
    description: row.description,
  });

  it('совпадающая запись не трогается: сверка без изменений состояния пуста', () => {
    const target = desired(dayOf(3), '09:22');
    expect(planLatenessSync([stored(7, target)], new Map([[target.day, target]]))).toEqual([]);
  });

  it('лишние записи дня уходят, остаётся самая ранняя — и правится на месте', () => {
    const target = desired(dayOf(3), '09:22');
    const old = desired(dayOf(3), '09:40');
    const steps = planLatenessSync([stored(9, old), stored(5, old)], new Map([[target.day, target]]));
    expect(steps.map((step) => [step.type, 'row' in step ? step.row.id : null])).toEqual([
      ['remove_duplicate', 9],
      ['adjust', 5],
    ]);
  });

  it('записи быть не должно — снять; должна быть, а нет — создать; дни по возрастанию', () => {
    const later = desired(dayOf(8), '09:05');
    const steps = planLatenessSync([stored(4, desired(dayOf(2), '09:40'))], new Map([[later.day, later]]));
    expect(steps.map((step) => step.type)).toEqual(['remove', 'create']);
  });

  it('любая таблица после исполнения плана — ровно оценка, и второй план пуст (2 000 случайных месяцев)', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const random = randomFrom(seed);
      const world = randomWorld(random);
      // Таблица — что угодно: дубли, записи без факта, записи не той ступени.
      world.rows = Array.from({ length: Math.floor(random() * 8) }, () => {
        const day = dayOf(1 + Math.floor(random() * 10));
        const kind = pick(random, LATE_DISCIPLINE_KINDS);
        return { id: world.nextId++, day, kind, isRepeat: random() < 0.5, points: -1, description: latenessDescription('09:00', '09:50', 50), comment: null };
      });
      sync(world);
      if (JSON.stringify(graded(world.rows)) !== JSON.stringify(graded(desiredOf(world).values()))) {
        failures.push(`зерно ${seed.toString()}: таблица не равна оценке`);
      }
      if (planLatenessSync(world.rows, desiredOf(world)).length > 0) failures.push(`зерно ${seed.toString()}: второй план не пуст`);
    }
    expect(failures).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Решения по очереди: записи равны оценке состояния на каждом шаге          */
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

const clock = (minutes: number): string =>
  `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

/** Отметки 09:01–10:30 по 10 дням, без решений. */
function randomWorld(random: () => number): World {
  const world = emptyWorld();
  for (let n = 1; n <= 10; n += 1) {
    if (random() < 0.7) apply(world, { type: 'check_in', day: dayOf(n), checkIn: clock(9 * 60 + 1 + Math.floor(random() * 90)) });
  }
  return world;
}

function randomOp(random: () => number): Op {
  const day = dayOf(1 + Math.floor(random() * 10));
  const roll = random();
  if (roll < 0.35) return { type: 'approve', day, arriveBy: clock(8 * 60 + 30 + 5 * Math.floor(random() * 24)) };
  if (roll < 0.65) return { type: 'withdraw', day };
  if (roll < 0.75) return { type: 'record', day, kind: pick(random, LATE_DISCIPLINE_KINDS) };
  if (roll < 0.82) return { type: 'remove_manual', day };
  if (roll < 0.87) return { type: 'forgive', day };
  if (roll < 0.95) return { type: 'explain', day, comment: `объяснение ${Math.floor(random() * 1000).toString()}` };
  return { type: 'check_in', day, checkIn: clock(9 * 60 + 1 + Math.floor(random() * 90)) };
}

describe('сверка месяца после каждого решения', () => {
  it('сценарий проверки 07/10/11 (FIFO): после всех снятий месяц ровно исходный, 11-е −1,5 с повтором', () => {
    const world = emptyWorld();
    apply(world, { type: 'check_in', day: dayOf(7), checkIn: '09:55' });
    apply(world, { type: 'check_in', day: dayOf(10), checkIn: '09:05' });
    apply(world, { type: 'check_in', day: dayOf(11), checkIn: '09:05' });
    const initial = visible(world);
    const ops: Op[] = [
      { type: 'approve', day: dayOf(11), arriveBy: '09:25' },
      { type: 'withdraw', day: dayOf(11) },
      { type: 'approve', day: dayOf(10), arriveBy: '09:20' },
      { type: 'approve', day: dayOf(7), arriveBy: '09:45' },
      { type: 'withdraw', day: dayOf(10) },
      { type: 'withdraw', day: dayOf(7) },
    ];
    for (const op of ops) apply(world, op);
    expect(visible(world)).toEqual(initial);
    expect(world.rows.find((row) => row.day === dayOf(11))).toMatchObject({ kind: 'late_under_15', points: -1.5, isRepeat: true });
  });

  it('объяснение остаётся при правке на месте и возвращается с записью после снятия и возврата', () => {
    const world = emptyWorld();
    apply(world, { type: 'check_in', day: dayOf(4), checkIn: '10:25' });
    apply(world, { type: 'explain', day: dayOf(4), comment: 'Автобус сломался' });
    apply(world, { type: 'approve', day: dayOf(4), arriveBy: '10:00' });
    expect(world.rows[0]).toMatchObject({ kind: 'late_15_30', comment: 'Автобус сломался' });
    apply(world, { type: 'withdraw', day: dayOf(4) });
    apply(world, { type: 'approve', day: dayOf(4), arriveBy: '10:30' });
    expect(world.rows).toEqual([]);
    apply(world, { type: 'withdraw', day: dayOf(4) });
    expect(visible(world)).toEqual([
      `${dayOf(4)} late_over_30 -2 | Смена с 09:00, отметка в 10:25 — опоздание 85 мин | Автобус сломался`,
    ]);
  });

  it('5 000 случайных последовательностей: на каждом шаге записи — оценка нынешнего состояния; одобрение никого не утяжеляет', () => {
    const failures: string[] = [];
    for (let seed = 10_000; seed < 15_000; seed += 1) {
      const random = randomFrom(seed);
      const world = randomWorld(random);
      for (let step = 0; step < 16; step += 1) {
        const op = randomOp(random);
        const before = new Map(world.rows.map((row) => [row.day, row]));
        apply(world, op);
        if (JSON.stringify(graded(world.rows)) !== JSON.stringify(graded(desiredOf(world).values()))) {
          failures.push(`зерно ${seed.toString()}, шаг ${step.toString()} (${op.type}): записи не равны оценке`);
        }
        if (op.type === 'approve') {
          for (const row of world.rows) {
            const was = before.get(row.day);
            if (was === undefined || row.points < was.points) {
              failures.push(`зерно ${seed.toString()}, шаг ${step.toString()}: одобрение ${op.day} утяжелило ${row.day}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('один и тот же итог решений в разном порядке — одни и те же записи (1 000 случайных месяцев)', () => {
    const failures: number[] = [];
    for (let seed = 20_000; seed < 21_000; seed += 1) {
      const random = randomFrom(seed);
      const checkIns: Op[] = [];
      for (let n = 1; n <= 10; n += 1) {
        if (random() < 0.7) checkIns.push({ type: 'check_in', day: dayOf(n), checkIn: clock(9 * 60 + 1 + Math.floor(random() * 90)) });
      }
      const approvals: Op[] = checkIns
        .filter(() => random() < 0.5)
        .map((op) => ({ type: 'approve', day: op.day, arriveBy: clock(9 * 60 + 5 * Math.floor(random() * 18)) }));
      const records: Op[] = Array.from({ length: Math.floor(random() * 3) }, () => ({
        type: 'record',
        day: dayOf(1 + Math.floor(random() * 10)),
        kind: pick(random, LATE_DISCIPLINE_KINDS),
      }));
      // Путь A: всё по порядку. Путь B: перемешано, и часть одобрений по дороге снята и дана заново.
      const pathA = [...checkIns, ...approvals, ...records];
      const shuffled = [...approvals, ...records]
        .map((op) => ({ op, key: random() }))
        .sort((a, b) => a.key - b.key)
        .flatMap(({ op }): Op[] => (op.type === 'approve' && random() < 0.4 ? [op, { type: 'withdraw', day: op.day }, op] : [op]));
      const pathB = [...checkIns, ...shuffled];
      const a = emptyWorld();
      const b = emptyWorld();
      for (const op of pathA) apply(a, op);
      for (const op of pathB) apply(b, op);
      if (JSON.stringify(visible(a)) !== JSON.stringify(visible(b))) failures.push(seed);
    }
    expect(failures).toEqual([]);
  });

  it('ручные записи сверка не трогает: в день с ручным опозданием записи системы нет', () => {
    const world = emptyWorld();
    apply(world, { type: 'check_in', day: dayOf(3), checkIn: '09:40' });
    apply(world, { type: 'record', day: dayOf(3), kind: 'late_15_30' });
    expect(world.rows).toEqual([]);
    apply(world, { type: 'remove_manual', day: dayOf(3) });
    expect(graded(world.rows)).toEqual([`${dayOf(3)} late_over_30 -2 | Смена с 09:00, отметка в 09:40 — опоздание 40 мин`]);
  });

  it('прощённый день не возвращают ни одобрение, ни снятие согласования', () => {
    const world = emptyWorld();
    apply(world, { type: 'check_in', day: dayOf(5), checkIn: '09:40' });
    apply(world, { type: 'forgive', day: dayOf(5) });
    apply(world, { type: 'approve', day: dayOf(5), arriveBy: '09:30' });
    apply(world, { type: 'withdraw', day: dayOf(5) });
    expect(world.rows).toEqual([]);
  });
});

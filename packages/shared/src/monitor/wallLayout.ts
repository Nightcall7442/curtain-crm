import { LiveStatus, type LiveStatus as LiveStatusName } from '../enums/monitor.enum';
import type { Translated } from '../i18n/locale';

/**
 * ТВ «всё сразу»: люди группы, разложенные по статусам.
 *
 * Заказчик (переписка 25.10): «все должны быть видны — швеи по статусам,
 * установщики по статусам». Полоса — статус: работают, на выезде, на
 * перерыве, без заказа; закрывшие смену, выходные и не отметившиеся — одна
 * полоса «не на смене», чтобы три почти пустые полосы не съедали экран.
 */
export const WALL_LANES = ['working', 'trip', 'break', 'idle', 'off'] as const;

export type WallLane = (typeof WALL_LANES)[number];

export const WALL_LANE_LABELS: Translated<WallLane> = {
  ru: { working: 'Работают', trip: 'На выезде', break: 'На перерыве', idle: 'Без заказа', off: 'Не на смене' },
  uz: { working: 'Ishlamoqda', trip: 'Chiqishda', break: 'Tanaffusda', idle: 'Buyurtmasiz', off: 'Smenada emas' },
};

export function wallLaneOf(status: LiveStatusName): WallLane {
  switch (status) {
    case LiveStatus.WORKING:
      return 'working';
    case LiveStatus.TRIP:
      return 'trip';
    case LiveStatus.BREAK:
      return 'break';
    case LiveStatus.IDLE:
      return 'idle';
    case LiveStatus.FINISHED:
    case LiveStatus.DAY_OFF:
    case LiveStatus.ABSENT:
      return 'off';
  }
}

/** Высота плитки к ширине: портрет во весь рост плюс имя и строка работы. */
export const WALL_TILE_RATIO = 1.42;
/** Крупнее — два человека на полэкрана выглядят плакатом, а не табло. */
export const WALL_TILE_MAX = 230;

export interface WallLanesArea {
  readonly width: number;
  readonly height: number;
  /** Зазор между плитками внутри полосы. */
  readonly gap: number;
  /** Зазор между полосами. */
  readonly laneGap: number;
  /** Высота шапки полосы (статус и число). */
  readonly laneHeader: number;
  /**
   * Наименьшая ширина каждой полосы — чтобы подпись статуса («На перерыве»,
   * «Buyurtmasiz») не обрезалась у полосы в одну плитку. В порядке `counts`.
   */
  readonly minWidths?: readonly number[];
}

export interface WallLanesFit {
  /** Ширина плитки, px. */
  readonly tile: number;
  /** Рядов плиток — одинаково во всех полосах. */
  readonly rows: number;
  /** Колонок в каждой полосе, в порядке `counts`; у пустой — 0. */
  readonly cols: readonly number[];
}

/**
 * Наибольшая плитка, при которой все полосы встают в одну строку панели.
 *
 * Перебираются числа рядов: при `rows` рядах полосе с `n` людьми нужно
 * `ceil(n / rows)` колонок. Ширину плитки ограничивают сумма колонок по
 * ширине и ряды по высоте; берётся раскладка, где плитка крупнее. Прокрутки
 * и листания нет: на ТВ «все должны быть видны».
 */
export function fitStatusLanes(counts: readonly number[], area: WallLanesArea): WallLanesFit {
  const busy = counts.filter((count) => count > 0);
  const most = Math.max(0, ...busy);
  if (most === 0) return { tile: WALL_TILE_MAX, rows: 0, cols: counts.map(() => 0) };

  const colsFor = (rows: number): number[] => counts.map((count) => (count > 0 ? Math.ceil(count / rows) : 0));
  const minOf = (index: number): number => area.minWidths?.[index] ?? 0;
  const lanesGap = (busy.length - 1) * area.laneGap;
  /** Ширина всех полос при плитке `tile`: узкая полоса — не уже своей подписи. */
  const widthAt = (cols: readonly number[], tile: number, withMins: boolean): number =>
    cols.reduce((sum, col, index) => {
      if (col === 0) return sum;
      const lane = col * tile + (col - 1) * area.gap;
      return sum + (withMins ? Math.max(lane, minOf(index)) : lane);
    }, lanesGap);

  /*
    Наибольшая плитка не больше `limit`, при которой полосы влезают по
    ширине. Ширина растёт с плиткой монотонно, поэтому — делением пополам.
    Подписи не влезают даже при нулевой плитке (экран слишком узкий) —
    тогда без них: людей видно важнее, чем подпись целиком.
  */
  const widest = (cols: readonly number[], limit: number): number => {
    const withMins = widthAt(cols, 0, true) <= area.width;
    if (widthAt(cols, limit, withMins) <= area.width) return limit;
    let low = 0;
    let high = limit;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (widthAt(cols, middle, withMins) <= area.width) low = middle;
      else high = middle;
    }
    return low;
  };

  let best: WallLanesFit = { tile: 0, rows: most, cols: colsFor(most) };
  for (let rows = 1; rows <= most; rows += 1) {
    const cols = colsFor(rows);
    const byHeight = (area.height - area.laneHeader - (rows - 1) * area.gap) / rows / WALL_TILE_RATIO;
    const tile = widest(cols, Math.max(0, Math.min(byHeight, WALL_TILE_MAX)));
    if (tile > best.tile) best = { tile, rows, cols };
  }

  return { ...best, tile: Math.max(0, Math.floor(best.tile * 100) / 100) };
}

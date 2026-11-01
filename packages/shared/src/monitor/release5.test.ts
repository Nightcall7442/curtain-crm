import { describe, expect, it } from 'vitest';

import { LIVE_STATUS_LABELS, LIVE_STATUSES, LiveStatus } from '../enums/monitor.enum';
import { CorniceStatus } from '../enums/corniceStatus.enum';
import { OrderStatus } from '../enums/orderStatus.enum';
import { BOARD_PHOTO_KIND_LABELS, boardPhotoKindOf } from './boardPhoto';
import { corniceQueueStatusOf, qcQueueStatusOf, QC_QUEUE_ORDER_STATUSES } from './queues';
import { fitStatusLanes, WALL_LANE_LABELS, WALL_TILE_MAX, WALL_TILE_RATIO, wallLaneOf } from './wallLayout';

describe('фото табло по статусу', () => {
  it('работает и на выезде — «Работает»', () => {
    expect(boardPhotoKindOf(LiveStatus.WORKING)).toBe('working');
    expect(boardPhotoKindOf(LiveStatus.TRIP)).toBe('working');
  });

  it('отлучка — «На перерыве»', () => {
    expect(boardPhotoKindOf(LiveStatus.BREAK)).toBe('break');
  });

  it('без заказа и не на смене — «Без заказа»', () => {
    for (const status of [LiveStatus.IDLE, LiveStatus.FINISHED, LiveStatus.DAY_OFF, LiveStatus.ABSENT]) {
      expect(boardPhotoKindOf(status)).toBe('idle');
    }
  });

  it('подписи — словами заказчика', () => {
    expect(BOARD_PHOTO_KIND_LABELS.ru).toEqual({ working: 'Работает', idle: 'Без заказа', break: 'На перерыве' });
    expect(LIVE_STATUS_LABELS.ru.break).toBe('На перерыве');
    expect(LIVE_STATUS_LABELS.uz.break).toBe('Tanaffusda');
  });
});

describe('полосы статусов на ТВ', () => {
  it('у каждого статуса своя полоса, не на смене — одна общая', () => {
    expect(LIVE_STATUSES.map(wallLaneOf)).toEqual(['trip', 'break', 'working', 'idle', 'off', 'off', 'off']);
    expect(WALL_LANE_LABELS.ru.off).toBe('Не на смене');
  });
});

describe('fitStatusLanes', () => {
  const area = { width: 1100, height: 420, gap: 10, laneGap: 24, laneHeader: 40 };

  const fits = (counts: readonly number[], a: typeof area): boolean => {
    const fit = fitStatusLanes(counts, a);
    const lanes = counts.filter((count) => count > 0).length;
    const cols = fit.cols.reduce((sum, value) => sum + value, 0);
    const width = cols * fit.tile + (cols - lanes) * a.gap + Math.max(0, lanes - 1) * a.laneGap;
    const height = a.laneHeader + fit.rows * fit.tile * WALL_TILE_RATIO + Math.max(0, fit.rows - 1) * a.gap;
    return width <= a.width + 0.01 && height <= a.height + 0.01;
  };

  it('15 швей по четырём полосам помещаются целиком', () => {
    const counts = [6, 0, 2, 3, 4];
    const fit = fitStatusLanes(counts, area);
    expect(fits(counts, area)).toBe(true);
    for (const [index, count] of counts.entries()) {
      expect((fit.cols[index] ?? 0) * fit.rows).toBeGreaterThanOrEqual(count);
    }
    expect(fit.tile).toBeGreaterThan(80);
  });

  it('пустая полоса места не занимает', () => {
    const fit = fitStatusLanes([3, 0, 0, 2, 0], area);
    expect(fit.cols[1]).toBe(0);
    expect(fit.cols[2]).toBe(0);
    expect(fit.cols[4]).toBe(0);
  });

  it('один человек — плитка не больше предела', () => {
    expect(fitStatusLanes([1], { ...area, width: 3000, height: 2000 }).tile).toBe(WALL_TILE_MAX);
  });

  it('никого — ни рядов, ни колонок', () => {
    expect(fitStatusLanes([0, 0], area)).toEqual({ tile: WALL_TILE_MAX, rows: 0, cols: [0, 0] });
  });

  it('узкая полоса не уже своей подписи — «На перерыве» не обрезается', () => {
    const minWidths = [150, 150, 230, 150, 160];
    const counts = [6, 1, 1, 3, 1];
    const fit = fitStatusLanes(counts, { ...area, minWidths });
    const widths = counts.map((count, index) =>
      count === 0 ? 0 : Math.max((fit.cols[index] ?? 0) * fit.tile + ((fit.cols[index] ?? 0) - 1) * area.gap, minWidths[index] ?? 0),
    );
    for (const [index, count] of counts.entries()) {
      if (count > 0) expect(widths[index]).toBeGreaterThanOrEqual(minWidths[index] ?? 0);
    }
    expect(widths.reduce((sum, value) => sum + value, 0) + 4 * area.laneGap).toBeLessThanOrEqual(area.width + 0.01);
  });

  it('две панели из спецификации: 15 швей и 8 установщиков на 1920×1080', () => {
    const panel = { width: 1300, height: 360, gap: 12, laneGap: 36, laneHeader: 27 };
    expect(fits([7, 0, 2, 4, 2], panel)).toBe(true);
    expect(fits([3, 2, 1, 2, 0], panel)).toBe(true);
    expect(fitStatusLanes([7, 0, 2, 4, 2], panel).tile).toBeGreaterThan(100);
  });

  it('много людей на узком экране — всё равно все на месте', () => {
    const narrow = { width: 700, height: 300, gap: 8, laneGap: 16, laneHeader: 32 };
    expect(fits([9, 3, 2, 4, 6], narrow)).toBe(true);
  });
});

describe('очереди на ТВ', () => {
  it('ОТК: сшит, на контроле, брак; остальное — не очередь ОТК', () => {
    expect(QC_QUEUE_ORDER_STATUSES.map(qcQueueStatusOf)).toEqual(['sewn', 'checking', 'failed']);
    expect(qcQueueStatusOf(OrderStatus.QC_PASSED)).toBeNull();
  });

  it('карнизы: ждёт и в работе; готовый и ненужный — не очередь', () => {
    expect(corniceQueueStatusOf(CorniceStatus.PENDING)).toBe('waiting');
    expect(corniceQueueStatusOf(CorniceStatus.IN_PROGRESS)).toBe('taken');
    expect(corniceQueueStatusOf(CorniceStatus.DONE)).toBeNull();
    expect(corniceQueueStatusOf(CorniceStatus.NOT_REQUIRED)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { fitTvGrid, TV_CARD_BASE } from './tvLayout';

describe('сетка ТВ-табло', () => {
  const area = { width: 1850, height: 700, gap: 16 };

  it('десять человек на 1920×1080 — одной страницей, пять в ряд', () => {
    const fit = fitTvGrid(10, area);
    expect(fit.pages).toBe(1);
    expect(fit.cols).toBe(5);
    expect(fit.rows).toBe(2);
  });

  it('карточка не шире и не выше своей ячейки', () => {
    const fit = fitTvGrid(10, area);
    const cellWidth = (area.width - (fit.cols - 1) * area.gap) / fit.cols;
    const cellHeight = (area.height - (fit.rows - 1) * area.gap) / fit.rows;
    expect(TV_CARD_BASE.width * fit.scale).toBeLessThanOrEqual(cellWidth + 0.001);
    expect(TV_CARD_BASE.height * fit.scale).toBeLessThanOrEqual(cellHeight + 0.001);
  });

  it('трое — крупно, но не крупнее полуторного размера', () => {
    const fit = fitTvGrid(3, area);
    expect(fit.pages).toBe(1);
    expect(fit.scale).toBeLessThanOrEqual(1.5);
  });

  it('сорок человек не влезают — страницы, и на каждой карточки читаемы', () => {
    const fit = fitTvGrid(40, area);
    expect(fit.pages).toBeGreaterThan(1);
    expect(fit.perPage * fit.pages).toBeGreaterThanOrEqual(40);
    expect(fit.scale).toBeGreaterThanOrEqual(0.7);
  });

  it('никого нет или нет места — одна пустая страница', () => {
    expect(fitTvGrid(0, area).pages).toBe(1);
    expect(fitTvGrid(5, { width: 0, height: 0, gap: 16 }).pages).toBe(1);
  });
});

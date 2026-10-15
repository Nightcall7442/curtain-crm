/**
 * Сетка ТВ-табло: сколько карточек в ряд и насколько крупно.
 *
 * Табло в цеху смотрят с нескольких метров, прокрутить его нельзя — все люди
 * должны поместиться на экран. Перебираются все раскладки «колонки × ряды»,
 * и выбирается та, где карточка крупнее всего. Если даже лучшая даёт
 * нечитаемо мелкие карточки, люди делятся на страницы, которые листаются.
 */

/** Размер карточки при масштабе 1: на 1920×1080 в ряд их встаёт пять. */
export const TV_CARD_BASE = { width: 340, height: 280 } as const;

/** Мельче — с трёх метров не прочитать номер заказа. */
const MIN_SCALE = 0.7;
/** Крупнее — три человека на весь экран выглядят плакатом, а не табло. */
const MAX_SCALE = 1.5;

export interface TvGridArea {
  readonly width: number;
  readonly height: number;
  readonly gap: number;
}

export interface TvGridFit {
  readonly cols: number;
  readonly rows: number;
  readonly perPage: number;
  readonly pages: number;
  /** Множитель размера карточки относительно `TV_CARD_BASE`. */
  readonly scale: number;
}

export function fitTvGrid(count: number, area: TvGridArea): TvGridFit {
  if (count === 0 || area.width <= 0 || area.height <= 0) {
    return { cols: 1, rows: 1, perPage: Math.max(count, 1), pages: 1, scale: 1 };
  }

  const scaleFor = (cols: number, rows: number): number =>
    Math.min(
      (area.width - (cols - 1) * area.gap) / cols / TV_CARD_BASE.width,
      (area.height - (rows - 1) * area.gap) / rows / TV_CARD_BASE.height,
    );

  let best = { cols: 1, rows: count, scale: scaleFor(1, count) };
  for (let cols = 2; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const scale = scaleFor(cols, rows);
    if (scale > best.scale) best = { cols, rows, scale };
  }

  if (best.scale >= MIN_SCALE) {
    return { cols: best.cols, rows: best.rows, perPage: count, pages: 1, scale: Math.min(best.scale, MAX_SCALE) };
  }

  // Не влезают: столько рядов и колонок, сколько помещается при наименьшем читаемом размере.
  const rows = Math.max(1, Math.floor((area.height + area.gap) / (TV_CARD_BASE.height * MIN_SCALE + area.gap)));
  const cols = Math.max(1, Math.floor((area.width + area.gap) / (TV_CARD_BASE.width * MIN_SCALE + area.gap)));
  const perPage = rows * cols;
  return { cols, rows, perPage, pages: Math.ceil(count / perPage), scale: Math.min(scaleFor(cols, rows), MAX_SCALE) };
}

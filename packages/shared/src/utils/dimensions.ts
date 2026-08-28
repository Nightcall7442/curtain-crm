/**
 * Разбор размеров окна/шторы из свободного текста.
 *
 * Логика перенесена из `curtain-bot` (`parse_dimensions`) и доработана:
 *  - результат — именованный объект вместо кортежа `(w, h, area)`;
 *  - разделители разбираются устойчивее: латинская `x`, кириллическая `х`,
 *    знак умножения `×`, `*`, дефисы и пробелы;
 *  - явно различаются «нет размеров» и «размеры вне допустимого диапазона»:
 *    в боте оба случая давали `None`, и продавец не понимал, что именно не так;
 *  - площадь округляется до 4 знаков — при хранении в `numeric(10, 4)` это
 *    исключает расхождение между посчитанным и сохранённым значением.
 */

/** Минимально и максимально допустимый размер по каждой стороне, см. */
export const MIN_DIMENSION_CM = 1;
export const MAX_DIMENSION_CM = 2_000;

export interface ParsedDimensions {
  /** Ширина, сантиметры. */
  readonly widthCm: number;
  /** Высота, сантиметры. */
  readonly heightCm: number;
  /** Площадь, квадратные метры, округлённая до 4 знаков. */
  readonly areaM2: number;
  /** Нормализованное представление для хранения и отображения: `150x200`. */
  readonly normalized: string;
}

export type DimensionsParseError =
  | 'empty'
  | 'not_enough_numbers'
  | 'out_of_range';

export type DimensionsParseResult =
  | { readonly ok: true; readonly value: ParsedDimensions }
  | { readonly ok: false; readonly error: DimensionsParseError; readonly message: string };

const PARSE_ERROR_MESSAGES_RU: Readonly<Record<DimensionsParseError, string>> = {
  empty: 'Размеры не указаны',
  not_enough_numbers:
    'Не удалось распознать размеры. Укажите ширину и высоту, например: 150x200',
  out_of_range: `Каждая сторона должна быть от ${MIN_DIMENSION_CM.toString()} до ${MAX_DIMENSION_CM.toString()} см`,
};

/** Единицы измерения, которые пользователь может дописать к числам. */
const UNITS_PATTERN = /(?:^|\s)(?:см|sm|cm|мм|mm|метр(?:ов|а)?|metr|сантиметр(?:ов|а)?|миллиметр(?:ов|а)?|м|m)(?=\s|$|[хx×*])/gi;

/** Разделители между числами. */
const SEPARATORS_PATTERN = /[хx×*\-–—|/\\,;\s]+/gi;

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const formatCm = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1);

/**
 * Разбирает строку с размерами.
 *
 * Поддерживает: `150x200`, `150х200`, `150×200`, `150*200`, `150 200`,
 * `150 см х 200 см`, `1,5м x 2м` (десятичная запятая), `150-200`.
 *
 * Если чисел больше двух, берутся первые два — остальное считается лишним
 * (например, «150x200x3 шт»); количество изделий хранится отдельным полем.
 */
export function parseDimensions(input: string): DimensionsParseResult {
  const fail = (error: DimensionsParseError): DimensionsParseResult => ({
    ok: false,
    error,
    message: PARSE_ERROR_MESSAGES_RU[error],
  });

  if (typeof input !== 'string' || input.trim().length === 0) {
    return fail('empty');
  }

  const withoutUnits = input.trim().toLowerCase().replace(UNITS_PATTERN, ' ');
  // Десятичная запятая -> точка. Делаем до замены разделителей, иначе `1,5`
  // распалось бы на два числа `1` и `5`.
  const withDecimalPoints = withoutUnits.replace(/(\d),(\d)/g, '$1.$2');
  const normalized = withDecimalPoints.replace(SEPARATORS_PATTERN, ' ');

  const numbers = normalized.match(/\d+(?:\.\d+)?/g);
  if (numbers === null || numbers.length < 2) {
    return fail('not_enough_numbers');
  }

  const rawWidth = numbers[0];
  const rawHeight = numbers[1];
  // `noUncheckedIndexedAccess`: длина проверена выше, но сузить тип нужно явно.
  if (rawWidth === undefined || rawHeight === undefined) {
    return fail('not_enough_numbers');
  }

  const widthCm = roundTo(Number.parseFloat(rawWidth), 1);
  const heightCm = roundTo(Number.parseFloat(rawHeight), 1);

  const inRange = (value: number): boolean =>
    Number.isFinite(value) && value >= MIN_DIMENSION_CM && value <= MAX_DIMENSION_CM;

  if (!inRange(widthCm) || !inRange(heightCm)) {
    return fail('out_of_range');
  }

  return {
    ok: true,
    value: {
      widthCm,
      heightCm,
      areaM2: roundTo((widthCm * heightCm) / 10_000, 4),
      normalized: `${formatCm(widthCm)}x${formatCm(heightCm)}`,
    },
  };
}

/** Отображение размеров для интерфейса: `150 × 200 см`. */
export function formatDimensions(dimensions: ParsedDimensions): string {
  return `${formatCm(dimensions.widthCm)} × ${formatCm(dimensions.heightCm)} см`;
}

/** Площадь в м² по ширине и высоте в сантиметрах. */
export function areaM2FromCm(widthCm: number, heightCm: number): number {
  return roundTo((widthCm * heightCm) / 10_000, 4);
}

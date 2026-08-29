'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * График двух серий нарастающим итогом: текущий период против прошлого.
 *
 * Обе серии на ОДНОЙ шкале — вторая ось здесь была бы ошибкой: две шкалы
 * позволяют «подогнать» любое сравнение и делают график нечитаемым.
 * Если понадобится сравнить величины разного масштаба (заказы и выручку),
 * это два отдельных графика, как и на макете.
 *
 * Прошлый период нейтрально-серый: это опорная линия, а не равноправная
 * категория. Идентичность серий несут легенда и подписи значений на концах —
 * цвет не единственный носитель смысла.
 */

export interface SeriesPoint {
  readonly x: number;
  readonly y: number;
}

export interface LineSeriesProps {
  readonly current: readonly SeriesPoint[];
  readonly previous: readonly SeriesPoint[];
  readonly currentLabel?: string;
  readonly previousLabel?: string;
  /** Форматирование значения в подсказке и в подписи на конце линии. */
  readonly formatValue?: (value: number) => string;
  readonly className?: string;
}

const VIEW_WIDTH = 460;
const VIEW_HEIGHT = 180;

/**
 * Кегль подписей внутри SVG — В ЕДИНИЦАХ viewBox, а не в пикселях.
 *
 * Здесь нельзя пользоваться типографической шкалой страницы, и это не
 * стилистическое предпочтение, а разные системы координат. Холст шириной
 * 460 единиц растягивается на всю карточку — около 1450 px, — то есть всё
 * внутри увеличивается втрое. Класс `text-overline` (11 px) превращался на
 * экране в 35 px: подписи оси разносило, а число вида «115 млн» вылезало за
 * левый край холста и обрезалось до «млн».
 *
 * Отсюда же запрет на разрядку из шкалы: 0,08em при таком масштабе добавляет
 * подписи ещё несколько единиц ширины и добивает то, что не поместилось.
 *
 * Значения подобраны под этот холст: при изменении `VIEW_WIDTH` их надо
 * пересчитывать вместе с ним.
 */
const AXIS_FONT_SIZE = 9;
const VALUE_FONT_SIZE = 10;

/**
 * Левое поле держит подпись оси.
 *
 * Самая широкая подпись — денежная («115 млн»), около 30 единиц при кегле 9.
 * Поле меньше этого молча обрезает начало числа, и на графике остаётся
 * хвост единицы измерения.
 */
const PADDING = { top: 16, right: 44, bottom: 24, left: 40 };

const PLOT_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

export function LineSeries({
  current,
  previous,
  currentLabel = 'Текущий месяц',
  previousLabel = 'Прошлый месяц',
  formatValue = (value) => value.toString(),
  className,
}: LineSeriesProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const scale = useMemo(() => {
    const allPoints = [...current, ...previous];

    const maxX = allPoints.reduce((max, point) => Math.max(max, point.x), 1);
    const maxY = allPoints.reduce((max, point) => Math.max(max, point.y), 0);

    // Верх шкалы округляем вверх до «круглого» числа, иначе подпись оси
    // получается вида 283.7 и читается хуже, чем 300.
    const niceMax = niceCeil(maxY);

    return {
      maxX: Math.max(1, maxX),
      maxY: niceMax,
      toX: (x: number) => PADDING.left + (x / Math.max(1, maxX)) * PLOT_WIDTH,
      toY: (y: number) =>
        PADDING.top + PLOT_HEIGHT - (niceMax === 0 ? 0 : (y / niceMax) * PLOT_HEIGHT),
    };
  }, [current, previous]);

  const buildPath = useCallback(
    (points: readonly SeriesPoint[]): string =>
      points
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${scale.toX(point.x).toFixed(2)} ${scale.toY(point.y).toFixed(2)}`,
        )
        .join(' '),
    [scale],
  );

  const handlePointer = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (svg === null) return;

      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0) return;

      // Переводим экранные координаты в координаты viewBox.
      const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
      const dataX = Math.round(((viewX - PADDING.left) / PLOT_WIDTH) * scale.maxX);

      setHoverX(Math.min(scale.maxX, Math.max(1, dataX)));
    },
    [scale],
  );

  const hoveredCurrent = hoverX === null ? undefined : findNearest(current, hoverX);
  const hoveredPrevious = hoverX === null ? undefined : findNearest(previous, hoverX);

  const lastCurrent = current.at(-1);
  const lastPrevious = previous.at(-1);

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => scale.maxY * ratio);

  return (
    <div className={cn('w-full', className)}>
      {/* Легенда обязательна: серий две */}
      <div className="mb-1 flex items-center gap-4 text-overline">
        <span className="flex items-center gap-1.5 text-secondary">
          <span aria-hidden className="h-0.5 w-4 rounded bg-series-current" />
          {currentLabel}
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-0.5 w-4 rounded bg-series-previous" />
          {previousLabel}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH.toString()} ${VIEW_HEIGHT.toString()}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          `${currentLabel}: ${formatValue(lastCurrent?.y ?? 0)}. ` +
          `${previousLabel}: ${formatValue(lastPrevious?.y ?? 0)}.`
        }
      >
        {/* Сетка — намеренно неконтрастная, чтобы не спорить с данными */}
        {gridValues.map((value) => {
          const y = scale.toY(value);
          return (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + PLOT_WIDTH}
                y1={y}
                y2={y}
                stroke="rgb(var(--border-subtle))"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={AXIS_FONT_SIZE}
                className="fill-muted"
              >
                {formatValue(Math.round(value))}
              </text>
            </g>
          );
        })}

        {/* Подписи оси X: первый, средние и последний день */}
        {[1, 5, 10, 15, 20, 25, scale.maxX]
          .filter((day, index, all) => day <= scale.maxX && all.indexOf(day) === index)
          .map((day) => (
            <text
              key={day}
              x={scale.toX(day)}
              y={VIEW_HEIGHT - 8}
              textAnchor="middle"
              fontSize={AXIS_FONT_SIZE}
              className="fill-muted"
            >
              {day}
            </text>
          ))}

        {/* Прошлый период — опорная линия, рисуется первой и лежит ниже */}
        {previous.length > 1 && (
          <path
            d={buildPath(previous)}
            fill="none"
            stroke="rgb(var(--series-previous))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {current.length > 1 && (
          <path
            d={buildPath(current)}
            fill="none"
            stroke="rgb(var(--series-current))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Точки серий */}
        {previous.map((point) => (
          <circle
            key={`prev-${point.x.toString()}`}
            cx={scale.toX(point.x)}
            cy={scale.toY(point.y)}
            r="2"
            fill="rgb(var(--series-previous))"
          />
        ))}
        {current.map((point) => (
          <circle
            key={`cur-${point.x.toString()}`}
            cx={scale.toX(point.x)}
            cy={scale.toY(point.y)}
            r="2"
            fill="rgb(var(--series-current))"
          />
        ))}

        {/* Подписи итогов на концах линий — вместо чисел над каждой точкой */}
        {lastPrevious !== undefined && (
          <text
            x={scale.toX(lastPrevious.x) + 6}
            y={scale.toY(lastPrevious.y) + 3}
            fontSize={VALUE_FONT_SIZE}
            className="fill-muted font-medium"
          >
            {formatValue(lastPrevious.y)}
          </text>
        )}
        {lastCurrent !== undefined && (
          <text
            x={scale.toX(lastCurrent.x) + 6}
            y={scale.toY(lastCurrent.y) + 3}
            fontSize={VALUE_FONT_SIZE}
            className="fill-positive font-semibold"
          >
            {formatValue(lastCurrent.y)}
          </text>
        )}

        {/* Перекрестье при наведении */}
        {hoverX !== null && (
          <line
            x1={scale.toX(hoverX)}
            x2={scale.toX(hoverX)}
            y1={PADDING.top}
            y2={PADDING.top + PLOT_HEIGHT}
            stroke="rgb(var(--border-strong))"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {hoveredCurrent !== undefined && (
          <circle
            cx={scale.toX(hoveredCurrent.x)}
            cy={scale.toY(hoveredCurrent.y)}
            r="4"
            fill="rgb(var(--series-current))"
            stroke="rgb(var(--surface-panel))"
            strokeWidth="2"
          />
        )}
        {hoveredPrevious !== undefined && (
          <circle
            cx={scale.toX(hoveredPrevious.x)}
            cy={scale.toY(hoveredPrevious.y)}
            r="4"
            fill="rgb(var(--series-previous))"
            stroke="rgb(var(--surface-panel))"
            strokeWidth="2"
          />
        )}

        {/* Прозрачная область перехвата указателя — крупнее любой точки */}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={handlePointer}
          onPointerLeave={() => {
            setHoverX(null);
          }}
        />
      </svg>

      {/* Подсказка под графиком: в SVG её позиционирование хрупко,
          а здесь она не перекрывает данные и доступна с клавиатуры. */}
      <div
        className={cn(
          'mt-1 flex h-5 items-center gap-3 text-overline transition-opacity',
          hoverX === null ? 'opacity-0' : 'opacity-100',
        )}
        aria-live="polite"
      >
        {hoverX !== null && (
          <>
            <span className="text-muted">{`День ${hoverX.toString()}`}</span>
            <span className="text-positive">
              {`${currentLabel}: ${formatValue(hoveredCurrent?.y ?? 0)}`}
            </span>
            <span className="text-muted">
              {`${previousLabel}: ${formatValue(hoveredPrevious?.y ?? 0)}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Ближайшая точка серии к указанной позиции по оси X. */
function findNearest(
  points: readonly SeriesPoint[],
  x: number,
): SeriesPoint | undefined {
  if (points.length === 0) return undefined;

  let best = points[0];
  if (best === undefined) return undefined;

  for (const point of points) {
    if (Math.abs(point.x - x) < Math.abs(best.x - x)) best = point;
  }

  return best;
}

/** Округление верхней границы шкалы до «круглого» значения. */
function niceCeil(value: number): number {
  if (value <= 0) return 10;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

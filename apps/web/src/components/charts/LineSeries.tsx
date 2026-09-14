'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';

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
  /** Подпись позиции по X в подсказке и на оси: по умолчанию — день месяца. */
  readonly formatX?: (x: number) => string;
  /** Какие позиции по X подписывать под осью; по умолчанию — 1, 5, 10… и последняя. */
  readonly ticks?: readonly number[];
  readonly className?: string;
}

const VIEW_HEIGHT = 200;

/**
 * Холст рисуется в пикселях контейнера, а не в условных единицах viewBox.
 *
 * Растягиваемый viewBox увеличивал вместе с линиями и шрифт: на широкой
 * карточке подписи оси вырастали до 25 px и спорили с заголовком. Ширина
 * снимается с контейнера наблюдателем, и текст остаётся 11-пиксельным при
 * любой ширине карточки.
 */
const AXIS_FONT_SIZE = 11;
const VALUE_FONT_SIZE = 12;

/** Левое поле держит подпись оси — самая широкая денежная, «115 млн». */
const PADDING = { top: 16, right: 64, bottom: 26, left: 56 };

const PLOT_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

const DEFAULT_TICKS = [1, 5, 10, 15, 20, 25];
const defaultFormatX = (x: number): string => `День ${x.toString()}`;

export function LineSeries({
  current,
  previous,
  currentLabel = 'Текущий месяц',
  previousLabel = 'Прошлый месяц',
  formatValue = (value) => value.toString(),
  formatX = defaultFormatX,
  ticks = DEFAULT_TICKS,
  className,
}: LineSeriesProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [viewWidth, setViewWidth] = useState(600);
  // На странице бывает несколько графиков — у каждого свои <defs>.
  const gradientId = useId().replace(/:/g, '');

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0) {
        setViewWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  }, []);

  const plotWidth = Math.max(40, viewWidth - PADDING.left - PADDING.right);

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
      toX: (x: number) => PADDING.left + (x / Math.max(1, maxX)) * plotWidth,
      toY: (y: number) =>
        PADDING.top + PLOT_HEIGHT - (niceMax === 0 ? 0 : (y / niceMax) * PLOT_HEIGHT),
    };
  }, [current, previous, plotWidth]);

  /*
    Плавная кривая вместо ломаной: кубические сегменты с горизонтальными
    касательными в каждой точке. Такая кривая не «перелетает» значения —
    между двумя точками она никогда не выше большей и не ниже меньшей.
  */
  const buildPath = useCallback(
    (points: readonly SeriesPoint[]): string =>
      points
        .map((point, index) => {
          const x = scale.toX(point.x);
          const y = scale.toY(point.y);
          if (index === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
          const prev = points[index - 1];
          if (prev === undefined) return '';
          const px = scale.toX(prev.x);
          const py = scale.toY(prev.y);
          const mid = ((px + x) / 2).toFixed(2);
          return `C ${mid} ${py.toFixed(2)} ${mid} ${y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' '),
    [scale],
  );

  const baseline = scale.toY(0);
  const areaPath =
    current.length > 1
      ? `${buildPath(current)} L ${scale.toX(current.at(-1)?.x ?? 0).toFixed(2)} ${baseline.toFixed(2)} L ${scale.toX(current[0]?.x ?? 0).toFixed(2)} ${baseline.toFixed(2)} Z`
      : null;

  const handlePointer = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (svg === null) return;

      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0) return;

      const viewX = event.clientX - bounds.left;
      const dataX = Math.round(((viewX - PADDING.left) / plotWidth) * scale.maxX);

      setHoverX(Math.min(scale.maxX, Math.max(1, dataX)));
    },
    [scale, plotWidth],
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
        viewBox={`0 0 ${viewWidth.toString()} ${VIEW_HEIGHT.toString()}`}
        height={VIEW_HEIGHT}
        className="block w-full"
        role="img"
        aria-label={
          `${currentLabel}: ${formatValue(lastCurrent?.y ?? 0)}. ` +
          `${previousLabel}: ${formatValue(lastPrevious?.y ?? 0)}.`
        }
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--series-current))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(var(--series-current))" stopOpacity="0" />
          </linearGradient>
          <filter id={`${gradientId}-glow`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Сетка — пунктир, намеренно неконтрастный, чтобы не спорить с данными */}
        {gridValues.map((value) => {
          const y = scale.toY(value);
          return (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + plotWidth}
                y1={y}
                y2={y}
                stroke="rgb(var(--glass-ink) / 0.14)"
                strokeWidth="1"
                strokeDasharray={value === 0 ? undefined : '2 5'}
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

        {/* Подписи оси X: заданные деления и последняя позиция */}
        {[...ticks, scale.maxX]
          .filter((x, index, all) => x <= scale.maxX && all.indexOf(x) === index)
          .map((x) => (
            <text
              key={x}
              x={scale.toX(x)}
              y={VIEW_HEIGHT - 8}
              textAnchor="middle"
              fontSize={AXIS_FONT_SIZE}
              className="fill-muted"
            >
              {ticks === DEFAULT_TICKS ? x : formatX(x)}
            </text>
          ))}

        {/* Заливка под текущей серией — тает к нулю */}
        {areaPath !== null && <path d={areaPath} fill={`url(#${gradientId}-area)`} />}

        {/* Прошлый период — опорная линия, рисуется первой и лежит ниже */}
        {previous.length > 1 && (
          <path
            d={buildPath(previous)}
            fill="none"
            stroke="rgb(var(--series-previous))"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Текущая серия: свечение под линией и сама линия */}
        {current.length > 1 && (
          <>
            <path
              d={buildPath(current)}
              fill="none"
              stroke="rgb(var(--series-current))"
              strokeWidth="6"
              strokeOpacity="0.45"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter={`url(#${gradientId}-glow)`}
            />
            <path
              d={buildPath(current)}
              fill="none"
              stroke="rgb(var(--series-current))"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Точка только на конце текущей серии: по каждой точке — шум */}
        {lastCurrent !== undefined && (
          <>
            <circle
              cx={scale.toX(lastCurrent.x)}
              cy={scale.toY(lastCurrent.y)}
              r="8"
              fill="rgb(var(--series-current))"
              fillOpacity="0.25"
            />
            <circle
              cx={scale.toX(lastCurrent.x)}
              cy={scale.toY(lastCurrent.y)}
              r="3.5"
              fill="rgb(var(--series-current))"
              stroke="rgb(var(--surface-panel))"
              strokeWidth="2"
            />
          </>
        )}

        {/* Подписи итогов на концах линий — вместо чисел над каждой точкой */}
        {/* Совпадающие концы подписываются один раз, иначе цифры ложатся друг на друга. */}
        {lastPrevious !== undefined &&
          (lastCurrent === undefined ||
            Math.abs(scale.toY(lastPrevious.y) - scale.toY(lastCurrent.y)) > 12) && (
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
            stroke="rgb(var(--glass-ink) / 0.35)"
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
          width={plotWidth}
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
            <span className="text-muted">{formatX(hoverX)}</span>
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

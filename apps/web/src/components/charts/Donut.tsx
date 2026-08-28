'use client';

import { useId, useState, type ReactElement } from 'react';

import { cn, formatPercent } from '@/lib/utils';

/**
 * Кольцевая диаграмма и полукруглый индикатор.
 *
 * Реализовано на SVG без библиотеки графиков: формы простые, а собственная
 * реализация даёт точное совпадение с макетом и не тянет в бандл несколько
 * сотен килобайт ради четырёх дуг.
 *
 * Доступность: каждый сегмент подписан в легенде текстом и числом, поэтому
 * цвет — подкрепление, а не единственный носитель смысла. Значение целиком
 * дублируется в `aria-label`.
 */

export interface DonutSegment {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** CSS-цвет: обычно `rgb(var(--stage-…))`. */
  readonly color: string;
}

const CIRCUMFERENCE_RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * CIRCUMFERENCE_RADIUS;

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 12,
  className,
}: {
  readonly segments: readonly DonutSegment[];
  readonly centerValue: string;
  readonly centerLabel?: string;
  readonly size?: number;
  readonly thickness?: number;
  readonly className?: string;
}): ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  // Накопленное смещение: каждая следующая дуга начинается там,
  // где закончилась предыдущая.
  let offset = 0;

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={`${centerLabel ?? 'Всего'}: ${centerValue}. ${segments
            .map((segment) => `${segment.label} — ${segment.value.toString()}`)
            .join(', ')}`}
          className="-rotate-90"
        >
          {/* Фоновое кольцо: показывает форму даже при нулевых данных */}
          <circle
            cx="50"
            cy="50"
            r={CIRCUMFERENCE_RADIUS}
            fill="none"
            stroke="rgb(var(--surface-raised))"
            strokeWidth={thickness}
          />

          {total > 0 &&
            segments.map((segment) => {
              const length = (segment.value / total) * CIRCUMFERENCE;
              // Зазор в 2px между сегментами — иначе соседние цвета сливаются.
              const gap = segments.length > 1 && length > 4 ? 2 : 0;
              const dash = `${Math.max(0, length - gap).toString()} ${(CIRCUMFERENCE - length + gap).toString()}`;
              const currentOffset = offset;
              offset += length;

              if (segment.value === 0) return null;

              return (
                <circle
                  key={segment.key}
                  cx="50"
                  cy="50"
                  r={CIRCUMFERENCE_RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={hovered === segment.key ? thickness + 2 : thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="butt"
                  className="cursor-pointer transition-[stroke-width] duration-150"
                  onMouseEnter={() => {
                    setHovered(segment.key);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                >
                  <title>{`${segment.label}: ${segment.value.toString()}`}</title>
                </circle>
              );
            })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-semibold leading-none text-primary">
            {centerValue}
          </span>
          {centerLabel !== undefined && (
            <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">
              {centerLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Легенда к кольцевой диаграмме: цвет, подпись, значение и доля. */
export function DonutLegend({
  segments,
  total,
}: {
  readonly segments: readonly DonutSegment[];
  readonly total: number;
}): ReactElement {
  return (
    <ul className="space-y-1.5">
      {segments.map((segment) => (
        <li key={segment.key} className="flex items-center gap-2 text-[12px]">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: segment.color }}
          />
          <span className="min-w-0 flex-1 truncate text-secondary">{segment.label}</span>
          <span className="font-medium text-primary">{segment.value}</span>
          {total > 0 && (
            <span className="w-12 text-right text-muted">
              {formatPercent(Math.round((segment.value / total) * 1000) / 10)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Полукруглый индикатор для одного значения («Эффективность 87%»).
 *
 * Отдельный компонент, а не кольцо с одним сегментом: у индикатора другая
 * задача — показать положение на шкале 0–100, а не соотношение частей.
 */
export function Gauge({
  percent,
  label,
  size = 160,
  color = 'rgb(var(--accent))',
}: {
  readonly percent: number;
  readonly label?: string;
  readonly size?: number;
  readonly color?: string;
}): ReactElement {
  const gradientId = useId();
  const clamped = Math.min(100, Math.max(0, percent));

  // Полукруг радиусом 40 в системе координат 100×60.
  const arcLength = Math.PI * 40;
  const filled = (clamped / 100) * arcLength;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 100 58"
        width={size}
        height={size * 0.58}
        role="img"
        aria-label={`${label ?? 'Показатель'}: ${clamped.toFixed(0)}%`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--warning))" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="rgb(var(--surface-raised))"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled.toString()} ${arcLength.toString()}`}
        />
      </svg>

      <div className="-mt-6 flex flex-col items-center">
        <span className="text-[26px] font-semibold leading-none text-primary">
          {`${clamped.toFixed(0)}%`}
        </span>
        {label !== undefined && (
          <span className="mt-1 text-[11px] text-muted">{label}</span>
        )}
      </div>
    </div>
  );
}

'use client';

import { Fragment, type ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * Горизонтальные и вертикальные столбики, полосы прогресса и тепловая карта.
 *
 * Все — одна серия, поэтому один тон: разные цвета столбиков кодировали бы
 * несуществующие категории. Ранг несёт порядок строк, а не цвет.
 */

export interface RankedItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Подпись значения. Если не задана — печатается само число. */
  readonly valueLabel?: string;
}

/** Рейтинг: «Самые продаваемые товары». */
export function RankedBars({
  items,
  className,
}: {
  readonly items: readonly RankedItem[];
  readonly className?: string;
}): ReactElement {
  const max = items.reduce((value, item) => Math.max(value, item.value), 0);

  return (
    <ol className={cn('space-y-2.5', className)}>
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent-muted/60 text-overline font-semibold text-accent"
          >
            {index + 1}
          </span>

          <span className="w-[38%] shrink-0 truncate text-footnote text-secondary" title={item.label}>
            {item.label}
          </span>

          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-raised">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: max === 0 ? '0%' : `${((item.value / max) * 100).toFixed(1)}%` }}
            />
          </span>

          <span className="w-20 shrink-0 text-right text-footnote font-medium text-primary">
            {item.valueLabel ?? item.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Полоса прогресса с подписью — «Выполнено KPI», «План на сегодня». */
export function ProgressBar({
  percent,
  tone = 'accent',
  className,
}: {
  readonly percent: number;
  readonly tone?: 'accent' | 'positive' | 'warning' | 'danger' | 'info';
  readonly className?: string;
}): ReactElement {
  const clamped = Math.min(100, Math.max(0, percent));

  const toneClass = {
    accent: 'bg-accent',
    positive: 'bg-positive',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }[tone];

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-raised', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', toneClass)}
        style={{ width: `${clamped.toFixed(1)}%` }}
      />
    </div>
  );
}

/** Вертикальные столбики — «Возрастная структура». */
export function ColumnChart({
  items,
  className,
}: {
  readonly items: readonly RankedItem[];
  readonly className?: string;
}): ReactElement {
  const max = items.reduce((value, item) => Math.max(value, item.value), 0);

  return (
    <div className={cn('flex h-full items-end gap-2', className)}>
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-overline font-medium text-primary">{item.value}</span>
          <div
            className="w-full rounded-t bg-stage-measurement/80 transition-[height] duration-300"
            style={{ height: max === 0 ? '2px' : `${Math.max(2, (item.value / max) * 100).toFixed(1)}%` }}
            title={`${item.label}: ${item.value.toString()}`}
          />
          <span className="truncate text-overline text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Тепловая карта                                */
/* -------------------------------------------------------------------------- */

export interface HeatmapCell {
  readonly date: string;
  /** Доля вышедших, проценты. `null` — данных за день нет. */
  readonly rate: number | null;
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/**
 * Пороги окраски задаются ЗДЕСЬ, а не на сервере: это вопрос представления,
 * и менять палитру не должно требовать правки API.
 */
function levelOf(rate: number | null): {
  readonly className: string;
  readonly label: string;
} {
  if (rate === null) return { className: 'bg-raised', label: 'Нет данных' };
  if (rate >= 85) return { className: 'bg-positive/80', label: 'Высокая' };
  if (rate >= 60) return { className: 'bg-warning/70', label: 'Средняя' };
  if (rate > 0) return { className: 'bg-danger/70', label: 'Низкая' };
  return { className: 'bg-strong/50', label: 'Отсутствие' };
}

/**
 * Посещаемость по неделям месяца.
 *
 * Сетка строится от понедельника: недели считаются по ISO, поэтому первая
 * строка может начинаться с пустых ячеек, если месяц начался не с понедельника.
 */
export function AttendanceHeatmap({
  cells,
  year,
  month,
  className,
}: {
  readonly cells: readonly HeatmapCell[];
  readonly year: number;
  readonly month: number;
  readonly className?: string;
}): ReactElement {
  const byDate = new Map(cells.map((cell) => [cell.date, cell.rate]));

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const weeks: ({ date: string; day: number; rate: number | null } | null)[][] = [];
  let week: ({ date: string; day: number; rate: number | null } | null)[] = Array.from(
    { length: firstWeekday },
    () => null,
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year.toString()}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    week.push({ date, day, rate: byDate.get(date) ?? null });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1">
        <span />
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-center text-overline text-muted">
            {label}
          </span>
        ))}

        {weeks.map((weekCells, weekIndex) => (
          <Fragment key={`week-${weekIndex.toString()}`}>
            <span className="pr-1 text-right text-overline leading-6 text-muted">
              {`Неделя ${(weekIndex + 1).toString()}`}
            </span>
            {weekCells.map((cell, dayIndex) => {
              if (cell === null) {
                return <span key={`empty-${weekIndex.toString()}-${dayIndex.toString()}`} />;
              }

              const level = levelOf(cell.rate);
              return (
                <span
                  key={cell.date}
                  className={cn('h-6 rounded-sm', level.className)}
                  title={
                    cell.rate === null
                      ? `${cell.date}: нет данных`
                      : `${cell.date}: ${level.label}, ${cell.rate.toFixed(0)}%`
                  }
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Легенда обязательна: без неё цвет ячейки не значит ничего */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-overline text-muted">
        {[
          { className: 'bg-positive/80', label: 'Высокая' },
          { className: 'bg-warning/70', label: 'Средняя' },
          { className: 'bg-danger/70', label: 'Низкая' },
          { className: 'bg-raised', label: 'Нет данных' },
        ].map((entry) => (
          <li key={entry.label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('h-2.5 w-2.5 rounded-sm', entry.className)} />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';

import type { ReactElement, ReactNode } from 'react';

import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';

import { Donut } from '@/components/charts/Donut';
import { cn, formatPercent } from '@/lib/utils';

/**
 * Плитки главной панели в духе макета «Неон»: сплошная неоновая карточка с
 * главным числом, пульс заказов по дням, крупное число с точечным узором,
 * кольцо и список «что горит» с пилюлями. Данные приходят снаружи — здесь
 * только форма.
 */

/* -------------------------------------------------------------------------- */
/*  Мелочи                                                                    */
/* -------------------------------------------------------------------------- */

/** Дельта к прошлому периоду — пилюля со стрелкой. */
export function DeltaPill({
  value,
  onHero = false,
}: {
  readonly value: number | null | undefined;
  readonly onHero?: boolean;
}): ReactElement | null {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const flat = value === 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-footnote font-semibold',
        onHero
          ? 'hero-chip text-current'
          : flat
            ? 'bg-ink/[0.06] text-muted'
            : up
              ? 'bg-accent/15 text-accent'
              : 'bg-danger/15 text-danger',
      )}
    >
      {!flat && (up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
      {formatPercent(value, { signed: true })}
    </span>
  );
}

/** Точечный узор — три блока по девять точек, как «индикаторы» на макете. */
function Dots({ lit, className }: { readonly lit: number; readonly className?: string }): ReactElement {
  return (
    <span aria-hidden className={cn('grid grid-cols-9 gap-1', className)}>
      {Array.from({ length: 27 }, (_unused, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            index < lit ? 'bg-accent' : 'bg-ink/[0.12]',
          )}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Карточки                                                                  */
/* -------------------------------------------------------------------------- */

/** Сплошная неоновая карточка с главным числом периода. */
export function HeroCard({
  title,
  value,
  unit,
  delta,
  caption,
  chips,
}: {
  readonly title: string;
  readonly value: string;
  readonly unit?: string;
  readonly delta?: number | null;
  readonly caption?: string;
  readonly chips: readonly { readonly label: string; readonly value: string; readonly href?: string }[];
}): ReactElement {
  return (
    <section className="surface-hero relative flex h-full flex-col overflow-hidden p-6">
      <h2 className="font-hero text-heading font-semibold tracking-[-0.01em]">{title}</h2>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="hero-number font-figure text-[46px] font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
          {value}
        </span>
        {unit !== undefined && <span className="text-subhead font-medium opacity-80">{unit}</span>}
        <DeltaPill value={delta} onHero />
      </p>
      {caption !== undefined && <p className="mt-2 text-footnote opacity-75">{caption}</p>}

      <ul className="mt-auto flex flex-col items-start gap-2 pt-6">
        {chips.map((chip) => {
          const body = (
            <>
              <span className="opacity-80">{chip.label}</span>
              <span className="font-hero text-subhead font-bold [font-variant-numeric:tabular-nums]">
                {chip.value}
              </span>
              {chip.href !== undefined && <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />}
            </>
          );
          const className =
            'hero-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-caption';
          return (
            <li key={chip.label}>
              {chip.href === undefined ? (
                <span className={className}>{body}</span>
              ) : (
                <Link href={chip.href} className={cn(className, 'transition-colors')}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Пульс заказов: столбики по дням месяца, сегодня — неоновый.
 * Слева — три числа периода с дельтами, как в календаре на макете.
 */
export function PulseCard({
  title,
  days,
  today,
  stats,
}: {
  readonly title: string;
  /** Заказов за каждый день месяца, с первого по сегодняшний. */
  readonly days: readonly number[];
  readonly today: number;
  readonly stats: readonly {
    readonly label: string;
    readonly value: string;
    readonly delta?: number | null;
    readonly caption?: string;
  }[];
}): ReactElement {
  const max = Math.max(1, ...days);

  return (
    <section className="surface-card flex h-full flex-col p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        <span className="text-footnote text-muted">по дням текущего месяца</span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[auto_1fr]">
        <dl className="flex flex-wrap gap-6 lg:flex-col lg:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-[120px]">
              <dt className="text-footnote text-muted">{stat.label}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-figure text-display font-semibold leading-none tracking-[-0.02em] text-primary [font-variant-numeric:tabular-nums]">
                  {stat.value}
                </span>
                <DeltaPill value={stat.delta} />
              </dd>
              {stat.caption !== undefined && (
                <dd className="mt-1 text-footnote text-muted">{stat.caption}</dd>
              )}
            </div>
          ))}
        </dl>

        {/* Столбики: высота — доля от самого загруженного дня. */}
        <div className="flex min-h-[120px] items-end justify-center gap-1.5" role="img" aria-label="Заказы по дням">
          {days.map((count, index) => {
            const day = index + 1;
            const isToday = day === today;
            const height = Math.max(6, Math.round((count / max) * 100));
            return (
              <span
                key={day}
                title={`${day.toString()}: ${count.toString()}`}
                className={cn(
                  'w-full max-w-[14px] flex-1 rounded-full transition-colors',
                  isToday
                    ? 'bg-accent shadow-[0_0_16px_rgb(var(--accent)_/_0.55)]'
                    : count === 0
                      ? 'bg-ink/[0.06]'
                      : 'bg-accent/40 hover:bg-accent/70',
                )}
                style={{ height: `${height.toString()}%` }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Крупное число с точечным узором — «Current Score». */
export function BigNumberCard({
  title,
  value,
  caption,
  litDots,
  href,
}: {
  readonly title: string;
  readonly value: string;
  readonly caption: string;
  readonly litDots: number;
  readonly href?: string;
}): ReactElement {
  const body = (
    <>
      <h2 className="section-title">{title}</h2>
      <p className="mt-3 flex items-end gap-4">
        <span className="font-figure text-[50px] font-semibold leading-none tracking-[-0.02em] text-primary [font-variant-numeric:tabular-nums]">
          {value}
        </span>
        <Dots lit={litDots} className="mb-2 w-[92px]" />
      </p>
      <p className="mt-2 text-footnote text-muted">{caption}</p>
    </>
  );

  return href === undefined ? (
    <section className="surface-card h-full p-6">{body}</section>
  ) : (
    <Link href={href} className="surface-card card-link block h-full p-6">
      {body}
    </Link>
  );
}

/** Кольцо с числом в центре и кнопкой под ним — «Main task». */
export function RingCard({
  title,
  segments,
  centerValue,
  centerLabel,
  action,
}: {
  readonly title: string;
  readonly segments: readonly { readonly key: string; readonly label: string; readonly value: number; readonly color: string }[];
  readonly centerValue: string;
  readonly centerLabel: string;
  readonly action?: { readonly label: string; readonly href: string };
}): ReactElement {
  return (
    <section className="surface-card flex h-full flex-col p-6">
      <h2 className="section-title">{title}</h2>
      <Donut
        segments={segments}
        centerValue={centerValue}
        centerLabel={centerLabel}
        size={148}
        thickness={14}
        className="my-4"
      />
      {action !== undefined && (
        <Link
          href={action.href}
          className="pressable mt-auto inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-caption font-semibold text-on-accent shadow-[0_8px_20px_-10px_rgb(var(--accent)_/_0.7)] hover:bg-accent-strong"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}

/** Список «что горит» — строки с пилюлями, как цели у «AI Co-pilot». */
export function AttentionCard({
  title,
  subtitle,
  headline,
  entries,
  isLoading,
  extra,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly headline?: { readonly value: string; readonly caption: string };
  readonly entries: readonly {
    readonly key: string;
    readonly label: string;
    readonly count: number;
    readonly severity: 'high' | 'medium' | 'low';
    readonly href?: string;
  }[];
  readonly isLoading: boolean;
  readonly extra?: ReactNode;
}): ReactElement {
  const TONE = {
    high: 'bg-danger/15 text-danger',
    medium: 'bg-warning/15 text-warning',
    low: 'bg-info/15 text-info',
  } as const;
  const TONE_LABEL = { high: 'срочно', medium: 'важно', low: 'в очереди' } as const;

  return (
    <section className="surface-card flex h-full flex-col p-6">
      <h2 className="section-title">{title}</h2>
      <p className="mt-1 text-footnote text-muted">{subtitle}</p>

      {headline !== undefined && (
        <p className="mt-4 flex items-end gap-3">
          <span className="font-figure text-[42px] font-semibold leading-none tracking-[-0.02em] text-primary [font-variant-numeric:tabular-nums]">
            {headline.value}
          </span>
          <span className="mb-1 text-footnote text-muted">{headline.caption}</span>
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {isLoading ? (
          <li className="h-9 animate-pulse rounded-full bg-ink/[0.06]" />
        ) : entries.length === 0 ? (
          <li className="rounded-full bg-accent/10 px-3 py-2 text-caption text-accent">
            Всё в порядке — заказов, требующих вмешательства, нет
          </li>
        ) : (
          entries.map((entry) => {
            const row = (
              <>
                <span className="grid h-7 min-w-[28px] place-items-center rounded-full bg-ink/[0.08] px-2 font-hero text-caption font-bold text-primary [font-variant-numeric:tabular-nums]">
                  {entry.count}
                </span>
                <span className="min-w-0 flex-1 truncate text-caption text-secondary">{entry.label}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-overline font-semibold', TONE[entry.severity])}>
                  {TONE_LABEL[entry.severity]}
                </span>
              </>
            );
            const className = 'flex items-center gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2';
            return (
              <li key={entry.key}>
                {entry.href === undefined ? (
                  <div className={className}>{row}</div>
                ) : (
                  <Link href={entry.href} className={cn(className, 'transition-colors hover:bg-ink/[0.09]')}>
                    {row}
                  </Link>
                )}
              </li>
            );
          })
        )}
      </ul>
      {extra}
    </section>
  );
}

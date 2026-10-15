'use client';

import { PLAN_PACE_LABELS, type Locale, type PlanPace } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { cn, formatNumber } from '@/lib/utils';

import { UNIT_SHORT, type BoardPerson, type BoardUnit } from './labels';

/** Цвет темпа: опережает — акцент, в графике — жёлтый, отстаёт — красный. */
export const PACE_FILL: Readonly<Record<PlanPace, string>> = {
  ahead: 'bg-accent',
  on_track: 'bg-warning',
  behind: 'bg-danger',
};

export const PACE_TEXT: Readonly<Record<PlanPace, string>> = {
  ahead: 'text-accent',
  on_track: 'text-warning',
  behind: 'text-danger',
};

/** Подписи полосы: на ТВ — на языке ссылки. */
export interface PlanBarText {
  readonly title: string;
  readonly noPlan: string;
  readonly unit: string;
}

/**
 * План месяца на карточке: «96 / 180 шт · 53%», полоса цвета темпа и риска
 * на доле прошедших рабочих дней — где надо быть сегодня, чтобы успеть.
 * Без плана — та же высота и подпись «план не задан»: карточки в ряду
 * не прыгают.
 *
 * `tv` — те же части в `em` от кегля карточки ТВ: сетка ТВ масштабирует
 * карточку целиком, и полоса растёт вместе с ней.
 */
export function PlanBar({
  plan,
  unit,
  done,
  variant = 'panel',
  locale = 'ru',
  text,
  className,
}: {
  readonly plan: BoardPerson['plan'];
  readonly unit: BoardUnit;
  /** Выработка месяца. */
  readonly done: number;
  readonly variant?: 'panel' | 'tv';
  readonly locale?: Locale;
  readonly text?: PlanBarText;
  readonly className?: string;
}): ReactElement {
  const tv = variant === 'tv';
  const labels = text ?? { title: 'План месяца', noPlan: 'план не задан', unit: UNIT_SHORT[unit] };
  const paceLabel = plan === null ? '' : PLAN_PACE_LABELS[locale][plan.pace];

  return (
    <div className={cn(tv ? 'space-y-[0.35em]' : 'space-y-1.5', className)}>
      <p
        className={cn(
          'flex items-baseline justify-between gap-2 text-muted',
          tv ? 'text-[0.78em] leading-tight' : 'text-footnote',
        )}
      >
        <span className="truncate">{labels.title}</span>
        {plan === null ? (
          <span className="shrink-0">{labels.noPlan}</span>
        ) : (
          <span className="shrink-0 tabular-nums">
            <span className="font-semibold text-primary">
              {formatNumber(done, 0)} / {formatNumber(plan.target, 0)}
            </span>{' '}
            {labels.unit} · <span className={cn(tv && 'font-semibold text-primary')}>{plan.percent.toString()}%</span>
          </span>
        )}
      </p>
      <div
        className={cn('relative rounded-full bg-ink/[0.08]', tv ? 'h-[0.4em]' : 'h-1.5')}
        {...(plan === null
          ? {}
          : {
              role: 'progressbar',
              'aria-label': `${labels.title}: ${plan.percent.toString()}%, ${paceLabel.toLowerCase()}`,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.min(100, plan.percent),
              title: paceLabel,
            })}
      >
        {plan !== null && (
          <>
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', PACE_FILL[plan.pace])}
              style={{ width: `${Math.min(100, plan.percent).toString()}%` }}
            />
            <span
              aria-hidden
              className={cn(
                'absolute -translate-x-1/2 rounded-full bg-primary/70',
                tv ? '-top-[0.25em] h-[0.9em] w-[0.14em]' : '-top-1 h-3.5 w-0.5',
              )}
              style={{ left: `${Math.min(100, plan.expectedPercent).toString()}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
}

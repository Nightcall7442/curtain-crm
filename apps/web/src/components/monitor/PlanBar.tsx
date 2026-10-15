'use client';

import { PLAN_PACE_LABELS, type PlanPace } from '@curtain-crm/shared';
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

/**
 * План месяца на карточке: «96 / 180 шт · 53%», полоса цвета темпа и риска
 * на доле прошедших рабочих дней — где надо быть сегодня, чтобы успеть.
 * Без плана — та же высота и подпись «план не задан»: карточки в ряду
 * не прыгают.
 */
export function PlanBar({
  plan,
  unit,
  done,
  className,
}: {
  readonly plan: BoardPerson['plan'];
  readonly unit: BoardUnit;
  /** Выработка месяца. */
  readonly done: number;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="flex items-baseline justify-between gap-2 text-footnote text-muted">
        <span>План месяца</span>
        {plan === null ? (
          <span>план не задан</span>
        ) : (
          <span className="tabular-nums">
            <span className="font-semibold text-primary">
              {formatNumber(done, 0)} / {formatNumber(plan.target, 0)}
            </span>{' '}
            {UNIT_SHORT[unit]} · {plan.percent.toString()}%
          </span>
        )}
      </p>
      <div
        className="relative h-1.5 rounded-full bg-ink/[0.08]"
        {...(plan === null
          ? {}
          : {
              role: 'progressbar',
              'aria-label': `План месяца: ${plan.percent.toString()}%, ${PLAN_PACE_LABELS.ru[plan.pace].toLowerCase()}`,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.min(100, plan.percent),
              title: PLAN_PACE_LABELS.ru[plan.pace],
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
              className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-primary/70"
              style={{ left: `${Math.min(100, plan.expectedPercent).toString()}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
}

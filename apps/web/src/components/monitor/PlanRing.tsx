import { PLAN_PACE_LABELS, type PlanPace } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

/** Цвет дуги — те же токены, что у полосы плана. */
const PACE_STROKE: Readonly<Record<PlanPace, string>> = {
  ahead: 'stroke-accent',
  on_track: 'stroke-warning',
  behind: 'stroke-danger',
};

/**
 * Кольцо «План месяца»: дуга до 100 %, в центре процент. Перевыполнение
 * дуга не рисует — круг уже полон, цифра в центре говорит, насколько.
 */
export function PlanRing({
  percent,
  pace,
  size = 96,
  className,
}: {
  readonly percent: number;
  readonly pace: PlanPace;
  readonly size?: number;
  readonly className?: string;
}): ReactElement {
  const stroke = Math.max(6, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div
      role="img"
      aria-label={`План месяца: ${percent.toString()}%, ${PLAN_PACE_LABELS.ru[pace].toLowerCase()}`}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size.toString()} ${size.toString()}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-ink/[0.08]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled.toString()} ${circumference.toString()}`}
          className={cn('transition-[stroke-dasharray] duration-500', PACE_STROKE[pace])}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block font-bold tabular-nums leading-none text-primary" style={{ fontSize: size / 4.2 }}>
            {percent.toString()}%
          </span>
          <span className="block text-footnote text-muted">плана</span>
        </span>
      </span>
    </div>
  );
}

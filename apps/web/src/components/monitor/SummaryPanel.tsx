'use client';

import {
  formatDateTime,
  LiveStatus,
  MonitorGroup,
  MONTH_NAMES_RU,
  workshopToday,
  type LiveStatus as LiveStatusName,
} from '@curtain-crm/shared';
import { Clock, Layers, ShieldCheck, Target, TrendingDown, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn, formatNumber } from '@/lib/utils';

import { GROUP_STATUSES, statusLabel, UNIT_SHORT, type BoardData } from './labels';

function Row({
  icon: Icon,
  value,
  unit,
  label,
  badge,
}: {
  readonly icon: LucideIcon;
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly badge?: ReactNode;
}): ReactElement {
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t border-ink/[0.06] py-2.5 first:border-t-0">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon aria-hidden className="h-[19px] w-[19px]" />
      </span>
      <div className="min-w-0">
        <p className="font-bold tabular-nums tracking-tight text-primary">
          <span className="text-[22px] leading-tight">{value}</span>
          {unit !== undefined && <span className="ml-1 text-caption font-medium text-secondary">{unit}</span>}
        </p>
        <p className="text-footnote text-muted">{label}</p>
      </div>
      {badge}
    </li>
  );
}

function DeltaBadge({ value }: { readonly value: number | null }): ReactElement | null {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-footnote font-semibold',
        up ? 'bg-positive/[0.12] text-positive' : 'bg-danger/[0.12] text-danger',
      )}
      title="К прошлому месяцу на ту же дату"
    >
      <Icon aria-hidden className="h-3 w-3" />
      {`${up ? '+' : '−'}${Math.abs(value).toString()}%`}
    </span>
  );
}

/** Кто не за работой: «отлучка 1 · нет отметки 1» — только ненулевые. */
function awayLine(board: Pick<BoardData, 'group' | 'statusCounts'>): string {
  const away: readonly LiveStatusName[] = [LiveStatus.TRIP, LiveStatus.BREAK, LiveStatus.ABSENT, LiveStatus.DAY_OFF];
  const parts = GROUP_STATUSES[board.group]
    .filter((status) => away.includes(status) && board.statusCounts[status] > 0)
    .map((status) => `${statusLabel(status).toLowerCase()} ${board.statusCounts[status].toString()}`);
  return parts.length === 0 ? 'на смене' : `на смене · ${parts.join(' · ')}`;
}

const percent = (value: number | null): string => (value === null ? '—' : formatNumber(value, 0));

/**
 * Сводка месяца справа от пьедестала: объём с динамикой к прошлому месяцу
 * на ту же дату, сколько людей на смене, среднее на человека и качество
 * (цех) или сроки (выездные).
 */
export function SummaryPanel({
  board,
  className,
}: {
  readonly board: Pick<BoardData, 'group' | 'unit' | 'generatedAt' | 'summary' | 'statusCounts'>;
  readonly className?: string;
}): ReactElement {
  const { summary } = board;
  const unit = UNIT_SHORT[board.unit];
  // Месяц мастерской, а не браузера: в полночь по Ташкенту он сменится вместе с цифрами.
  const { month } = workshopToday(board.generatedAt);
  const workshop = board.group === MonitorGroup.WORKSHOP;

  return (
    <section aria-labelledby="summary-title" className={cn('surface-card flex flex-col px-5 py-4', className)}>
      <h2 id="summary-title" className="text-subhead font-semibold text-primary">
        {MONTH_NAMES_RU[month - 1] ?? 'Месяц'}
      </h2>
      <p className="mb-1 text-footnote text-muted">на {formatDateTime(board.generatedAt, false)}</p>
      <ul>
        <Row
          icon={TrendingUp}
          value={formatNumber(summary.monthTotal, 0)}
          unit={unit}
          label={`${workshop ? 'Сшито' : 'Выполнено'} за месяц · к прошлому на ту же дату`}
          badge={<DeltaBadge value={summary.monthDeltaPercent} />}
        />
        <Row
          icon={Users}
          value={`${summary.onShift.toString()} из ${summary.headcount.toString()}`}
          label={awayLine(board)}
        />
        <Row
          icon={Target}
          value={percent(summary.planPercent)}
          {...(summary.planPercent === null ? {} : { unit: '%' })}
          label={
            summary.planTotal === null
              ? 'План месяца не задан'
              : `План месяца · сумма планов ${formatNumber(summary.planTotal, 0)} ${unit}`
          }
        />
        <Row
          icon={Layers}
          value={formatNumber(summary.averagePerPerson, 0)}
          unit={unit}
          label="В среднем на человека за месяц"
        />
        {workshop ? (
          <Row icon={ShieldCheck} value={percent(summary.qualityPercent)} unit="%" label="Качество · без брака с ОТК" />
        ) : (
          <Row icon={Clock} value={percent(summary.onTimePercent)} unit="%" label="Вовремя · к сроку в заказе" />
        )}
      </ul>
    </section>
  );
}

'use client';

import type { LiveStatus, MonitorGroup } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { GROUP_STATUSES, STATUS_DOT, statusLabel } from './labels';

export type StatusFilter = LiveStatus | 'all';

/** Чипы статусов со счётчиками: «Все 10», «Работает 6», … Выбранный — акцентом, как вкладки раздела. */
export function StatusChips({
  group,
  counts,
  total,
  value,
  onChange,
}: {
  readonly group: MonitorGroup;
  readonly counts: Readonly<Record<LiveStatus, number>>;
  readonly total: number;
  readonly value: StatusFilter;
  readonly onChange: (value: StatusFilter) => void;
}): ReactElement {
  const chips: readonly { readonly key: StatusFilter; readonly label: string; readonly count: number }[] = [
    { key: 'all', label: 'Все', count: total },
    ...GROUP_STATUSES[group].map((status) => ({ key: status, label: statusLabel(status), count: counts[status] })),
  ];

  return (
    <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const active = chip.key === value;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(chip.key);
            }}
            className={cn(
              'pressable inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full border px-3 text-caption transition-colors',
              active
                ? 'border-accent/40 bg-accent/15 font-semibold text-accent'
                : 'border-ink/10 bg-ink/[0.03] text-secondary hover:bg-ink/[0.08] hover:text-primary',
              !active && chip.count === 0 && 'opacity-60',
            )}
          >
            {chip.key !== 'all' && <span aria-hidden className={cn('h-[7px] w-[7px] rounded-full', STATUS_DOT[chip.key])} />}
            {chip.label}
            <span className={cn('font-mono text-footnote', active ? 'text-accent/80' : 'text-muted')}>
              {chip.count.toString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

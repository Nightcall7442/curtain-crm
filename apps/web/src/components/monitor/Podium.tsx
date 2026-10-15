'use client';

import { MONITOR_PODIUM_SIZE, MONTH_NAMES_RU, shortName } from '@curtain-crm/shared';
import { Crown, Trophy } from 'lucide-react';
import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/Card';
import { cn, formatNumber } from '@/lib/utils';

import { UNIT_SHORT, type BoardUnit } from './labels';
import { PersonPhoto } from './PersonPhoto';

export interface PodiumEntry {
  readonly userId: number;
  readonly fullName: string;
  readonly photoUrl: string | null;
  readonly value: number;
  /** Выработка к плану того месяца; плана не было — `null`. */
  readonly planPercent: number | null;
}

/**
 * Металл первых трёх мест.
 *
 * Цвета не из палитры панели намеренно: золото, серебро и бронза узнаются
 * по цвету, а не по теме оформления, и в обеих схемах должны быть одни.
 */
const METAL: Readonly<Record<number, { readonly frame: string; readonly medal: string }>> = {
  1: {
    frame: 'border-[#e9c46a] shadow-[0_0_0_4px_rgb(233_196_106/0.18),0_12px_30px_rgb(233_196_106/0.18)]',
    medal: 'bg-gradient-to-br from-[#f6d58b] to-[#c9962e] text-[#2b1d05]',
  },
  2: { frame: 'border-[#c9d3d8]', medal: 'bg-gradient-to-br from-[#eef2f4] to-[#9eaab1] text-[#1d2427]' },
  3: { frame: 'border-[#d9945f]', medal: 'bg-gradient-to-br from-[#efb58c] to-[#a8643a] text-[#2b1405]' },
};
const PLAIN = { frame: 'border-ink/[0.12]', medal: 'bg-raised text-secondary' };

/** «сентябрь» из `2026-09`. */
function monthName(month: string): string {
  const index = Number.parseInt(month.slice(5, 7), 10) - 1;
  return (MONTH_NAMES_RU[index] ?? month).toLowerCase();
}

/**
 * Топ-5 прошлого месяца по объёму: портреты в арках, у первых трёх — рамка
 * золото / серебро / бронза, над первым — корона. Прошлый месяц, а не
 * текущий: в начале месяца текущий топ — это те, кому повезло со сменами.
 */
export function Podium({
  podium,
  unit,
  className,
}: {
  readonly podium: { readonly month: string; readonly entries: readonly PodiumEntry[] };
  readonly unit: BoardUnit;
  readonly className?: string;
}): ReactElement {
  const month = monthName(podium.month);

  return (
    <section aria-labelledby="podium-title" className={cn('surface-card px-5 pb-5 pt-4', className)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-gradient-to-br from-[#f6d58b] to-[#c9962e] text-[#3a2a08]">
          <Trophy aria-hidden className="h-[18px] w-[18px]" />
        </span>
        <h2 id="podium-title" className="text-subhead font-semibold text-primary">
          Топ-{MONITOR_PODIUM_SIZE.toString()} за {month}
        </h2>
        <span className="text-caption text-muted">
          · по объёму · {unit === 'pieces' ? 'сшито штук' : 'выполнено заказов'}
        </span>
      </div>

      {podium.entries.length === 0 ? (
        <EmptyState message={`За ${month} выработки нет`} hint="Пьедестал заполнится, когда закроются первые заказы" />
      ) : (
        // На узком экране пять арок не сжимаются в нитки, а прокручиваются вбок внутри карточки.
        <div className="-mx-1 overflow-x-auto px-1 pb-1 pt-5">
          <ol className="grid min-w-[620px] grid-cols-[1.22fr_repeat(4,minmax(0,1fr))] items-end gap-3">
            {podium.entries.map((entry, index) => {
              const place = index + 1;
              const first = place === 1;
              const metal = METAL[place] ?? PLAIN;
              return (
                <li
                  key={entry.userId}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-[18px] border px-3.5 pb-3.5 text-center',
                    first
                      ? 'border-[#f6d58b]/35 bg-gradient-to-b from-[#f6d58b]/[0.14] to-[#f6d58b]/[0.03] pt-6'
                      : 'border-ink/[0.07] bg-ink/[0.035] pt-4',
                  )}
                >
                  <div className={cn('relative w-full', first ? 'max-w-[170px]' : 'max-w-[150px]')}>
                    {first && (
                      <Crown
                        aria-hidden
                        className="absolute -top-[19px] left-1/2 z-10 h-6 w-6 -translate-x-1/2 fill-[#f2c94c] text-[#b8860b] drop-shadow-[0_2px_4px_rgb(0_0_0/0.4)]"
                      />
                    )}
                    <PersonPhoto
                      name={entry.fullName}
                      photoUrl={entry.photoUrl}
                      variant="podium"
                      className={cn('aspect-[4/4.4] w-full rounded-b-2xl rounded-t-[80px] border-2', metal.frame)}
                    />
                    <span
                      className={cn(
                        'absolute -bottom-[13px] left-1/2 z-10 grid h-[30px] w-[30px] -translate-x-1/2 place-items-center rounded-full border-[3px] border-panel text-caption font-bold',
                        metal.medal,
                      )}
                    >
                      <span className="sr-only">Место </span>
                      {place.toString()}
                    </span>
                  </div>
                  <p className="mt-4 w-full truncate text-body font-semibold text-primary" title={entry.fullName}>
                    {shortName(entry.fullName)}
                  </p>
                  <p className="font-bold tabular-nums tracking-tight text-primary">
                    <span className={first ? 'text-[32px] leading-none' : 'text-[26px] leading-none'}>
                      {formatNumber(entry.value, 0)}
                    </span>
                    <span className="ml-1 text-caption font-medium text-secondary">{UNIT_SHORT[unit]}</span>
                  </p>
                  {/* Без плана строка остаётся пустой: высота карточек в ряду одна. */}
                  <div className="w-full space-y-1.5" aria-hidden={entry.planPercent === null}>
                    <p className="text-footnote text-secondary">
                      {entry.planPercent === null ? '\u00a0' : `${entry.planPercent.toString()}% плана`}
                    </p>
                    <div className="h-1 overflow-hidden rounded-full bg-ink/[0.08]">
                      {entry.planPercent !== null && (
                        <div
                          className={cn(
                            'h-full rounded-full',
                            first ? 'bg-gradient-to-r from-[#f6d58b] to-[#c9962e]' : 'bg-accent',
                          )}
                          style={{ width: `${Math.min(100, entry.planPercent).toString()}%` }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {/* Свободные места держат форму пьедестала, когда призёров меньше пяти. */}
            {Array.from({ length: Math.max(0, MONITOR_PODIUM_SIZE - podium.entries.length) }, (_, index) => {
              const place = podium.entries.length + index + 1;
              return (
                <li
                  key={`free-${place.toString()}`}
                  aria-label={`Место ${place.toString()} свободно`}
                  className="flex flex-col items-center gap-1.5 rounded-[18px] border border-dashed border-ink/10 px-3.5 pb-3.5 pt-4 text-center"
                >
                  <div className="relative w-full max-w-[150px]">
                    <div className="aspect-[4/4.4] w-full rounded-b-2xl rounded-t-[80px] border-2 border-dashed border-ink/10" />
                    <span className="absolute -bottom-[13px] left-1/2 grid h-[30px] w-[30px] -translate-x-1/2 place-items-center rounded-full border-[3px] border-panel bg-raised text-caption font-bold text-muted">
                      {place.toString()}
                    </span>
                  </div>
                  <p className="mt-4 text-body text-muted">—</p>
                  <p className="text-[26px] font-bold leading-none text-muted/40">0</p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

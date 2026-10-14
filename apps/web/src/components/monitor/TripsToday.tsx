'use client';

import { formatTime, shortName } from '@curtain-crm/shared';
import { Check } from 'lucide-react';
import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export interface TripRow {
  readonly fullName: string;
  readonly startedAt: Date;
  readonly returnedAt: Date | null;
  readonly orderNumber: string | null;
  /** На ТВ адреса нет. */
  readonly address?: string | null;
}

/**
 * «Выезды сегодня» справа от выездных: кто, когда и по какому заказу уехал,
 * вернулся ли. В выпуске 1 это замена расписания установок — времени
 * установки в заказе ещё нет, а отметки выездов есть.
 */
export function TripsToday({
  trips,
  className,
}: {
  readonly trips: readonly TripRow[];
  readonly className?: string;
}): ReactElement {
  const ordered = [...trips].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const onSite = ordered.filter((trip) => trip.returnedAt === null).length;

  return (
    <section aria-labelledby="trips-title" className={cn('surface-card px-4 pb-4 pt-4', className)}>
      <h2 id="trips-title" className="flex flex-wrap items-baseline gap-2 text-subhead font-semibold text-primary">
        Выезды сегодня
        <span className="text-caption font-normal text-muted">
          {ordered.length.toString()}
          {onSite > 0 && ` · на объекте ${onSite.toString()}`}
        </span>
      </h2>

      {ordered.length === 0 ? (
        <EmptyState message="Сегодня выездов ещё не было" hint="Выезд появится, когда установщик отметит его в приложении" />
      ) : (
        <ol className="relative mt-3 before:absolute before:bottom-3 before:left-[51px] before:top-3 before:w-0.5 before:bg-ink/[0.08]">
          {ordered.map((trip) => {
            const back = trip.returnedAt !== null;
            return (
              <li
                key={`${trip.fullName}-${trip.startedAt.getTime().toString()}`}
                className="relative grid grid-cols-[40px_24px_minmax(0,1fr)] items-start gap-2.5 py-1.5"
              >
                <span className="pt-0.5 font-mono text-caption text-secondary">{formatTime(trip.startedAt)}</span>
                <span
                  aria-hidden
                  className={cn(
                    'z-[1] ml-px grid h-5 w-5 place-items-center rounded-full border-2',
                    back
                      ? 'border-positive bg-positive text-on-accent'
                      : 'border-stage-installation bg-panel shadow-[0_0_0_4px_rgb(var(--stage-installation)/0.18)]',
                  )}
                >
                  {back ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-stage-installation" />
                  )}
                </span>
                <div className={cn('min-w-0', back && 'opacity-70')}>
                  <p className="flex flex-wrap items-center gap-x-2 text-caption">
                    <span className="font-mono font-medium text-primary">{trip.orderNumber ?? 'без заказа'}</span>
                    <span className={cn('text-footnote font-semibold', back ? 'text-positive' : 'text-stage-installation')}>
                      {back && trip.returnedAt !== null ? `вернулся в ${formatTime(trip.returnedAt)}` : 'на объекте'}
                    </span>
                  </p>
                  <p className="truncate text-footnote text-muted">
                    {shortName(trip.fullName)}
                    {trip.address !== undefined && trip.address !== null && ` · ${trip.address}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

'use client';

import {
  formatElapsed,
  formatInstallSlot,
  INSTALL_SLOT_STATE_LABELS,
  shortName,
  type InstallSlotState,
} from '@curtain-crm/shared';
import { ArrowUpRight, Check, Clock4, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

import type { BoardData } from './labels';

type Schedule = NonNullable<BoardData['schedule']>;
type Slot = Schedule['slots'][number];

const STATE_TEXT: Readonly<Record<InstallSlotState, string>> = {
  done: 'text-positive',
  in_progress: 'text-stage-installation',
  late: 'text-danger',
  upcoming: 'text-muted',
};

/** Точка на линии времени: галочка у сделанной, пульс у идущей, красная у опоздания. */
function Marker({ state }: { readonly state: InstallSlotState }): ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        'z-[1] ml-px grid h-5 w-5 place-items-center rounded-full border-2',
        state === 'done' && 'border-positive bg-positive text-on-accent',
        state === 'in_progress' &&
          'border-stage-installation bg-panel shadow-[0_0_0_4px_rgb(var(--stage-installation)/0.18)]',
        state === 'late' && 'border-danger bg-panel shadow-[0_0_0_4px_rgb(var(--danger)/0.16)]',
        state === 'upcoming' && 'border-ink/20 bg-panel',
      )}
    >
      {state === 'done' && <Check className="h-3 w-3" />}
      {state === 'in_progress' && <span className="h-2 w-2 animate-pulse rounded-full bg-stage-installation" />}
      {state === 'late' && <span className="h-2 w-2 rounded-full bg-danger" />}
    </span>
  );
}

/** «опаздывает +40 мин» — насколько, считая от назначенного времени. */
function stateLabel(slot: Slot, now: Date): string {
  const label = INSTALL_SLOT_STATE_LABELS.ru[slot.state].toLowerCase();
  return slot.state === 'late' ? `${label} +${formatElapsed(now.getTime() - slot.at.getTime())}` : label;
}

/**
 * «Установки сегодня» справа от выездных: лента по времени с отметками
 * сделано / идёт / опаздывает / впереди, ниже — сколько назначено без
 * времени и что с карнизами.
 */
export function InstallSchedule({
  schedule,
  now,
  className,
}: {
  readonly schedule: Schedule;
  /** Время снимка: опоздание считается от него. */
  readonly now: Date;
  readonly className?: string;
}): ReactElement {
  const done = schedule.slots.filter((slot) => slot.state === 'done').length;

  return (
    <section aria-labelledby="schedule-title" className={cn('surface-card px-4 pb-4 pt-4', className)}>
      <h2 id="schedule-title" className="flex flex-wrap items-baseline gap-2 text-subhead font-semibold text-primary">
        Установки сегодня
        <span className="text-caption font-normal text-muted">
          {schedule.slots.length.toString()}
          {done > 0 && ` · сделано ${done.toString()}`}
        </span>
      </h2>

      {schedule.slots.length === 0 ? (
        <EmptyState
          message="На сегодня установок со временем нет"
          hint="Время ставится в карточке заказа, когда назначают установщика"
        />
      ) : (
        <ol className="relative mt-3 before:absolute before:bottom-3 before:left-[51px] before:top-3 before:w-0.5 before:bg-ink/[0.08]">
          {schedule.slots.map((slot) => (
            <li key={slot.orderId} className="relative grid grid-cols-[40px_24px_minmax(0,1fr)] items-start gap-2.5 py-1.5">
              <span
                className={cn(
                  'pt-0.5 font-mono text-caption',
                  slot.state === 'late' ? 'font-semibold text-danger' : 'text-secondary',
                )}
              >
                {formatInstallSlot(slot.at).time}
              </span>
              <Marker state={slot.state} />
              <div className={cn('min-w-0', slot.state === 'done' && 'opacity-70')}>
                <p className="flex flex-wrap items-center gap-x-2 text-caption">
                  <Link
                    href={`/orders/${slot.orderId.toString()}`}
                    className="inline-flex items-center gap-0.5 font-mono font-medium text-primary hover:text-accent"
                  >
                    {slot.orderNumber}
                    <ArrowUpRight aria-hidden className="h-3 w-3 opacity-60" />
                  </Link>
                  <span className={cn('text-footnote font-semibold', STATE_TEXT[slot.state])}>{stateLabel(slot, now)}</span>
                </p>
                <p className="truncate text-footnote text-muted">
                  {slot.installerName === null ? 'установщик не назначен' : shortName(slot.installerName)}
                </p>
                {slot.address !== null && (
                  <p className="flex items-start gap-1 text-footnote text-muted">
                    <MapPin aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-1">{slot.address}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 space-y-1.5 border-t border-ink/[0.07] pt-3 text-footnote text-muted">
        <p className="flex items-center gap-1.5">
          <Clock4 aria-hidden className="h-3.5 w-3.5" />
          {schedule.unscheduled === 0 ? (
            'У всех назначенных установок есть время'
          ) : (
            <Link href="/orders?tab=installation" className="font-medium text-secondary hover:text-accent">
              Без времени: {schedule.unscheduled.toString()}
            </Link>
          )}
        </p>
        <p>
          Карнизы: в очереди {schedule.cornices.pending.toString()} · в работе {schedule.cornices.inProgress.toString()}
        </p>
      </div>
    </section>
  );
}

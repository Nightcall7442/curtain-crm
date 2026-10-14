'use client';

import { formatElapsed, formatIsoDateShort, formatTime, MONITOR_POLL_MS } from '@curtain-crm/shared';
import { ArrowUpRight, Camera, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { DailyBars } from '@/components/charts/Bars';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, Skeleton } from '@/components/ui/Card';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

import { AWAY_STATUSES, STATUS_DOT, UNIT_SHORT } from './labels';
import { statusPillText } from './PersonCard';
import { PersonPhoto } from './PersonPhoto';

type PersonDetail = RouterOutputs['monitor']['person'];
type DetailWork = PersonDetail['queueAll'][number];

function Section({ title, aside, children }: { readonly title: string; readonly aside?: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <section className="space-y-2.5 border-t border-ink/[0.07] px-5 py-4">
      <h3 className="flex items-baseline gap-2 text-caption font-semibold text-primary">
        {title}
        {aside !== undefined && <span className="ml-auto text-footnote font-normal text-muted">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Строка заказа со ссылкой в карточку: номер, состав, срок. */
function WorkRow({ work, now }: { readonly work: DetailWork; readonly now: Date }): ReactElement {
  return (
    <li>
      <Link
        href={`/orders/${work.orderId.toString()}`}
        className="group flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-ink/[0.035] px-3 py-2.5 transition-colors hover:bg-ink/[0.07]"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-caption font-medium text-primary">
            {work.orderNumber}
            {work.rework && (
              <span className="rounded-md bg-danger/[0.12] px-1.5 font-sans text-footnote font-semibold text-danger">
                переделка
              </span>
            )}
          </p>
          <p className="truncate text-footnote text-secondary">{work.items.text === '' ? 'Состав не указан' : work.items.text}</p>
          <p className={cn('text-footnote', work.overdue ? 'text-danger' : 'text-muted')}>
            {[
              work.deadline === null ? null : `срок ${formatIsoDateShort(work.deadline)}`,
              work.since === null ? null : `в работе ${formatElapsed(now.getTime() - work.since.getTime())}`,
              work.overdue ? 'просрочен' : null,
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-footnote font-semibold text-accent opacity-80 group-hover:opacity-100">
          Открыть заказ
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </span>
      </Link>
    </li>
  );
}

const span = (from: Date, to: Date | null): string => `${formatTime(from)}–${to === null ? 'сейчас' : formatTime(to)}`;

function DrawerBody({ detail }: { readonly detail: PersonDetail }): ReactElement {
  const { isManagement } = useAuth();
  const now = new Date();
  const unit = UNIT_SHORT[detail.unit];
  const total30 = detail.daily.reduce((sum, entry) => sum + entry.value, 0);
  const shift = detail.shiftToday;

  return (
    <>
      <div className="relative">
        <PersonPhoto
          name={detail.fullName}
          photoUrl={detail.photoUrl}
          variant="drawer"
          dimmed={AWAY_STATUSES.has(detail.status)}
          className="h-[280px] w-full"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-12">
          <div className="min-w-0 flex-1 text-white">
            <p className="text-overline uppercase text-white/70">Место {detail.place.toString()} за месяц</p>
            <h2 id="person-drawer-title" className="truncate text-title font-semibold">
              {detail.fullName}
            </h2>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-black/55 px-3 text-footnote font-semibold text-white backdrop-blur-md">
            <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[detail.status])} />
            {statusPillText(detail)}
          </span>
        </div>
      </div>

      {detail.photoUrl === null && isManagement && (
        <div className="flex items-center gap-3 px-5 pt-4">
          <Camera aria-hidden className="h-4 w-4 text-muted" />
          <p className="flex-1 text-footnote text-muted">Фото берётся из карточки сотрудника</p>
          <Link
            href={`/employees?search=${encodeURIComponent(detail.fullName)}`}
            className="pressable rounded-full border border-ink/10 bg-ink/[0.06] px-3 py-1.5 text-footnote font-semibold text-secondary hover:bg-ink/10 hover:text-primary"
          >
            Загрузить фото
          </Link>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2 px-5 py-4">
        {[
          { label: 'Сегодня', value: detail.counts.today },
          { label: 'Неделя', value: detail.counts.week },
          { label: 'Месяц', value: detail.counts.month },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col-reverse rounded-xl border border-ink/[0.07] px-3 py-2">
            <dt className="text-footnote text-muted">{cell.label}</dt>
            <dd className="font-bold tabular-nums text-primary">
              <span className="text-[22px]">{formatNumber(cell.value, 0)}</span>
              <span className="ml-1 text-caption font-medium text-secondary">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <Section title="Сейчас в работе" aside={detail.current.length === 0 ? undefined : detail.current.length.toString()}>
        {detail.current.length === 0 ? (
          <p className="text-footnote text-muted">Текущего заказа нет</p>
        ) : (
          <ul className="space-y-2">
            {detail.current.map((work) => (
              <WorkRow key={work.orderId} work={work} now={now} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="За 30 дней" aside={`${formatNumber(total30, 0)} ${unit}`}>
        <DailyBars days={detail.daily} unit={unit} className="h-36" />
      </Section>

      <Section title="Смена сегодня">
        {shift === null ? (
          <p className="text-footnote text-muted">Сегодня смены не было</p>
        ) : (
          <ul className="space-y-1.5 text-footnote text-secondary">
            <li className="flex justify-between gap-3">
              <span>Смена</span>
              <span className="font-mono text-primary">
                {span(shift.startedAt, shift.endedAt)}
                {shift.endedAt === null && ` · ${formatElapsed(now.getTime() - shift.startedAt.getTime())}`}
              </span>
            </li>
            {shift.breaks.map((item) => (
              <li key={`b-${item.startedAt.getTime().toString()}`} className="flex justify-between gap-3">
                <span>Отлучка · заявлено {item.plannedMinutes.toString()} мин</span>
                <span className="font-mono text-primary">{span(item.startedAt, item.returnedAt)}</span>
              </li>
            ))}
            {shift.trips.map((item) => (
              <li key={`t-${item.startedAt.getTime().toString()}`} className="flex justify-between gap-3">
                <span>Выезд{item.orderNumber === null ? '' : ` · ${item.orderNumber}`}</span>
                <span className="font-mono text-primary">{span(item.startedAt, item.returnedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Очередь" aside={detail.queueAll.length === 0 ? undefined : detail.queueAll.length.toString()}>
        {detail.queueAll.length === 0 ? (
          <p className="text-footnote text-muted">Очередь пуста</p>
        ) : (
          <ul className="space-y-2">
            {detail.queueAll.map((work) => (
              <WorkRow key={work.orderId} work={work} now={now} />
            ))}
          </ul>
        )}
        {detail.cornicePool !== null && (
          <p className="text-footnote text-muted">Общая очередь карнизов: {detail.cornicePool.toString()}</p>
        )}
      </Section>

      {detail.photos.length > 0 && (
        <Section title="Фото с объектов">
          <ul className="grid grid-cols-4 gap-2">
            {detail.photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-lg bg-raised">
                <img
                  src={photo.url}
                  alt={photo.orderNumber === null ? 'Фото с объекта' : `Фото с объекта, ${photo.orderNumber}`}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/**
 * Боковая панель человека: всё, что не уместилось в карточку, — вся очередь,
 * 30 дней выработки, смена сегодня, фото с объектов у выездных.
 *
 * Открыта, пока в адресе `?person=<id>`: ссылкой на неё можно поделиться,
 * а «назад» в браузере её закрывает вместе с остальным адресом.
 */
export function PersonDrawer({
  userId,
  branchId,
  onClose,
}: {
  readonly userId: number | null;
  /** Филиал табло: панель считает те же цифры, что карточка. */
  readonly branchId: number | null;
  readonly onClose: () => void;
}): ReactElement | null {
  const open = userId !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  // Табло перерисовывается каждые 20 с с новым `onClose`; эффект открытия от него не зависит,
  // иначе фокус прыгал бы на «Закрыть» при каждом опросе.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const detail = trpc.monitor.person.useQuery(
    branchId === null ? { userId: userId ?? 0 } : { userId: userId ?? 0, branchId },
    { enabled: open, refetchInterval: MONITOR_POLL_MS, refetchIntervalInBackground: false },
  );

  useEffect(() => {
    if (!open) return undefined;
    // Фокус — в панель, а после закрытия — туда, где он был: на карточку.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      opener?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-drawer-title"
        className="relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-panel shadow-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/70"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>

        {detail.data !== undefined ? (
          <DrawerBody detail={detail.data} />
        ) : detail.isError ? (
          <div className="pt-16">
            <h2 id="person-drawer-title" className="sr-only">
              Сотрудник
            </h2>
            <ErrorState
              message={detail.error.message}
              onRetry={() => {
                void detail.refetch();
              }}
            />
          </div>
        ) : (
          <div aria-busy="true" className="space-y-4">
            <h2 id="person-drawer-title" className="sr-only">
              Загрузка
            </h2>
            <Skeleton className="h-[280px] w-full rounded-none" />
            <div className="space-y-3 px-5">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

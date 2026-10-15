'use client';

import {
  fitTvGrid,
  formatIsoDateShort,
  isoWeekdayOf,
  LIVE_STATUS_LABELS,
  LiveStatus,
  MONITOR_GROUP_ROLES,
  MONITOR_PODIUM_SIZE,
  MonitorGroup,
  monthName,
  monthNameGenitive,
  ROLE_LABELS,
  SEWER_CATEGORIES,
  SEWER_CATEGORY_LABELS,
  shortName,
  sortPeople,
  TV_PAGE_MS,
  weekdayName,
  WORKSHOP_TIME_ZONE,
  workshopToday,
  type Locale,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';
import { Crown, Trophy, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

import { AWAY_STATUSES, STATUS_DOT } from './labels';
import { PersonPhoto } from './PersonPhoto';
import { TV_TEXT, type TvText } from './tvLabels';

/** Снимок для ТВ: и `display.board` по ссылке, и `monitor.board` руководителя — у второго лишь больше полей. */
export type TvBoardData = Omit<RouterOutputs['display']['board'], 'link'>;
type TvPerson = TvBoardData['people'][number];

/** Время на ТВ — всегда ташкентское: часовой пояс самого телевизора никто не настраивал. */
const tvTime = (at: Date | number): string =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: WORKSHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(at);

function tvDate(now: number, locale: Locale): string {
  const { year, month, day } = workshopToday(new Date(now));
  const weekday = weekdayName(isoWeekdayOf(new Date(Date.UTC(year, month - 1, day))), locale).toLowerCase();
  return locale === 'uz'
    ? `${weekday}, ${day.toString()}-${monthNameGenitive(month, locale)}`
    : `${weekday}, ${day.toString()} ${monthNameGenitive(month, locale)}`;
}

/** Секундный такт для часов и «обновлено N с назад». */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

export interface TvRotation {
  /** Подпись следующей группы. */
  readonly nextLabel: string;
  readonly startedAt: number;
  readonly durationMs: number;
}

/* -------------------------------------------------------------------------- */
/*                                   Шапка                                    */
/* -------------------------------------------------------------------------- */

function TvHeader({
  title,
  branchName,
  lastSuccessAt,
  stale,
  rotation,
  page,
  locale,
  text,
}: {
  readonly title: string;
  readonly branchName: string | null;
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
  readonly rotation: TvRotation | null;
  readonly page: { readonly current: number; readonly total: number };
  readonly locale: Locale;
  readonly text: TvText;
}): ReactElement {
  const now = useNow();
  const offline = stale && lastSuccessAt !== null;
  const seconds = lastSuccessAt === null ? 0 : Math.max(0, Math.round((now - lastSuccessAt.getTime()) / 1000));
  const left = rotation === null ? 0 : Math.max(0, Math.ceil((rotation.startedAt + rotation.durationMs - now) / 1000));

  const live = [
    lastSuccessAt === null ? text.connecting : offline ? text.offline : text.online,
    branchName ?? text.allBranches,
    lastSuccessAt === null ? null : offline ? text.dataFrom(tvTime(lastSuccessAt)) : text.updatedAgo(seconds),
    page.total > 1 ? text.page(page.current, page.total) : null,
  ].filter((part) => part !== null);

  return (
    <header className="flex items-start gap-[2vw]">
      <div className="flex shrink-0 items-center gap-[0.8vw] self-center">
        <span className="grid h-[clamp(40px,3.4vw,104px)] w-[clamp(40px,3.4vw,104px)] place-items-center rounded-[24%] bg-accent text-[clamp(15px,1.25vw,38px)] font-extrabold text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
          DH
        </span>
        <div className="leading-tight">
          <p className="text-[clamp(12px,0.95vw,28px)] font-bold tracking-[0.25em] text-primary">DESIGN HOUSE</p>
          <p className="text-[clamp(9px,0.62vw,18px)] tracking-[0.32em] text-muted">PARDA BOZOR</p>
        </div>
      </div>
      <span aria-hidden className="w-px self-stretch bg-ink/10" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[clamp(28px,2.7vw,80px)] font-bold leading-none tracking-tight text-primary">{title}</h1>
        <p className="mt-[0.5vw] flex items-center gap-[0.5vw] text-[clamp(12px,0.9vw,26px)] text-secondary">
          <span
            aria-hidden
            className={cn(
              'h-[0.6em] w-[0.6em] shrink-0 rounded-full',
              offline ? 'bg-danger' : lastSuccessAt === null ? 'bg-muted' : 'animate-pulse bg-positive',
            )}
          />
          <span className={cn('truncate', offline && 'font-semibold text-danger')}>{live.join(' · ')}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        {rotation !== null && (
          <p className="text-[clamp(10px,0.7vw,20px)] text-muted">
            {title} · {text.nextGroup(rotation.nextLabel, left)}
          </p>
        )}
        <p className="font-bold tabular-nums leading-none tracking-tight text-primary text-[clamp(40px,4.4vw,132px)]">
          {tvTime(now)}
        </p>
        <p className="mt-[0.3vw] text-[clamp(12px,0.95vw,28px)] text-secondary">{tvDate(now, locale)}</p>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Пьедестал и плитки сводки                           */
/* -------------------------------------------------------------------------- */

const MEDAL: Readonly<Record<number, string>> = {
  1: 'bg-gradient-to-br from-[#f6d58b] to-[#c9962e] text-[#2b1d05]',
  2: 'bg-gradient-to-br from-[#eef2f4] to-[#9eaab1] text-[#1d2427]',
  3: 'bg-gradient-to-br from-[#efb58c] to-[#a8643a] text-[#2b1405]',
};
const FRAME: Readonly<Record<number, string>> = {
  1: 'border-[#e9c46a]',
  2: 'border-[#c9d3d8]',
  3: 'border-[#d9945f]',
};

function TvPodium({ board, locale, text }: { readonly board: TvBoardData; readonly locale: Locale; readonly text: TvText }): ReactElement {
  const month = Number.parseInt(board.podium.month.slice(5, 7), 10);
  const slots = Array.from({ length: MONITOR_PODIUM_SIZE }, (_, index) => board.podium.entries[index] ?? null);

  return (
    <section className="surface-card flex min-w-0 flex-1 items-center gap-[1.2vw] px-[1.3vw] py-[0.9vw]">
      <div className="w-[12vw] shrink-0">
        <span className="mb-[0.5vw] grid h-[2.6vw] w-[2.6vw] place-items-center rounded-[0.6vw] bg-gradient-to-br from-[#f6d58b] to-[#c9962e] text-[#3a2a08]">
          <Trophy aria-hidden className="h-[55%] w-[55%]" />
        </span>
        <p className="text-[clamp(16px,1.35vw,40px)] font-semibold leading-tight text-primary">
          {text.bestOf(monthName(month, locale).toLowerCase())}
        </p>
        <p className="mt-[0.2vw] text-[clamp(10px,0.7vw,20px)] text-muted">{text.byVolume[board.unit]}</p>
      </div>
      <ol className="grid min-w-0 flex-1 grid-cols-5 gap-[0.7vw]">
        {slots.map((entry, index) => {
          const place = index + 1;
          return (
            <li
              key={place}
              className={cn(
                'flex min-w-0 items-center gap-[0.7vw] rounded-[0.9vw] border px-[0.8vw] py-[0.6vw]',
                place === 1
                  ? 'border-[#f6d58b]/35 bg-gradient-to-b from-[#f6d58b]/[0.14] to-[#f6d58b]/[0.03]'
                  : 'border-ink/[0.07] bg-ink/[0.035]',
                entry === null && 'border-dashed opacity-50',
              )}
            >
              <div className="relative w-[3.6vw] shrink-0">
                {place === 1 && entry !== null && (
                  <Crown
                    aria-hidden
                    className="absolute -top-[0.9vw] left-1/2 z-10 h-[1.2vw] w-[1.2vw] -translate-x-1/2 fill-[#f2c94c] text-[#b8860b]"
                  />
                )}
                {entry === null ? (
                  <div className="aspect-[4/4.4] w-full rounded-b-[0.5vw] rounded-t-full border-2 border-dashed border-ink/15" />
                ) : (
                  <PersonPhoto
                    name={entry.fullName}
                    photoUrl={entry.photoUrl}
                    variant="podium"
                    noPhotoLabel={text.noPhoto}
                    className={cn(
                      'aspect-[4/4.4] w-full rounded-b-[0.5vw] rounded-t-full border-2 text-[0.6vw]',
                      FRAME[place] ?? 'border-ink/15',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'absolute -bottom-[0.55vw] left-1/2 grid h-[1.3vw] w-[1.3vw] -translate-x-1/2 place-items-center rounded-full border-2 border-panel text-[0.7vw] font-bold',
                    MEDAL[place] ?? 'bg-raised text-secondary',
                  )}
                >
                  {place.toString()}
                </span>
              </div>
              <div className="min-w-0">
                {/* Только имя: в узкой плашке «Нигора А.» обрезалась бы до «Нигора…». */}
                <p className="truncate text-[clamp(11px,0.88vw,26px)] font-semibold text-primary" title={entry?.fullName}>
                  {entry === null ? '—' : (entry.fullName.trim().split(/\s+/)[0] ?? entry.fullName)}
                </p>
                <p className="whitespace-nowrap font-bold tabular-nums leading-none text-primary">
                  <span className="text-[clamp(20px,1.9vw,56px)]">{entry === null ? '0' : formatNumber(entry.value, 0)}</span>
                  <span className="ml-[0.2vw] text-[clamp(10px,0.75vw,22px)] font-medium text-secondary">
                    {text.unit[board.unit]}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tile({ icon, value, unit, label, extra }: {
  readonly icon: ReactNode;
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly extra?: ReactNode;
}): ReactElement {
  return (
    <section className="surface-card flex w-[13vw] flex-col justify-center px-[1.2vw] py-[0.9vw]">
      <span className="mb-[0.4vw] text-accent">{icon}</span>
      <p className="flex flex-wrap items-baseline gap-x-[0.4vw] font-bold tabular-nums leading-none text-primary">
        <span className="text-[clamp(26px,2.6vw,76px)]">{value}</span>
        {unit !== undefined && <span className="text-[clamp(11px,0.85vw,24px)] font-medium text-secondary">{unit}</span>}
        {extra}
      </p>
      <p className="mt-[0.4vw] text-[clamp(10px,0.8vw,22px)] text-muted">{label}</p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Карточка                                  */
/* -------------------------------------------------------------------------- */

function subtitle(person: TvPerson, group: MonitorGroupName, locale: Locale): string {
  const category = SEWER_CATEGORIES.find((value) => value === person.sewerCategory);
  if (group === MonitorGroup.WORKSHOP && category !== undefined) return SEWER_CATEGORY_LABELS[locale][category];
  return person.roles
    .filter((role) => MONITOR_GROUP_ROLES[group].includes(role))
    .map((role) => ROLE_LABELS[locale][role])
    .join(', ');
}

function pillText(person: TvPerson, locale: Locale, text: TvText): string {
  if (person.status === LiveStatus.TRIP && person.statusSince !== null) return text.tripSince(tvTime(person.statusSince));
  if (person.status === LiveStatus.BREAK && person.statusUntil !== null) return text.breakUntil(tvTime(person.statusUntil));
  return LIVE_STATUS_LABELS[locale][person.status];
}

/** Две строки под фото: что в руках сейчас — или почему ничего. */
function WorkLines({ person, locale, text }: { readonly person: TvPerson; readonly locale: Locale; readonly text: TvText }): ReactElement {
  const [work] = person.current;
  const busy = person.status === LiveStatus.WORKING || person.status === LiveStatus.TRIP;

  if (busy && work !== undefined) {
    return (
      <div className="min-w-0 space-y-[0.2em]">
        <p className="truncate text-[1em] text-secondary">
          <span className="mr-[0.4em] font-mono font-semibold text-primary">{work.orderNumber}</span>
          {work.items.text}
        </p>
        <p className={cn('truncate text-[0.9em]', work.overdue ? 'font-semibold text-danger' : 'text-muted')}>
          {[
            work.deadline === null ? null : text.deadline(formatIsoDateShort(work.deadline)),
            work.overdue ? text.overdue : null,
            work.rework ? text.rework : null,
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </p>
      </div>
    );
  }

  const line =
    person.status === LiveStatus.IDLE || person.status === LiveStatus.WORKING
      ? text.noWork
      : person.status === LiveStatus.FINISHED && person.statusSince !== null
        ? text.finishedAt(tvTime(person.statusSince))
        : pillText(person, locale, text);
  return <p className="line-clamp-2 text-[1em] text-muted">{line}</p>;
}

function TvCard({
  person,
  group,
  locale,
  text,
  fontSize,
}: {
  readonly person: TvPerson;
  readonly group: MonitorGroupName;
  readonly locale: Locale;
  readonly text: TvText;
  readonly fontSize: number;
}): ReactElement {
  const away = AWAY_STATUSES.has(person.status);
  const counts = [
    { label: text.today, value: person.counts.today },
    { label: text.week, value: person.counts.week },
    { label: text.month, value: person.counts.month },
  ];

  return (
    <article
      className="surface-card flex h-full min-h-0 flex-col overflow-hidden rounded-[1.1em]"
      style={{ fontSize: `${fontSize.toFixed(2)}px` }}
    >
      <div className="relative h-[8.4em] shrink-0">
        <PersonPhoto
          name={person.fullName}
          photoUrl={person.photoUrl}
          variant="tv"
          dimmed={away}
          noPhotoLabel={text.noPhoto}
          className="h-full w-full"
        />
        <span className="absolute left-[0.65em] top-[0.65em] grid h-[1.9em] min-w-[1.9em] place-items-center rounded-[0.6em] border border-white/20 bg-black/55 px-[0.45em] text-[1.05em] font-extrabold tabular-nums text-white backdrop-blur-md">
          {person.place.toString()}
        </span>
        <span className="absolute right-[0.65em] top-[0.65em] inline-flex h-[1.75em] max-w-[calc(100%-4em)] items-center gap-[0.4em] rounded-full bg-black/55 px-[0.75em] text-[0.85em] font-semibold text-white backdrop-blur-md">
          <span aria-hidden className={cn('h-[0.45em] w-[0.45em] shrink-0 rounded-full', STATUS_DOT[person.status])} />
          <span className="truncate">{pillText(person, locale, text)}</span>
        </span>
        <div className="absolute inset-x-0 bottom-0 px-[1em] pb-[0.55em] pt-[1.6em]">
          <p className="truncate text-[1.35em] font-bold leading-tight text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
            {shortName(person.fullName)}
          </p>
          <p className="truncate text-[0.8em] text-white/75 [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">
            {subtitle(person, group, locale)}
          </p>
        </div>
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col justify-between gap-[0.6em] px-[1em] pb-[0.75em] pt-[0.7em]', away && 'opacity-60')}>
        <WorkLines person={person} locale={locale} text={text} />
        <dl className="grid grid-cols-3 border-t border-ink/[0.08] pt-[0.5em]">
          {counts.map((cell) => (
            <div key={cell.label} className="flex flex-col-reverse items-center">
              <dt className="text-[0.75em] text-muted">{cell.label}</dt>
              <dd className="text-[2.1em] font-bold leading-none tabular-nums text-primary">{formatNumber(cell.value, 0)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Табло                                    */
/* -------------------------------------------------------------------------- */

/** Сетка без прокрутки: раскладку и масштаб считает `fitTvGrid` по размеру области. */
function TvGrid({
  people,
  group,
  locale,
  text,
  onPage,
}: {
  readonly people: readonly TvPerson[];
  readonly group: MonitorGroupName;
  readonly locale: Locale;
  readonly text: TvText;
  readonly onPage: (page: { readonly current: number; readonly total: number }) => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Зазор растёт с экраном: на 4K 16 px между карточками смотрятся щелью.
  const gap = Math.max(10, Math.round(area.width / 115));
  const fit = fitTvGrid(people.length, { width: area.width, height: area.height, gap });
  const current = Math.min(page, fit.pages - 1);

  useEffect(() => {
    if (fit.pages <= 1) return undefined;
    const timer = window.setInterval(() => {
      setPage((value) => (value + 1) % fit.pages);
    }, TV_PAGE_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [fit.pages]);

  useEffect(() => {
    onPage({ current: current + 1, total: fit.pages });
  }, [current, fit.pages, onPage]);

  const visible = people.slice(current * fit.perPage, (current + 1) * fit.perPage);

  return (
    <div ref={ref} className="min-h-0 flex-1">
      {area.width > 0 && (
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${fit.cols.toString()}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${fit.rows.toString()}, minmax(0, 1fr))`,
            gap,
          }}
        >
          {/* Внутренних id на ТВ нет — ключ по месту в списке и имени. */}
          {visible.map((person, index) => (
            <TvCard key={`${index.toString()}-${person.fullName}`} person={person} group={group} locale={locale} text={text} fontSize={16 * fit.scale} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ТВ-табло во весь экран: шапка с часами, пьедестал со сводкой, сетка
 * карточек без прокрутки. Разметка рассчитана на 1920×1080, кегли — через
 * `clamp()` от ширины экрана, а карточки — в `em` от масштаба сетки, так что
 * табло читается и на 1366, и на 4K.
 */
export function TvBoard({
  board,
  group,
  title,
  branchName,
  locale,
  lastSuccessAt,
  stale,
  rotation,
  idle,
  overlay,
  onPagesChange,
}: {
  readonly board: TvBoardData | null;
  readonly group: MonitorGroupName;
  readonly title: string;
  readonly branchName: string | null;
  readonly locale: Locale;
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
  readonly rotation: TvRotation | null;
  /** Мышь давно не двигалась — курсор спрятан. */
  readonly idle: boolean;
  /** Кнопки поверх табло (выход для руководителя). */
  readonly overlay?: ReactNode;
  /** Сколько страниц у текущей группы: смена групп ждёт, пока пролистаются все. */
  readonly onPagesChange?: (pages: number) => void;
}): ReactElement {
  const text = TV_TEXT[locale];
  const [page, setPage] = useState({ current: 1, total: 1 });

  useEffect(() => {
    onPagesChange?.(page.total);
  }, [page.total, onPagesChange]);
  const people = board === null ? [] : sortPeople(board.people, 'place');
  const delta = board?.summary.monthDeltaPercent ?? null;

  return (
    <div
      className={cn(
        'app-canvas fixed inset-0 flex flex-col gap-[1.1vw] overflow-hidden p-[clamp(12px,1.6vw,48px)]',
        idle && 'cursor-none',
      )}
    >
      {rotation !== null && (
        <span
          key={rotation.startedAt}
          aria-hidden
          className="absolute inset-x-0 top-0 z-10 h-[3px] origin-left bg-accent-bright"
          style={{ animation: `tv-progress ${rotation.durationMs.toString()}ms linear forwards` }}
        />
      )}

      <TvHeader
        title={title}
        branchName={branchName}
        lastSuccessAt={lastSuccessAt}
        stale={stale}
        rotation={rotation}
        page={page}
        locale={locale}
        text={text}
      />

      {board === null ? (
        <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-2 gap-[1vw]" aria-busy="true">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="surface-card animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-[1vw]">
            <TvPodium board={board} locale={locale} text={text} />
            <Tile
              icon={<TrendingUp aria-hidden className="h-[1.6vw] w-[1.6vw]" />}
              value={formatNumber(board.summary.monthTotal, 0)}
              unit={text.unit[board.unit]}
              label={text.monthTotal[board.unit]}
              extra={
                delta === null ? undefined : (
                  <span
                    className={cn(
                      'inline-flex items-center gap-[0.2vw] text-[clamp(11px,0.85vw,24px)] font-semibold',
                      delta >= 0 ? 'text-positive' : 'text-danger',
                    )}
                  >
                    {delta >= 0 ? <TrendingUp aria-hidden className="h-[1em] w-[1em]" /> : <TrendingDown aria-hidden className="h-[1em] w-[1em]" />}
                    {`${Math.abs(delta).toString()}%`}
                  </span>
                )
              }
            />
            <Tile
              icon={<Users aria-hidden className="h-[1.6vw] w-[1.6vw]" />}
              value={text.of(board.summary.onShift, board.summary.headcount)}
              label={text.onShift}
            />
          </div>
          {people.length === 0 ? (
            <div className="grid flex-1 place-items-center text-[clamp(18px,1.6vw,48px)] text-muted">{text.emptyGroup}</div>
          ) : (
            <TvGrid key={group} people={people} group={group} locale={locale} text={text} onPage={setPage} />
          )}
        </>
      )}

      {overlay}
    </div>
  );
}

/** Экран вместо табло: ссылка недействительна или групп на ней нет. */
export function TvMessage({ title, hint }: { readonly title: string; readonly hint: string }): ReactElement {
  return (
    <div className="app-canvas fixed inset-0 grid place-items-center p-8 text-center">
      <div className="space-y-[1vw]">
        <span aria-hidden className="mx-auto block h-px w-[4vw] bg-brass" />
        <h1 className="text-[clamp(28px,3vw,88px)] font-bold tracking-tight text-primary">{title}</h1>
        <p className="text-[clamp(16px,1.4vw,40px)] text-secondary">{hint}</p>
      </div>
    </div>
  );
}

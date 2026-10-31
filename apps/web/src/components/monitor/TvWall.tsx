'use client';

import {
  fitStatusLanes,
  formatIsoDateShort,
  isoWeekdayOf,
  LIVE_STATUS_LABELS,
  LiveStatus,
  MonitorGroup,
  monthName,
  monthNameGenitive,
  QUEUE_STATUS_LABELS,
  QueueStatus,
  shortName,
  sortPeople,
  WALL_LANE_LABELS,
  WALL_LANES,
  WALL_TILE_RATIO,
  wallLaneOf,
  weekdayName,
  WORKSHOP_TIME_ZONE,
  workshopToday,
  type Locale,
  type MonitorGroup as MonitorGroupName,
  type QueueStatus as QueueStatusName,
  type WallLane,
} from '@curtain-crm/shared';
import { Crown, PackageCheck, Ruler, Scissors, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

import { PersonPhoto } from './PersonPhoto';
import { TV_TEXT, type TvText } from './tvLabels';

/**
 * ТВ «всё сразу».
 *
 * Заказчик (переписка 25.10): «все должны быть видны: швеи по статусам,
 * установщики по статусам; справа — контроль качества, очередь с
 * исполнителями; рядом — очередь на карнизы: номер заказа, исполнитель,
 * статус». Ротации групп и листания нет: экран один, и на нём весь цех.
 *
 * Разметка рассчитана на 1920×1080 и читается с нескольких метров: кегли —
 * через `clamp()` от ширины экрана, плитки людей — по `fitStatusLanes`, в
 * `em` от размера плитки, так что экран держится и на 1366, и на 4K.
 */

/** Снимок группы: и `display.board` по ссылке, и `monitor.board` руководителя. */
export type TvBoardData = Omit<RouterOutputs['display']['board'], 'link'>;
type TvPerson = TvBoardData['people'][number];
type TvQueueItem = NonNullable<RouterOutputs['display']['queues']['qc']>[number];

export interface TvWallQueues {
  /** `null` — очередь на этом экране не показывается (группа выключена). */
  readonly qc: readonly TvQueueItem[] | null;
  readonly cornice: readonly TvQueueItem[] | null;
}

export interface TvWallGroup {
  readonly group: MonitorGroupName;
  /** `null` — снимок ещё грузится. */
  readonly board: TvBoardData | null;
}

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

/** Секундный такт для часов, «обновлено N с назад» и «ждёт 40 мин». */
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

/** Размер области: раскладку плиток и длину очередей считает экран сам. */
function useSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, size];
}

/* -------------------------------------------------------------------------- */
/*                                 Цвета полос                                */
/* -------------------------------------------------------------------------- */

/** Цвет полосы — цвет статуса, как на табло в панели: выезд — цветом этапа «Установка». */
const LANE_STYLE: Readonly<Record<WallLane, { dot: string; text: string; ring: string; tint: string }>> = {
  working: {
    dot: 'bg-positive',
    text: 'text-positive',
    ring: 'wall-breathe animate-[wall-breathe_3.2s_ease-in-out_infinite]',
    tint: 'from-positive/[0.16]',
  },
  trip: {
    dot: 'bg-stage-installation',
    text: 'text-stage-installation',
    ring: 'shadow-[inset_0_0_0_2px_rgb(var(--stage-installation)/0.85),0_0_1em_-0.2em_rgb(var(--stage-installation)/0.5)]',
    tint: 'from-stage-installation/[0.16]',
  },
  break: {
    dot: 'bg-warning',
    text: 'text-warning',
    ring: 'shadow-[inset_0_0_0_2px_rgb(var(--warning)/0.85),0_0_1em_-0.2em_rgb(var(--warning)/0.45)]',
    tint: 'from-warning/[0.14]',
  },
  idle: {
    dot: 'bg-info',
    text: 'text-info',
    ring: 'shadow-[inset_0_0_0_2px_rgb(var(--info)/0.7)]',
    tint: 'from-info/[0.12]',
  },
  off: {
    dot: 'bg-muted',
    text: 'text-muted',
    ring: 'shadow-[inset_0_0_0_1px_rgb(var(--border-subtle)/1)]',
    tint: 'from-ink/[0.05]',
  },
};

const QUEUE_STYLE: Readonly<Record<QueueStatusName, string>> = {
  [QueueStatus.SEWN]: 'border-stage-sewing/40 bg-stage-sewing/15 text-stage-sewing',
  [QueueStatus.CHECKING]: 'border-stage-qc/40 bg-stage-qc/15 text-stage-qc',
  [QueueStatus.FAILED]: 'border-danger/40 bg-danger/15 text-danger',
  [QueueStatus.WAITING]: 'border-warning/40 bg-warning/15 text-warning',
  [QueueStatus.TAKEN]: 'border-positive/40 bg-positive/15 text-positive',
};

/* -------------------------------------------------------------------------- */
/*                                   Шапка                                    */
/* -------------------------------------------------------------------------- */

function Stat({ value, unit, label, accent }: {
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly accent?: string;
}): ReactElement {
  return (
    <div className="min-w-0 border-l border-ink/10 pl-[1vw]">
      <p className="whitespace-nowrap font-bold tabular-nums leading-none text-primary">
        <span className={cn('text-[clamp(22px,2.1vw,64px)]', accent)}>{value}</span>
        {unit !== undefined && <span className="ml-[0.3vw] text-[clamp(11px,0.85vw,24px)] font-medium text-secondary">{unit}</span>}
      </p>
      <p className="mt-[0.35vw] truncate text-[clamp(10px,0.75vw,22px)] text-muted">{label}</p>
    </div>
  );
}

function WallHeader({
  groups,
  queues,
  branchName,
  lastSuccessAt,
  stale,
  locale,
  text,
}: {
  readonly groups: readonly TvWallGroup[];
  readonly queues: TvWallQueues | null;
  readonly branchName: string | null;
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
  readonly locale: Locale;
  readonly text: TvText;
}): ReactElement {
  const now = useNow();
  const offline = stale && lastSuccessAt !== null;
  const seconds = lastSuccessAt === null ? 0 : Math.max(0, Math.round((now - lastSuccessAt.getTime()) / 1000));
  const live = [
    lastSuccessAt === null ? text.connecting : offline ? text.offline : text.online,
    branchName ?? text.allBranches,
    lastSuccessAt === null ? null : offline ? text.dataFrom(tvTime(lastSuccessAt)) : text.updatedAgo(seconds),
  ].filter((part) => part !== null);

  const boards = groups.map((entry) => entry.board).filter((board): board is TvBoardData => board !== null);
  const onShift = boards.reduce((sum, board) => sum + board.summary.onShift, 0);
  const headcount = boards.reduce((sum, board) => sum + board.summary.headcount, 0);
  const workshop = groups.find((entry) => entry.group === MonitorGroup.WORKSHOP)?.board ?? null;
  const installation = groups.find((entry) => entry.group === MonitorGroup.INSTALLATION)?.board ?? null;

  return (
    <header className="flex items-center gap-[1.6vw]">
      <div className="flex shrink-0 items-center gap-[0.8vw]">
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
        <h1 className="truncate text-[clamp(26px,2.4vw,72px)] font-bold leading-none tracking-tight text-primary">{text.wallTitle}</h1>
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
      <div className="hidden shrink-0 items-center gap-[1vw] lg:flex">
        {boards.length > 0 && <Stat value={text.of(onShift, headcount)} label={text.onShift} accent="text-positive" />}
        {workshop !== null && (
          <Stat value={formatNumber(workshop.summary.monthTotal, 0)} unit={text.unit[workshop.unit]} label={text.sewnMonth} />
        )}
        {installation !== null && (
          <Stat value={formatNumber(installation.summary.monthTotal, 0)} unit={text.unit[installation.unit]} label={text.installedMonth} />
        )}
        {queues?.qc != null && <Stat value={queues.qc.length.toString()} label={text.qcTitle} />}
        {queues?.cornice != null && <Stat value={queues.cornice.length.toString()} label={text.corniceTitle} />}
      </div>
      <span aria-hidden className="w-px self-stretch bg-ink/10" />
      <div className="shrink-0 text-right">
        <p className="text-[clamp(40px,4.2vw,128px)] font-bold tabular-nums leading-none tracking-tight text-primary">{tvTime(now)}</p>
        <p className="mt-[0.3vw] text-[clamp(12px,0.95vw,28px)] text-secondary">{tvDate(now, locale)}</p>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Плитка                                   */
/* -------------------------------------------------------------------------- */

/** Строка под именем: что в руках, до какого времени перерыв, или почему никого. */
function tileLine(person: TvPerson, lane: WallLane, group: MonitorGroupName, locale: Locale, text: TvText): ReactNode {
  const [work] = person.current;
  if ((lane === 'working' || lane === 'trip') && work !== undefined) {
    return (
      <>
        <span className="font-mono font-semibold text-primary">{work.orderNumber}</span>
        <span className="ml-[0.4em]">{work.items.text}</span>
      </>
    );
  }
  if (lane === 'trip' && person.statusSince !== null) return text.tripSince(tvTime(person.statusSince));
  if (lane === 'break' && person.statusUntil !== null) return text.breakUntil(tvTime(person.statusUntil));
  if (lane === 'idle') {
    return group === MonitorGroup.WORKSHOP && person.workstation !== null ? text.workstation(person.workstation) : text.noWork;
  }
  if (person.status === LiveStatus.FINISHED && person.statusSince !== null) return text.finishedAt(tvTime(person.statusSince));
  return LIVE_STATUS_LABELS[locale][person.status];
}

function WallTile({
  person,
  lane,
  group,
  unit,
  size,
  locale,
  text,
}: {
  readonly person: TvPerson;
  readonly lane: WallLane;
  readonly group: MonitorGroupName;
  readonly unit: TvBoardData['unit'];
  readonly size: number;
  readonly locale: Locale;
  readonly text: TvText;
}): ReactElement {
  const style = LANE_STYLE[lane];
  const off = lane === 'off';
  const [work] = person.current;

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[0.9em] border border-ink/[0.06] bg-panel"
      style={{ width: size, height: size * WALL_TILE_RATIO, fontSize: Math.max(9, size * 0.078) }}
    >
      <div className="relative min-h-0 flex-1">
        <PersonPhoto
          name={person.fullName}
          photoUrl={person.photoUrl}
          variant="tv"
          dimmed={off}
          noPhotoLabel={text.noPhoto}
          className="h-full w-full"
        />
        <span
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent to-45%', style.tint)}
        />
        <span className="absolute right-[0.5em] top-[0.5em] rounded-full bg-black/55 px-[0.55em] py-[0.15em] text-[0.82em] font-bold tabular-nums text-white backdrop-blur-md">
          {formatNumber(person.counts.month, 0)}
          <span className="ml-[0.25em] font-medium text-white/70">{text.unit[unit]}</span>
        </span>
        {work?.overdue === true && (lane === 'working' || lane === 'trip') && (
          <span className="absolute left-[0.5em] top-[0.5em] rounded-full bg-danger px-[0.55em] py-[0.15em] text-[0.75em] font-bold text-white">
            {text.overdue}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 px-[0.6em] pb-[0.35em] pt-[1.4em]">
          <p className="truncate text-[1.18em] font-bold leading-tight text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.7)]">
            {shortName(person.fullName)}
          </p>
        </div>
      </div>
      <p className={cn('truncate px-[0.6em] py-[0.45em] text-[0.88em]', off ? 'text-muted' : 'text-secondary')}>
        {tileLine(person, lane, group, locale, text)}
      </p>
      <span aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-[0.9em]', style.ring)} />
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Панель группы                                */
/* -------------------------------------------------------------------------- */

/** Полосы группы: у цеха выездов нет — полосы «На выезде» у швей не бывает. */
const GROUP_LANES: Readonly<Record<MonitorGroupName, readonly WallLane[]>> = {
  [MonitorGroup.WORKSHOP]: WALL_LANES.filter((lane) => lane !== 'trip'),
  [MonitorGroup.INSTALLATION]: WALL_LANES,
};

const GROUP_ICON: Readonly<Record<MonitorGroupName, ReactElement>> = {
  [MonitorGroup.WORKSHOP]: <Scissors aria-hidden className="h-[1em] w-[1em]" />,
  [MonitorGroup.INSTALLATION]: <Truck aria-hidden className="h-[1em] w-[1em]" />,
};

function GroupPanel({ entry, locale, text }: { readonly entry: TvWallGroup; readonly locale: Locale; readonly text: TvText }): ReactElement {
  const [ref, area] = useSize();
  const { board, group } = entry;
  const lanes = GROUP_LANES[group];
  const people = board === null ? [] : sortPeople(board.people, 'place');
  const byLane = lanes.map((lane) => people.filter((person) => wallLaneOf(person.status) === lane));

  const gap = Math.max(6, Math.round(area.width / 160));
  const laneGap = gap * 3;
  const laneHeader = Math.max(22, Math.round(area.width / 48));
  const fit = fitStatusLanes(
    byLane.map((list) => list.length),
    { width: area.width, height: area.height, gap, laneGap, laneHeader },
  );

  return (
    <section className="surface-card flex min-h-0 flex-1 flex-col px-[1.1vw] pb-[0.9vw] pt-[0.8vw]">
      <header className="mb-[0.6vw] flex items-baseline gap-[0.8vw]">
        <h2 className="flex items-center gap-[0.5vw] text-[clamp(16px,1.35vw,40px)] font-bold text-primary">
          <span className="text-accent">{GROUP_ICON[group]}</span>
          {text.groupTitle[group]}
        </h2>
        {board !== null && (
          <span className="text-[clamp(11px,0.85vw,24px)] text-secondary">
            {text.onShift} {text.of(board.summary.onShift, board.summary.headcount)}
          </span>
        )}
      </header>
      <div ref={ref} className="min-h-0 flex-1">
        {board === null ? (
          <div className="h-full animate-pulse rounded-[0.8vw] bg-ink/[0.04]" aria-busy="true" />
        ) : people.length === 0 ? (
          <p className="grid h-full place-items-center text-[clamp(14px,1.2vw,36px)] text-muted">{text.emptyGroup}</p>
        ) : (
          area.width > 0 && (
            <div className="flex h-full items-start" style={{ gap: laneGap }}>
              {lanes.map((lane, index) => {
                const list = byLane[index] ?? [];
                const cols = fit.cols[index] ?? 0;
                if (list.length === 0 || cols === 0) return null;
                const style = LANE_STYLE[lane];
                return (
                  <div key={lane} className="min-w-0 shrink-0" style={{ width: cols * fit.tile + (cols - 1) * gap }}>
                    <div className="flex items-center gap-[0.45em]" style={{ height: laneHeader, fontSize: laneHeader * 0.5 }}>
                      <span aria-hidden className={cn('h-[0.65em] w-[0.65em] shrink-0 rounded-full', style.dot)} />
                      <span className={cn('truncate font-semibold uppercase tracking-[0.08em]', style.text)}>
                        {WALL_LANE_LABELS[locale][lane]}
                      </span>
                      <span className="ml-auto rounded-full bg-ink/[0.06] px-[0.5em] font-bold tabular-nums text-primary">
                        {list.length.toString()}
                      </span>
                    </div>
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `repeat(${cols.toString()}, ${fit.tile.toString()}px)`, gap }}
                    >
                      {/* Внутренних id на ТВ нет — ключ по имени и месту. */}
                      {list.map((person, place) => (
                        <WallTile
                          key={`${person.fullName}-${place.toString()}`}
                          person={person}
                          lane={lane}
                          group={group}
                          unit={board.unit}
                          size={fit.tile}
                          locale={locale}
                          text={text}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Лучшие и очереди                               */
/* -------------------------------------------------------------------------- */

const MEDAL: Readonly<Record<number, string>> = {
  1: 'bg-gradient-to-br from-[#f6d58b] to-[#c9962e] text-[#2b1d05]',
  2: 'bg-gradient-to-br from-[#eef2f4] to-[#9eaab1] text-[#1d2427]',
  3: 'bg-gradient-to-br from-[#efb58c] to-[#a8643a] text-[#2b1405]',
};

function Leaders({ board, locale, text }: { readonly board: TvBoardData; readonly locale: Locale; readonly text: TvText }): ReactElement | null {
  const entries = board.podium.entries.slice(0, 3);
  if (entries.length === 0) return null;
  const month = Number.parseInt(board.podium.month.slice(5, 7), 10);

  return (
    <section className="surface-card px-[1vw] py-[0.8vw]">
      <h2 className="mb-[0.6vw] flex items-center gap-[0.4vw] text-[clamp(12px,0.95vw,28px)] font-semibold text-primary">
        <Crown aria-hidden className="h-[1.1em] w-[1.1em] fill-[#f2c94c] text-[#b8860b]" />
        {text.leaders(monthName(month, locale).toLowerCase())}
      </h2>
      <ol className="grid grid-cols-3 gap-[0.6vw]">
        {entries.map((entry, index) => {
          const place = index + 1;
          return (
            <li key={`${entry.fullName}-${place.toString()}`} className="min-w-0 text-center">
              <div className="relative mx-auto w-[62%]">
                <PersonPhoto
                  name={entry.fullName}
                  photoUrl={entry.photoUrl}
                  variant="podium"
                  noPhotoLabel={text.noPhoto}
                  className={cn(
                    'aspect-square w-full rounded-full border-2 text-[0.7vw]',
                    place === 1 ? 'border-[#e9c46a]' : place === 2 ? 'border-[#c9d3d8]' : 'border-[#d9945f]',
                  )}
                />
                <span
                  className={cn(
                    'absolute -bottom-[0.3vw] left-1/2 grid h-[1.3vw] w-[1.3vw] -translate-x-1/2 place-items-center rounded-full border-2 border-panel text-[0.7vw] font-bold',
                    MEDAL[place],
                  )}
                >
                  {place.toString()}
                </span>
              </div>
              <p className="mt-[0.5vw] truncate text-[clamp(10px,0.8vw,24px)] font-semibold text-primary">
                {entry.fullName.trim().split(/\s+/)[0] ?? entry.fullName}
              </p>
              <p className="font-bold tabular-nums text-primary">
                <span className="text-[clamp(14px,1.25vw,36px)]">{formatNumber(entry.value, 0)}</span>
                <span className="ml-[0.2vw] text-[clamp(9px,0.65vw,18px)] font-medium text-secondary">{text.unit[board.unit]}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function QueueRow({ item, now, locale, text }: {
  readonly item: TvQueueItem;
  readonly now: number;
  readonly locale: Locale;
  readonly text: TvText;
}): ReactElement {
  const minutes = item.since === null ? null : Math.max(0, Math.floor((now - new Date(item.since).getTime()) / 60_000));
  const timing =
    minutes === null
      ? item.deadline === null
        ? null
        : text.deadline(formatIsoDateShort(item.deadline))
      : item.status === QueueStatus.TAKEN
        ? text.inWork(text.duration(minutes))
        : text.waiting(text.duration(minutes));

  return (
    <li className="flex items-center gap-[0.8em] border-t border-ink/[0.07] py-[0.55em] first:border-t-0">
      <div className="flex shrink-0 -space-x-[0.6em]">
        {item.performers.length === 0 ? (
          <span className="grid h-[2.6em] w-[2.6em] place-items-center rounded-full border border-dashed border-ink/25 text-[0.8em] text-muted">
            ?
          </span>
        ) : (
          item.performers.slice(0, 2).map((person) => (
            <PersonPhoto
              key={person.name}
              name={person.name}
              photoUrl={person.photoUrl}
              variant="podium"
              noPhotoLabel={text.noPhoto}
              className="h-[2.6em] w-[2.6em] rounded-full border-2 border-panel text-[0.75em]"
            />
          ))
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-[0.6em]">
          <span className="font-mono text-[1.2em] font-bold tracking-tight text-primary">{item.orderNumber}</span>
          <span className={cn('truncate rounded-full border px-[0.6em] py-[0.05em] text-[0.78em] font-semibold', QUEUE_STYLE[item.status])}>
            {QUEUE_STATUS_LABELS[locale][item.status]}
          </span>
        </p>
        <p className="mt-[0.1em] truncate text-[0.88em] text-secondary">
          {item.performers.length === 0 ? text.noPerformer : item.performers.map((person) => shortName(person.name)).join(', ')}
        </p>
      </div>
      <div className="shrink-0 text-right text-[0.82em]">
        {timing !== null && <p className="tabular-nums text-muted">{timing}</p>}
        {item.overdue && <p className="font-semibold text-danger">{text.overdue}</p>}
      </div>
    </li>
  );
}

function QueueCard({ title, icon, items, locale, text }: {
  readonly title: string;
  readonly icon: ReactElement;
  readonly items: readonly TvQueueItem[] | null;
  readonly locale: Locale;
  readonly text: TvText;
}): ReactElement {
  const now = useNow();
  const [ref, area] = useSize();
  // Кегль от ширины колонки: строка очереди — номер, исполнитель, время.
  const fontSize = Math.max(11, Math.min(22, area.width / 30));
  const rowHeight = fontSize * 3.45;
  const fits = Math.max(1, Math.floor(area.height / rowHeight));
  const list = items ?? [];
  const visible = list.length > fits ? list.slice(0, fits - 1) : list;
  const hidden = list.length - visible.length;

  return (
    <section className="surface-card flex min-h-0 flex-1 flex-col px-[1vw] pb-[0.6vw] pt-[0.8vw]">
      <h2 className="mb-[0.3vw] flex items-center gap-[0.5vw] text-[clamp(13px,1.05vw,32px)] font-bold text-primary">
        <span className="text-accent">{icon}</span>
        {title}
        <span className="ml-auto rounded-full bg-ink/[0.07] px-[0.6em] text-[0.85em] tabular-nums">{list.length.toString()}</span>
      </h2>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden" style={{ fontSize }}>
        {items === null ? (
          <div className="h-full animate-pulse rounded-[0.6vw] bg-ink/[0.04]" aria-busy="true" />
        ) : list.length === 0 ? (
          <p className="flex h-full items-center justify-center gap-[0.5em] text-muted">
            <PackageCheck aria-hidden className="h-[1.2em] w-[1.2em]" />
            {text.queueEmpty}
          </p>
        ) : (
          <ul>
            {visible.map((item) => (
              <QueueRow key={item.orderNumber} item={item} now={now} locale={locale} text={text} />
            ))}
            {hidden > 0 && <li className="pt-[0.4em] text-center text-[0.85em] text-muted">{text.more(hidden)}</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Экран                                    */
/* -------------------------------------------------------------------------- */

export function TvWall({
  groups,
  queues,
  branchName,
  locale,
  lastSuccessAt,
  stale,
  idle,
  overlay,
}: {
  /** Группы этого экрана: выключенной в ссылке здесь нет вовсе. */
  readonly groups: readonly TvWallGroup[];
  /** `null` — очереди ещё грузятся. */
  readonly queues: TvWallQueues | null;
  readonly branchName: string | null;
  readonly locale: Locale;
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
  /** Мышь давно не двигалась — курсор спрятан. */
  readonly idle: boolean;
  /** Кнопки поверх экрана (выход для руководителя). */
  readonly overlay?: ReactNode;
}): ReactElement {
  const text = TV_TEXT[locale];
  const workshop = groups.find((entry) => entry.group === MonitorGroup.WORKSHOP) ?? null;
  const installation = groups.find((entry) => entry.group === MonitorGroup.INSTALLATION) ?? null;
  const showQc = workshop !== null;
  const showCornice = installation !== null;

  // Высота панели — по числу людей, но не меньше трети: пустая группа не сжимается в щель.
  const total = groups.reduce((sum, entry) => sum + (entry.board?.people.length ?? 1), 0);
  const weight = (entry: TvWallGroup): number => Math.max(entry.board?.people.length ?? 1, total * 0.36);

  return (
    <div
      className={cn(
        'app-canvas fixed inset-0 flex flex-col gap-[1vw] overflow-hidden p-[clamp(12px,1.4vw,44px)]',
        idle && 'cursor-none',
      )}
    >
      <WallHeader
        groups={groups}
        queues={queues}
        branchName={branchName}
        lastSuccessAt={lastSuccessAt}
        stale={stale}
        locale={locale}
        text={text}
      />

      <div className="flex min-h-0 flex-1 gap-[1vw]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[1vw]">
          {groups.map((entry) => (
            <div key={entry.group} className="flex min-h-0 flex-col" style={{ flexGrow: weight(entry), flexBasis: 0 }}>
              <GroupPanel entry={entry} locale={locale} text={text} />
            </div>
          ))}
        </div>

        {(showQc || showCornice) && (
          <aside className="flex min-h-0 w-[clamp(300px,26vw,960px)] shrink-0 flex-col gap-[1vw]">
            {workshop?.board != null && <Leaders board={workshop.board} locale={locale} text={text} />}
            {showQc && (
              <QueueCard
                title={text.qcTitle}
                icon={<ShieldCheck aria-hidden className="h-[1em] w-[1em]" />}
                items={queues === null ? null : queues.qc}
                locale={locale}
                text={text}
              />
            )}
            {showCornice && (
              <QueueCard
                title={text.corniceTitle}
                icon={<Ruler aria-hidden className="h-[1em] w-[1em]" />}
                items={queues === null ? null : queues.cornice}
                locale={locale}
                text={text}
              />
            )}
          </aside>
        )}
      </div>

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

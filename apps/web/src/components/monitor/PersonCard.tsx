'use client';

import {
  formatElapsed,
  formatIsoDateShort,
  formatTenure,
  formatTime,
  LiveStatus,
  MONITOR_GROUP_ROLES,
  MonitorGroup,
  ROLE_LABELS_RU,
  SEWER_CATEGORIES,
  SEWER_CATEGORY_LABELS_RU,
  type LiveStatus as LiveStatusName,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';
import {
  AlertCircle,
  Ban,
  Clock,
  Coffee,
  DoorOpen,
  Inbox,
  MapPin,
  Sun,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn, formatNumber } from '@/lib/utils';

import { AWAY_STATUSES, STATUS_DOT, statusLabel, type BoardPerson, type BoardUnit, type BoardWork } from './labels';
import { PersonPhoto } from './PersonPhoto';
import { PlanBar } from './PlanBar';

/**
 * Подпись под именем: у швеи — «Машинка №3 · 2-я категория» (по машинке её
 * ищут в цехе), без машинки — категория и стаж; у выездных — роли и стаж.
 */
function subtitle(person: BoardPerson, group: MonitorGroupName, now: Date): string {
  const category = SEWER_CATEGORIES.find((value) => value === person.sewerCategory);
  const primary =
    group === MonitorGroup.WORKSHOP && category !== undefined
      ? SEWER_CATEGORY_LABELS_RU[category]
      : person.roles
          .filter((role) => MONITOR_GROUP_ROLES[group].includes(role))
          .map((role) => ROLE_LABELS_RU[role])
          .join(', ');
  if (person.workstation !== null) return `Машинка №${person.workstation.toString()} · ${primary}`;
  return person.hiredAt === null ? primary : `${primary} · стаж ${formatTenure(person.hiredAt, now)}`;
}

/** Текст плашки статуса поверх фото: у выезда и отлучки — со временем. */
export function statusPillText(
  person: Pick<BoardPerson, 'status' | 'statusSince' | 'statusUntil'>,
): string {
  if (person.status === LiveStatus.TRIP && person.statusSince !== null) {
    return `На выезде с ${formatTime(person.statusSince)}`;
  }
  if (person.status === LiveStatus.BREAK && person.statusUntil !== null) {
    return `Отлучка до ${formatTime(person.statusUntil)}`;
  }
  return statusLabel(person.status);
}

/** Текущий заказ: номер, состав, адрес у выездных, срок и сколько уже в работе. */
function WorkInfo({
  work,
  more,
  group,
  status,
  tripSince,
  now,
}: {
  readonly work: BoardWork;
  readonly more: number;
  readonly group: MonitorGroupName;
  readonly status: LiveStatusName;
  /** Начало выезда: на объекте время идёт от него, а не от смены статуса заказа. */
  readonly tripSince: Date | null;
  readonly now: Date;
}): ReactElement {
  const { items } = work;
  const volume =
    group === MonitorGroup.WORKSHOP && items.pieces > 0
      ? ` · ${items.pieces.toString()} шт${items.areaM2 > 0 ? ` · ${formatNumber(items.areaM2)} м²` : ''}`
      : '';
  const elapsed =
    status === LiveStatus.TRIP && tripSince !== null
      ? `на объекте ${formatElapsed(now.getTime() - tripSince.getTime())}`
      : work.since === null
        ? null
        : `в работе ${formatElapsed(now.getTime() - work.since.getTime())}`;
  const deadline = work.deadline === null ? null : `срок ${formatIsoDateShort(work.deadline)}`;

  return (
    <div className="flex min-h-[84px] flex-col gap-1 rounded-[14px] border border-ink/[0.06] bg-ink/[0.045] px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-1.5 font-mono text-caption font-medium text-primary">
        {work.orderNumber}
        {work.rework && (
          <span className="rounded-md bg-danger/[0.12] px-1.5 font-sans text-overline font-semibold normal-case tracking-normal text-danger">
            переделка
          </span>
        )}
        {more > 0 && <span className="font-sans text-footnote font-normal text-muted">и ещё {more.toString()}</span>}
      </p>
      <p className="line-clamp-2 text-caption text-secondary">
        {items.text === '' ? 'Состав не указан' : items.text}
        {volume}
      </p>
      {work.address !== null && group === MonitorGroup.INSTALLATION && (
        <p className="flex items-start gap-1 text-footnote text-muted">
          <MapPin aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{work.address}</span>
        </p>
      )}
      {(deadline !== null || elapsed !== null) && (
        <p className={cn('flex items-start gap-1 text-footnote', work.overdue ? 'text-danger' : 'text-muted')}>
          {work.overdue ? (
            <AlertCircle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <Clock aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>
            {[deadline, elapsed, work.overdue ? 'просрочен' : null].filter((part) => part !== null).join(' · ')}
          </span>
        </p>
      )}
    </div>
  );
}

/** Пустой блок работы: почему у человека сейчас нет заказа в руках. */
function StatusBlock({
  icon: Icon,
  title,
  hint,
  extra,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly hint: string | null;
  readonly extra?: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-[14px] border border-ink/[0.06] bg-ink/[0.045] px-3 py-2.5 text-center">
      <Icon aria-hidden className="h-5 w-5 text-muted" />
      <p className="text-caption font-semibold text-secondary">{title}</p>
      {hint !== null && <p className="text-footnote text-muted">{hint}</p>}
      {extra}
    </div>
  );
}

function WorkArea({
  person,
  group,
  now,
}: {
  readonly person: BoardPerson;
  readonly group: MonitorGroupName;
  readonly now: Date;
}): ReactElement {
  const [first] = person.current;
  const busy = person.status === LiveStatus.WORKING || person.status === LiveStatus.TRIP;

  if (busy && first !== undefined) {
    return (
      <WorkInfo
        work={first}
        more={person.current.length - 1}
        group={group}
        status={person.status}
        tripSince={person.status === LiveStatus.TRIP ? person.statusSince : null}
        now={now}
      />
    );
  }

  // Не на месте, но заказ за человеком числится — номер виден, чтобы его не потеряли.
  const holding =
    first === undefined ? undefined : (
      <p className="text-footnote text-muted">
        в работе <span className="font-mono">{first.orderNumber}</span>
        {person.current.length > 1 && ` и ещё ${(person.current.length - 1).toString()}`}
      </p>
    );
  const since = person.statusSince === null ? null : formatTime(person.statusSince);

  switch (person.status) {
    case LiveStatus.TRIP:
      return <StatusBlock icon={Truck} title={statusPillText(person)} hint="без заказа" />;
    case LiveStatus.BREAK:
      return (
        <StatusBlock
          icon={Coffee}
          title={statusPillText(person)}
          hint={since === null ? null : `с ${since}`}
          extra={holding}
        />
      );
    case LiveStatus.FINISHED:
      return (
        <StatusBlock icon={DoorOpen} title={since === null ? 'Смена закрыта' : `Смена закрыта в ${since}`} hint={null} extra={holding} />
      );
    case LiveStatus.DAY_OFF:
      return <StatusBlock icon={Sun} title="Выходной" hint={null} extra={holding} />;
    case LiveStatus.ABSENT:
      return <StatusBlock icon={Ban} title="Нет отметки" hint="смена сегодня не открыта" extra={holding} />;
    case LiveStatus.IDLE:
    case LiveStatus.WORKING:
      return <StatusBlock icon={Inbox} title="Без заказа" hint="нет текущего заказа" />;
  }
}

function Counts({ counts }: { readonly counts: BoardPerson['counts'] }): ReactElement {
  const cells = [
    { label: 'Сегодня', value: counts.today },
    { label: 'Неделя', value: counts.week },
    { label: 'Месяц', value: counts.month },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-ink/[0.07] rounded-xl border border-ink/[0.07]">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse items-center py-1.5">
          <dt className="text-overline normal-case tracking-normal text-muted">{cell.label}</dt>
          <dd className="text-heading font-bold tabular-nums text-primary">{formatNumber(cell.value, 0)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Очередь: две позиции и «+N», переделка — меткой. У карнизчика — общая очередь карнизов. */
function QueueLine({ person }: { readonly person: BoardPerson }): ReactElement {
  const shown = person.queue.slice(0, 2);
  const rest = person.queueTotal - shown.length;

  return (
    <div className="space-y-1 text-footnote text-muted">
      <p className="flex min-h-[22px] flex-wrap items-center gap-1.5">
        {person.queueTotal === 0 ? (
          'Очередь пуста'
        ) : (
          <>
            <span>Очередь {person.queueTotal.toString()}:</span>
            {shown.map((work) => (
              <span
                key={work.orderNumber}
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono',
                  work.rework ? 'bg-danger/[0.12] text-danger' : 'bg-ink/[0.05] text-secondary',
                )}
                title={work.rework ? 'Переделка' : undefined}
              >
                {work.orderNumber}
              </span>
            ))}
            {rest > 0 && <span>+{rest.toString()}</span>}
          </>
        )}
      </p>
      {person.cornicePool !== null && (
        <p>
          Общая очередь карнизов:{' '}
          <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-secondary">
            {person.cornicePool.toString()}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Карточка человека на табло: фото полосой сверху, на нём место за месяц и
 * статус; ниже имя, текущая работа, выработка и очередь.
 *
 * Плашки на фото — тёмное стекло с цветной точкой, а не заливка цветом
 * статуса: под ними фотография любого тона, и белый текст на тёмном стекле
 * читается на любой из них в обеих схемах.
 */
export function PersonCard({
  person,
  group,
  unit,
  now,
  onSelect,
}: {
  readonly person: BoardPerson;
  readonly group: MonitorGroupName;
  readonly unit: BoardUnit;
  /** Время снимка: длительности считаются от него, а не от часов браузера. */
  readonly now: Date;
  /** Открыть боковую панель человека. */
  readonly onSelect?: (userId: number) => void;
}): ReactElement {
  const away = AWAY_STATUSES.has(person.status);

  return (
    <article className="surface-card group/card flex flex-col overflow-hidden rounded-[20px] transition-transform duration-200 hover:-translate-y-0.5">
      {/*
        Вся карточка — одна кнопка: растянутая поверх содержимого, а не обёртка
        вокруг него. Внутри кнопки нельзя держать блоки и заголовки, а программа
        чтения экрана прочитала бы всю карточку как подпись кнопки.
      */}
      {onSelect !== undefined && (
        <button
          type="button"
          aria-label={`Открыть: ${person.fullName}`}
          onClick={() => {
            onSelect(person.userId);
          }}
          className="!absolute inset-0 z-[2] rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      )}
      <div className="relative h-[150px] shrink-0">
        <PersonPhoto
          name={person.fullName}
          photoUrl={person.photoUrl}
          variant="card"
          dimmed={away}
          className="h-full w-full"
        />
        <span className="absolute left-2.5 top-2.5 grid h-[30px] min-w-[30px] place-items-center rounded-[10px] border border-white/20 bg-black/55 px-2 text-subhead font-extrabold tabular-nums text-white backdrop-blur-md">
          <span className="sr-only">Место </span>
          {person.place.toString()}
        </span>
        <span className="absolute right-2.5 top-2.5 inline-flex h-6 max-w-[calc(100%-60px)] items-center gap-1.5 rounded-full bg-black/55 px-2.5 text-footnote font-semibold text-white backdrop-blur-md">
          <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[person.status])} />
          <span className="truncate">{statusPillText(person)}</span>
        </span>
      </div>

      <div className={cn('flex flex-1 flex-col gap-2.5 px-3.5 pb-3.5 pt-3', away && 'opacity-75')}>
        <div className="min-w-0">
          <h3 className="truncate text-subhead font-semibold text-primary" title={person.fullName}>
            {person.fullName}
          </h3>
          <p className="truncate text-footnote text-muted">{subtitle(person, group, now)}</p>
        </div>
        <WorkArea person={person} group={group} now={now} />
        <PlanBar plan={person.plan} unit={unit} done={person.counts.month} />
        <Counts counts={person.counts} />
        <QueueLine person={person} />
      </div>
    </article>
  );
}

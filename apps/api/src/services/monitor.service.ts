import type { Database } from '@curtain-crm/db';
import {
  assignPlaces,
  CorniceStatus,
  deltaPercent,
  deriveLiveStatus,
  isDayOffOn,
  LIVE_STATUSES,
  LiveStatus,
  MONITOR_GROUP_ROLES,
  MONITOR_PODIUM_SIZE,
  MONITOR_QUEUE_PREVIEW,
  MONITOR_UNIT,
  MonitorGroup,
  OrderStatus,
  Role,
  summarizeItems,
  type ItemsSummary,
  type Locale,
  type LiveStatus as LiveStatusName,
  type MonitorGroup as MonitorGroupName,
  type Role as RoleName,
} from '@curtain-crm/shared';

import {
  countPendingCornices,
  loadApprovedDaysOff,
  loadGroupPeople,
  loadOutput,
  loadPresence,
  loadTripsToday,
  loadWorkOrders,
  type GroupPersonRow,
  type OutputRow,
  type WorkOrderRow,
} from './monitor.queries';
import { workshopDay, workshopPeriodStarts } from './periods';
import { employeeRating, type RatingEntry } from './rating.service';
import { sewerCategories } from './sewerCategory.service';
import { getStorage } from './storage.service';

/* -------------------------------------------------------------------------- */
/*  Контракт табло                                                            */
/* -------------------------------------------------------------------------- */

export interface MonitorWork {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly items: ItemsSummary;
  /** `YYYY-MM-DD`. */
  readonly deadline: string | null;
  /** Когда заказ вошёл в текущий статус; у очереди — `null`. */
  readonly since: Date | null;
  /** Срок раньше сегодняшнего дня по Ташкенту. */
  readonly overdue: boolean;
  /** Вернулся с ОТК на переделку. */
  readonly rework: boolean;
  /** Только у установки. На ТВ вырезается. */
  readonly address: string | null;
}

export interface MonitorPerson {
  readonly userId: number;
  readonly fullName: string;
  /** Превью фото, если есть, иначе оригинал. */
  readonly photoUrl: string | null;
  /** Только роли этой группы. */
  readonly roles: readonly RoleName[];
  readonly hiredAt: string | null;
  /** Ручная категория швеи, иначе расчётная; у выездных `null`. */
  readonly sewerCategory: number | null;
  readonly status: LiveStatusName;
  readonly statusSince: Date | null;
  readonly statusUntil: Date | null;
  readonly current: readonly MonitorWork[];
  /** Первые `MONITOR_QUEUE_PREVIEW` заказов очереди. */
  readonly queue: readonly MonitorWork[];
  readonly queueTotal: number;
  /** Только у карнизчика: карнизы, ждущие хоть кого-то. */
  readonly cornicePool: number | null;
  readonly counts: { readonly today: number; readonly week: number; readonly month: number };
  /** Место за текущий месяц по выработке. */
  readonly place: number;
  readonly qualityPercent: number | null;
  readonly onTimePercent: number | null;
}

export interface MonitorTrip {
  readonly userId: number;
  readonly fullName: string;
  readonly startedAt: Date;
  readonly returnedAt: Date | null;
  readonly orderNumber: string | null;
  readonly address: string | null;
}

export interface MonitorPodiumEntry {
  readonly userId: number;
  readonly fullName: string;
  readonly photoUrl: string | null;
  readonly value: number;
}

export interface MonitorBoard {
  readonly group: MonitorGroupName;
  readonly unit: 'pieces' | 'orders';
  readonly generatedAt: Date;
  /** По месту, затем по имени. */
  readonly people: readonly MonitorPerson[];
  /** Топ прошлого месяца по объёму; `month` — `YYYY-MM`. */
  readonly podium: { readonly month: string; readonly entries: readonly MonitorPodiumEntry[] };
  readonly summary: {
    readonly monthTotal: number;
    /** К прошлому месяцу на ту же дату. */
    readonly monthDeltaPercent: number | null;
    readonly headcount: number;
    /** Работают, без заказа, на отлучке и на выезде. */
    readonly onShift: number;
    readonly averagePerPerson: number;
    /** Цех. */
    readonly qualityPercent: number | null;
    /** Выездные. */
    readonly onTimePercent: number | null;
  };
  readonly statusCounts: Readonly<Record<LiveStatusName, number>>;
  /** Только у выездных: выезды, начатые сегодня. */
  readonly trips: readonly MonitorTrip[] | null;
}

export interface BuildBoardParams {
  readonly group: MonitorGroupName;
  readonly branchId: number | null;
  readonly now: Date;
  readonly locale: Locale;
}

/* -------------------------------------------------------------------------- */
/*  Сборка                                                                    */
/* -------------------------------------------------------------------------- */

const ON_SHIFT: readonly LiveStatusName[] = [LiveStatus.WORKING, LiveStatus.IDLE, LiveStatus.BREAK, LiveStatus.TRIP];

/** Тот же момент в прошлом месяце, но не дальше его последнего дня. */
function sameMomentPreviousMonth(now: Date, monthStart: Date, prevMonthStart: Date): Date {
  return new Date(Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
}

const photoUrlOf = async (person: Pick<GroupPersonRow, 'avatarStorageKey' | 'avatarPreviewKey'>): Promise<string | null> => {
  const key = person.avatarPreviewKey ?? person.avatarStorageKey;
  return key === null ? null : getStorage().getUrl(key, { stableWithinHour: true });
};

/** Взвешенный по числу заказов процент по ролям группы. */
function weightedPercent(
  entries: readonly RatingEntry[],
  roles: readonly RoleName[],
  pick: 'qualityPercent' | 'punctualityPercent',
): number | null {
  let weighted = 0;
  let total = 0;
  for (const entry of entries) {
    for (const role of entry.byRole) {
      const value = role[pick];
      if (!roles.includes(role.role) || value === null || role.ordersCount === 0) continue;
      weighted += value * role.ordersCount;
      total += role.ordersCount;
    }
  }
  return total === 0 ? null : Math.round(weighted / total);
}

function personPercent(
  entry: RatingEntry | undefined,
  roles: readonly RoleName[],
  pick: 'qualityPercent' | 'punctualityPercent',
): number | null {
  return entry === undefined ? null : weightedPercent([entry], roles, pick);
}

/**
 * Категории швей и рейтинг за месяц меняются медленно, а табло спрашивает
 * снимок каждые 20 секунд с каждого экрана. Их пересчёт — до двух десятков
 * запросов, поэтому они живут в памяти процесса минуту. Экземпляр API один
 * (см. ARCHITECTURE.md), так что расхождения между экранами нет.
 */
const SLOW_PARTS_TTL_MS = 60_000;
const slowCache = new Map<string, { readonly at: number; readonly value: Promise<SlowParts> }>();

interface SlowParts {
  readonly rating: readonly RatingEntry[];
  readonly categories: ReadonlyMap<number, number>;
}

function loadSlowParts(
  db: Database,
  people: readonly GroupPersonRow[],
  group: MonitorGroupName,
  branchId: number | null,
  monthStart: Date,
  now: Date,
): Promise<SlowParts> {
  const key = `${group}:${String(branchId)}:${monthStart.toISOString()}:${people.map((p) => p.id).join(',')}`;
  const cached = slowCache.get(key);
  if (cached !== undefined && now.getTime() - cached.at < SLOW_PARTS_TTL_MS) return cached.value;

  const employees = people.map((person) => ({
    id: person.id,
    fullName: person.fullName,
    avatarStorageKey: person.avatarStorageKey,
    roles: person.roles,
  }));
  const value = (async (): Promise<SlowParts> => {
    const [rating, categories] = await Promise.all([
      employeeRating(db, employees, { start: monthStart, end: now }, branchId ?? undefined),
      group === MonitorGroup.WORKSHOP ? sewerCategories(db, employees) : Promise.resolve([]),
    ]);
    return { rating, categories: new Map(categories.map((row) => [row.userId, row.category])) };
  })();
  value.catch(() => slowCache.delete(key));
  slowCache.set(key, { at: now.getTime(), value });
  return value;
}

function toWork(row: WorkOrderRow, todayIso: string, withSince: boolean, locale: Locale): MonitorWork {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    items: summarizeItems(row.items, locale),
    deadline: row.deadline,
    since: withSince ? row.since : null,
    overdue: row.deadline !== null && row.deadline < todayIso,
    rework: row.status === OrderStatus.QC_FAILED,
    address: row.installAddress,
  };
}

/** Текущие заказы и очередь одного человека в его группе. */
function splitWork(
  personId: number,
  group: MonitorGroupName,
  rows: readonly WorkOrderRow[],
  tripOrderId: number | null,
): { current: WorkOrderRow[]; queue: WorkOrderRow[] } {
  if (group === MonitorGroup.WORKSHOP) {
    const mine = rows.filter((row) => row.sewerId === personId);
    return {
      current: mine.filter((row) => row.status === OrderStatus.SEWING_IN_PROGRESS),
      queue: mine.filter(
        (row) => row.status === OrderStatus.PENDING_SEWING_ASSIGNMENT || row.status === OrderStatus.QC_FAILED,
      ),
    };
  }

  const current = rows.filter(
    (row) =>
      (row.installerId === personId && row.status === OrderStatus.INSTALLATION_IN_PROGRESS) ||
      (row.corniceInstallerId === personId && row.corniceStatus === CorniceStatus.IN_PROGRESS),
  );
  // Заказ открытого выезда — то, где человек сейчас физически: он первым.
  const trip = tripOrderId === null ? undefined : rows.find((row) => row.id === tripOrderId);
  const withTrip = trip === undefined ? current : [trip, ...current.filter((row) => row.id !== trip.id)];
  return {
    current: withTrip,
    queue: rows.filter((row) => row.installerId === personId && row.status === OrderStatus.INSTALLATION_ASSIGNED),
  };
}

export async function buildBoard(db: Database, params: BuildBoardParams): Promise<MonitorBoard> {
  const { group, branchId, now, locale } = params;
  const roles = MONITOR_GROUP_ROLES[group];
  const starts = workshopPeriodStarts(now);
  const todayIso = workshopDay(starts.today);

  const people = await loadGroupPeople(db, roles, branchId);
  const ids = people.map((person) => person.id);

  const presence = await loadPresence(db, ids, starts.today, now);
  const tripOrderIds = [...presence.values()]
    .map((row) => row.openTrip?.orderId ?? null)
    .filter((id): id is number => id !== null);

  const [daysOff, work, output, pool, slow, tripRows, photos] = await Promise.all([
    loadApprovedDaysOff(db, ids, todayIso),
    loadWorkOrders(db, ids, tripOrderIds),
    loadOutput(
      db,
      people,
      {
        today: starts.today,
        week: starts.week,
        month: starts.month,
        prevMonth: starts.prevMonth,
        prevMonthToDate: sameMomentPreviousMonth(now, starts.month, starts.prevMonth),
      },
      branchId,
    ),
    group === MonitorGroup.INSTALLATION ? countPendingCornices(db, branchId) : Promise.resolve(0),
    loadSlowParts(db, people, group, branchId, starts.month, now),
    group === MonitorGroup.INSTALLATION ? loadTripsToday(db, ids, starts.today) : Promise.resolve(null),
    Promise.all(people.map(photoUrlOf)),
  ]);

  const ratingById = new Map(slow.rating.map((entry) => [entry.userId, entry]));
  const empty: OutputRow = { today: 0, week: 0, month: 0, prevMonth: 0, prevMonthToDate: 0 };

  const unplaced = people.map((person, index) => {
    const seen = presence.get(person.id);
    const { current, queue } = splitWork(person.id, group, work, seen?.openTrip?.orderId ?? null);
    const live = deriveLiveStatus({
      now,
      shift: seen?.shift ?? null,
      openBreak: seen?.openBreak ?? null,
      openTrip: seen?.openTrip ?? null,
      dayOff: isDayOffOn(todayIso, person.weeklyDayOff, daysOff.get(person.id) ?? []),
      hasCurrentWork: current.length > 0,
    });
    const counts = output.get(person.id) ?? empty;
    const entry = ratingById.get(person.id);

    return {
      userId: person.id,
      fullName: person.fullName,
      photoUrl: photos[index] ?? null,
      roles: person.roles,
      hiredAt: person.hiredAt,
      sewerCategory:
        group === MonitorGroup.WORKSHOP ? (person.sewerCategory ?? slow.categories.get(person.id) ?? null) : null,
      status: live.status,
      statusSince: live.since,
      statusUntil: live.until,
      current: current.map((row) => toWork(row, todayIso, true, locale)),
      queue: queue.slice(0, MONITOR_QUEUE_PREVIEW).map((row) => toWork(row, todayIso, false, locale)),
      queueTotal: queue.length,
      cornicePool: person.roles.includes(Role.CORNICE_INSTALLER) ? pool : null,
      counts: { today: counts.today, week: counts.week, month: counts.month },
      qualityPercent: personPercent(entry, person.roles, 'qualityPercent'),
      onTimePercent: personPercent(entry, person.roles, 'punctualityPercent'),
      prevMonth: counts.prevMonth,
      prevMonthToDate: counts.prevMonthToDate,
    };
  });

  const ranked = assignPlaces(
    [...unplaced].sort((a, b) => b.counts.month - a.counts.month || a.fullName.localeCompare(b.fullName, 'ru')),
    (a, b) => a.counts.month === b.counts.month,
  );

  const peopleOut: MonitorPerson[] = ranked.map(({ prevMonth: _prev, prevMonthToDate: _toDate, ...person }) => person);

  const podiumEntries = [...unplaced]
    .filter((person) => person.prevMonth > 0)
    .sort((a, b) => b.prevMonth - a.prevMonth || a.fullName.localeCompare(b.fullName, 'ru'))
    .slice(0, MONITOR_PODIUM_SIZE)
    .map((person) => ({
      userId: person.userId,
      fullName: person.fullName,
      photoUrl: person.photoUrl,
      value: person.prevMonth,
    }));

  const monthTotal = unplaced.reduce((sum, person) => sum + person.counts.month, 0);
  const prevToDate = unplaced.reduce((sum, person) => sum + person.prevMonthToDate, 0);
  const statusCounts = Object.fromEntries(
    LIVE_STATUSES.map((status) => [status, peopleOut.filter((person) => person.status === status).length]),
  ) as Record<LiveStatusName, number>;
  const nameOf = new Map(people.map((person) => [person.id, person.fullName]));

  return {
    group,
    unit: MONITOR_UNIT[group],
    generatedAt: now,
    people: peopleOut,
    podium: { month: workshopDay(starts.prevMonth).slice(0, 7), entries: podiumEntries },
    summary: {
      monthTotal,
      monthDeltaPercent: deltaPercent(monthTotal, prevToDate),
      headcount: people.length,
      onShift: peopleOut.filter((person) => ON_SHIFT.includes(person.status)).length,
      averagePerPerson: people.length === 0 ? 0 : Math.round(monthTotal / people.length),
      qualityPercent: group === MonitorGroup.WORKSHOP ? weightedPercent(slow.rating, roles, 'qualityPercent') : null,
      onTimePercent:
        group === MonitorGroup.INSTALLATION ? weightedPercent(slow.rating, roles, 'punctualityPercent') : null,
    },
    statusCounts,
    trips:
      tripRows === null
        ? null
        : tripRows.map((trip) => ({
            userId: trip.userId,
            fullName: nameOf.get(trip.userId) ?? '',
            startedAt: trip.startedAt,
            returnedAt: trip.returnedAt,
            orderNumber: trip.orderNumber,
            address: trip.address,
          })),
  };
}

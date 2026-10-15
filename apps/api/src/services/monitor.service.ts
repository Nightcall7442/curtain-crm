import type { Database } from '@curtain-crm/db';
import {
  assignPlaces,
  CorniceStatus,
  deltaPercent,
  deriveLiveStatus,
  isDayOffOn,
  isPlanRole,
  LIVE_STATUSES,
  LiveStatus,
  MONITOR_GROUP_ROLES,
  MONITOR_PODIUM_SIZE,
  MONITOR_QUEUE_PREVIEW,
  MONITOR_UNIT,
  MonitorGroup,
  OrderStatus,
  planPace,
  planPercent,
  resolveCombinedPlan,
  Role,
  summarizeItems,
  workdaysInMonth,
  type ItemsSummary,
  type Locale,
  type LiveStatus as LiveStatusName,
  type MonitorGroup as MonitorGroupName,
  type PlanPace,
  type PlanSource,
  type Role as RoleName,
  type WorkPlanRow,
} from '@curtain-crm/shared';

import {
  countPendingCornices,
  loadApprovedDaysOff,
  loadDailyOutput,
  loadGroupPeople,
  loadOutput,
  loadPresence,
  loadRecentPhotos,
  loadShiftDetail,
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
import { loadWorkPlans } from './workPlans.service';

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

/** План месяца на карточке: сумма действующих планов ролей группы у человека. */
export interface MonitorPlan {
  readonly target: number;
  /** Выработка месяца к плану, целые проценты. */
  readonly percent: number;
  readonly pace: PlanPace;
  readonly source: PlanSource;
  /** `YYYY-MM-01`, с которого план действует. */
  readonly effectiveFrom: string;
  /** Доля прошедших рабочих дней месяца, % — риска «где надо быть сегодня». */
  readonly expectedPercent: number;
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
  /** Номер машинки швеи; у выездных `null`. */
  readonly workstation: number | null;
  /** `null` — плана на этот месяц нет ни по одной роли группы. */
  readonly plan: MonitorPlan | null;
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
  /** Выработка прошлого месяца к плану прошлого месяца; плана не было — `null`. */
  readonly planPercent: number | null;
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
    /** Сумма планов месяца у тех, у кого план есть; ни у кого — `null`. */
    readonly planTotal: number | null;
    /** Их выработка месяца к этой сумме. */
    readonly planPercent: number | null;
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
  /**
   * Только превью фото, без отката на оригинал — для публичного ТВ. Оригинал
   * с телефона несёт метаданные (в том числе место съёмки) и весит мегабайты;
   * без превью ТВ покажет монограмму.
   */
  readonly previewOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Сборка                                                                    */
/* -------------------------------------------------------------------------- */

const ON_SHIFT: readonly LiveStatusName[] = [LiveStatus.WORKING, LiveStatus.IDLE, LiveStatus.BREAK, LiveStatus.TRIP];

/** Тот же момент в прошлом месяце, но не дальше его последнего дня. */
function sameMomentPreviousMonth(now: Date, monthStart: Date, prevMonthStart: Date): Date {
  return new Date(Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
}

const photoUrlOf = async (
  person: Pick<GroupPersonRow, 'avatarStorageKey' | 'avatarPreviewKey'>,
  previewOnly: boolean,
): Promise<string | null> => {
  const key = previewOnly ? person.avatarPreviewKey : (person.avatarPreviewKey ?? person.avatarStorageKey);
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

/**
 * С какого момента заказ в руках у этого человека.
 *
 * Время статуса заказа годится, только если статус — его собственная работа:
 * пошив у швеи, установка у установщика. Карниз в работе при заказе, который
 * ещё шьётся, — со взятия карниза; заказ выезда, который ещё «назначен», —
 * без времени: время выезда показывает статус человека, а выдумывать цифру
 * из чужого статуса нельзя.
 */
function workSince(row: WorkOrderRow, personId: number): Date | null {
  if (row.sewerId === personId && row.status === OrderStatus.SEWING_IN_PROGRESS) return row.since;
  if (row.installerId === personId && row.status === OrderStatus.INSTALLATION_IN_PROGRESS) return row.since;
  if (row.corniceInstallerId === personId && row.corniceStatus === CorniceStatus.IN_PROGRESS) return row.corniceSince;
  return null;
}

function toWork(row: WorkOrderRow, todayIso: string, since: Date | null, locale: Locale): MonitorWork {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    items: summarizeItems(row.items, locale),
    deadline: row.deadline,
    since,
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

/** План месяца на карточке: процент, темп по рабочим дням человека и риска. */
function monitorPlan(
  rows: readonly WorkPlanRow[],
  person: Pick<GroupPersonRow, 'id' | 'roles' | 'weeklyDayOff'>,
  done: number,
  todayIso: string,
): MonitorPlan | null {
  const month = todayIso.slice(0, 7);
  const plan = resolveCombinedPlan(rows, person.id, person.roles.filter(isPlanRole), month);
  if (plan === null) return null;
  const days = workdaysInMonth(month, person.weeklyDayOff, todayIso);
  return {
    target: plan.target,
    percent: planPercent(done, plan.target),
    pace: planPace({ done, target: plan.target, elapsed: days.elapsed, total: days.total }),
    source: plan.source,
    effectiveFrom: plan.effectiveFrom,
    expectedPercent: days.total === 0 ? 0 : Math.round((days.elapsed / days.total) * 100),
  };
}

export async function buildBoard(db: Database, params: BuildBoardParams): Promise<MonitorBoard> {
  const { group, branchId, now, locale } = params;
  const roles = MONITOR_GROUP_ROLES[group];
  const starts = workshopPeriodStarts(now);
  const todayIso = workshopDay(starts.today);
  const prevMonthKey = workshopDay(starts.prevMonth).slice(0, 7);

  const people = await loadGroupPeople(db, roles, branchId);
  const ids = people.map((person) => person.id);

  const presence = await loadPresence(db, ids, starts.today, now);
  const tripOrderIds = [...presence.values()]
    .map((row) => row.openTrip?.orderId ?? null)
    .filter((id): id is number => id !== null);

  const [daysOff, work, output, pool, slow, tripRows, photos, planRows] = await Promise.all([
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
    Promise.all(people.map((person) => photoUrlOf(person, params.previewOnly === true))),
    loadWorkPlans(db, roles.filter(isPlanRole)),
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
    const prevPlan = resolveCombinedPlan(planRows, person.id, person.roles.filter(isPlanRole), prevMonthKey);

    return {
      userId: person.id,
      fullName: person.fullName,
      photoUrl: photos[index] ?? null,
      roles: person.roles,
      hiredAt: person.hiredAt,
      sewerCategory:
        group === MonitorGroup.WORKSHOP ? (person.sewerCategory ?? slow.categories.get(person.id) ?? null) : null,
      workstation: group === MonitorGroup.WORKSHOP ? person.workstation : null,
      plan: monitorPlan(planRows, person, counts.month, todayIso),
      status: live.status,
      statusSince: live.since,
      statusUntil: live.until,
      current: current.map((row) => toWork(row, todayIso, workSince(row, person.id), locale)),
      queue: queue.slice(0, MONITOR_QUEUE_PREVIEW).map((row) => toWork(row, todayIso, null, locale)),
      queueTotal: queue.length,
      cornicePool: person.roles.includes(Role.CORNICE_INSTALLER) ? pool : null,
      counts: { today: counts.today, week: counts.week, month: counts.month },
      qualityPercent: personPercent(entry, person.roles, 'qualityPercent'),
      onTimePercent: personPercent(entry, person.roles, 'punctualityPercent'),
      prevMonth: counts.prevMonth,
      prevMonthToDate: counts.prevMonthToDate,
      prevPlanPercent: prevPlan === null ? null : planPercent(counts.prevMonth, prevPlan.target),
    };
  });

  const ranked = assignPlaces(
    [...unplaced].sort((a, b) => b.counts.month - a.counts.month || a.fullName.localeCompare(b.fullName, 'ru')),
    (a, b) => a.counts.month === b.counts.month,
  );

  const peopleOut: MonitorPerson[] = ranked.map(
    ({ prevMonth: _prev, prevMonthToDate: _toDate, prevPlanPercent: _prevPlan, ...person }) => person,
  );

  // Топ по объёму; при равном объёме выше тот, кто больше сделал к своему плану.
  const podiumEntries = [...unplaced]
    .filter((person) => person.prevMonth > 0)
    .sort(
      (a, b) =>
        b.prevMonth - a.prevMonth ||
        (b.prevPlanPercent ?? -1) - (a.prevPlanPercent ?? -1) ||
        a.fullName.localeCompare(b.fullName, 'ru'),
    )
    .slice(0, MONITOR_PODIUM_SIZE)
    .map((person) => ({
      userId: person.userId,
      fullName: person.fullName,
      photoUrl: person.photoUrl,
      value: person.prevMonth,
      planPercent: person.prevPlanPercent,
    }));

  // План цеха — только по людям с планом: выработка тех, кому план не
  // поставлен, к чужой сумме не прибавляется.
  const planned = unplaced.filter((person) => person.plan !== null);
  const planTotal = planned.length === 0 ? null : planned.reduce((sum, person) => sum + (person.plan?.target ?? 0), 0);
  const plannedDone = planned.reduce((sum, person) => sum + person.counts.month, 0);

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
      planTotal,
      planPercent: planTotal === null ? null : planPercent(plannedDone, planTotal),
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

/* -------------------------------------------------------------------------- */
/*  Карточка человека                                                         */
/* -------------------------------------------------------------------------- */

export interface MonitorPersonDetail extends MonitorPerson {
  readonly group: MonitorGroupName;
  readonly unit: 'pieces' | 'orders';
  readonly queueAll: readonly MonitorWork[];
  /** 30 дней по Ташкенту, сегодня последним; пустые дни — 0. */
  readonly daily: readonly { readonly day: string; readonly value: number }[];
  readonly shiftToday: {
    readonly startedAt: Date;
    readonly endedAt: Date | null;
    readonly breaks: readonly { startedAt: Date; returnedAt: Date | null; plannedMinutes: number }[];
    readonly trips: readonly { startedAt: Date; returnedAt: Date | null; orderNumber: string | null }[];
  } | null;
  /** У выездных — последние фото с объектов, загруженные ими; у цеха пусто. */
  readonly photos: readonly { id: number; url: string; orderNumber: string | null; createdAt: Date }[];
}

const DAILY_DAYS = 30;
const RECENT_PHOTOS = 8;

/** Группа человека на табло: швея — цех, выездные — установщики. */
export function monitorGroupOf(roles: readonly RoleName[]): MonitorGroupName | null {
  if (roles.some((role) => MONITOR_GROUP_ROLES.workshop.includes(role))) return MonitorGroup.WORKSHOP;
  if (roles.some((role) => MONITOR_GROUP_ROLES.installation.includes(role))) return MonitorGroup.INSTALLATION;
  return null;
}

/**
 * Карточка человека для боковой панели и экрана в приложении.
 *
 * Сама карточка берётся из снимка его группы с тем же фильтром филиала, что
 * у табло, с которого её открыли, — одно правило для табло и для карточки,
 * цифры не могут разойтись. 30 дней выработки — по тому же филиалу.
 */
export async function buildPerson(
  db: Database,
  params: { readonly userId: number; readonly branchId: number | null; readonly now: Date; readonly locale: Locale },
): Promise<MonitorPersonDetail | null> {
  const { userId, branchId, now, locale } = params;
  const [row] = await loadGroupPeople(db, [...MONITOR_GROUP_ROLES.workshop, ...MONITOR_GROUP_ROLES.installation], null).then(
    (rows) => rows.filter((person) => person.id === userId),
  );
  const group = row === undefined ? null : monitorGroupOf(row.roles);
  if (row === undefined || group === null) return null;

  const board = await buildBoard(db, { group, branchId, now, locale });
  const card = board.people.find((person) => person.userId === userId);
  if (card === undefined) return null;

  const starts = workshopPeriodStarts(now);
  const todayIso = workshopDay(starts.today);
  const dayMs = 24 * 60 * 60 * 1000;
  const from = new Date(starts.today.getTime() - (DAILY_DAYS - 1) * dayMs);

  const presence = await loadPresence(db, [userId], starts.today, now);
  const seen = presence.get(userId);
  const shift = seen?.shift ?? null;

  const [work, daily, shiftDetail, photoRows] = await Promise.all([
    loadWorkOrders(db, [userId], seen?.openTrip?.orderId == null ? [] : [seen.openTrip.orderId]),
    loadDailyOutput(db, userId, card.roles, from, branchId),
    shift === null ? Promise.resolve(null) : loadShiftDetail(db, shift.id),
    group === MonitorGroup.INSTALLATION ? loadRecentPhotos(db, userId, RECENT_PHOTOS) : Promise.resolve([]),
  ]);
  const { queue } = splitWork(userId, group, work, seen?.openTrip?.orderId ?? null);

  const storage = getStorage();
  const photos = await Promise.all(
    photoRows.map(async (photo) => ({
      id: photo.id,
      url: await storage.getUrl(photo.storageKey, { stableWithinHour: true }),
      orderNumber: photo.orderNumber,
      createdAt: photo.createdAt,
    })),
  );

  return {
    ...card,
    group,
    unit: board.unit,
    queueAll: queue.map((order) => toWork(order, todayIso, null, locale)),
    daily: Array.from({ length: DAILY_DAYS }, (_, index) => {
      const day = workshopDay(new Date(from.getTime() + index * dayMs));
      return { day, value: daily.get(day) ?? 0 };
    }),
    shiftToday:
      shift === null || shiftDetail === null
        ? null
        : { startedAt: shift.startedAt, endedAt: shift.endedAt, ...shiftDetail },
    photos,
  };
}

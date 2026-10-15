import { LIVE_STATUSES, type Locale, type LiveStatus } from '@curtain-crm/shared';

import type { MonitorBoard, MonitorPerson, MonitorTrip, MonitorWork } from './monitor.service';

/**
 * Табло для ТВ в цеху.
 *
 * Экран висит там, где его видят клиенты и случайные люди, а ссылка открывается
 * без входа. Поэтому из снимка руководителя здесь собирается НОВЫЙ объект —
 * поле за полем, только из разрешённого списка. Спред или `omit` пропустили бы
 * всё, что `buildBoard` начнёт отдавать завтра: адрес, клиента, телефон.
 * Новое поле на ТВ появляется только тогда, когда его впишут сюда руками.
 */

export interface DisplayWork {
  readonly orderNumber: string;
  readonly items: MonitorWork['items'];
  readonly deadline: string | null;
  readonly since: Date | null;
  readonly overdue: boolean;
  readonly rework: boolean;
}

/**
 * Человек на ТВ — только то, что экран показывает (спецификация, §3.4): имя,
 * фото, статус, роль или категория для подписи, текущий заказ, выработка и
 * место. Стажа, внутренних id, личных процентов качества и очереди здесь нет.
 */
export interface DisplayPerson
  extends Pick<
    MonitorPerson,
    | 'fullName'
    | 'photoUrl'
    | 'roles'
    | 'sewerCategory'
    | 'workstation'
    | 'plan'
    | 'status'
    | 'statusSince'
    | 'statusUntil'
    | 'counts'
    | 'place'
  > {
  readonly current: readonly DisplayWork[];
}

export interface DisplayPodiumEntry {
  readonly fullName: string;
  readonly photoUrl: string | null;
  readonly value: number;
  readonly planPercent: number | null;
}

export interface DisplayTrip {
  readonly fullName: string;
  readonly startedAt: Date;
  readonly returnedAt: Date | null;
  readonly orderNumber: string | null;
}

export interface DisplayLinkInfo {
  readonly label: string;
  readonly branchName: string | null;
  readonly showWorkshop: boolean;
  readonly showInstallation: boolean;
  readonly locale: Locale;
}

/** Расписания установок с адресами на ТВ нет: `schedule` в список не входит. */
export interface DisplayBoard extends Omit<MonitorBoard, 'people' | 'trips' | 'podium' | 'schedule'> {
  readonly people: readonly DisplayPerson[];
  readonly podium: { readonly month: string; readonly entries: readonly DisplayPodiumEntry[] };
  readonly trips: readonly DisplayTrip[] | null;
  readonly link: DisplayLinkInfo;
}

function toDisplayWork(work: MonitorWork): DisplayWork {
  return {
    orderNumber: work.orderNumber,
    items: { text: work.items.text, pieces: work.items.pieces, areaM2: work.items.areaM2 },
    deadline: work.deadline,
    since: work.since,
    overdue: work.overdue,
    rework: work.rework,
  };
}

function toDisplayPerson(person: MonitorPerson): DisplayPerson {
  return {
    fullName: person.fullName,
    photoUrl: person.photoUrl,
    roles: person.roles,
    sewerCategory: person.sewerCategory,
    workstation: person.workstation,
    plan:
      person.plan === null
        ? null
        : {
            target: person.plan.target,
            percent: person.plan.percent,
            pace: person.plan.pace,
            source: person.plan.source,
            effectiveFrom: person.plan.effectiveFrom,
            expectedPercent: person.plan.expectedPercent,
          },
    status: person.status,
    statusSince: person.statusSince,
    statusUntil: person.statusUntil,
    current: person.current.map(toDisplayWork),
    counts: { today: person.counts.today, week: person.counts.week, month: person.counts.month },
    place: person.place,
  };
}

function toDisplayTrip(trip: MonitorTrip): DisplayTrip {
  return {
    fullName: trip.fullName,
    startedAt: trip.startedAt,
    returnedAt: trip.returnedAt,
    orderNumber: trip.orderNumber,
  };
}

export function toDisplayBoard(board: MonitorBoard, link: DisplayLinkInfo): DisplayBoard {
  const { summary } = board;
  return {
    group: board.group,
    unit: board.unit,
    generatedAt: board.generatedAt,
    people: board.people.map(toDisplayPerson),
    podium: {
      month: board.podium.month,
      entries: board.podium.entries.map((entry) => ({
        fullName: entry.fullName,
        photoUrl: entry.photoUrl,
        value: entry.value,
        planPercent: entry.planPercent,
      })),
    },
    summary: {
      monthTotal: summary.monthTotal,
      monthDeltaPercent: summary.monthDeltaPercent,
      headcount: summary.headcount,
      onShift: summary.onShift,
      averagePerPerson: summary.averagePerPerson,
      qualityPercent: summary.qualityPercent,
      onTimePercent: summary.onTimePercent,
      planTotal: summary.planTotal,
      planPercent: summary.planPercent,
    },
    statusCounts: Object.fromEntries(
      LIVE_STATUSES.map((status) => [status, board.statusCounts[status]]),
    ) as Record<LiveStatus, number>,
    trips: board.trips === null ? null : board.trips.map(toDisplayTrip),
    link: {
      label: link.label,
      branchName: link.branchName,
      showWorkshop: link.showWorkshop,
      showInstallation: link.showInstallation,
      locale: link.locale,
    },
  };
}

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

export interface DisplayPerson extends Omit<MonitorPerson, 'current' | 'queue'> {
  readonly current: readonly DisplayWork[];
  readonly queue: readonly DisplayWork[];
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

export interface DisplayBoard extends Omit<MonitorBoard, 'people' | 'trips'> {
  readonly people: readonly DisplayPerson[];
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
    userId: person.userId,
    fullName: person.fullName,
    photoUrl: person.photoUrl,
    roles: person.roles,
    hiredAt: person.hiredAt,
    sewerCategory: person.sewerCategory,
    status: person.status,
    statusSince: person.statusSince,
    statusUntil: person.statusUntil,
    current: person.current.map(toDisplayWork),
    queue: person.queue.map(toDisplayWork),
    queueTotal: person.queueTotal,
    cornicePool: person.cornicePool,
    counts: { today: person.counts.today, week: person.counts.week, month: person.counts.month },
    place: person.place,
    qualityPercent: person.qualityPercent,
    onTimePercent: person.onTimePercent,
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
        userId: entry.userId,
        fullName: entry.fullName,
        photoUrl: entry.photoUrl,
        value: entry.value,
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

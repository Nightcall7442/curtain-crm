import {
  auditLog,
  dayOffRequests,
  installationTrips,
  orderItems,
  orderPhotos,
  orders,
  orderStatusHistory,
  personalBreaks,
  shifts,
  userBranches,
  userRoles,
  users,
  type Database,
} from '@curtain-crm/db';
import {
  CorniceStatus,
  DayOffStatus,
  isOrderItemKind,
  OrderItemKind,
  OrderStatus,
  Priority,
  Role,
  SHIFT_FORGOTTEN_AFTER_HOURS,
  type OrderStatus as OrderStatusName,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';

import type { AuditAction } from '../lib/constants';
import { sqlTimestamp } from './shifts.service';

/**
 * SQL табло. Каждая функция — один запрос по всем людям группы сразу:
 * снимок табло собирается из шести-восьми запросов, а не из запроса на
 * человека, и время не растёт с размером цеха.
 */

export interface GroupPersonRow {
  readonly id: number;
  readonly fullName: string;
  readonly avatarStorageKey: string | null;
  readonly avatarPreviewKey: string | null;
  readonly hiredAt: string | null;
  readonly sewerCategory: number | null;
  readonly weeklyDayOff: number | null;
  readonly workstation: number | null;
  readonly roles: readonly RoleName[];
}

/** Активные сотрудники с ролями группы; при филиале — привязанные к нему. */
export async function loadGroupPeople(
  db: Database,
  roles: readonly RoleName[],
  branchId: number | null,
): Promise<GroupPersonRow[]> {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      avatarStorageKey: users.avatarStorageKey,
      avatarPreviewKey: users.avatarPreviewKey,
      hiredAt: users.hiredAt,
      sewerCategory: users.sewerCategory,
      weeklyDayOff: users.weeklyDayOff,
      workstation: users.workstation,
      role: userRoles.role,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(users.isActive, true),
        inArray(userRoles.role, [...roles]),
        branchId === null
          ? undefined
          : sql`exists (select 1 from ${userBranches} ub where ub.user_id = ${users.id} and ub.branch_id = ${branchId})`,
      ),
    )
    .orderBy(asc(users.fullName), asc(users.id));

  // Человек с двумя ролями группы — одна строка с обеими ролями.
  const byId = new Map<number, GroupPersonRow & { roles: RoleName[] }>();
  for (const { role, ...person } of rows) {
    const existing = byId.get(person.id);
    if (existing === undefined) byId.set(person.id, { ...person, roles: [role] });
    else if (!existing.roles.includes(role)) existing.roles.push(role);
  }
  return [...byId.values()];
}

export interface PresenceRow {
  readonly shift: { readonly id: number; readonly startedAt: Date; readonly endedAt: Date | null } | null;
  readonly openBreak: { readonly startedAt: Date; readonly plannedMinutes: number } | null;
  readonly openTrip: { readonly startedAt: Date; readonly orderId: number | null } | null;
}

/**
 * Смена каждого: самая поздняя из начатых сегодня по Ташкенту или ещё
 * открытых моложе `SHIFT_FORGOTTEN_AFTER_HOURS`; к ней — открытые отлучка
 * и выезд.
 */
export async function loadPresence(
  db: Database,
  userIds: readonly number[],
  todayStart: Date,
  now: Date,
): Promise<Map<number, PresenceRow>> {
  const result = new Map<number, PresenceRow>();
  if (userIds.length === 0) return result;

  const forgottenBefore = new Date(now.getTime() - SHIFT_FORGOTTEN_AFTER_HOURS * 60 * 60 * 1000);
  const shiftRows = await db
    .select({ id: shifts.id, userId: shifts.userId, startedAt: shifts.startedAt, endedAt: shifts.endedAt })
    .from(shifts)
    .where(
      and(
        inArray(shifts.userId, [...userIds]),
        or(
          and(isNull(shifts.endedAt), gte(shifts.startedAt, forgottenBefore)),
          gte(shifts.startedAt, todayStart),
        ),
      ),
    )
    .orderBy(desc(shifts.startedAt));

  const latest = new Map<number, (typeof shiftRows)[number]>();
  for (const row of shiftRows) if (!latest.has(row.userId)) latest.set(row.userId, row);

  const openShiftIds = [...latest.values()].filter((row) => row.endedAt === null).map((row) => row.id);
  const [breaks, trips] =
    openShiftIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              shiftId: personalBreaks.shiftId,
              startedAt: personalBreaks.startedAt,
              plannedMinutes: personalBreaks.plannedMinutes,
            })
            .from(personalBreaks)
            .where(and(inArray(personalBreaks.shiftId, openShiftIds), isNull(personalBreaks.returnedAt))),
          db
            .select({
              shiftId: installationTrips.shiftId,
              startedAt: installationTrips.startedAt,
              orderId: installationTrips.orderId,
            })
            .from(installationTrips)
            .where(and(inArray(installationTrips.shiftId, openShiftIds), isNull(installationTrips.returnedAt))),
        ]);
  const breakByShift = new Map(breaks.map((row) => [row.shiftId, row]));
  const tripByShift = new Map(trips.map((row) => [row.shiftId, row]));

  for (const [userId, shift] of latest) {
    const openBreak = breakByShift.get(shift.id);
    const openTrip = tripByShift.get(shift.id);
    result.set(userId, {
      shift: { id: shift.id, startedAt: shift.startedAt, endedAt: shift.endedAt },
      openBreak:
        openBreak === undefined ? null : { startedAt: openBreak.startedAt, plannedMinutes: openBreak.plannedMinutes },
      openTrip: openTrip === undefined ? null : { startedAt: openTrip.startedAt, orderId: openTrip.orderId },
    });
  }
  return result;
}

/** Одобренные выходные, покрывающие день `dayIso`. */
export async function loadApprovedDaysOff(
  db: Database,
  userIds: readonly number[],
  dayIso: string,
): Promise<Map<number, { startDate: string; endDate: string }[]>> {
  const result = new Map<number, { startDate: string; endDate: string }[]>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({ userId: dayOffRequests.userId, startDate: dayOffRequests.startDate, endDate: dayOffRequests.endDate })
    .from(dayOffRequests)
    .where(
      and(
        inArray(dayOffRequests.userId, [...userIds]),
        eq(dayOffRequests.status, DayOffStatus.APPROVED),
        lte(dayOffRequests.startDate, dayIso),
        gte(dayOffRequests.endDate, dayIso),
      ),
    );
  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    result.set(row.userId, list);
  }
  return result;
}

export interface WorkOrderRow {
  readonly id: number;
  readonly orderNumber: string;
  readonly status: OrderStatusName;
  readonly priority: string;
  readonly deadline: string | null;
  readonly installAddress: string | null;
  /** Время установки; очередь установщика идёт по нему. */
  readonly installationAt: Date | null;
  readonly sewerId: number | null;
  readonly installerId: number | null;
  readonly corniceInstallerId: number | null;
  readonly corniceStatus: string;
  readonly items: readonly { kind: OrderItemKind; quantity: number; areaM2: number | null }[];
  /** Когда заказ вошёл в свой текущий статус. */
  readonly since: Date | null;
  /** Когда карнизчик взял карниз — из журнала действий; история статусов карниз не пишет. */
  readonly corniceSince: Date | null;
}

/** Действие «карниз взят» в журнале: имя проверяет компилятор по списку действий аудита. */
const CORNICE_TAKEN: AuditAction = 'order.cornice_taken';

/**
 * Заказы людей группы: текущие и очередь.
 *
 * Цех: в пошиве — текущие; ждут пошива или вернулись с ОТК — очередь.
 * Выездные: установка идёт или карниз взят — текущие; установщик назначен —
 * очередь. Плюс заказы открытых выездов — они текущие, даже если статус
 * заказа ещё не «установка идёт».
 */
export async function loadWorkOrders(
  db: Database,
  userIds: readonly number[],
  extraOrderIds: readonly number[],
): Promise<WorkOrderRow[]> {
  if (userIds.length === 0) return [];
  const ids = [...userIds];

  const conditions: SQL[] = [
    and(inArray(orders.sewerId, ids), inArray(orders.status, [
      OrderStatus.SEWING_IN_PROGRESS,
      OrderStatus.PENDING_SEWING_ASSIGNMENT,
      OrderStatus.QC_FAILED,
    ])) as SQL,
    and(inArray(orders.installerId, ids), inArray(orders.status, [
      OrderStatus.INSTALLATION_IN_PROGRESS,
      OrderStatus.INSTALLATION_ASSIGNED,
    ])) as SQL,
    and(inArray(orders.corniceInstallerId, ids), eq(orders.corniceStatus, CorniceStatus.IN_PROGRESS)) as SQL,
  ];
  if (extraOrderIds.length > 0) conditions.push(inArray(orders.id, [...extraOrderIds]));

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      priority: orders.priority,
      deadline: orders.deadline,
      installAddress: orders.installAddress,
      installationAt: orders.installationAt,
      sewerId: orders.sewerId,
      installerId: orders.installerId,
      corniceInstallerId: orders.corniceInstallerId,
      corniceStatus: orders.corniceStatus,
    })
    .from(orders)
    .where(and(or(...conditions), sql`${orders.status} <> ${OrderStatus.CANCELLED}`))
    .orderBy(
      sql`case ${orders.priority} when ${Priority.CRITICAL} then 0 when ${Priority.URGENT} then 1 else 2 end`,
      sql`${orders.deadline} asc nulls last`,
      asc(orders.id),
    );
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
  const [itemRows, sinceRows, corniceRows] = await Promise.all([
    db
      .select({
        orderId: orderItems.orderId,
        kind: orderItems.kind,
        quantity: orderItems.quantity,
        areaM2: orderItems.areaM2,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.orderId), asc(orderItems.position)),
    db
      .select({
        orderId: orderStatusHistory.orderId,
        toStatus: orderStatusHistory.toStatus,
        at: sql<Date>`max(${orderStatusHistory.createdAt})`.mapWith((value: string | Date) => new Date(value)),
      })
      .from(orderStatusHistory)
      .where(inArray(orderStatusHistory.orderId, orderIds))
      .groupBy(orderStatusHistory.orderId, orderStatusHistory.toStatus),
    db
      .select({
        orderId: auditLog.entityId,
        at: sql<Date>`max(${auditLog.createdAt})`.mapWith((value: string | Date) => new Date(value)),
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, CORNICE_TAKEN),
          eq(auditLog.entityType, 'order'),
          inArray(auditLog.entityId, orderIds),
        ),
      )
      .groupBy(auditLog.entityId),
  ]);

  const itemsByOrder = new Map<number, WorkOrderRow['items'][number][]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      kind: isOrderItemKind(item.kind) ? item.kind : OrderItemKind.OTHER,
      quantity: item.quantity,
      areaM2: item.areaM2 === null ? null : Number.parseFloat(item.areaM2),
    });
    itemsByOrder.set(item.orderId, list);
  }
  const sinceByKey = new Map(sinceRows.map((row) => [`${row.orderId.toString()}:${row.toStatus}`, row.at]));
  const corniceSince = new Map(corniceRows.map((row) => [row.orderId, row.at]));

  return rows.map((row) => ({
    ...row,
    orderNumber: row.orderNumber ?? `#${row.id.toString()}`,
    items: itemsByOrder.get(row.id) ?? [],
    since: sinceByKey.get(`${row.id.toString()}:${row.status}`) ?? null,
    corniceSince: corniceSince.get(row.id) ?? null,
  }));
}

/** Карнизы, ждущие карнизчика: общая очередь, личной у них нет. */
export interface ScheduleCounts {
  /** Установщик назначен, времени нет. */
  readonly unscheduled: number;
  /** Карнизы, ждущие карнизчика; у карнизчика на карточке — общий пул. */
  readonly cornicesPending: number;
  readonly cornicesInProgress: number;
}

/** Счётчики «Установщиков» одним запросом; филиал — по заказу. */
export async function loadScheduleCounts(db: Database, branchId: number | null): Promise<ScheduleCounts> {
  const [row] = await db
    .select({
      unscheduled: sql<number>`count(*) filter (where ${orders.status} = ${OrderStatus.INSTALLATION_ASSIGNED} and ${orders.installationAt} is null)::int`,
      cornicesPending: sql<number>`count(*) filter (where ${orders.corniceStatus} = ${CorniceStatus.PENDING})::int`,
      cornicesInProgress: sql<number>`count(*) filter (where ${orders.corniceStatus} = ${CorniceStatus.IN_PROGRESS})::int`,
    })
    .from(orders)
    .where(
      and(
        sql`${orders.status} <> ${OrderStatus.CANCELLED}`,
        branchId === null ? undefined : eq(orders.branchId, branchId),
      ),
    );
  return {
    unscheduled: row?.unscheduled ?? 0,
    cornicesPending: row?.cornicesPending ?? 0,
    cornicesInProgress: row?.cornicesInProgress ?? 0,
  };
}

export interface InstallationSlotRow {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly status: OrderStatusName;
  readonly at: Date;
  readonly installerName: string | null;
  readonly address: string | null;
}

/**
 * Установки с временем в сутках `[dayStart, dayEnd)` по Ташкенту, кроме
 * отменённых, по времени. Филиал — по заказу: установщик чужого филиала,
 * поехавший сюда, всё равно в расписании этого цеха.
 */
export async function loadInstallationsToday(
  db: Database,
  dayStart: Date,
  dayEnd: Date,
  branchId: number | null,
): Promise<InstallationSlotRow[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      at: orders.installationAt,
      installerName: users.fullName,
      address: orders.installAddress,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.installerId))
    .where(
      and(
        gte(orders.installationAt, dayStart),
        lt(orders.installationAt, dayEnd),
        sql`${orders.status} <> ${OrderStatus.CANCELLED}`,
        branchId === null ? undefined : eq(orders.branchId, branchId),
      ),
    )
    .orderBy(asc(orders.installationAt), asc(orders.id));
  return rows.flatMap((row) =>
    row.at === null ? [] : [{ ...row, at: row.at, orderNumber: row.orderNumber ?? `#${row.orderId.toString()}` }],
  );
}

export interface OutputStarts {
  readonly today: Date;
  readonly week: Date;
  readonly month: Date;
  readonly prevMonth: Date;
  /** Тот же момент прошлого месяца: «рост к прошлому месяцу на ту же дату». */
  readonly prevMonthToDate: Date;
}

export interface OutputRow {
  today: number;
  week: number;
  month: number;
  prevMonth: number;
  prevMonthToDate: number;
}

const ts = (value: Date): SQL => sql`${sqlTimestamp(value)}::timestamptz`;

const periodColumns = (value: SQL, at: SQL, starts: OutputStarts): SQL => sql`
  coalesce(sum(${value}) filter (where ${at} >= ${ts(starts.today)}), 0)::int as today,
  coalesce(sum(${value}) filter (where ${at} >= ${ts(starts.week)}), 0)::int as week,
  coalesce(sum(${value}) filter (where ${at} >= ${ts(starts.month)}), 0)::int as month,
  coalesce(sum(${value}) filter (where ${at} >= ${ts(starts.prevMonth)} and ${at} < ${ts(starts.month)}), 0)::int as prev_month,
  coalesce(sum(${value}) filter (where ${at} >= ${ts(starts.prevMonth)} and ${at} < ${ts(starts.prevMonthToDate)}), 0)::int as prev_month_to_date`;

const idList = (ids: readonly number[]): SQL => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/**
 * Выработка за сегодня, неделю, месяц, прошлый месяц и прошлый месяц до
 * той же даты — одним запросом на роль.
 *
 * Определения те же, что у рейтинга (`rating.service.ts`): швее — штуки
 * заказов с последним «пошив сдан» в периоде, установщику — заказы с
 * последним «установка сделана», карнизчику — отмеченные готовыми карнизы.
 * Человеку с двумя ролями выработка складывается.
 */
export async function loadOutput(
  db: Database,
  people: readonly { readonly id: number; readonly roles: readonly RoleName[] }[],
  starts: OutputStarts,
  branchId: number | null,
): Promise<Map<number, OutputRow>> {
  const result = new Map<number, OutputRow>();
  const idsWith = (role: RoleName): number[] =>
    people.filter((person) => person.roles.includes(role)).map((person) => person.id);
  const branch = branchId === null ? sql`` : sql`and o.branch_id = ${branchId}`;
  const lastStage = (status: OrderStatusName): SQL => sql`
    join lateral (
      select max(h.created_at) as at from order_status_history h
      where h.order_id = o.id and h.to_status = ${status}
    ) done on true`;

  const queries: ReturnType<Database['execute']>[] = [];
  const sewers = idsWith(Role.SEWER);
  if (sewers.length > 0) {
    queries.push(
      db.execute(sql`
        select o.sewer_id as user_id, ${periodColumns(sql`p.pieces`, sql`done.at`, starts)}
        from orders o
        ${lastStage(OrderStatus.SEWING_DONE)}
        join lateral (
          select greatest(coalesce(sum(oi.quantity), 0), 1) as pieces
          from order_items oi where oi.order_id = o.id
        ) p on true
        where o.sewer_id in (${idList(sewers)}) and o.status <> ${OrderStatus.CANCELLED}
          and done.at >= ${ts(starts.prevMonth)} ${branch}
        group by o.sewer_id`),
    );
  }
  const installers = idsWith(Role.INSTALLER);
  if (installers.length > 0) {
    queries.push(
      db.execute(sql`
        select o.installer_id as user_id, ${periodColumns(sql`1`, sql`done.at`, starts)}
        from orders o
        ${lastStage(OrderStatus.INSTALLATION_DONE)}
        where o.installer_id in (${idList(installers)}) and o.status <> ${OrderStatus.CANCELLED}
          and done.at >= ${ts(starts.prevMonth)} ${branch}
        group by o.installer_id`),
    );
  }
  const cornice = idsWith(Role.CORNICE_INSTALLER);
  if (cornice.length > 0) {
    queries.push(
      db.execute(sql`
        select o.cornice_installer_id as user_id, ${periodColumns(sql`1`, sql`o.cornice_done_at`, starts)}
        from orders o
        where o.cornice_installer_id in (${idList(cornice)}) and o.status <> ${OrderStatus.CANCELLED}
          and o.cornice_done_at >= ${ts(starts.prevMonth)} ${branch}
        group by o.cornice_installer_id`),
    );
  }

  for (const rows of await Promise.all(queries)) {
    for (const row of rows) {
      const userId = Number(row['user_id']);
      const current = result.get(userId) ?? { today: 0, week: 0, month: 0, prevMonth: 0, prevMonthToDate: 0 };
      current.today += Number(row['today']);
      current.week += Number(row['week']);
      current.month += Number(row['month']);
      current.prevMonth += Number(row['prev_month']);
      current.prevMonthToDate += Number(row['prev_month_to_date']);
      result.set(userId, current);
    }
  }
  return result;
}

export interface TripRow {
  readonly userId: number;
  readonly startedAt: Date;
  readonly returnedAt: Date | null;
  readonly orderNumber: string | null;
  readonly address: string | null;
}

/** Выезды, начатые сегодня, — колонка «Выезды сегодня» у установщиков. */
export async function loadTripsToday(
  db: Database,
  userIds: readonly number[],
  todayStart: Date,
): Promise<TripRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      userId: shifts.userId,
      startedAt: installationTrips.startedAt,
      returnedAt: installationTrips.returnedAt,
      orderNumber: orders.orderNumber,
      address: orders.installAddress,
    })
    .from(installationTrips)
    .innerJoin(shifts, eq(shifts.id, installationTrips.shiftId))
    .leftJoin(orders, eq(orders.id, installationTrips.orderId))
    .where(and(inArray(shifts.userId, [...userIds]), gte(installationTrips.startedAt, todayStart)))
    .orderBy(asc(installationTrips.startedAt));
}

/**
 * Выработка одного человека по дням Ташкента начиная с `from` — для
 * столбиков в карточке. Те же определения, что у `loadOutput`.
 */
export async function loadDailyOutput(
  db: Database,
  userId: number,
  roles: readonly RoleName[],
  from: Date,
  branchId: number | null,
): Promise<Map<string, number>> {
  const day = (at: SQL): SQL => sql`to_char((${at} at time zone 'Asia/Tashkent')::date, 'YYYY-MM-DD')`;
  // Как в `loadOutput`: табло филиала считает только заказы этого филиала.
  const inBranch = branchId === null ? sql`` : sql` and o.branch_id = ${branchId}`;
  const queries: ReturnType<Database['execute']>[] = [];

  if (roles.includes(Role.SEWER)) {
    queries.push(
      db.execute(sql`
        select ${day(sql`done.at`)} as day, sum(p.pieces)::int as value
        from orders o
        join lateral (
          select max(h.created_at) as at from order_status_history h
          where h.order_id = o.id and h.to_status = ${OrderStatus.SEWING_DONE}
        ) done on true
        join lateral (
          select greatest(coalesce(sum(oi.quantity), 0), 1) as pieces
          from order_items oi where oi.order_id = o.id
        ) p on true
        where o.sewer_id = ${userId} and o.status <> ${OrderStatus.CANCELLED} and done.at >= ${ts(from)}${inBranch}
        group by 1`),
    );
  }
  if (roles.includes(Role.INSTALLER)) {
    queries.push(
      db.execute(sql`
        select ${day(sql`done.at`)} as day, count(*)::int as value
        from orders o
        join lateral (
          select max(h.created_at) as at from order_status_history h
          where h.order_id = o.id and h.to_status = ${OrderStatus.INSTALLATION_DONE}
        ) done on true
        where o.installer_id = ${userId} and o.status <> ${OrderStatus.CANCELLED} and done.at >= ${ts(from)}${inBranch}
        group by 1`),
    );
  }
  if (roles.includes(Role.CORNICE_INSTALLER)) {
    queries.push(
      db.execute(sql`
        select ${day(sql`o.cornice_done_at`)} as day, count(*)::int as value
        from orders o
        where o.cornice_installer_id = ${userId} and o.status <> ${OrderStatus.CANCELLED}
          and o.cornice_done_at >= ${ts(from)}${inBranch}
        group by 1`),
    );
  }

  const result = new Map<string, number>();
  for (const rows of await Promise.all(queries)) {
    for (const row of rows) {
      const key = String(row['day']);
      result.set(key, (result.get(key) ?? 0) + Number(row['value']));
    }
  }
  return result;
}

export interface ShiftDetailRow {
  readonly breaks: { startedAt: Date; returnedAt: Date | null; plannedMinutes: number }[];
  readonly trips: { startedAt: Date; returnedAt: Date | null; orderNumber: string | null }[];
}

/** Все отлучки и выезды смены — открытые и закрытые. */
export async function loadShiftDetail(db: Database, shiftId: number): Promise<ShiftDetailRow> {
  const [breaks, trips] = await Promise.all([
    db
      .select({
        startedAt: personalBreaks.startedAt,
        returnedAt: personalBreaks.returnedAt,
        plannedMinutes: personalBreaks.plannedMinutes,
      })
      .from(personalBreaks)
      .where(eq(personalBreaks.shiftId, shiftId))
      .orderBy(asc(personalBreaks.startedAt)),
    db
      .select({
        startedAt: installationTrips.startedAt,
        returnedAt: installationTrips.returnedAt,
        orderNumber: orders.orderNumber,
      })
      .from(installationTrips)
      .leftJoin(orders, eq(orders.id, installationTrips.orderId))
      .where(eq(installationTrips.shiftId, shiftId))
      .orderBy(asc(installationTrips.startedAt)),
  ]);
  return { breaks, trips };
}

/** Последние фото с объектов, которые человек загрузил сам. */
export async function loadRecentPhotos(
  db: Database,
  userId: number,
  limit: number,
): Promise<{ id: number; storageKey: string; orderNumber: string | null; createdAt: Date }[]> {
  return db
    .select({
      id: orderPhotos.id,
      storageKey: orderPhotos.storageKey,
      orderNumber: orders.orderNumber,
      createdAt: orderPhotos.createdAt,
    })
    .from(orderPhotos)
    .innerJoin(orders, eq(orders.id, orderPhotos.orderId))
    .where(eq(orderPhotos.uploadedBy, userId))
    .orderBy(desc(orderPhotos.createdAt), desc(orderPhotos.id))
    .limit(limit);
}

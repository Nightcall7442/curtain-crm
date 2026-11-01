import { auditLog, orders, orderStatusHistory, users, type Database } from '@curtain-crm/db';
import {
  BoardPhotoKind,
  CorniceStatus,
  corniceQueueStatusOf,
  OrderStatus,
  QC_QUEUE_ORDER_STATUSES,
  qcQueueStatusOf,
  QUEUE_LIMIT,
  type QueueStatus,
} from '@curtain-crm/shared';
import { and, count, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';

import type { AuditAction } from '../lib/constants';
import { loadBoardPhotos } from './monitor.queries';
import { workshopDay } from './periods';
import { getStorage } from './storage.service';

/**
 * Очереди ТВ «всё сразу»: контроль качества и карнизы.
 *
 * Заказчик (переписка 25.10): «справа — контроль качества, очередь с
 * исполнителями; рядом — очередь на карнизы: номер заказа, исполнитель,
 * статус». Клиента и адреса здесь нет вовсе, а не только на ТВ: очередь
 * отвечает «что ждёт и чьё это», и руководителю за клиентом — в заказ.
 */

export interface QueuePerformer {
  readonly name: string;
  readonly photoUrl: string | null;
}

export interface QueueItem {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly status: QueueStatus;
  /** Швея (и контролёр, если ОТК уже решил) или карнизчик. */
  readonly performers: readonly QueuePerformer[];
  /** С какого момента в этом статусе; у карниза, который ждёт, — `null`. */
  readonly since: Date | null;
  readonly deadline: string | null;
  readonly overdue: boolean;
}

/** Очередь: первые `QUEUE_LIMIT` строк и сколько ждёт всего — на ТВ показывается полная длина. */
export interface QueueList {
  readonly items: readonly QueueItem[];
  readonly total: number;
}

export interface BoardQueues {
  readonly qc: QueueList;
  readonly cornice: QueueList;
}

const CORNICE_TAKEN: AuditAction = 'order.cornice_taken';

/** Момент входа заказа в его текущий статус — по истории. */
const enteredCurrentStatus = sql`(
  select max(${orderStatusHistory.createdAt}) from ${orderStatusHistory}
  where ${orderStatusHistory.orderId} = ${orders.id}
    and ${orderStatusHistory.toStatus} = ${orders.status}
)`;

/** Когда карниз взяли — по журналу: отдельной колонки нет. */
const corniceTakenAt = sql`(
  select max(${auditLog.createdAt}) from ${auditLog}
  where ${auditLog.action} = ${CORNICE_TAKEN}
    and ${auditLog.entityType} = 'order'
    and ${auditLog.entityId} = ${orders.id}
)`;

/**
 * Подзапрос полем выборки — ТОЛЬКО через эту обёртку. Сырой SQL полем
 * верхнего уровня Drizzle рендерит без имени таблицы, и `${orders.id}`
 * внутри подзапроса превращается в `"id"` — то есть в id строки истории
 * или журнала, а не заказа. Вложенное выражение рендерится с таблицей.
 */
const asMoment = (expression: SQL): SQL<Date | null> =>
  sql<Date | null>`${expression}`.mapWith((value: Date | string | null) =>
    value === null ? null : new Date(value),
  );

export async function loadQueues(
  db: Database,
  params: {
    readonly branchId: number | null;
    readonly now: Date;
    /** Публичный ТВ — только превью фото, без оригиналов. */
    readonly previewOnly: boolean;
  },
): Promise<BoardQueues> {
  const branch: SQL | undefined = params.branchId === null ? undefined : eq(orders.branchId, params.branchId);
  const qcWhere = and(inArray(orders.status, [...QC_QUEUE_ORDER_STATUSES]), branch);
  /*
    Карниз ждёт карнизчика и у ЗАКРЫТОГО заказа: готовые шторы закрываются
    сразу, а карниз остаётся в очереди «как обычно» (`orderWorkflow`). Фильтр —
    тот же, что у очереди самого карнизчика (`orders.corniceQueue`) и счётчика
    табло: исключены только отменённые.
  */
  const corniceWhere = and(
    inArray(orders.corniceStatus, [CorniceStatus.PENDING, CorniceStatus.IN_PROGRESS]),
    ne(orders.status, OrderStatus.CANCELLED),
    branch,
  );
  const countOf = async (where: SQL | undefined): Promise<number> => {
    const [row] = await db.select({ n: count() }).from(orders).where(where);
    return row?.n ?? 0;
  };

  const [qcRows, corniceRows, qcTotal, corniceTotal] = await Promise.all([
    db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        deadline: orders.deadline,
        sewerId: orders.sewerId,
        qcId: orders.qcId,
        since: asMoment(enteredCurrentStatus),
      })
      .from(orders)
      .where(qcWhere)
      // Дольше всех ждущий — сверху: очередь читают сверху вниз.
      .orderBy(sql`${enteredCurrentStatus} asc nulls last`, orders.id)
      .limit(QUEUE_LIMIT),
    db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        corniceStatus: orders.corniceStatus,
        deadline: orders.deadline,
        corniceInstallerId: orders.corniceInstallerId,
        since: asMoment(corniceTakenAt),
      })
      .from(orders)
      .where(corniceWhere)
      // Сначала те, что уже ставят, — потом ждущие, по сроку.
      .orderBy(
        sql`case when ${orders.corniceStatus} = ${CorniceStatus.IN_PROGRESS} then 0 else 1 end`,
        sql`${orders.deadline} asc nulls last`,
        orders.id,
      )
      .limit(QUEUE_LIMIT),
    countOf(qcWhere),
    countOf(corniceWhere),
  ]);

  const peopleIds = [
    ...new Set(
      [
        ...qcRows.flatMap((row) => [row.sewerId, row.qcId]),
        ...corniceRows.map((row) => row.corniceInstallerId),
      ].filter((id): id is number => id !== null),
    ),
  ];
  const [people, boardPhotos] = await Promise.all([
    peopleIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: users.id,
            fullName: users.fullName,
            avatarStorageKey: users.avatarStorageKey,
            avatarPreviewKey: users.avatarPreviewKey,
          })
          .from(users)
          .where(inArray(users.id, peopleIds)),
    loadBoardPhotos(db, peopleIds),
  ]);

  // Исполнитель в очереди — за работой: фото табло «Работает», иначе аватарка.
  const storage = getStorage();
  const performers = new Map<number, QueuePerformer>(
    await Promise.all(
      people.map(async (person) => {
        const working = boardPhotos.get(person.id)?.[BoardPhotoKind.WORKING];
        const key = params.previewOnly
          ? (working?.previewKey ?? person.avatarPreviewKey)
          : (working?.previewKey ?? working?.storageKey ?? person.avatarPreviewKey ?? person.avatarStorageKey);
        return [
          person.id,
          {
            name: person.fullName,
            photoUrl: key === null ? null : await storage.getUrl(key, { stableWithinHour: true }),
          },
        ] as const;
      }),
    ),
  );
  const performersOf = (ids: readonly (number | null)[]): QueuePerformer[] =>
    [...new Set(ids)].flatMap((id) => {
      const person = id === null ? undefined : performers.get(id);
      return person === undefined ? [] : [person];
    });

  const today = workshopDay(params.now);
  const overdue = (deadline: string | null): boolean => deadline !== null && deadline < today;

  return {
    qc: {
      total: qcTotal,
      items: qcRows.flatMap((row) => {
      const status = qcQueueStatusOf(row.status);
      return status === null
        ? []
        : [
            {
              orderId: row.orderId,
              orderNumber: row.orderNumber ?? `#${row.orderId.toString()}`,
              status,
              performers: performersOf([row.sewerId, row.qcId]),
              since: row.since,
              deadline: row.deadline,
              overdue: overdue(row.deadline),
            },
          ];
      }),
    },
    cornice: {
      total: corniceTotal,
      items: corniceRows.flatMap((row) => {
      const status = corniceQueueStatusOf(row.corniceStatus);
      return status === null
        ? []
        : [
            {
              orderId: row.orderId,
              orderNumber: row.orderNumber ?? `#${row.orderId.toString()}`,
              status,
              performers: performersOf([row.corniceInstallerId]),
              since: status === 'taken' ? row.since : null,
              deadline: row.deadline,
              overdue: overdue(row.deadline),
            },
          ];
      }),
    },
  };
}

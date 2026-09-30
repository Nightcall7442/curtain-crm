import { orders, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import {
  DISCIPLINE_KIND_LABELS,
  DisciplineKind,
  disciplineKindSchema,
  findTransition,
  formatIsoDate,
  isOrderStatus,
  isRole,
  MANAGEMENT_ROLES,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  OrderStatus,
  OrderType,
  PHOTO_STAGE_LABELS,
  PHOTO_STAGE_UPLOADER_ROLES,
  Role,
  ROLE_LABELS,
  ROLES,
  translate,
  type Locale,
  type OrderType as OrderTypeName,
  type PhotoStage,
} from '@curtain-crm/shared';
import { eq, inArray } from 'drizzle-orm';

import type { AuditAction } from '../lib/constants';

import type { RecordAuditInput } from './audit.service';
import {
  isTelegramGroupEnabled,
  sendTelegramGroupMessage,
  sendTelegramGroupPhotos,
  type TelegramPhoto,
} from './telegram.service';

/**
 * Лента действий в Telegram-группе мастерской.
 *
 * Группа — общая для всех сотрудников, поэтому в неё идёт только ход работы:
 * по заказам — новый заказ, смена статуса, кто назначен, карниз, продажа,
 * фото этапов; по доп. работам — выдача, сдача, приёмка, возврат, отмена;
 * по явке — опоздания и прогулы (`ATTENDANCE_KINDS`).
 * Деньги (цены, расценки, оплаты, зарплата), дисциплина, права и пароли
 * остаются в журнале панели — их видит руководство, а не двадцать человек
 * в чате. Сумм в ленте нет ни в каком виде.
 *
 * Сообщение пишется словами, а не полями журнала: номер заказа вместо id,
 * имя сотрудника вместо его номера в базе, подпись статуса вместо слага.
 */

/** Группа узбекоязычная; русский текст рядом — чтобы его читал и разработчик. */
const GROUP_FEED_LOCALE: Locale = 'uz';

/** Действия, которые уходят в группу. Всё прочее — только в журнал. */
const FEED_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'order.status_changed',
  'order.cancelled',
  'order.assignee_changed',
  'order.cornice_taken',
  'order.cornice_done',
  'ready_made_item.sold',
  'retail_sale.created',
  'task.created',
  'task.submitted',
  'task.approved',
  'task.returned',
  'task.completed',
  'task.cancelled',
  'discipline.recorded',
]);

/**
 * Какие записи дисциплины уходят в группу — только про явку.
 *
 * Опоздание и прогул видны всем и так: рабочий день общий. Жалобы клиентов,
 * грубость, ошибки замера и поощрения — разговор руководства с человеком, а
 * не новость для двадцати коллег; они остаются в журнале и в карточке
 * сотрудника. Баллов в ленте нет: это внутренний счёт рейтинга.
 */
const LATE_KINDS: ReadonlySet<string> = new Set([
  DisciplineKind.LATE_UNDER_15,
  DisciplineKind.LATE_15_30,
  DisciplineKind.LATE_OVER_30,
]);
const ATTENDANCE_KINDS: ReadonlySet<string> = new Set([
  ...LATE_KINDS,
  DisciplineKind.ABSENCE,
  DisciplineKind.NO_SHOW_NO_NOTICE,
]);

interface FeedText {
  readonly newOrder: (order: string) => string;
  readonly orderStatus: (order: string, status: string) => string;
  readonly orderCancelled: (order: string) => string;
  readonly assigned: (order: string) => string;
  readonly unassigned: (order: string) => string;
  readonly corniceTaken: (order: string) => string;
  readonly corniceDone: (order: string) => string;
  readonly photos: (order: string, stage: string) => string;
  readonly taskNew: string;
  readonly taskSubmitted: string;
  readonly taskApproved: string;
  readonly taskReturned: string;
  readonly taskClosed: string;
  readonly taskCancelled: string;
  readonly employeeLate: string;
  readonly employee: string;
  readonly lateFor: string;
  readonly kind: string;
  readonly minutes: string;
  readonly hours: string;
  readonly assignee: string;
  readonly due: string;
  readonly readyMadeSold: string;
  readonly retailSale: string;
  readonly receipt: string;
  readonly pieces: (quantity: string) => string;
  readonly client: string;
  readonly type: string;
  readonly status: string;
  readonly previousStatus: string;
  readonly previousAssignee: string;
  readonly reason: string;
  readonly comment: string;
  readonly order: string;
  readonly left: string;
  readonly goods: string;
  readonly by: string;
  readonly someone: string;
}

const FEED_TEXT: Readonly<Record<Locale, FeedText>> = {
  ru: {
    newOrder: (order) => `Новый заказ ${order}`,
    orderStatus: (order, status) => `Заказ ${order}: ${status}`,
    orderCancelled: (order) => `Заказ ${order} отменён`,
    assigned: (order) => `Заказ ${order}: назначен исполнитель`,
    unassigned: (order) => `Заказ ${order}: исполнитель снят`,
    corniceTaken: (order) => `Заказ ${order}: карниз взят в работу`,
    corniceDone: (order) => `Заказ ${order}: карниз повешен`,
    photos: (order, stage) => `Фото заказа ${order}: ${stage}`,
    taskNew: 'Новая доп. работа',
    taskSubmitted: 'Доп. работа выполнена — ждёт подтверждения',
    taskApproved: 'Доп. работа принята',
    taskReturned: 'Доп. работа возвращена на доработку',
    taskClosed: 'Доп. работа закрыта',
    taskCancelled: 'Доп. работа отменена',
    employeeLate: 'Опоздание на работу',
    employee: 'Сотрудник',
    lateFor: 'Опоздание',
    kind: 'Что записано',
    minutes: 'мин',
    hours: 'ч',
    assignee: 'Исполнитель',
    due: 'Срок',
    readyMadeSold: 'Продана готовая штора',
    retailSale: 'Продажа с витрины',
    receipt: 'Чек',
    pieces: (quantity) => `${quantity} шт.`,
    client: 'Клиент',
    type: 'Тип',
    status: 'Статус',
    previousStatus: 'Был статус',
    previousAssignee: 'Был',
    reason: 'Причина',
    comment: 'Комментарий',
    order: 'Заказ',
    left: 'Осталось',
    goods: 'Товаров',
    by: 'Кто',
    someone: 'Сотрудник',
  },
  uz: {
    newOrder: (order) => `Yangi buyurtma ${order}`,
    orderStatus: (order, status) => `Buyurtma ${order}: ${status}`,
    orderCancelled: (order) => `${order} buyurtmasi bekor qilindi`,
    assigned: (order) => `${order} buyurtmasiga ijrochi tayinlandi`,
    unassigned: (order) => `${order} buyurtmasidan ijrochi olib tashlandi`,
    corniceTaken: (order) => `${order} buyurtmasi: karniz ishga olindi`,
    corniceDone: (order) => `${order} buyurtmasi: karniz osildi`,
    photos: (order, stage) => `${order} buyurtmasi rasmlari: ${stage}`,
    taskNew: "Yangi qo'shimcha ish",
    taskSubmitted: "Qo'shimcha ish bajarildi — tasdiq kutilmoqda",
    taskApproved: "Qo'shimcha ish qabul qilindi",
    taskReturned: "Qo'shimcha ish qayta ishlashga qaytarildi",
    taskClosed: "Qo'shimcha ish yopildi",
    taskCancelled: "Qo'shimcha ish bekor qilindi",
    employeeLate: 'Xodim ishga kechikdi',
    employee: 'Xodim',
    lateFor: 'Kechikish',
    kind: 'Yozuv',
    minutes: 'daqiqa',
    hours: 'soat',
    assignee: 'Ijrochi',
    due: 'Muddat',
    readyMadeSold: 'Tayyor parda sotildi',
    retailSale: 'Vitrinadan sotuv',
    receipt: 'Chek',
    pieces: (quantity) => `${quantity} dona`,
    client: 'Mijoz',
    type: 'Turi',
    status: 'Holat',
    previousStatus: 'Oldingi holat',
    previousAssignee: 'Oldingi',
    reason: 'Sabab',
    comment: 'Izoh',
    order: 'Buyurtma',
    left: 'Qoldi',
    goods: 'Tovarlar soni',
    by: 'Kim',
    someone: 'Xodim',
  },
};

/** Роли, на которые назначают в заказе, — в порядке хода заказа по цеху. */
const ORDER_ASSIGNEE_ROLES = [
  Role.MASTER,
  Role.SEWER,
  Role.QC,
  Role.CORNICE_INSTALLER,
  Role.INSTALLER,
] as const;

type OrderAssigneeRole = (typeof ORDER_ASSIGNEE_ROLES)[number];

/** Заказ, о котором сообщение, — в том виде, в каком его знают в цехе. */
export interface FeedOrder {
  /** `DH-000007`, а не id: по номеру заказ ищут в панели и называют вслух. */
  readonly label: string;
  readonly clientName: string;
  readonly orderType: OrderTypeName;
  /** Кто на какой роли назначен — чтобы подписать автора его ролью в заказе. */
  readonly assignees: Readonly<Record<OrderAssigneeRole, number | null>>;
}

export const feedOrder = (row: {
  readonly id: number;
  readonly orderNumber: string | null;
  readonly clientName: string;
  readonly orderType: OrderTypeName;
  readonly masterId: number | null;
  readonly sewerId: number | null;
  readonly qcId: number | null;
  readonly corniceInstallerId: number | null;
  readonly installerId: number | null;
}): FeedOrder => ({
  label: row.orderNumber ?? `#${row.id.toString()}`,
  clientName: row.clientName,
  orderType: row.orderType,
  assignees: {
    master: row.masterId,
    sewer: row.sewerId,
    qc: row.qcId,
    cornice_installer: row.corniceInstallerId,
    installer: row.installerId,
  },
});

export interface FeedContext {
  readonly order: FeedOrder | null;
  /** Имена по id: автор действия и те, кого оно касается. */
  readonly names: ReadonlyMap<number, string>;
  /** Должности автора действия. */
  readonly actorRoles: readonly Role[];
}

/**
 * Кем выступал автор действия — вместо безликого «Kim».
 *
 * Сначала роль, на которую он назначен в этом заказе, затем его должности:
 * рабочие раньше руководящих — швея, взявшая заказ из общего пула, ещё не
 * назначена, но действует как швея. `allowed` — роли, которым действие
 * вообще доступно (переход статуса, загрузка фото этапа): админ, назначенный
 * в заказе ОТК, при проверке админа подписывается админом, а не ОТК.
 */
export function actorRole(
  actorId: number,
  order: FeedOrder | null,
  actorRoles: readonly Role[],
  allowed?: readonly Role[],
): Role | null {
  const fits = (role: Role): boolean => allowed === undefined || allowed.includes(role);
  const assigned =
    order === null ? [] : ORDER_ASSIGNEE_ROLES.filter((role) => order.assignees[role] === actorId);
  const isManagementRole = (role: Role): boolean => MANAGEMENT_ROLES.includes(role);
  const held = [
    ...ROLES.filter((role) => actorRoles.includes(role) && !isManagementRole(role)),
    ...ROLES.filter((role) => actorRoles.includes(role) && isManagementRole(role)),
  ];

  return (
    assigned.find(fits) ??
    held.find(fits) ??
    assigned[0] ??
    // Ни одна роль не подошла к действию — старшая должность.
    ROLES.find((role) => actorRoles.includes(role)) ??
    null
  );
}

export interface FeedMessage {
  readonly title: string;
  readonly body: string;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const count = (value: unknown): string | null =>
  typeof value === 'number' ? value.toString() : text(value);

/** Строка «Подпись: значение»; без значения строки нет. */
const line = (label: string, value: string | null): string | null =>
  value === null ? null : `${label}: ${value}`;

const message = (title: string, lines: readonly (string | null)[]): FeedMessage => ({
  title,
  // Повтор убирается: назначивший себя ОТК — это одна строка, а не две.
  body: [...new Set(lines.filter((part): part is string => part !== null))].join('\n'),
});

/** Чей заказ: клиент, а у пошива для склада — тип (клиент там — заглушка «Склад»). */
function whoseOrder(order: FeedOrder, locale: Locale): string | null {
  const t = FEED_TEXT[locale];
  return order.orderType === OrderType.STOCK
    ? line(t.type, translate(ORDER_TYPE_LABELS, order.orderType, locale))
    : line(t.client, order.clientName);
}

/** «3 ч 48 мин» / «45 мин» — опоздание в минутах читается хуже, чем в часах. */
function duration(totalMinutes: number, locale: Locale): string {
  const t = FEED_TEXT[locale];
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes.toString()} ${t.minutes}`;
  return minutes === 0
    ? `${hours.toString()} ${t.hours}`
    : `${hours.toString()} ${t.hours} ${minutes.toString()} ${t.minutes}`;
}

/**
 * Текст сообщения для группы или `null`, если действие туда не идёт.
 *
 * Чистая функция: всё, что нужно достать из базы, приходит в `context`.
 */
export function describeForGroup(
  input: RecordAuditInput,
  context: FeedContext,
  locale: Locale,
): FeedMessage | null {
  const t = FEED_TEXT[locale];
  const details = input.details ?? {};
  const name = (id: unknown): string =>
    (typeof id === 'number' ? context.names.get(id) : undefined) ?? t.someone;
  /** Строка автора: «Tikuvchi: …», «Administrator: …»; без роли — «Kim: …». */
  const actorLine = (allowed?: readonly Role[]): string | null => {
    const role = actorRole(input.actorId, context.order, context.actorRoles, allowed);
    return line(role === null ? t.by : translate(ROLE_LABELS, role, locale), name(input.actorId));
  };
  const actor = actorLine();

  if (input.action === 'discipline.recorded') {
    const parsed = disciplineKindSchema.safeParse(details['kind']);
    if (!parsed.success || !ATTENDANCE_KINDS.has(parsed.data)) return null;
    const kind = parsed.data;

    // Автозапись при отметке прихода: автор — сам опоздавший. Ручная: автор — руководитель,
    // а о ком запись, лежит в `userId`.
    const subject = typeof details['userId'] === 'number' ? details['userId'] : input.actorId;
    const lateBy = details['lateBy'];
    const kindLabel = translate(DISCIPLINE_KIND_LABELS, kind, locale);

    return message(LATE_KINDS.has(kind) ? t.employeeLate : kindLabel, [
      line(t.employee, name(subject)),
      typeof lateBy === 'number' && lateBy > 0
        ? line(t.lateFor, duration(lateBy, locale))
        : LATE_KINDS.has(kind)
          ? line(t.kind, kindLabel)
          : null,
    ]);
  }

  if (input.action === 'ready_made_item.sold') {
    const model = text(details['model']);
    const quantity = count(details['quantity']);
    const left = count(details['stockAfter']);
    return message(t.readyMadeSold, [
      model === null || quantity === null ? model : `${model} — ${t.pieces(quantity)}`,
      left === null ? null : line(t.left, t.pieces(left)),
      line(t.order, context.order?.label ?? null),
      actor,
    ]);
  }

  if (input.action === 'retail_sale.created') {
    const receipt = count(input.entityId);
    return message(t.retailSale, [
      line(t.receipt, receipt === null ? null : `#${receipt}`),
      line(t.goods, count(details['lines'])),
      actor,
    ]);
  }

  if (input.action.startsWith('task.')) {
    const title = text(details['title']);
    const work = title === null ? null : `«${title}»`;
    const assigneeId = details['assigneeId'];
    // Сдал сам исполнитель — его строка уже есть в подписи автора.
    const assignee = assigneeId === input.actorId ? null : line(t.assignee, name(assigneeId));
    const reason = line(t.reason, text(details['reason']));
    // Выдаёт, принимает, возвращает и отменяет руководство.
    const boss = actorLine(MANAGEMENT_ROLES);

    switch (input.action) {
      case 'task.created': {
        const due = text(details['dueDate']);
        return message(t.taskNew, [
          work,
          assignee,
          due === null ? null : line(t.due, formatIsoDate(due)),
          boss,
        ]);
      }
      case 'task.submitted':
        return message(t.taskSubmitted, [work, actor]);
      case 'task.approved':
        return message(t.taskApproved, [work, assignee, boss]);
      case 'task.returned':
        return message(t.taskReturned, [work, assignee, reason, boss]);
      case 'task.completed':
        return message(t.taskClosed, [work, assignee, boss]);
      case 'task.cancelled':
        return message(t.taskCancelled, [work, assignee, reason, boss]);
      default:
        return null;
    }
  }

  // Дальше — действия по заказу: без заказа их не описать.
  const order = context.order;
  if (order === null) return null;

  const typeLine = line(t.type, translate(ORDER_TYPE_LABELS, order.orderType, locale));
  const whose = whoseOrder(order, locale);

  switch (input.action) {
    case 'order.status_changed': {
      const from = details['fromStatus'];
      const to = details['toStatus'];
      if (!isOrderStatus(from) || !isOrderStatus(to)) return null;
      const status = translate(ORDER_STATUS_LABELS, to, locale);
      const mover = actorLine(findTransition(from, to, order.orderType)?.roles);

      /*
        Создание заказа — это переход из «Нового»: он пишется в журнал сразу
        за `order.created` и знает, куда заказ попал. Поэтому новый заказ
        объявляется здесь, а `order.created` в ленту не идёт — иначе на
        каждый заказ приходило бы два сообщения подряд.
      */
      if (from === OrderStatus.NEW) {
        return message(t.newOrder(order.label), [
          order.orderType === OrderType.READY_MADE ? typeLine : null,
          whose,
          line(t.status, status),
          mover,
        ]);
      }

      return message(t.orderStatus(order.label, status), [
        whose,
        line(t.previousStatus, translate(ORDER_STATUS_LABELS, from, locale)),
        line(t.comment, text(details['comment'])),
        mover,
      ]);
    }

    case 'order.cancelled': {
      const from = details['fromStatus'];
      return message(t.orderCancelled(order.label), [
        whose,
        line(t.reason, text(details['comment'])),
        actorLine(
          isOrderStatus(from)
            ? findTransition(from, OrderStatus.CANCELLED, order.orderType)?.roles
            : undefined,
        ),
      ]);
    }

    case 'order.assignee_changed': {
      const role = details['role'];
      if (!isRole(role)) return null;
      const roleName = translate(ROLE_LABELS, role, locale);
      const from = details['from'];
      const to = details['to'];
      // Назначает руководство; исполнитель, взявший заказ сам, — своей ролью.
      const assigner = actorLine(MANAGEMENT_ROLES);

      if (typeof to !== 'number') {
        return message(t.unassigned(order.label), [whose, line(roleName, name(from)), assigner]);
      }
      return message(t.assigned(order.label), [
        whose,
        line(roleName, name(to)),
        typeof from === 'number' ? line(t.previousAssignee, name(from)) : null,
        assigner,
      ]);
    }

    case 'order.cornice_taken':
      return message(t.corniceTaken(order.label), [
        whose,
        line(translate(ROLE_LABELS, 'cornice_installer', locale), name(input.actorId)),
      ]);

    case 'order.cornice_done': {
      const installerId = details['corniceInstallerId'];
      return message(t.corniceDone(order.label), [
        whose,
        line(translate(ROLE_LABELS, 'cornice_installer', locale), name(installerId)),
        // Отметку мог поставить не сам карнизчик, а админ за него.
        installerId === input.actorId ? null : actor,
      ]);
    }

    default:
      return null;
  }
}

/**
 * Пишет действие в группу, если оно из ленты.
 *
 * Вызывается из `recordAudit` внутри транзакции действия: заказ и имена
 * читаются тем же исполнителем, поэтому только что созданный заказ уже
 * виден.
 *
 * Отправка не ждётся: ждать её — значит сделать чужой сервис условием
 * работы мастерской. Ошибки гасит сам клиент Bot API. Плата за это: если
 * транзакция потом откатится, сообщение уже уйдёт. Откат случается на
 * ошибке, то есть редко, и лишняя строка в ленте дешевле задержки на
 * каждом действии.
 */
export async function announceToGroup(executor: DbExecutor, input: RecordAuditInput): Promise<void> {
  if (!FEED_ACTIONS.has(input.action) || !isTelegramGroupEnabled()) return;

  const details = input.details ?? {};
  const orderId = input.entityType === 'order' ? input.entityId : details['orderId'];

  const mentioned =
    input.action === 'order.assignee_changed'
      ? [details['from'], details['to']]
      : input.action === 'order.cornice_done'
        ? [details['corniceInstallerId']]
        : input.entityType === 'task'
          ? [details['assigneeId']]
          : input.entityType === 'discipline_event'
            ? [details['userId']]
            : [];
  const userIds = [input.actorId, ...mentioned].filter((id): id is number => typeof id === 'number');

  const people = await executor
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, userIds));

  const actorRoles = await executor
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, input.actorId));

  const [order] =
    typeof orderId === 'number'
      ? await executor
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            clientName: orders.clientName,
            orderType: orders.orderType,
            masterId: orders.masterId,
            sewerId: orders.sewerId,
            qcId: orders.qcId,
            corniceInstallerId: orders.corniceInstallerId,
            installerId: orders.installerId,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1)
      : [];

  const feed = describeForGroup(
    input,
    {
      order: order === undefined ? null : feedOrder(order),
      names: new Map(people.map((person) => [person.id, person.fullName])),
      actorRoles: actorRoles.map((row) => row.role),
    },
    GROUP_FEED_LOCALE,
  );
  if (feed === null) return;

  void sendTelegramGroupMessage(feed.title, feed.body);
}

/* -------------------------------------------------------------------------- */
/*                              Фото заказа                                   */
/* -------------------------------------------------------------------------- */

export interface PhotoAlbum {
  readonly order: FeedOrder;
  readonly stage: PhotoStage;
  readonly uploaderName: string;
  /** Кем снимал: роль в заказе или должность; `null` — подпишется «Kim». */
  readonly uploaderRole: Role | null;
}

/** Подпись альбома: чей заказ, какой этап, кто снимал. */
export function describePhotoAlbum(album: PhotoAlbum, locale: Locale): FeedMessage {
  const t = FEED_TEXT[locale];
  const uploader =
    album.uploaderRole === null ? t.by : translate(ROLE_LABELS, album.uploaderRole, locale);
  return message(t.photos(album.order.label, translate(PHOTO_STAGE_LABELS, album.stage, locale)), [
    whoseOrder(album.order, locale),
    line(uploader, album.uploaderName),
  ]);
}

/**
 * Сколько ждать следующее фото той же пачки, прежде чем отправить альбом.
 *
 * Фото загружаются по одному запросу на снимок: установщик на объекте
 * снимает пять кадров подряд — это пять загрузок. Без ожидания в группе
 * было бы пять сообщений с одной и той же подписью; с ним — один альбом.
 */
const PHOTO_ALBUM_DELAY_MS = 30_000;

interface PendingAlbum extends PhotoAlbum {
  readonly photos: TelegramPhoto[];
  timer: ReturnType<typeof setTimeout>;
}

/** Копящиеся альбомы: заказ + этап + кто снимал. */
const pendingAlbums = new Map<string, PendingAlbum>();

function flushAlbum(key: string): void {
  const album = pendingAlbums.get(key);
  if (album === undefined) return;
  pendingAlbums.delete(key);

  const caption = describePhotoAlbum(album, GROUP_FEED_LOCALE);
  void sendTelegramGroupPhotos(caption.title, caption.body, album.photos);
}

function scheduleFlush(key: string): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => {
    flushAlbum(key);
  }, PHOTO_ALBUM_DELAY_MS);
  // Таймер ленты не должен держать процесс при остановке сервера.
  timer.unref();
  return timer;
}

/**
 * Ставит загруженное фото заказа в ленту.
 *
 * Вызывается ПОСЛЕ транзакции загрузки: фото, запись о котором откатилась,
 * в группу не уйдёт. Альбом копится в памяти процесса — если сервер
 * перезапустится в эти полминуты, фото останется в заказе, но в группу не
 * попадёт. Для ленты это приемлемо: она дублирует систему, а не заменяет.
 */
export function queueOrderPhotoForGroup(params: {
  readonly orderId: number;
  readonly order: FeedOrder;
  readonly stage: PhotoStage;
  readonly uploaderId: number;
  readonly uploaderName: string;
  readonly uploaderRoles: readonly Role[];
  readonly photo: TelegramPhoto;
}): void {
  if (!isTelegramGroupEnabled()) return;

  const key = `${params.orderId.toString()}:${params.stage}:${params.uploaderId.toString()}`;
  const pending = pendingAlbums.get(key);

  if (pending !== undefined) {
    clearTimeout(pending.timer);
    pending.photos.push(params.photo);
    pending.timer = scheduleFlush(key);
    return;
  }

  pendingAlbums.set(key, {
    order: params.order,
    stage: params.stage,
    uploaderName: params.uploaderName,
    uploaderRole: actorRole(
      params.uploaderId,
      params.order,
      params.uploaderRoles,
      PHOTO_STAGE_UPLOADER_ROLES[params.stage],
    ),
    photos: [params.photo],
    timer: scheduleFlush(key),
  });
}

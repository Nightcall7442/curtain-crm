import { orders, users, type DbExecutor } from '@curtain-crm/db';
import {
  isOrderStatus,
  isRole,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  OrderStatus,
  OrderType,
  PHOTO_STAGE_LABELS,
  ROLE_LABELS,
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
 * Группа — общая для всех сотрудников, поэтому в неё идёт только ход работы
 * по заказам: новый заказ, смена статуса, кто назначен, карниз, продажа,
 * фото этапов.
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

/** Заказ, о котором сообщение, — в том виде, в каком его знают в цехе. */
export interface FeedOrder {
  /** `DH-000007`, а не id: по номеру заказ ищут в панели и называют вслух. */
  readonly label: string;
  readonly clientName: string;
  readonly orderType: OrderTypeName;
}

export const feedOrder = (row: {
  readonly id: number;
  readonly orderNumber: string | null;
  readonly clientName: string;
  readonly orderType: OrderTypeName;
}): FeedOrder => ({
  label: row.orderNumber ?? `#${row.id.toString()}`,
  clientName: row.clientName,
  orderType: row.orderType,
});

export interface FeedContext {
  readonly order: FeedOrder | null;
  /** Имена по id: автор действия и те, кого оно касается. */
  readonly names: ReadonlyMap<number, string>;
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
  body: lines.filter((part): part is string => part !== null).join('\n'),
});

/** Чей заказ: клиент, а у пошива для склада — тип (клиент там — заглушка «Склад»). */
function whoseOrder(order: FeedOrder, locale: Locale): string | null {
  const t = FEED_TEXT[locale];
  return order.orderType === OrderType.STOCK
    ? line(t.type, translate(ORDER_TYPE_LABELS, order.orderType, locale))
    : line(t.client, order.clientName);
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
  const actor = line(t.by, name(input.actorId));

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
          actor,
        ]);
      }

      return message(t.orderStatus(order.label, status), [
        whose,
        line(t.previousStatus, translate(ORDER_STATUS_LABELS, from, locale)),
        line(t.comment, text(details['comment'])),
        actor,
      ]);
    }

    case 'order.cancelled':
      return message(t.orderCancelled(order.label), [
        whose,
        line(t.reason, text(details['comment'])),
        actor,
      ]);

    case 'order.assignee_changed': {
      const role = details['role'];
      if (!isRole(role)) return null;
      const roleName = translate(ROLE_LABELS, role, locale);
      const from = details['from'];
      const to = details['to'];

      if (typeof to !== 'number') {
        return message(t.unassigned(order.label), [whose, line(roleName, name(from)), actor]);
      }
      return message(t.assigned(order.label), [
        whose,
        line(roleName, name(to)),
        typeof from === 'number' ? line(t.previousAssignee, name(from)) : null,
        actor,
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
        : [];
  const userIds = [input.actorId, ...mentioned].filter((id): id is number => typeof id === 'number');

  const people = await executor
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, userIds));

  const [order] =
    typeof orderId === 'number'
      ? await executor
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            clientName: orders.clientName,
            orderType: orders.orderType,
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
}

/** Подпись альбома: чей заказ, какой этап, кто снимал. */
export function describePhotoAlbum(album: PhotoAlbum, locale: Locale): FeedMessage {
  const t = FEED_TEXT[locale];
  return message(t.photos(album.order.label, translate(PHOTO_STAGE_LABELS, album.stage, locale)), [
    whoseOrder(album.order, locale),
    line(t.by, album.uploaderName),
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
    photos: [params.photo],
    timer: scheduleFlush(key),
  });
}

import { isTerminalStatus, OrderStatus } from '../enums/orderStatus.enum';
import { OrderType } from '../enums/orderType.enum';
import { canDispatchOrders, isManagement, Role, type AssignableRole } from '../enums/role.enum';
import type { Locale } from '../i18n/locale';
import { parseMoney } from '../utils/money';

/**
 * Правила заказа, общие для сервера, сайта и приложения.
 *
 * Сервер по ним разрешает и запрещает, клиенты — решают, что показать.
 * Пока правило жило в двух местах, кнопка на телефоне обещала то, от чего
 * сервер потом отказывался.
 */

/**
 * Кто «владеет» заказом, находящимся в данном статусе.
 *
 * Используется, чтобы сотрудник не мог двигать чужой заказ: пока заказ в
 * пошиве, действия по нему выполняет назначенная швея, а не любая швея цеха.
 * Если владелец ещё не назначен (`null`), ограничение не применяется —
 * например, `pending_qc` это общий пул, из которого заказ берёт свободный ОТК.
 *
 * По этой же таблице списки показывают «текущего исполнителя».
 *
 * Руководство (CEO, админ) не ограничено этой проверкой никогда.
 */
export const ORDER_STATUS_OWNER: Readonly<Partial<Record<OrderStatus, AssignableRole>>> = {
  [OrderStatus.MEASUREMENT_ASSIGNED]: Role.MASTER,
  [OrderStatus.MEASUREMENT_DONE]: Role.MASTER,
  [OrderStatus.PENDING_SEWING_ASSIGNMENT]: Role.SEWER,
  [OrderStatus.SEWING_IN_PROGRESS]: Role.SEWER,
  [OrderStatus.SEWING_DONE]: Role.SEWER,
  [OrderStatus.PENDING_QC]: Role.QC,
  [OrderStatus.QC_FAILED]: Role.QC,
  [OrderStatus.QC_PASSED]: Role.QC,
  /*
    «Ждёт назначения установщика» этой таблицы не знал — и зря.

    У пошива и контроля статус ожидания есть, у установки его не было, хотя
    смысл тот же: заказ готов, установщик ещё не назначен. Из-за пропуска
    установщики не получали уведомления о свободной работе (оно рассылается
    как раз по этой таблице) и не могли даже открыть такой заказ, чтобы
    посмотреть адрес и объём.

    Двигать заказ дальше по-прежнему вправе только руководство и менеджер:
    переход «Назначить установщика» назван в `ORDER_TRANSITIONS` ролями
    админа, директора и менеджера, и эта строка на него не влияет.
  */
  [OrderStatus.PENDING_INSTALLATION_ASSIGNMENT]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_ASSIGNED]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_IN_PROGRESS]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_DONE]: Role.INSTALLER,
};

/**
 * Роль исполнителя текущего этапа; `null` — у статуса исполнителя нет
 * (заказ на приёме, у руководства или уже закрыт).
 *
 * Карниз сюда не входит: он идёт параллельно основной цепочке.
 */
export function currentExecutorRole(status: OrderStatus): AssignableRole | null {
  return ORDER_STATUS_OWNER[status] ?? null;
}

/**
 * Статусы, в которых автор ещё вправе править собственный заказ.
 *
 * Типизирован как `OrderStatus[]`, а не `string[]`: с обычным массивом строк
 * переименование статуса прошло бы мимо компилятора, и правка молча стала бы
 * недоступна автору — без единой ошибки сборки.
 */
export const AUTHOR_EDITABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.PENDING_ADMIN_REVIEW,
  OrderStatus.REJECTED_TO_CEO,
];

/**
 * Может ли сотрудник править заказ: клиента, адрес, срок, позиции, цену.
 *
 * Закрытый и отменённый заказ не правит никто: по нему уже начислены
 * проценты и рейтинг, и правка задним числом переписала бы закрытый месяц.
 * Руководство и менеджер правят любой открытый; автор — свой, пока админ его
 * не принял: дальше швея работает по тому, что видела.
 */
export function canEditOrder(
  order: { readonly status: OrderStatus; readonly createdBy: number },
  user: { readonly id: number; readonly roles: readonly Role[] },
): boolean {
  if (isTerminalStatus(order.status)) return false;
  if (canDispatchOrders(user.roles)) return true;
  return order.createdBy === user.id && AUTHOR_EDITABLE_STATUSES.includes(order.status);
}

/**
 * Видит ли сотрудник деньги клиента (стоимость, оплачено, остаток) по роли.
 *
 * Руководство, менеджер (ставит цену) и продавец (её назвал). Установщик
 * видит их только у своего заказа — это решает сервер по заказу, а не по
 * роли, поэтому здесь его нет.
 */
export function canSeeClientMoney(roles: readonly Role[]): boolean {
  return isManagement(roles) || canDispatchOrders(roles) || roles.includes(Role.SELLER);
}

/**
 * Не даёт ли долг клиента закрыть заказ.
 *
 * Пошив на склад не закрывается деньгами — у него нет клиента и цена 0.
 * Сумма, скрытая от сотрудника (`null`), здесь не решает ничего: клиент
 * без неё не знает остатка, и отказ в закрытии всё равно даст сервер.
 */
export function closeBlockedByDebt(order: {
  readonly orderType: OrderType;
  readonly remainingPayment: string | null;
}): boolean {
  if (order.orderType === OrderType.STOCK || order.remainingPayment === null) return false;
  return parseMoney(order.remainingPayment) > 0;
}

/** Установка сделана, а клиент заплатил не всё: заказ ждёт оплаты. */
export function isAwaitingPayment(order: {
  readonly status: OrderStatus;
  readonly orderType: OrderType;
  readonly remainingPayment: string | null;
}): boolean {
  return order.status === OrderStatus.INSTALLATION_DONE && closeBlockedByDebt(order);
}

/**
 * Статусы, в которых остаток уже долг: работа сделана, деньги не получены.
 * Пока заказ в производстве, неоплаченный остаток — обычная доплата.
 */
export const DEBT_STATUSES: readonly OrderStatus[] = [
  OrderStatus.INSTALLATION_DONE,
  OrderStatus.COMPLETED,
];

/**
 * Метраж материала после правки позиции.
 *
 * Метраж проставляет админ после приёма заказа, а форма правки показывает
 * только код. Код прежний — метраж остаётся; сменили ткань — старые метры к
 * ней не относятся, и админ проставит их заново.
 */
export function editedMaterialMeters(material: {
  readonly code: string;
  readonly originalCode: string | null;
  readonly meters: number | null;
}): number | null {
  return material.code.trim() === material.originalCode ? material.meters : null;
}

export const AWAITING_PAYMENT_LABEL: Readonly<Record<Locale, string>> = {
  ru: 'Ждёт оплаты',
  uz: "To'lov kutilmoqda",
};

export const DEBT_FILTER_LABEL: Readonly<Record<Locale, string>> = {
  ru: 'С долгом',
  uz: 'Qarzdor',
};

export const EXECUTOR_LABEL: Readonly<Record<Locale, string>> = {
  ru: 'Исполнитель',
  uz: 'Ijrochi',
};

export const EXECUTOR_NOT_ASSIGNED_LABEL: Readonly<Record<Locale, string>> = {
  ru: 'не назначен',
  uz: 'tayinlanmagan',
};

import type { Translated } from '../i18n/locale';
import { OrderType, type OrderType as OrderTypeName } from '../enums/orderType.enum';
import { Role, type Role as RoleName } from '../enums/role.enum';

/**
 * Сдельные расценки по этапам заказа.
 *
 * За каждый этап исполнителю платят сумму, назначенную вручную при приёме
 * заказа. Формулой она не выводится: сложность работы не выражается ни ценой
 * заказа, ни площадью штор — два окна одинакового размера шьются по-разному,
 * и это знает человек, а не расчёт.
 *
 * Список этапов здесь, а не в `packages/db`: его одинаково читают форма
 * приёма заказа в панели, форма в мобильном приложении и расчёт зарплаты.
 * Привязку к колонкам таблицы знает только API — это деталь хранения.
 */

export const ORDER_STAGE_FEES = ['measurement', 'sewing', 'qc', 'installation'] as const;

export type OrderStageFee = (typeof ORDER_STAGE_FEES)[number];

export const OrderStageFee = {
  MEASUREMENT: 'measurement',
  SEWING: 'sewing',
  QC: 'qc',
  INSTALLATION: 'installation',
} as const satisfies Record<string, OrderStageFee>;

export const ORDER_STAGE_FEE_LABELS: Translated<OrderStageFee> = {
  ru: {
    measurement: 'За замер',
    sewing: 'За пошив',
    qc: 'За контроль качества',
    installation: 'За установку',
  },
  uz: {
    measurement: "O'lchov uchun",
    sewing: 'Tikuv uchun',
    qc: 'Sifat nazorati uchun',
    installation: "O'rnatish uchun",
  },
};

export const ORDER_STAGE_FEE_LABELS_RU = ORDER_STAGE_FEE_LABELS.ru;

/**
 * Роль, которая получает расценку этапа.
 *
 * Продавца здесь нет намеренно: он получает по своей схеме — фиксом за
 * закрытый заказ, — а не сдельной строкой в самом заказе. Иначе одна и та же
 * работа оплачивалась бы дважды из двух разных мест.
 */
export const ORDER_STAGE_FEE_ROLE = {
  measurement: Role.MASTER,
  sewing: Role.SEWER,
  qc: Role.QC,
  installation: Role.INSTALLER,
  /*
    `as const satisfies` вместо аннотации типом.

    Аннотация расширяла значения до всех восьми ролей системы, и вызов
    `orders.assign` с ролью этапа не проходил проверку: процедура принимает
    только четыре назначаемые роли, а тип обещал ей и директора, и продавца.
    `satisfies` сохраняет прежнее ограничение — ключом остаётся этап,
    значением роль, — но оставляет значения такими, какие они есть.
  */
} as const satisfies Readonly<Record<OrderStageFee, RoleName>>;

/** Этап, за который платят сотруднику этой роли. `null` — роль сдельной оплаты не получает. */
export function stageFeeOfRole(role: RoleName): OrderStageFee | null {
  return (
    ORDER_STAGE_FEES.find((stage) => ORDER_STAGE_FEE_ROLE[stage] === role) ?? null
  );
}

/**
 * Этапы, применимые к заказу этого типа.
 *
 * У готовых штор нет ни замера, ни пошива, ни контроля: товар продаётся с
 * витрины. Остаётся установка, и то не всегда. Показывать продавцу четыре
 * пустых поля при каждой продаже с витрины — верный способ, чтобы он
 * перестал заполнять и то единственное, которое нужно.
 */
export function stageFeesOfOrderType(orderType: OrderTypeName): readonly OrderStageFee[] {
  return orderType === OrderType.READY_MADE
    ? [OrderStageFee.INSTALLATION]
    : ORDER_STAGE_FEES;
}

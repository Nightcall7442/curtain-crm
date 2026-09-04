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

/**
 * Порядок — производственный, а не алфавитный: замер, раскрой, пошив,
 * контроль, установка. По нему рисуются поля во всех формах, и заказ в них
 * читается так же, как проходит цех.
 */
export const ORDER_STAGE_FEES = [
  'measurement',
  'cutting',
  'sewing',
  'qc',
  'installation',
] as const;

export type OrderStageFee = (typeof ORDER_STAGE_FEES)[number];

export const OrderStageFee = {
  MEASUREMENT: 'measurement',
  CUTTING: 'cutting',
  SEWING: 'sewing',
  QC: 'qc',
  INSTALLATION: 'installation',
} as const satisfies Record<string, OrderStageFee>;

export const ORDER_STAGE_FEE_LABELS: Translated<OrderStageFee> = {
  ru: {
    measurement: 'За замер',
    cutting: 'За раскрой',
    sewing: 'За пошив',
    qc: 'За контроль качества',
    installation: 'За установку',
  },
  uz: {
    measurement: "O'lchov uchun",
    cutting: 'Bichish uchun',
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
  /*
    Раскрой числится за швеёй — временно и осознанно.

    Закройщика в штате пока нет, раскраивает та же швея, что потом шьёт.
    Заводить роль под несуществующую должность значило бы раздать её тем же
    людям и получить пустой уровень доступа.

    Когда закройщик появится: добавить роль в `ROLES`, поменять здесь одну
    строку и колонку исполнителя в `STAGE_EXECUTOR_COLUMN` на сервере.
    Расценка, суммы в закрытых заказах и расчёт зарплаты переживут это без
    правок — они читают эту таблицу, а не знают роли наизусть.
  */
  cutting: Role.SEWER,
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

/**
 * Этапы, за которые платят сотруднику этой роли. Пустой список — роль
 * сдельной оплаты не получает.
 *
 * Список, а не один этап: пока нет закройщика, швея получает и за раскрой, и
 * за пошив. Прежняя версия возвращала первый подошедший этап, и с появлением
 * раскроя швея молча потеряла бы половину сдельных — `find` вернул бы
 * «раскрой» и остановился, а «пошив» в расчёт бы не попал.
 */
export function stageFeesOfRole(role: RoleName): readonly OrderStageFee[] {
  return ORDER_STAGE_FEES.filter((stage) => ORDER_STAGE_FEE_ROLE[stage] === role);
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

import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Касса: чем и за что заплатил клиент.
 *
 * До этого деньги жили только в заказе (`work_price`, `deposit`) и в чеке
 * витрины — без ответа на вопрос, которым заканчивается каждый день
 * директора: сколько пришло наличными, сколько по карте, сколько по QR
 * и Click, и сколько из этого лежит в кассе. Каждый приход теперь —
 * строка со способом и источником; заказ и чек остаются первичными
 * документами, платёж — записью о деньгах.
 */

/** Способ оплаты — то, что спрашивают у клиента у кассы. */
export const PAYMENT_METHODS = ['cash', 'card', 'qr', 'click'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  QR: 'qr',
  CLICK: 'click',
} as const satisfies Record<string, PaymentMethod>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PAYMENT_METHOD_LABELS: Translated<PaymentMethod> = {
  ru: {
    cash: 'Наличные',
    card: 'Карта',
    qr: 'QR',
    click: 'Click',
  },
  uz: {
    cash: 'Naqd',
    card: 'Karta',
    qr: 'QR',
    click: 'Click',
  },
};

export const PAYMENT_METHOD_LABELS_RU = PAYMENT_METHOD_LABELS.ru;

/**
 * Источник денег — строки дневного отчёта кассы.
 *
 * `order_deposit` — предоплата при приёме нового заказа, `order_balance` —
 * остаток по заказу (обычно у двери, при установке), `ready_made` —
 * продажа готовых штор, `other` — витрина и всё остальное.
 */
/**
 * Вид проводки — что за движение денег.
 *
 * Одна книга на всё: приходы от клиентов, инкассация (наличные с рук в
 * кассу), выплаты сотрудникам и возвраты клиентам. Что приход, что расход и
 * что перекладывание — решает вид, а не отдельная таблица: тогда «в кассе»,
 * «на руках» и «оплачено по заказу» считаются из одного места.
 */
export const PAYMENT_KINDS = [
  'order_deposit',
  'order_balance',
  'ready_made',
  'other',
  'collection',
  'payroll',
  'refund',
  'terminal_check',
] as const;

export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PaymentKind = {
  /** Первая оплата по заказу на пошив. */
  ORDER_DEPOSIT: 'order_deposit',
  /** Остаток или очередная часть по заказу. */
  ORDER_BALANCE: 'order_balance',
  /** Продажа готовых штор. */
  READY_MADE: 'ready_made',
  /** Касса по кодам склада и прочие продажи. */
  OTHER: 'other',
  /** Инкассация: сотрудник сдал наличные в кассу. */
  COLLECTION: 'collection',
  /** Выплата сотруднику по расчёту зарплаты. */
  PAYROLL: 'payroll',
  /** Возврат денег клиенту. */
  REFUND: 'refund',
  /**
   * Терминальный чек: фото с фискального терминала и сумма.
   *
   * Не движение денег, а запись о пробитом чеке — владелец: «терминальный
   * чек к кассе отношения не имеет». В кассу и на счёт не попадает, в
   * приход по источникам не входит; считается только норма дня.
   */
  TERMINAL_CHECK: 'terminal_check',
} as const satisfies Record<string, PaymentKind>;

/** Приходы от клиентов — строки отчёта кассы «откуда деньги». */
export const PAYMENT_INCOME_KINDS = [
  PaymentKind.ORDER_DEPOSIT,
  PaymentKind.ORDER_BALANCE,
  PaymentKind.READY_MADE,
  PaymentKind.OTHER,
] as const;

export type PaymentIncomeKind = (typeof PAYMENT_INCOME_KINDS)[number];

export const paymentKindSchema = z.enum(PAYMENT_KINDS);
export const paymentIncomeKindSchema = z.enum(PAYMENT_INCOME_KINDS);

export const PAYMENT_KIND_LABELS: Translated<PaymentKind> = {
  ru: {
    order_deposit: 'Новые заказы — первая оплата',
    order_balance: 'Остатки по заказам',
    ready_made: 'Готовые шторы',
    other: 'Прочие продажи',
    collection: 'Инкассация',
    payroll: 'Выплата зарплаты',
    refund: 'Возврат клиенту',
    terminal_check: 'Терминальный чек',
  },
  uz: {
    order_deposit: 'Yangi buyurtmalar — birinchi to‘lov',
    order_balance: 'Buyurtmalar qoldiqlari',
    ready_made: 'Tayyor pardalar',
    other: 'Boshqa sotuvlar',
    collection: 'Inkassatsiya',
    payroll: 'Maosh to‘lovi',
    refund: 'Mijozga qaytarish',
    terminal_check: 'Terminal cheki',
  },
};

export const PAYMENT_KIND_LABELS_RU = PAYMENT_KIND_LABELS.ru;

/** Безналичные способы — деньги сразу на счёте, через руки не проходят. */
export const CASHLESS_METHODS = [PaymentMethod.CARD, PaymentMethod.QR, PaymentMethod.CLICK] as const;

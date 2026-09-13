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
export const PAYMENT_KINDS = ['order_deposit', 'order_balance', 'ready_made', 'other'] as const;

export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PaymentKind = {
  ORDER_DEPOSIT: 'order_deposit',
  ORDER_BALANCE: 'order_balance',
  READY_MADE: 'ready_made',
  OTHER: 'other',
} as const satisfies Record<string, PaymentKind>;

export const paymentKindSchema = z.enum(PAYMENT_KINDS);

export const PAYMENT_KIND_LABELS: Translated<PaymentKind> = {
  ru: {
    order_deposit: 'Новые заказы — предоплата',
    order_balance: 'Остатки по заказам',
    ready_made: 'Готовые шторы',
    other: 'Прочие продажи',
  },
  uz: {
    order_deposit: 'Yangi buyurtmalar — oldindan to‘lov',
    order_balance: 'Buyurtmalar qoldiqlari',
    ready_made: 'Tayyor pardalar',
    other: 'Boshqa sotuvlar',
  },
};

export const PAYMENT_KIND_LABELS_RU = PAYMENT_KIND_LABELS.ru;

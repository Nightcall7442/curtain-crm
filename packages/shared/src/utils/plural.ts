/**
 * Склонение существительных после числа.
 *
 * В русском три формы, и выбор между ними — не «один или много», а остаток
 * от деления: «21 балл», но «11 баллов»; «2 года», но «12 лет». Написать это
 * по месту — значит рано или поздно получить «1 баллов» на экране.
 *
 * Функция уже существовала внутри `formatTenure`, но была локальной, и
 * рейтинг о ней не знал — на главном экране действительно печаталось
 * «1 баллов». Здесь она вынесена, чтобы следующему месту не пришлось
 * изобретать её заново.
 */

/** Три формы: для 1, для 2–4 и для остальных. */
export type PluralForms = readonly [one: string, few: string, many: string];

export function plural(value: number, forms: PluralForms): string {
  const absolute = Math.abs(Math.trunc(value));

  const mod100 = absolute % 100;
  const mod10 = absolute % 10;

  // 11–14 — исключение: несмотря на последнюю цифру, у них форма «многих».
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];

  return forms[2];
}

/** Число вместе со склонённым словом: `21 балл`, `11 баллов`. */
export function pluralize(value: number, forms: PluralForms): string {
  return `${value.toString()} ${plural(value, forms)}`;
}

/* -------------------------------------------------------------------------- */
/*  Готовые наборы форм                                                       */
/* -------------------------------------------------------------------------- */

export const PLURAL_POINTS: PluralForms = ['балл', 'балла', 'баллов'];
export const PLURAL_ORDERS: PluralForms = ['заказ', 'заказа', 'заказов'];
export const PLURAL_PARTICIPANTS: PluralForms = ['участник', 'участника', 'участников'];
export const PLURAL_DAYS: PluralForms = ['день', 'дня', 'дней'];
export const PLURAL_YEARS: PluralForms = ['год', 'года', 'лет'];
export const PLURAL_MONTHS: PluralForms = ['месяц', 'месяца', 'месяцев'];

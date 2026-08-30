import { formatMoney, type MoneyMinor } from '@curtain-crm/shared';

/**
 * Компактная сумма для карточек списка: «13,8 млн сум» вместо
 * «13 800 000 сум».
 *
 * Полная запись в узкой карточке заказа не помещается рядом со сроком и
 * переносится на вторую строку — восемь цифр подряд на телефоне не читаются
 * мельком. Это ЧИСТО экранное сокращение: везде, где сумма — предмет
 * (карточка заказа, зарплата), остаётся полный `formatMoney` из shared.
 *
 * Округление до одного знака после запятой: «17,2 млн» — этого достаточно,
 * чтобы отличить заказ от заказа; точную сумму показывает карточка.
 */
export function formatMoneyShort(minor: MoneyMinor): string {
  const soums = minor / 100;
  const abs = Math.abs(soums);

  if (abs >= 1_000_000_000) return `${trim(soums / 1_000_000_000)} млрд сум`;
  if (abs >= 1_000_000) return `${trim(soums / 1_000_000)} млн сум`;
  if (abs >= 10_000) return `${trim(soums / 1_000)} тыс. сум`;

  return formatMoney(minor);
}

function trim(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

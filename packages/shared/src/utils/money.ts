import type { Locale } from '../i18n/locale';

/**
 * Денежные величины.
 *
 * В БД суммы хранятся как `numeric(14, 2)` и приходят из Drizzle строкой —
 * это осознанный выбор: `double precision` для денег даёт накопленную ошибку
 * при расчёте зарплаты и себестоимости.
 *
 * В прикладном коде сумма представляется целым числом «мелких единиц»
 * (сотых долей сума, tiyin). Все арифметические операции идут в целых числах,
 * и только на границе БД/интерфейса выполняется конвертация.
 */

/** Валюта системы. Мультивалютность не требуется. */
export const CURRENCY_CODE = 'UZS';

/**
 * Обозначение валюты на языке интерфейса.
 *
 * Одна и та же валюта, но пишется по-разному: «сум» и «so'm». Это не перевод
 * названия, а его исходное написание в каждом языке, поэтому подстановка
 * обязательна — «сум» в узбекском тексте читается как чужое слово.
 */
export const CURRENCY_SYMBOL: Readonly<Record<Locale, string>> = {
  ru: 'сум',
  uz: "so'm",
};

export const CURRENCY_SYMBOL_RU = CURRENCY_SYMBOL.ru;

/** Количество знаков после запятой в хранимой сумме. */
export const MONEY_SCALE = 2;

const MINOR_UNITS_PER_MAJOR = 10 ** MONEY_SCALE;

/**
 * Сумма в мелких единицах (целое число).
 * Тип-алиас, а не branded type: избыточная строгость здесь мешала бы больше,
 * чем помогала, — вся арифметика всё равно проходит через функции этого модуля.
 */
export type MoneyMinor = number;

/** Максимальная сумма, которую можно безопасно представить целым числом. */
export const MAX_MONEY_MINOR = Number.MAX_SAFE_INTEGER;

const isSafeMinor = (value: number): boolean =>
  Number.isInteger(value) && Math.abs(value) <= MAX_MONEY_MINOR;

/** Округление «половина от нуля» — как в бухгалтерии, а не как `Math.round` для отрицательных. */
const roundHalfAwayFromZero = (value: number): number =>
  value < 0 ? -Math.round(-value) : Math.round(value);

/**
 * Разбирает сумму из строки БД (`"1250000.00"`) или из числа в основных единицах.
 *
 * @throws {RangeError} если значение не является конечным числом или выходит
 *   за пределы безопасного целого. Молча возвращать 0 здесь опасно: ошибка
 *   разбора превратилась бы в «зарплата 0» без единого следа в логах.
 */
export function parseMoney(value: string | number): MoneyMinor {
  const major = typeof value === 'string' ? Number.parseFloat(value) : value;

  if (!Number.isFinite(major)) {
    throw new RangeError(`Некорректная денежная сумма: ${String(value)}`);
  }

  const minor = roundHalfAwayFromZero(major * MINOR_UNITS_PER_MAJOR);
  if (!isSafeMinor(minor)) {
    throw new RangeError(`Денежная сумма вне допустимого диапазона: ${String(value)}`);
  }

  return minor;
}

/** Безопасный разбор: возвращает `null` вместо исключения. */
export function tryParseMoney(value: string | number | null | undefined): MoneyMinor | null {
  if (value === null || value === undefined) return null;
  try {
    return parseMoney(value);
  } catch {
    return null;
  }
}

/** Строка для записи в колонку `numeric(14, 2)`: `"1250000.00"`. */
export function moneyToDecimalString(minor: MoneyMinor): string {
  if (!isSafeMinor(minor)) {
    throw new RangeError(`Денежная сумма вне допустимого диапазона: ${String(minor)}`);
  }
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const major = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;
  return `${sign}${major.toString()}.${fraction.toString().padStart(MONEY_SCALE, '0')}`;
}

/** Сумма нескольких величин. */
export function sumMoney(values: readonly MoneyMinor[]): MoneyMinor {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  if (!isSafeMinor(total)) {
    throw new RangeError('Переполнение при суммировании денежных величин');
  }
  return total;
}

/** Умножение суммы на количество или коэффициент с округлением до мелкой единицы. */
export function multiplyMoney(minor: MoneyMinor, factor: number): MoneyMinor {
  if (!Number.isFinite(factor)) {
    throw new RangeError(`Некорректный множитель: ${String(factor)}`);
  }
  const result = roundHalfAwayFromZero(minor * factor);
  if (!isSafeMinor(result)) {
    throw new RangeError('Переполнение при умножении денежной величины');
  }
  return result;
}

/** Процент от суммы: `percentOfMoney(1_000_00, 15)` -> 150.00. */
export function percentOfMoney(minor: MoneyMinor, percent: number): MoneyMinor {
  return multiplyMoney(minor, percent / 100);
}

/** Отображение для интерфейса: `1 250 000 сум`. Дробная часть скрыта, если она нулевая. */
export function formatMoney(
  minor: MoneyMinor,
  options?: { readonly withCurrency?: boolean; readonly locale?: Locale },
): string {
  const withCurrency = options?.withCurrency ?? true;
  const locale = options?.locale ?? 'ru';
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const major = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;

  // Неразрывный пробел (U+00A0) как разделитель разрядов: сумма не должна
  // разрываться переносом строки посередине. Записан escape-последовательностью,
  // а не самим символом — невидимый в исходнике пробел легко потерять при правке.
  const majorFormatted = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const fractionFormatted =
    fraction === 0 ? '' : `,${fraction.toString().padStart(MONEY_SCALE, '0')}`;

  const amount = `${sign}${majorFormatted}${fractionFormatted}`;
  return withCurrency ? `${amount}\u00A0${CURRENCY_SYMBOL[locale]}` : amount;
}

/**
 * Компактная сумма для плотных списков: `13,8 млн сум` вместо
 * `13 800 000 сум`.
 *
 * Восемь цифр подряд в строке таблицы никто не читает — их сравнивают
 * по порядку величины. Точная запись остаётся там, где сумма — предмет
 * (карточка заказа, ведомость зарплаты): это ЭКРАННОЕ сокращение,
 * а не новый формат хранения.
 *
 * Один знак после запятой: этого хватает, чтобы отличить заказ от заказа.
 * Суммы до 10 тысяч сумов отдаются полностью — сокращать в них нечего.
 */
export function formatMoneyShort(
  minor: MoneyMinor,
  options?: { readonly locale?: Locale },
): string {
  const locale = options?.locale ?? 'ru';
  const soums = minor / MINOR_UNITS_PER_MAJOR;
  const absolute = Math.abs(soums);

  const scaled =
    absolute >= 1_000_000_000
      ? { value: soums / 1_000_000_000, unit: { ru: 'млрд', uz: 'mlrd' } as const }
      : absolute >= 1_000_000
        ? { value: soums / 1_000_000, unit: { ru: 'млн', uz: 'mln' } as const }
        : absolute >= 10_000
          ? { value: soums / 1_000, unit: { ru: 'тыс.', uz: 'ming' } as const }
          : null;

  if (scaled === null) return formatMoney(minor, { locale });

  // Один знак после запятой, без хвостового нуля: «14 млн», а не «14,0 млн».
  const rounded = Math.round(scaled.value * 10) / 10;
  const amount = rounded.toString().replace('.', ',');

  // Пробелы неразрывные, как в `formatMoney`: сумма не рвётся переносом.
  return [amount, scaled.unit[locale], CURRENCY_SYMBOL[locale]].join(' ');
}

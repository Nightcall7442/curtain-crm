/**
 * Телефонные номера Узбекистана.
 *
 * Логика перенесена из `curtain-bot` (`validate_phone`, `format_phone`) и доработана:
 *  - введён канонический формат хранения E.164 (`+998XXXXXXXXX`) — в боте номер
 *    хранился «как ввели», из-за чего поиск по номеру не находил дубли;
 *  - добавлена проверка кода оператора/региона: он не может начинаться с 0 или 1,
 *    поэтому «000000000» больше не считается валидным номером;
 *  - поддержан ввод с префиксом `8` и с любыми разделителями.
 */

/** Код страны Узбекистана. */
export const UZ_COUNTRY_CODE = '998';

/** Длина национального номера без кода страны. */
const NATIONAL_NUMBER_LENGTH = 9;

/** Длина полного номера с кодом страны. */
const FULL_NUMBER_LENGTH = UZ_COUNTRY_CODE.length + NATIONAL_NUMBER_LENGTH;

/**
 * Приводит произвольный пользовательский ввод к национальному номеру из 9 цифр.
 *
 * Принимает: `901234567`, `+998 90 123 45 67`, `998901234567`, `8 90 123-45-67`.
 *
 * @returns 9 цифр национального номера или `null`, если ввод не похож на номер.
 */
function toNationalDigits(input: string): string | null {
  if (typeof input !== 'string') return null;

  let digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Междугородний префикс «8», принятый при наборе внутри страны.
  if (digits.length === NATIONAL_NUMBER_LENGTH + 1 && digits.startsWith('8')) {
    digits = digits.slice(1);
  }

  if (digits.length === FULL_NUMBER_LENGTH && digits.startsWith(UZ_COUNTRY_CODE)) {
    digits = digits.slice(UZ_COUNTRY_CODE.length);
  }

  if (digits.length !== NATIONAL_NUMBER_LENGTH) return null;

  // Код оператора (первые две цифры) в Узбекистане всегда >= 20.
  const operatorCode = digits.slice(0, 2);
  if (operatorCode.startsWith('0') || operatorCode.startsWith('1')) return null;

  return digits;
}

/** Валиден ли номер телефона. */
export function isValidPhone(input: string): boolean {
  return toNationalDigits(input) !== null;
}

/**
 * Канонический формат для хранения в БД: `+998901234567`.
 *
 * Все номера в базе хранятся именно так — это единственный способ гарантировать,
 * что поиск клиента по номеру и проверка дублей работают независимо от того,
 * как продавец ввёл номер.
 *
 * @returns `null`, если ввод не является корректным узбекским номером.
 */
export function normalizePhone(input: string): string | null {
  const national = toNationalDigits(input);
  if (national === null) return null;
  return `+${UZ_COUNTRY_CODE}${national}`;
}

/**
 * Формат для отображения: `+998 90 123 45 67`.
 *
 * Если номер не распознан — возвращает исходную строку без изменений,
 * чтобы не терять данные, введённые до появления валидации.
 */
export function formatPhone(input: string): string {
  const national = toNationalDigits(input);
  if (national === null) return input;

  const operator = national.slice(0, 2);
  const part1 = national.slice(2, 5);
  const part2 = national.slice(5, 7);
  const part3 = national.slice(7, 9);

  return `+${UZ_COUNTRY_CODE} ${operator} ${part1} ${part2} ${part3}`;
}

/** Ссылка `tel:` для кнопки «Позвонить» в мобильном приложении. */
export function toTelHref(input: string): string | null {
  const normalized = normalizePhone(input);
  return normalized === null ? null : `tel:${normalized}`;
}

import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

/**
 * Русские тексты ошибок валидации.
 *
 * Zod по умолчанию отвечает по-английски, и эти тексты доходили до сотрудника
 * как есть: «Number must be less than or equal to 90», «Required». Формулировки
 * в схемах (`nonEmptyString('Укажите имя клиента')`) закрывали только те поля,
 * до которых дошли руки, — остальные оставались английскими.
 *
 * Карта заменяет ТОЛЬКО значения по умолчанию: если у схемы задано своё
 * сообщение, Zod возьмёт его, сюда управление не попадёт.
 *
 * Отдельная тонкость — перечисления. Стандартный текст перечисляет все
 * допустимые значения (`Expected 'ceo' | 'admin' | …`), то есть выдаёт наружу
 * внутренние коды системы и при этом ничем не помогает: значение приходит
 * из выпадающего списка, а не набирается руками.
 */

/** Названия типов в родительном падеже — для «ожидается строка». */
const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'строка',
  number: 'число',
  boolean: 'да/нет',
  date: 'дата',
  array: 'список',
  object: 'объект',
  integer: 'целое число',
  bigint: 'целое число',
};

const typeName = (value: string): string => TYPE_NAMES[value] ?? value;

/** «5 символов» / «2 символа» / «1 символ». */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const units = (count: number, kind: 'string' | 'array'): string =>
  kind === 'string'
    ? plural(count, 'символа', 'символов', 'символов')
    : plural(count, 'элемента', 'элементов', 'элементов');

export const russianErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type: {
      // `undefined` и `null` означают «поле не прислали», а не «неверный тип»:
      // для формы это разные подсказки.
      if (issue.received === 'undefined') return { message: 'Поле обязательно' };
      if (issue.received === 'null') return { message: 'Поле не может быть пустым' };
      return { message: `Ожидается ${typeName(issue.expected)}` };
    }

    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
      return { message: 'Недопустимое значение' };

    case ZodIssueCode.invalid_union:
      return { message: 'Значение не подходит ни под один допустимый формат' };

    case ZodIssueCode.unrecognized_keys:
      return { message: `Лишние поля: ${issue.keys.join(', ')}` };

    case ZodIssueCode.invalid_date:
      return { message: 'Некорректная дата' };

    case ZodIssueCode.invalid_string: {
      if (issue.validation === 'email') return { message: 'Некорректный адрес почты' };
      if (issue.validation === 'url') return { message: 'Некорректная ссылка' };
      if (issue.validation === 'uuid') return { message: 'Некорректный идентификатор' };
      if (issue.validation === 'datetime') return { message: 'Некорректные дата и время' };
      if (issue.validation === 'date') return { message: 'Некорректная дата' };
      return { message: 'Значение не соответствует формату' };
    }

    case ZodIssueCode.too_small: {
      const min = Number(issue.minimum);

      if (issue.type === 'string') {
        if (issue.exact) return { message: `Ровно ${min.toString()} ${units(min, 'string')}` };
        if (min <= 1) return { message: 'Поле обязательно для заполнения' };
        return { message: `Не короче ${min.toString()} ${units(min, 'string')}` };
      }

      if (issue.type === 'array') {
        if (min <= 1) return { message: 'Добавьте хотя бы одно значение' };
        return { message: `Не меньше ${min.toString()} ${units(min, 'array')}` };
      }

      if (issue.type === 'date') return { message: 'Дата слишком ранняя' };

      return {
        message: issue.inclusive
          ? `Значение не меньше ${min.toString()}`
          : `Значение больше ${min.toString()}`,
      };
    }

    case ZodIssueCode.too_big: {
      const max = Number(issue.maximum);

      if (issue.type === 'string') {
        if (issue.exact) return { message: `Ровно ${max.toString()} ${units(max, 'string')}` };
        return { message: `Не длиннее ${max.toString()} ${units(max, 'string')}` };
      }

      if (issue.type === 'array') {
        return { message: `Не больше ${max.toString()} ${units(max, 'array')}` };
      }

      if (issue.type === 'date') return { message: 'Дата слишком поздняя' };

      return {
        message: issue.inclusive
          ? `Значение не больше ${max.toString()}`
          : `Значение меньше ${max.toString()}`,
      };
    }

    case ZodIssueCode.not_multiple_of:
      return { message: `Значение должно быть кратно ${String(issue.multipleOf)}` };

    case ZodIssueCode.not_finite:
      return { message: 'Значение должно быть конечным числом' };

    default:
      // Всё остальное (в том числе `custom` из `.refine()`) уже приходит
      // с собственным текстом схемы.
      return { message: ctx.defaultError };
  }
};

/**
 * Включает русские тексты для ВСЕХ схем процесса.
 *
 * Вызывается один раз при старте сервера. Функция, а не побочный эффект при
 * импорте: побочный эффект сработал бы и в юнит-тестах чистых функций,
 * которые про локализацию ничего не знают и проверяют схемы напрямую.
 */
export function installRussianZodMessages(): void {
  z.setErrorMap(russianErrorMap);
}

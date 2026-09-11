import {
  CORNICE_STATUS_LABELS,
  MATERIAL_SLOT_LABELS,
  MONTH_NAMES_RU,
  MONTH_NAMES_UZ,
  ORDER_STAGE_FEE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PAYROLL_RECORD_STATUS_LABELS,
  PAYROLL_SCHEME_TYPE_LABELS,
  PHOTO_STAGE_LABELS,
  ROLE_LABELS,
  transitionLabel,
  WEEKDAY_NAMES_RU,
  WEEKDAY_NAMES_UZ,
  type Locale,
  type Translated,
} from '@curtain-crm/shared';

/**
 * Перевод по исходной строке — как gettext.
 *
 * Русский текст в коде остаётся ключом: точное соответствие ищется в
 * таблице, текст с подстановками — по шаблону с `{плейсхолдерами}`.
 * Захваченный кусок, если это русская подпись справочника (статус, роль,
 * стадия, месяц, день недели), тоже переводится.
 *
 * Одна механика на ошибки (`errorTranslations.ts`) и уведомления
 * (`notificationTranslations.ts`): у них разные таблицы, но одинаковая
 * плата — таблица обязана знать каждый текст, и это проверяют тесты.
 */

export type TranslationTable = {
  readonly exact: Readonly<Record<string, string>>;
  /** `[русский шаблон, узбекский шаблон]`; более частные шаблоны — раньше. */
  readonly patterns: readonly (readonly [ru: string, uz: string])[];
};

/* -------------------------------------------------------------------------- */
/*  Подписи справочников внутри текста                                        */
/* -------------------------------------------------------------------------- */

const LABEL_RU_TO_UZ: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const add = <TKey extends string>(dict: Translated<TKey>): void => {
    for (const key of Object.keys(dict.ru) as TKey[]) map.set(dict.ru[key], dict.uz[key]);
  };
  add(ORDER_STATUS_LABELS);
  add(ROLE_LABELS);
  add(PHOTO_STAGE_LABELS);
  add(CORNICE_STATUS_LABELS);
  add(PAYROLL_RECORD_STATUS_LABELS);
  add(PAYROLL_SCHEME_TYPE_LABELS);
  add(ORDER_STAGE_FEE_LABELS);
  add(MATERIAL_SLOT_LABELS);
  // Подписи кнопок переходов («Отдать на пошив») — в тексте про права.
  for (const transition of ORDER_TRANSITIONS) {
    map.set(transition.label, transitionLabel(transition, 'uz'));
  }
  // «каждую неделю — пятница»: день недели в теле уведомления строчными.
  for (const day of [1, 2, 3, 4, 5, 6, 7] as const) {
    map.set(WEEKDAY_NAMES_RU[day].toLowerCase(), WEEKDAY_NAMES_UZ[day].toLowerCase());
  }
  return map;
})();

// `\b` в JS не знает кириллицы — границы слова через просмотр вокруг.
const MONTH_RX = new RegExp(`(?<![А-Яа-яЁё])(${MONTH_NAMES_RU.join('|')})(?![А-Яа-яЁё])`, 'g');

/** Захваченный кусок: подпись справочника, список подписей через запятую, месяц в периоде. */
function translateFragment(value: string): string {
  const direct = LABEL_RU_TO_UZ.get(value);
  if (direct !== undefined) return direct;
  if (value.includes(', ')) {
    return value
      .split(', ')
      .map((part) => LABEL_RU_TO_UZ.get(part) ?? part)
      .join(', ');
  }
  // «Сентябрь 2026» → «Sentabr 2026»
  return value.replace(MONTH_RX, (month) => {
    const index = (MONTH_NAMES_RU as readonly string[]).indexOf(month);
    return index === -1 ? month : (MONTH_NAMES_UZ[index] ?? month);
  });
}

/* -------------------------------------------------------------------------- */
/*  Компиляция таблицы                                                        */
/* -------------------------------------------------------------------------- */

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileTranslator(table: TranslationTable): (text: string, locale: Locale) => string {
  const compiled = table.patterns.map(([ru, uz]) => {
    const names: string[] = [];
    const source = ru
      .split(/(\{\w+\})/)
      .map((chunk) => {
        const match = /^\{(\w+)\}$/.exec(chunk);
        if (match?.[1] === undefined) return escapeRegExp(chunk);
        names.push(match[1]);
        return '([\\s\\S]+?)';
      })
      .join('');
    return { rx: new RegExp(`^${source}$`), uz, names };
  });

  return (text, locale) => {
    if (locale === 'ru') return text;

    const exact = table.exact[text];
    if (exact !== undefined) return exact;

    for (const { rx, uz, names } of compiled) {
      const match = rx.exec(text);
      if (match === null) continue;
      return names.reduce(
        (result, name, index) =>
          result.replaceAll(`{${name}}`, translateFragment(match[index + 1] ?? '')),
        uz,
      );
    }

    // Текст без перевода уходит по-русски — лучше пустоты; тест не даст
    // такому появиться незаметно.
    return text;
  };
}

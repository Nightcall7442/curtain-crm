import { z } from 'zod';

import { Role, type Role as RoleName } from './role.enum';

/**
 * Кадровые атрибуты сотрудника.
 *
 * Отличаются от ролей и не заменяют их: роль определяет ПРАВА в системе
 * (их может быть несколько), подразделение и должность — организационную
 * принадлежность (одна). Мастер-замерщик со второй ролью швеи числится
 * в одном подразделении, но имеет два набора прав.
 */

/* -------------------------------------------------------------------------- */
/*                              Подразделения                                 */
/* -------------------------------------------------------------------------- */

export const DEPARTMENTS = [
  'sewing',
  'installation',
  'cutting',
  'sales',
  'administration',
  'quality',
  'other',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const Department = {
  SEWING: 'sewing',
  INSTALLATION: 'installation',
  CUTTING: 'cutting',
  SALES: 'sales',
  ADMINISTRATION: 'administration',
  QUALITY: 'quality',
  OTHER: 'other',
} as const satisfies Record<string, Department>;

export const departmentSchema = z.enum(DEPARTMENTS);

export const DEPARTMENT_LABELS_RU: Readonly<Record<Department, string>> = {
  sewing: 'Швейный цех',
  installation: 'Установка',
  cutting: 'Раскрой',
  sales: 'Продажи',
  administration: 'Администрация',
  quality: 'Контроль качества',
  other: 'Другое',
};

/**
 * Подразделение по умолчанию для роли.
 *
 * Используется только как подсказка при заведении сотрудника: реальное
 * подразделение хранится отдельным полем, потому что раскройщик и швея
 * работают в разных подразделениях с одной и той же ролью `sewer`.
 */
export const DEFAULT_DEPARTMENT_BY_ROLE: Readonly<Record<RoleName, Department>> = {
  ceo: Department.ADMINISTRATION,
  admin: Department.ADMINISTRATION,
  seller: Department.SALES,
  master: Department.SEWING,
  sewer: Department.SEWING,
  qc: Department.QUALITY,
  installer: Department.INSTALLATION,
  smm: Department.OTHER,
};

/* -------------------------------------------------------------------------- */
/*                              Тип занятости                                 */
/* -------------------------------------------------------------------------- */

export const EMPLOYMENT_TYPES = ['permanent', 'probation', 'temporary', 'intern'] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EmploymentType = {
  PERMANENT: 'permanent',
  PROBATION: 'probation',
  TEMPORARY: 'temporary',
  INTERN: 'intern',
} as const satisfies Record<string, EmploymentType>;

export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);

export const EMPLOYMENT_TYPE_LABELS_RU: Readonly<Record<EmploymentType, string>> = {
  permanent: 'Постоянный',
  probation: 'Испытательный срок',
  temporary: 'Временный',
  intern: 'Стажёр',
};

/* -------------------------------------------------------------------------- */
/*                          Присутствие сегодня                               */
/* -------------------------------------------------------------------------- */

/**
 * Статус сотрудника на сегодня — вычисляемый, в БД не хранится.
 *
 * Значения `at_work` и `absent` выводятся из смен: открытая смена сегодня —
 * «на работе», иначе «отсутствует». `finished` — смена была и уже закрыта.
 *
 * Отдельного статуса «перерыв» НЕТ: по требованию заказчика смена учитывается
 * одним блоком, без перерывов, поэтому вывести его не из чего.
 */
export const PRESENCE_STATUSES = ['at_work', 'finished', 'absent'] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const PresenceStatus = {
  AT_WORK: 'at_work',
  FINISHED: 'finished',
  ABSENT: 'absent',
} as const satisfies Record<string, PresenceStatus>;

export const PRESENCE_STATUS_LABELS_RU: Readonly<Record<PresenceStatus, string>> = {
  at_work: 'На работе',
  finished: 'Смена закрыта',
  absent: 'Отсутствует',
};

/* -------------------------------------------------------------------------- */
/*                              Табельный номер                               */
/* -------------------------------------------------------------------------- */

/** Формат табельного номера: `EMP-2026-0158`. */
export function formatEmployeeCode(year: number, sequence: number): string {
  return `EMP-${year.toString()}-${sequence.toString().padStart(4, '0')}`;
}

/** Стаж работы в человекочитаемом виде: `4 года 7 месяцев`. */
export function formatTenure(hiredAt: Date | string | null, now: Date = new Date()): string {
  if (hiredAt === null) return '—';

  const start = hiredAt instanceof Date ? hiredAt : new Date(hiredAt);
  if (Number.isNaN(start.getTime()) || start > now) return '—';

  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  const years = Math.floor(months / 12);
  const restMonths = months % 12;

  const plural = (value: number, forms: readonly [string, string, string]): string => {
    const mod100 = value % 100;
    const mod10 = value % 10;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  };

  const parts: string[] = [];
  if (years > 0) parts.push(`${years.toString()} ${plural(years, ['год', 'года', 'лет'])}`);
  if (restMonths > 0) {
    parts.push(`${restMonths.toString()} ${plural(restMonths, ['месяц', 'месяца', 'месяцев'])}`);
  }

  return parts.length === 0 ? 'меньше месяца' : parts.join(' ');
}

/** Ближайший день рождения и число дней до него. */
export function daysUntilBirthday(birthDate: Date | string, now: Date = new Date()): number | null {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let next = new Date(Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  if (next < today) {
    next = new Date(Date.UTC(today.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate()));
  }

  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/** Полных лет на указанную дату. */
export function ageInYears(birthDate: Date | string, now: Date = new Date()): number | null {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;

  return age < 0 ? null : age;
}

/** Возрастные группы для диаграммы «Возрастная структура». */
export const AGE_BUCKETS = [
  { key: '18-25', min: 18, max: 25 },
  { key: '26-30', min: 26, max: 30 },
  { key: '31-35', min: 31, max: 35 },
  { key: '36-40', min: 36, max: 40 },
  { key: '41-45', min: 41, max: 45 },
  { key: '46+', min: 46, max: 200 },
] as const;

export type AgeBucketKey = (typeof AGE_BUCKETS)[number]['key'];

export function ageBucket(age: number): AgeBucketKey | null {
  return AGE_BUCKETS.find((bucket) => age >= bucket.min && age <= bucket.max)?.key ?? null;
}

/** Группы стажа для диаграммы «Стаж работы». */
export const TENURE_BUCKETS = [
  { key: 'lt6m', label: 'До 6 мес.', minMonths: 0, maxMonths: 5 },
  { key: '6m-1y', label: '6 мес. – 1 год', minMonths: 6, maxMonths: 11 },
  { key: '1-3y', label: '1 – 3 года', minMonths: 12, maxMonths: 35 },
  { key: '3-5y', label: '3 – 5 лет', minMonths: 36, maxMonths: 59 },
  { key: 'gt5y', label: 'Более 5 лет', minMonths: 60, maxMonths: Number.MAX_SAFE_INTEGER },
] as const;

export type TenureBucketKey = (typeof TENURE_BUCKETS)[number]['key'];

export function tenureBucket(months: number): TenureBucketKey {
  return (
    TENURE_BUCKETS.find((bucket) => months >= bucket.minMonths && months <= bucket.maxMonths)
      ?.key ?? 'gt5y'
  );
}

/** Роли, которые считаются «руководством» при группировке по подразделениям. */
export const ADMINISTRATION_ROLES: readonly RoleName[] = [Role.CEO, Role.ADMIN];

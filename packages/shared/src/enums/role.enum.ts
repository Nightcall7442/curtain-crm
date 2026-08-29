import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Роли сотрудников.
 *
 * Роль — это НЕ поле пользователя, а связь many-to-many (таблица `user_roles`):
 * один человек может быть одновременно, например, мастером-замерщиком и швеёй.
 *
 * Единственный источник правды для всего монорепозитория: `apps/api`, `apps/web`
 * и `apps/mobile` обязаны импортировать значения отсюда, а не писать строковые
 * литералы вида `'admin'`.
 */
export const ROLES = [
  'ceo',
  'admin',
  'seller',
  'master',
  'sewer',
  'qc',
  'installer',
  'smm',
] as const;

export type Role = (typeof ROLES)[number];

/** Именованные константы ролей — вместо строковых литералов в коде. */
export const Role = {
  CEO: 'ceo',
  ADMIN: 'admin',
  SELLER: 'seller',
  MASTER: 'master',
  SEWER: 'sewer',
  QC: 'qc',
  INSTALLER: 'installer',
  SMM: 'smm',
} as const satisfies Record<string, Role>;

/** Zod-схема роли — для валидации входных данных tRPC-процедур. */
export const roleSchema = z.enum(ROLES);

/** Человекочитаемые названия ролей (русский интерфейс). */
export const ROLE_LABELS: Translated<Role> = {
  ru: {
    ceo: 'Директор',
    admin: 'Администратор',
    seller: 'Продавец',
    master: 'Мастер-замерщик',
    sewer: 'Швея',
    qc: 'Контроль качества',
    installer: 'Установщик',
    smm: 'SMM',
  },
  uz: {
    ceo: 'Direktor',
    admin: 'Administrator',
    seller: 'Sotuvchi',
    master: "O'lchovchi usta",
    sewer: 'Tikuvchi',
    qc: 'Sifat nazorati',
    installer: "O'rnatuvchi",
    smm: 'SMM',
  },
};

export const ROLE_LABELS_RU = ROLE_LABELS.ru;

/**
 * Роли, которым разрешено управлять ролями других сотрудников.
 *
 * По требованию заказчика — только CEO. Администратор ролями НЕ управляет,
 * даже своими. Проверка выполняется в `users.router.ts` через `roleGuard`.
 */
export const ROLE_MANAGER_ROLES: readonly Role[] = [Role.CEO];

/**
 * Управленческие роли: видят все заказы и все разделы веб-панели,
 * могут отменять заказы и корректировать смены.
 */
export const MANAGEMENT_ROLES: readonly Role[] = [Role.CEO, Role.ADMIN];

/**
 * Производственные роли — сотрудники, которые физически работают в цехе
 * или на объекте и отмечают смены по геолокации.
 */
export const PRODUCTION_ROLES: readonly Role[] = [
  Role.MASTER,
  Role.SEWER,
  Role.QC,
  Role.INSTALLER,
];

/**
 * Роли, которым разрешено ЗАВОДИТЬ заказ.
 *
 * Продавец принимает заказ у клиента, администратор и директор — заводят
 * задним числом или за отсутствующего продавца.
 *
 * Список общий с сервером намеренно: на нём построена `orderIntakeProcedure`,
 * и мобильное приложение по нему же решает, показывать ли кнопку «Новый
 * заказ». Две копии этого перечня разошлись бы при первой правке, и
 * пользователь увидел бы кнопку, которая заведомо откажет.
 */
export const ORDER_INTAKE_ROLES: readonly Role[] = [Role.SELLER, Role.ADMIN, Role.CEO];

/**
 * Роли, которые назначаются на конкретный заказ.
 *
 * Совпадает по составу с `PRODUCTION_ROLES`, но смысл другой и расходиться
 * они могут: там «кто отмечает смены в цехе», здесь «кого можно поставить
 * исполнителем этапа». Колонки заказа под каждую из этих ролей задаёт
 * `orderWorkflow.service.ts` — здесь только список, общий для сервера
 * и обоих клиентов.
 *
 * Тип выводится из массива, а не пишется объединением: перечисление
 * `'master' | 'sewer' | 'qc' | 'installer'` было переписано в веб-панели
 * трижды, и добавление роли пришлось бы искать по всему репозиторию.
 */
export const ASSIGNABLE_ROLES = [Role.MASTER, Role.SEWER, Role.QC, Role.INSTALLER] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

/** Type guard: является ли произвольная строка известной ролью. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Есть ли у набора ролей пользователя хотя бы одна из требуемых. */
export function hasAnyRole(userRoles: readonly Role[], required: readonly Role[]): boolean {
  return userRoles.some((role) => required.includes(role));
}

/** Входит ли пользователь в руководство (CEO или админ). */
export function isManagement(userRoles: readonly Role[]): boolean {
  return hasAnyRole(userRoles, MANAGEMENT_ROLES);
}

/** Название роли для интерфейса; для неизвестного значения возвращает его как есть. */
export function roleLabel(role: Role): string {
  return ROLE_LABELS_RU[role];
}

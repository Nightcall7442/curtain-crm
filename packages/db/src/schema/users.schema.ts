import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { branches } from './branches.schema';
import { departmentEnum, employmentTypeEnum, roleEnum } from './enums';

/**
 * Сотрудники.
 *
 * Роль здесь НЕ хранится: один человек может быть одновременно мастером-замерщиком
 * и швеёй, поэтому роли вынесены в `user_roles` (many-to-many). Это главное отличие
 * от `curtain-bot`, где роль вычислялась по принадлежности Telegram-ID к списку
 * в переменной окружения и была строго одна.
 *
 * Сотрудники не удаляются физически: увольнение — это `is_active = false`.
 * За смены, заказы и зарплатные ведомости отвечают внешние ключи с
 * `onDelete: 'restrict'`, которые не дадут удалить сотрудника с историей.
 *
 * `ON UPDATE` не задан НИ У ОДНОГО внешнего ключа во всей схеме, и это
 * решение, а не упущение: все цели ссылок — суррогатные `serial`-ключи,
 * которые никогда не меняются. Правило по умолчанию (`NO ACTION`) поэтому
 * не может сработать, а `ON UPDATE CASCADE` создавал бы ложное впечатление,
 * что первичный ключ у нас изменяемый.
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),

    fullName: text('full_name').notNull(),

    /**
     * Телефон в каноническом формате E.164 (`+998901234567`) — он же логин.
     * Нормализация выполняется `normalizePhone()` из `@curtain-crm/shared`
     * до записи, поэтому уникальный индекс действительно ловит дубли.
     */
    phone: text('phone').notNull(),

    /** Хеш пароля (scrypt, см. `apps/api/src/services/auth.service.ts`). */
    passwordHash: text('password_hash').notNull(),

    /**
     * Telegram-ID: нужен для переноса пользователей из `curtain-bot` и оставлен
     * как задел под будущую доставку уведомлений в Telegram. На вход в CRM не влияет.
     */
    telegramId: bigint('telegram_id', { mode: 'number' }),

    /** Ключ файла в хранилище (`storage.service.ts`), не публичный URL. */
    avatarStorageKey: text('avatar_storage_key'),

    /* --- Кадровые данные ---------------------------------------------------
     * Отличаются от ролей и не заменяют их: роли задают ПРАВА (их может быть
     * несколько), эти поля — организационную принадлежность (она одна).
     * Нужны разделам «Сотрудники» и «Ведомость рабочих» веб-панели.
     */

    /**
     * Табельный номер вида `EMP-2026-0158`.
     *
     * Обычная колонка, а не вычисляемая: формат включает год, а `to_char`
     * по timestamptz зависит от часового пояса сессии и потому не immutable —
     * Postgres не принял бы такое выражение в GENERATED-колонке.
     * Значение проставляет `users.create` один раз при заведении сотрудника.
     */
    employeeCode: text('employee_code'),

    /** Должность: «Швея», «Мастер цеха», «Продавец-консультант». */
    jobTitle: text('job_title'),

    department: departmentEnum('department').notNull().default('other'),
    employmentType: employmentTypeEnum('employment_type').notNull().default('permanent'),

    birthDate: date('birth_date'),

    hiredAt: date('hired_at'),
    /** Дата увольнения. Заполняется вместе с `is_active = false`. */
    firedAt: date('fired_at'),

    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('users_phone_unique').on(table.phone),
    uniqueIndex('users_telegram_id_unique').on(table.telegramId),
    uniqueIndex('users_employee_code_unique').on(table.employeeCode),
    index('users_is_active_idx').on(table.isActive),
    index('users_full_name_idx').on(table.fullName),
    index('users_department_idx').on(table.department),
    // Для виджета «Дни рождения»: выборка идёт по месяцу и дню, без года.
    index('users_birthday_idx').on(sql`extract(month from ${table.birthDate})`, sql`extract(day from ${table.birthDate})`),
    check('users_phone_e164', sql`${table.phone} ~ '^\\+998[0-9]{9}$'`),
    check(
      'users_fired_after_hired',
      sql`${table.firedAt} is null or ${table.hiredAt} is null or ${table.firedAt} >= ${table.hiredAt}`,
    ),
  ],
);

/**
 * Роли сотрудника (many-to-many).
 *
 * Управлять содержимым этой таблицы вправе только CEO — проверка в
 * `users.router.ts` через `roleGuard(ROLE_MANAGER_ROLES)`. Каждое изменение
 * дополнительно пишется в `audit_log`.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    // cascade: роль без сотрудника не имеет смысла и должна исчезнуть вместе с ним.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    role: roleEnum('role').notNull(),

    /**
     * Кто выдал роль. restrict: запись о выдаче прав — часть аудита,
     * её нельзя обезличить удалением директора.
     */
    grantedBy: integer('granted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index('user_roles_role_idx').on(table.role),
  ],
);

/**
 * Привязка сотрудника к филиалам (many-to-many).
 *
 * Сотрудник может работать в нескольких цехах; чек-ин допускается у любого из
 * своих филиалов. Ровно один филиал помечается основным (`is_primary`) —
 * он подставляется по умолчанию при создании заказа.
 */
export const userBranches = pgTable(
  'user_branches',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // restrict: филиалы не удаляются, а деактивируются. Попытка удалить филиал,
    // за которым закреплены люди, должна упасть с ошибкой, а не отвязать их молча.
    branchId: integer('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    isPrimary: boolean('is_primary').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.branchId] }),
    index('user_branches_branch_idx').on(table.branchId),
    // Основной филиал у сотрудника не более одного.
    uniqueIndex('user_branches_single_primary')
      .on(table.userId)
      .where(sql`${table.isPrimary}`),
  ],
);

/**
 * Refresh-токены сессий.
 *
 * Access-токен короткоживущий и не хранится; refresh-токен нужен мобильному
 * приложению, чтобы не заставлять сотрудника вводить пароль каждый день,
 * и чтобы CEO мог принудительно завершить сессии уволенного сотрудника.
 * В таблице лежит только хеш токена — утечка дампа не даёт войти.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tokenHash: text('token_hash').notNull(),

    /** Устройство/клиент — чтобы сотрудник видел свои активные сессии. */
    userAgent: text('user_agent'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    index('refresh_tokens_user_idx').on(table.userId),
    index('refresh_tokens_expires_idx').on(table.expiresAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type UserBranch = typeof userBranches.$inferSelect;
export type NewUserBranch = typeof userBranches.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

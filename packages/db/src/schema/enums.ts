import {
  CATALOG_KINDS,
  DAY_OFF_STATUSES,
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  NOTIFICATION_TYPES,
  ORDER_ITEM_KINDS,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYROLL_RECORD_STATUSES,
  PAYROLL_SCHEME_TYPES,
  PHOTO_STAGES,
  PRIORITIES,
  PURCHASE_CATEGORIES,
  PURCHASE_UNITS,
  ROLES,
  TASK_STATUSES,
} from '@curtain-crm/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * PostgreSQL-энумы.
 *
 * Значения берутся ИСКЛЮЧИТЕЛЬНО из `@curtain-crm/shared` — так тип колонки в БД
 * и тип в приложении не могут разойтись. Добавление нового значения = правка
 * массива в shared + `drizzle-kit generate` (Postgres умеет `ALTER TYPE ... ADD VALUE`).
 *
 * Файл вынесен отдельно, чтобы схемы таблиц могли ссылаться на энумы,
 * не импортируя друг друга и не создавая циклов.
 */

export const roleEnum = pgEnum('role', ROLES);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const orderTypeEnum = pgEnum('order_type', ORDER_TYPES);
export const priorityEnum = pgEnum('priority', PRIORITIES);
export const photoStageEnum = pgEnum('photo_stage', PHOTO_STAGES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const payrollSchemeTypeEnum = pgEnum('payroll_scheme_type', PAYROLL_SCHEME_TYPES);
export const payrollRecordStatusEnum = pgEnum('payroll_record_status', PAYROLL_RECORD_STATUSES);
export const purchaseUnitEnum = pgEnum('purchase_unit', PURCHASE_UNITS);
export const purchaseCategoryEnum = pgEnum('purchase_category', PURCHASE_CATEGORIES);
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const dayOffStatusEnum = pgEnum('day_off_status', DAY_OFF_STATUSES);
export const catalogKindEnum = pgEnum('catalog_kind', CATALOG_KINDS);
export const departmentEnum = pgEnum('department', DEPARTMENTS);
export const employmentTypeEnum = pgEnum('employment_type', EMPLOYMENT_TYPES);

export const orderItemKindEnum = pgEnum('order_item_kind', ORDER_ITEM_KINDS);

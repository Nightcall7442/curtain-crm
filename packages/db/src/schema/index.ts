/**
 * Полная схема БД.
 *
 * Этот модуль передаётся в `drizzle()` и в `drizzle.config.ts`, поэтому здесь
 * должны быть реэкспортированы ВСЕ таблицы, энумы и связи: то, чего нет в этом
 * файле, не попадёт ни в миграции, ни в `db.query.*`.
 */

export * from './enums';

export * from './branches.schema';
export * from './users.schema';
export * from './orders.schema';
export * from './orderStatusHistory.schema';
export * from './orderPhotos.schema';
export * from './orderComments.schema';
export * from './shifts.schema';
export * from './personalBreaks.schema';
export * from './personalWorks.schema';
export * from './retail.schema';
export * from './catalog.schema';
export * from './purchases.schema';
export * from './tasks.schema';
export * from './dayOffRequests.schema';
export * from './payroll.schema';
export * from './notifications.schema';
export * from './auditLog.schema';

export * from './relations';

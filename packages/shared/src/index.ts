/**
 * `@curtain-crm/shared` — единственный источник правды для доменных
 * перечислений, констант и чистых утилит.
 *
 * Правило монорепозитория: `apps/api`, `apps/web` и `apps/mobile` НЕ содержат
 * собственных строковых литералов ролей, статусов и стадий — всё импортируется
 * отсюда. Пакет не зависит ни от Drizzle, ни от tRPC, ни от React, поэтому
 * пригоден и для бэкенда, и для React Native.
 */

/* Перечисления */
export * from './enums/role.enum';
export * from './i18n/locale';
export * from './enums/orderStatus.enum';
export * from './enums/orderType.enum';
export * from './enums/orderItemKind.enum';
export * from './enums/priority.enum';
export * from './enums/photoStage.enum';
export * from './enums/notificationType.enum';
export * from './enums/payroll.enum';
export * from './enums/staff.enum';
export * from './enums/task.enum';
export * from './enums/dayOff.enum';

/* Константы */
export * from './constants/calendar';
export * from './constants/catalog';
export * from './constants/rating';
export * from './constants/personalBreak';

/* Типы */
export * from './types/orderItemAccessory';

/* Утилиты */
export * from './utils/dates';
export * from './utils/geolocation';
export * from './utils/phone';
export * from './utils/plural';
export * from './utils/dimensions';
export * from './utils/money';

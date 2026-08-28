import { Role } from '@curtain-crm/shared';

import { roleProcedure } from '../middleware/roleGuard.middleware';
import { router } from '../trpc';

/**
 * SMM.
 *
 * Права доступа: `ping` — роль `smm`, а также руководство.
 *
 * Функционал роли ЗАКАЗЧИКОМ ПОКА НЕ ОПРЕДЕЛЁН. Роль зарезервирована в
 * перечислении `Role`, учётную запись с ней можно завести и она войдёт в
 * систему, но задач у неё нет. Придумывать их самостоятельно мы намеренно
 * не стали — роутер остаётся с единственной процедурой-заглушкой.
 *
 * Зарплата SMM также не рассчитывается: см. `payableRoles()` в
 * `payroll.service.ts`.
 */
export const smmRouter = router({
  /** Проверка доступности роутера и наличия прав у вызывающего. */
  ping: roleProcedure(Role.SMM, Role.ADMIN, Role.CEO).query(() => ({
    ok: true as const,
    message: 'Функционал роли SMM ещё не определён',
  })),
});

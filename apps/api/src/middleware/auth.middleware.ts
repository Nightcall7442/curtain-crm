import { TRPCError } from '@trpc/server';

import { baseProcedure, middleware } from '../trpc';
import type { AuthenticatedUser } from '../types';

/**
 * Проверка аутентификации.
 *
 * После этого middleware `ctx.user` гарантированно не `null` — тип сужается,
 * и процедурам не приходится писать `if (ctx.user === null) throw ...`.
 * Забыть проверку становится невозможно: она встроена в тип процедуры.
 */
export const isAuthenticated = middleware(({ ctx, next }) => {
  if (ctx.user === null) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Требуется вход в систему',
    });
  }

  // Дополнительная страховка: `loadAuthenticatedUser` уже отсеивает
  // деактивированных, но проверка здесь защищает от контекста,
  // собранного в обход (например, в тестах или во внутреннем вызове).
  if (!ctx.user.isActive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Учётная запись деактивирована. Обратитесь к руководству',
    });
  }

  return next({
    ctx: { ...ctx, user: ctx.user satisfies AuthenticatedUser },
  });
});

/**
 * Процедура, доступная любому аутентифицированному сотруднику,
 * независимо от набора ролей.
 *
 * Ограничение по ролям навешивается сверху через `roleProcedure(...)`
 * из `roleGuard.middleware.ts`.
 */
export const protectedProcedure = baseProcedure.use(isAuthenticated);

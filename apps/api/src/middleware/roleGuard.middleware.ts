import {
  hasAnyRole,
  MANAGEMENT_ROLES,
  Role,
  ROLE_LABELS_RU,
  ROLE_MANAGER_ROLES,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';

import { middleware } from '../trpc';
import { protectedProcedure } from './auth.middleware';

/**
 * Проверка прав по ролям.
 *
 * Права проверяются здесь, на сервере, а не только скрытием кнопок во
 * фронтенде: интерфейс лишь удобство, а tRPC-процедура — граница доверия.
 *
 * Роли складываются: сотрудник с ролями «мастер + швея» проходит guard,
 * требующий любую из них.
 */
export function roleGuard(allowedRoles: readonly RoleName[]) {
  if (allowedRoles.length === 0) {
    // Пустой список означал бы «никому нельзя» — почти всегда это опечатка,
    // и лучше упасть при старте, чем отдавать FORBIDDEN в рантайме.
    throw new Error('roleGuard требует хотя бы одну роль');
  }

  return middleware(({ ctx, next }) => {
    if (ctx.user === null) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Требуется вход в систему' });
    }

    if (!hasAnyRole(ctx.user.roles, allowedRoles)) {
      const required = allowedRoles.map((role) => ROLE_LABELS_RU[role]).join(', ');
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Недостаточно прав. Действие доступно ролям: ${required}`,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Процедура, доступная перечисленным ролям. */
export function roleProcedure(...allowedRoles: readonly RoleName[]) {
  return protectedProcedure.use(roleGuard(allowedRoles));
}

/**
 * Процедура только для директора.
 * Управление ролями и правами — исключительно его зона (`ROLE_MANAGER_ROLES`).
 */
export const ceoProcedure = protectedProcedure.use(roleGuard(ROLE_MANAGER_ROLES));

/** Процедура для руководства: директор и администратор. */
export const managementProcedure = protectedProcedure.use(roleGuard(MANAGEMENT_ROLES));

/** Процедура для тех, кто заводит заказы: продавец, админ, директор. */
export const orderIntakeProcedure = protectedProcedure.use(
  roleGuard([Role.SELLER, Role.ADMIN, Role.CEO]),
);

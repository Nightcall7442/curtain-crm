import { z } from 'zod';

import { protectedProcedure } from '../middleware/auth.middleware';
import { passwordSchema, phoneSchema } from '../lib/schemas';
import {
  changeOwnPassword,
  login,
  logout,
  refreshSession,
  revokeAllSessions,
} from '../services/auth.service';
import {
  assertLoginAllowed,
  registerLoginFailure,
  resetLoginAttempts,
} from '../services/loginThrottle.service';
import { baseProcedure, router } from '../trpc';

/**
 * Аутентификация.
 *
 * Права доступа:
 *  - `login`, `refresh` — публичные: без них войти было бы невозможно.
 *    `login` вдобавок ограничен по числу неудач на номер
 *    (`loginThrottle.service.ts`), иначе публичная процедура с проверкой
 *    пароля по 100 мс была бы и точкой подбора, и точкой нагрузки;
 *  - `me`, `logout`, `logoutAll`, `changePassword` — любой вошедший сотрудник,
 *    независимо от ролей; каждая процедура работает только с собственной
 *    учётной записью вызывающего.
 *
 * Управление чужими учётными записями — в `users.router.ts` (только CEO).
 */
export const authRouter = router({
  /**
   * Вход по номеру телефона и паролю.
   *
   * Счётчик неудач ведётся по номеру, уже приведённому `phoneSchema` к E.164,
   * — иначе `+998901234567` и `901234567` считались бы порознь и лимит
   * обходился бы сменой написания.
   */
  login: baseProcedure
    .input(
      z.object({
        phone: phoneSchema,
        password: z.string().min(1, 'Введите пароль'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertLoginAllowed(input.phone);

      try {
        const result = await login(ctx.db, {
          phone: input.phone,
          password: input.password,
          userAgent: ctx.userAgent,
        });

        resetLoginAttempts(input.phone);
        return result;
      } catch (error) {
        // Считаем любой неуспех: и неверный пароль, и деактивированную
        // учётную запись. Разделять их значило бы по поведению лимита
        // сообщать, что именно не так, — ровно то, чего избегает единая
        // формулировка «неверный номер телефона или пароль».
        registerLoginFailure(input.phone);
        throw error;
      }
    }),

  /**
   * Обновление пары токенов.
   *
   * Публичная намеренно: access-токен к этому моменту уже истёк, и требовать
   * его было бы взаимоисключающим условием. Доверие обеспечивает сам
   * refresh-токен, который проверяется и ротируется в сервисе.
   */
  refresh: baseProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      refreshSession(ctx.db, input.refreshToken, ctx.userAgent),
    ),

  /** Текущий сотрудник: профиль, роли, филиалы. */
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  /** Выход с текущего устройства. */
  logout: protectedProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await logout(ctx.db, input.refreshToken);
      return { success: true } as const;
    }),

  /** Выход со всех устройств. */
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await revokeAllSessions(ctx.db, ctx.user.id);
    return { success: true } as const;
  }),

  /** Смена собственного пароля. Завершает все сессии, включая текущую. */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, 'Введите текущий пароль'),
        newPassword: passwordSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await changeOwnPassword(ctx.db, ctx.user.id, input.currentPassword, input.newPassword);
      return { success: true } as const;
    }),
});

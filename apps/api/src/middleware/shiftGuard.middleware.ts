import { shifts } from '@curtain-crm/db';
import { isManagement } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import { middleware } from '../trpc';

/**
 * Мутации, которые разрешены и без открытой смены.
 *
 * Открыть смену — само собой; всё вокруг учётной записи, выходных и
 * уведомлений — тоже: это не работа, а быт. Остальное — заказы, касса,
 * поручения, фото, комментарии — только на смене: по решению владельца
 * работать «между делом», не отметившись, нельзя, иначе часы не сходятся.
 */
const ALLOWED_WITHOUT_SHIFT = [
  'auth.',
  'shifts.',
  'users.',
  'dayOff.',
  'notifications.',
] as const;

/**
 * Требует открытую смену для мутаций у всех, кроме руководства.
 *
 * Стоит в `protectedProcedure`, а не в каждом роутере: правило одно на всех,
 * и забыть его в новом роутере невозможно. Запросы (чтение) не трогает —
 * посмотреть заказ или график можно и дома.
 *
 * ponytail: лишний select на каждую мутацию сотрудника; кэш по userId на
 * минуту — если станет заметно.
 */
export const requiresOpenShift = middleware(async ({ ctx, path, type, next }) => {
  const user = ctx.user;
  if (
    type !== 'mutation' ||
    user === null ||
    isManagement(user.roles) ||
    ALLOWED_WITHOUT_SHIFT.some((prefix) => path.startsWith(prefix))
  ) {
    return next();
  }

  const [open] = await ctx.db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, user.id), isNull(shifts.endedAt)))
    .limit(1);

  if (open === undefined) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Сначала начните смену',
    });
  }

  return next();
});

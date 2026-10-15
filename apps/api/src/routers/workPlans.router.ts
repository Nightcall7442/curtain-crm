import { userRoles } from '@curtain-crm/db';
import { PLAN_TARGET_MAX, planRoleSchema } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema } from '../lib/schemas';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { listPlans, setWorkPlan } from '../services/workPlans.service';
import { router } from '../trpc';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Месяц в формате ГГГГ-ММ');

const targetSchema = z
  .number()
  .int()
  .min(1, 'План должен быть больше нуля')
  .max(PLAN_TARGET_MAX, 'План слишком большой');

/**
 * План на месяц — директор и администратор.
 *
 * План задаёт руководство: менеджер видит табло, но цели цеху не ставит.
 * Правка действует с выбранного месяца и дальше, прошлое не переписывает.
 */
export const workPlansRouter = router({
  list: managementProcedure
    .input(z.object({ month: monthSchema }))
    .query(({ ctx, input }) => listPlans(ctx.db, input.month)),

  /** Норма роли с месяца `month`: достаётся всем, у кого нет личного плана. */
  setRoleNorm: managementProcedure
    .input(z.object({ role: planRoleSchema, month: monthSchema, target: targetSchema }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const change = await setWorkPlan(tx, {
          role: input.role,
          userId: null,
          month: input.month,
          target: input.target,
          actorId: ctx.user.id,
        });
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'work_plan.norm_set',
          entityType: 'work_plan',
          details: { role: input.role, month: input.month, ...change },
          ipAddress: ctx.ipAddress,
        });
        return change;
      }),
    ),

  /** Личный план с месяца `month`; `target: null` — с этого месяца вернуться к норме. */
  setPersonal: managementProcedure
    .input(
      z.object({
        userId: idSchema,
        role: planRoleSchema,
        month: monthSchema,
        target: targetSchema.nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [hasRole] = await tx
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(and(eq(userRoles.userId, input.userId), eq(userRoles.role, input.role)))
          .limit(1);
        if (hasRole === undefined) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'У сотрудника нет этой роли' });
        }

        const change = await setWorkPlan(tx, {
          role: input.role,
          userId: input.userId,
          month: input.month,
          target: input.target,
          actorId: ctx.user.id,
        });
        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'work_plan.personal_set',
          entityType: 'work_plan',
          entityId: input.userId,
          details: { role: input.role, userId: input.userId, month: input.month, ...change },
          ipAddress: ctx.ipAddress,
        });
        return change;
      }),
    ),
});

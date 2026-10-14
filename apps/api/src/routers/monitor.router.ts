import { monitorGroupSchema } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { idSchema } from '../lib/schemas';
import { orderDispatchProcedure } from '../middleware/roleGuard.middleware';
import { buildBoard, buildPerson } from '../services/monitor.service';
import { router } from '../trpc';

/**
 * Табло «Цех» и «Установщики» для тех, кто ведёт заказы: директор, админ,
 * менеджер. Денег здесь нет — только люди, их работа и выработка, поэтому
 * менеджеру, у которого нет финансов, табло доступно.
 */
export const monitorRouter = router({
  board: orderDispatchProcedure
    .input(z.object({ group: monitorGroupSchema, branchId: idSchema.optional() }))
    .query(({ ctx, input }) =>
      buildBoard(ctx.db, {
        group: input.group,
        branchId: input.branchId ?? null,
        now: new Date(),
        locale: ctx.locale,
      }),
    ),

  /** Карточка человека: вся очередь, 30 дней выработки, смена сегодня, фото. */
  person: orderDispatchProcedure
    .input(z.object({ userId: idSchema }))
    .query(async ({ ctx, input }) => {
      const detail = await buildPerson(ctx.db, { userId: input.userId, now: new Date(), locale: ctx.locale });
      if (detail === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудника нет на табло' });
      }
      return detail;
    }),
});

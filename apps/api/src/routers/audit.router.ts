import { auditLog, users } from '@curtain-crm/db';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';

import { AUDIT_ACTIONS } from '../lib/constants';
import { idSchema, paginationSchema } from '../lib/schemas';
import { ceoProcedure } from '../middleware/roleGuard.middleware';
import { AUDIT_ENTITY_TYPES } from '../services/audit.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Чтение журнала значимых действий.
 *
 * Писали в `audit_log` с самого начала — из десятка процедур, — а прочитать
 * его через API было нельзя ни одному роутеру. Директору, чтобы разобрать
 * спорную корректировку смены или узнать, кто менял цену, приходилось идти
 * в базу руками. Комментарий в `notifications.router.ts` при этом прямо
 * отсылал сюда: «для разбора событий есть `audit_log`».
 *
 * Права: ТОЛЬКО директор (`ceoProcedure`). Журнал показывает, кто и что делал,
 * включая действия администратора, — а значит, администратор не должен иметь
 * к нему доступа: иначе проверяющий и проверяемый совпадают.
 *
 * Таблица append-only, поэтому процедур изменения и удаления здесь нет
 * и не появится.
 */
export const auditRouter = router({
  /**
   * Лента записей, свежие сверху.
   *
   * Фильтры перекрывают три вопроса, с которыми в журнал вообще приходят:
   * «что происходило с этой сущностью», «кто это сделал» и «что было
   * за период».
   */
  list: ceoProcedure
    .input(
      paginationSchema
        .extend({
          entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
          /** Имеет смысл только вместе с `entityType`. */
          entityId: idSchema.optional(),
          action: z.enum(AUDIT_ACTIONS).optional(),
          actorId: idSchema.optional(),
          from: z.date().optional(),
          to: z.date().optional(),
        })
        .default({ page: 1, pageSize: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.entityType === undefined ? [] : [eq(auditLog.entityType, input.entityType)]),
        ...(input.entityId === undefined ? [] : [eq(auditLog.entityId, input.entityId)]),
        ...(input.action === undefined ? [] : [eq(auditLog.action, input.action)]),
        ...(input.actorId === undefined ? [] : [eq(auditLog.actorId, input.actorId)]),
        ...(input.from === undefined ? [] : [gte(auditLog.createdAt, input.from)]),
        ...(input.to === undefined ? [] : [lt(auditLog.createdAt, input.to)]),
      );

      const [items, [totalRow]] = await Promise.all([
        ctx.db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            entityType: auditLog.entityType,
            entityId: auditLog.entityId,
            details: auditLog.details,
            ipAddress: auditLog.ipAddress,
            createdAt: auditLog.createdAt,
            actorId: auditLog.actorId,
            actorName: users.fullName,
          })
          .from(auditLog)
          .innerJoin(users, eq(users.id, auditLog.actorId))
          .where(where)
          // Второй ключ по той же причине, что и в истории статусов: `now()`
          // в PostgreSQL — время начала транзакции, и записи одной транзакции
          // делят одну метку времени.
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(auditLog).where(where),
      ]);

      return toPage(items, totalRow?.value ?? 0, input);
    }),

  /**
   * Справочник значений для фильтров.
   *
   * Отдаётся сервером, а не перечисляется в веб-панели: список действий
   * пополняется вместе с каждым новым сценарием, и вторая его копия
   * в интерфейсе разошлась бы с первой на ближайшей же правке.
   */
  filters: ceoProcedure.query(() => ({
    actions: AUDIT_ACTIONS,
    entityTypes: AUDIT_ENTITY_TYPES,
  })),
});

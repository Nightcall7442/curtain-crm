import {
  isManagement,
  isTaskActive,
  MAX_TASK_DETAILS_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  TaskStatus,
  taskStatusSchema,
  type Role,
} from '@curtain-crm/shared';
import { taskMessages, tasks, users } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { ALLOWED_TASK_ATTACHMENT_MIME_TYPES, getEnv } from '../lib/constants';
import {
  base64FileSchema,
  idSchema,
  nonEmptyString,
  optionalText,
  reasonSchema,
} from '../lib/schemas';
import { recordAudit } from '../services/audit.service';
import {
  buildStorageKey,
  decodeBase64Payload,
  getStorage,
} from '../services/storage.service';
import {
  notifyTaskApproved,
  notifyTaskAssigned,
  notifyTaskCancelled,
  notifyTaskCompleted,
  notifyTaskReplied,
  notifyTaskReturned,
  notifyTaskSubmitted,
} from '../services/notifications.service';
import { router } from '../trpc';

/**
 * Доп работы (в коде — tasks) — дополнительная работа мимо конвейера заказов.
 *
 * Права доступа:
 *  - `create`, `list`, `cancel`, `sendBack` — руководство (CEO, админ):
 *    поручения выдаёт, возвращает и отменяет тот, кто отвечает за загрузку
 *    людей;
 *  - `my` — любой вошедший, ТОЛЬКО свои поручения;
 *  - `complete` — адресат поручения или руководство. Адресат только СДАЁТ
 *    работу: поручение ждёт подтверждения, а закрывает его руководство —
 *    принимая сданное или закрывая за сотрудника.
 *
 * Записи не удаляются: выполненное — история работы, ошибочное отменяется
 * с причиной. Инварианты «выполнено ⇒ есть дата», «отменено ⇒ есть причина»
 * держит БД (check-констрейнты), а не только код.
 */
export const tasksRouter = router({
  /** Выдать поручение сотруднику. */
  create: managementProcedure
    .input(
      z.object({
        assigneeId: idSchema,
        title: nonEmptyString(MAX_TASK_TITLE_LENGTH, 'Опишите поручение'),
        details: optionalText(MAX_TASK_DETAILS_LENGTH),
        dueDate: z.string().date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const assignee = await tx.query.users.findFirst({
          where: eq(users.id, input.assigneeId),
          columns: { id: true, isActive: true, fullName: true },
        });

        if (assignee === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }
        if (!assignee.isActive) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сотрудник уволен — поручение выдать некому',
          });
        }

        const [created] = await tx
          .insert(tasks)
          .values({
            assigneeId: input.assigneeId,
            createdBy: ctx.user.id,
            title: input.title,
            details: input.details ?? null,
            dueDate: input.dueDate ?? null,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Доп. работа не создана' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.created',
          entityType: 'task',
          entityId: created.id,
          details: {
            assigneeId: input.assigneeId,
            title: input.title,
            dueDate: input.dueDate ?? null,
          },
          ipAddress: ctx.ipAddress,
        });

        await notifyTaskAssigned(tx, input.assigneeId, {
          taskId: created.id,
          title: input.title,
          creatorName: ctx.user.fullName,
          dueDate: input.dueDate ?? null,
        });

        return created;
      }),
    ),

  /**
   * Мои поручения.
   *
   * Открытые — все; закрытые ограничены последними, чтобы список не рос
   * бесконечно: сотруднику нужна рабочая лента, а не архив (архив — у
   * руководства в `list`).
   */
  my: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: tasks.id,
        title: tasks.title,
        details: tasks.details,
        dueDate: tasks.dueDate,
        status: tasks.status,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        creatorName: users.fullName,
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.createdBy, users.id))
      .where(eq(tasks.assigneeId, ctx.user.id))
      // Открытые сверху, за ними сданные на проверку; внутри — ближайший
      // срок первым, поручения без срока в конце.
      .orderBy(
        sql`case ${tasks.status} when 'open' then 0 when 'pending_review' then 1 else 2 end`,
        sql`${tasks.dueDate} asc nulls last`,
        desc(tasks.createdAt),
      )
      .limit(50);

    return rows;
  }),

  /**
   * Одно поручение целиком: сроки, автор и переписка.
   *
   * Раньше поручение существовало только строкой в списке: заголовок, срок,
   * кнопка «Выполнено». Ни открыть его, ни спросить «а что именно не так»
   * было нельзя — уточнения шли голосом и в системе не оставались.
   *
   * Видят адресат, автор и руководство. Чужое поручение закрыто: лента
   * переписки — это разговор двоих о работе, а не общая доска.
   */
  byId: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.id),
        with: {
          assignee: { columns: { id: true, fullName: true } },
          creator: { columns: { id: true, fullName: true } },
          messages: {
            with: { author: { columns: { id: true, fullName: true } } },
            orderBy: (message, { asc: ascending }) => [ascending(message.createdAt)],
          },
        },
      });

      if (task === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Поручение не найдено' });
      }

      assertCanSeeTask(task, ctx.user);

      /*
        Ссылки подписываются на каждое чтение и живут недолго — так же, как
        у фото заказа. Хранить готовый адрес в базе нельзя: он протух бы
        раньше, чем понадобился.
      */
      const storage = getStorage();
      const messages = await Promise.all(
        task.messages.map(async (message) => ({
          ...message,
          url:
            message.storageKey === null
              ? null
              : await storage.getUrl(message.storageKey),
        })),
      );

      return { ...task, messages };
    }),

  /**
   * Реплика по поручению: текст, файл или и то и другое.
   *
   * Одна процедура на обе стороны. Руководитель прикладывает фото брака,
   * исполнитель отвечает фотографией результата — это один и тот же жест,
   * и разводить его на «вложение» и «отчёт» значило бы писать дважды одно.
   *
   * Пустая реплика отклоняется здесь и не проходит check-констрейнт в базе:
   * сообщение без текста и без файла — сбой, а не сообщение.
   */
  reply: protectedProcedure
    .input(
      z
        .object({
          taskId: idSchema,
          body: optionalText(MAX_TASK_DETAILS_LENGTH),
          file: base64FileSchema.optional(),
        })
        .refine((value) => value.body !== undefined || value.file !== undefined, {
          message: 'Напишите сообщение или приложите файл',
          path: ['body'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({ where: eq(tasks.id, input.taskId) });
      if (task === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Поручение не найдено' });
      }
      assertCanSeeTask(task, ctx.user);

      const storage = getStorage();
      let stored: { readonly key: string; readonly size: number } | null = null;

      if (input.file !== undefined) {
        const env = getEnv();
        const body = decodeBase64Payload(input.file, {
          allowedMimeTypes: ALLOWED_TASK_ATTACHMENT_MIME_TYPES,
          maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        });

        const uploaded = await storage.upload({
          key: buildStorageKey(['tasks', task.id.toString()], input.file.mimeType),
          body,
          mimeType: input.file.mimeType,
        });
        stored = { key: uploaded.key, size: body.byteLength };
      }

      try {
        const [created] = await ctx.db
          .insert(taskMessages)
          .values({
            taskId: task.id,
            authorId: ctx.user.id,
            body: input.body ?? null,
            storageKey: stored?.key ?? null,
            originalFileName: input.file?.fileName ?? null,
            mimeType: input.file?.mimeType ?? null,
            sizeBytes: stored?.size ?? null,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось сохранить сообщение',
          });
        }

        /*
          Уведомляем вторую сторону, а не всех участников: в поручении их
          ровно двое. Себе уведомление не шлём — человек только что это и
          написал.
        */
        const recipientId =
          ctx.user.id === task.assigneeId ? task.createdBy : task.assigneeId;

        if (recipientId !== ctx.user.id) {
          await notifyTaskReplied(ctx.db, {
            recipientId,
            taskId: task.id,
            taskTitle: task.title,
            authorName: ctx.user.fullName,
            preview: input.body ?? 'Приложен файл',
          });
        }

        return {
          ...created,
          url: created.storageKey === null ? null : await storage.getUrl(created.storageKey),
        };
      } catch (error) {
        // Запись не удалась — убираем загруженный файл, чтобы хранилище не
        // копило мусор от неудачных попыток. Тот же приём, что у фото заказа.
        if (stored !== null) await storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
    }),

  /** Все поручения — для руководства. */
  list: managementProcedure
    .input(
      z
        .object({
          status: taskStatusSchema.optional(),
          assigneeId: idSchema.optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        ...(input.status === undefined ? [] : [eq(tasks.status, input.status)]),
        ...(input.assigneeId === undefined ? [] : [eq(tasks.assigneeId, input.assigneeId)]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db.query.tasks.findMany({
          where,
          with: {
            assignee: { columns: { id: true, fullName: true } },
            creator: { columns: { id: true, fullName: true } },
          },
          // Сданные на проверку — первыми: это работа самого руководителя.
          orderBy: [
            sql`case ${tasks.status} when 'pending_review' then 0 when 'open' then 1 else 2 end`,
            asc(tasks.dueDate),
            desc(tasks.createdAt),
          ],
          limit: 200,
        }),
        ctx.db.select({ value: count() }).from(tasks).where(where),
      ]);

      return { items: rows, total: totalRow?.value ?? 0 };
    }),

  /**
   * Отметить выполнение.
   *
   * Адресат сдаёт работу — поручение ждёт подтверждения, автор получает
   * уведомление. Руководство закрывает: принимает сданное или закрывает
   * открытое за сотрудника. Отметка сотрудника больше не закрывает работу
   * сама — иначе «сделано» ставилось без проверки.
   */
  complete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, input.id),
          with: { assignee: { columns: { fullName: true } } },
        });

        if (task === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Доп. работа не найдена' });
        }

        const isOwn = task.assigneeId === ctx.user.id;
        const isBoss = isManagement(ctx.user.roles);
        if (!isOwn && !isBoss) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Доп. работа закреплена за другим сотрудником',
          });
        }

        if (!isTaskActive(task.status)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Доп. работа уже закрыта' });
        }

        /* Сотрудник сдаёт работу — закрывать её будет руководство. */
        if (!isBoss) {
          if (task.status === TaskStatus.PENDING_REVIEW) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Доп. работа уже сдана — ждёт подтверждения руководителя',
            });
          }

          const [submitted] = await tx
            .update(tasks)
            .set({ status: TaskStatus.PENDING_REVIEW })
            .where(eq(tasks.id, input.id))
            .returning();

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: 'task.submitted',
            entityType: 'task',
            entityId: input.id,
            details: { title: task.title, assigneeId: task.assigneeId },
            ipAddress: ctx.ipAddress,
          });

          await notifyTaskSubmitted(tx, task.createdBy, {
            taskId: task.id,
            title: task.title,
            assigneeName: task.assignee.fullName,
          });

          return submitted;
        }

        const wasSubmitted = task.status === TaskStatus.PENDING_REVIEW;

        const [updated] = await tx
          .update(tasks)
          .set({ status: TaskStatus.DONE, completedAt: new Date() })
          .where(eq(tasks.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: wasSubmitted ? 'task.approved' : 'task.completed',
          entityType: 'task',
          entityId: input.id,
          details: { title: task.title, assigneeId: task.assigneeId },
          ipAddress: ctx.ipAddress,
        });

        if (wasSubmitted) {
          // Исполнитель узнаёт, что работу приняли, — если принял не он сам.
          if (task.assigneeId !== ctx.user.id) {
            await notifyTaskApproved(tx, task.assigneeId, {
              taskId: task.id,
              title: task.title,
              approverName: ctx.user.fullName,
            });
          }
        } else if (task.createdBy !== ctx.user.id) {
          // Закрыли за сотрудника — автор узнаёт, кроме случая, когда сам и закрыл.
          await notifyTaskCompleted(tx, task.createdBy, {
            taskId: task.id,
            title: task.title,
            assigneeName: task.assignee.fullName,
          });
        }

        return updated;
      }),
    ),

  /**
   * Вернуть сданное поручение в работу — только руководство и с причиной.
   *
   * Причина ложится репликой в переписку поручения: исполнитель видит её
   * там же, где обсуждает работу, и она остаётся в истории, а не только в
   * уведомлении, которое прочитают и забудут.
   */
  sendBack: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, input.id) });

        if (task === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Доп. работа не найдена' });
        }
        if (task.status !== TaskStatus.PENDING_REVIEW) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Вернуть можно только сданную работу, которая ждёт подтверждения',
          });
        }

        const [updated] = await tx
          .update(tasks)
          .set({ status: TaskStatus.OPEN })
          .where(eq(tasks.id, input.id))
          .returning();

        await tx.insert(taskMessages).values({
          taskId: task.id,
          authorId: ctx.user.id,
          body: input.reason,
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.returned',
          entityType: 'task',
          entityId: input.id,
          details: { title: task.title, assigneeId: task.assigneeId, reason: input.reason },
          ipAddress: ctx.ipAddress,
        });

        await notifyTaskReturned(tx, task.assigneeId, {
          taskId: task.id,
          title: task.title,
          reason: input.reason,
        });

        return updated;
      }),
    ),

  /** Отменить поручение — только руководство и только с причиной. */
  cancel: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, input.id) });

        if (task === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Доп. работа не найдена' });
        }
        if (!isTaskActive(task.status)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Доп. работа уже закрыта' });
        }

        const [updated] = await tx
          .update(tasks)
          .set({ status: TaskStatus.CANCELLED, cancelReason: input.reason })
          .where(eq(tasks.id, input.id))
          .returning();

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'task.cancelled',
          entityType: 'task',
          entityId: input.id,
          details: { title: task.title, assigneeId: task.assigneeId, reason: input.reason },
          ipAddress: ctx.ipAddress,
        });

        await notifyTaskCancelled(tx, task.assigneeId, {
          taskId: task.id,
          title: task.title,
          reason: input.reason,
        });

        return updated;
      }),
    ),
});

/**
 * Кому видно поручение: адресату, автору и руководству.
 *
 * Отдельная функция, а не строчка в каждой процедуре: правило одно и то же
 * для карточки и для переписки, и разъехаться они не должны. Руководство
 * проходит всегда — оно и так видит весь список.
 */
function assertCanSeeTask(
  task: { readonly assigneeId: number; readonly createdBy: number },
  user: { readonly id: number; readonly roles: readonly Role[] },
): void {
  if (isManagement(user.roles)) return;
  if (task.assigneeId === user.id || task.createdBy === user.id) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Это поручение выдано другому сотруднику',
  });
}

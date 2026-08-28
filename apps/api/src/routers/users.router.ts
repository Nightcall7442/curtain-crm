import {
  hashPassword,
  payrollRecords,
  payrollSchemes,
  userBranches,
  userRoles,
  users,
  type DbExecutor,
} from '@curtain-crm/db';
import {
  DEFAULT_DEPARTMENT_BY_ROLE,
  departmentSchema,
  employmentTypeSchema,
  formatEmployeeCode,
  isManagement,
  Role,
  ROLE_LABELS_RU,
  roleSchema,
  type Department,
  type EmploymentType,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, count, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import {
  base64FileSchema,
  idSchema,
  nonEmptyString,
  paginationSchema,
  passwordSchema,
  periodSchema,
  phoneSchema,
} from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { ceoProcedure, managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { resetPasswordByManager, revokeAllSessions } from '../services/auth.service';
import { notifyRoleChanged } from '../services/notifications.service';
import { calculateCompletedOrders } from '../services/payroll.service';
import { periodBounds } from '../services/shifts.service';
import {
  buildStorageKey,
  decodeBase64Payload,
  getStorage,
} from '../services/storage.service';
import {
  attendanceByDay,
  presenceToday,
  staffDistributions,
  staffSummary,
  upcomingBirthdays,
} from '../services/staff.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Сотрудники, их роли и привязка к филиалам.
 *
 * Права доступа:
 *  - `list`, `listByRole`, `setBranches` — руководство (CEO, админ):
 *    админу нужны списки, чтобы назначать исполнителей на заказы;
 *  - `byId` — руководство ЛИБО сам сотрудник (свой профиль);
 *  - `uploadAvatar`, `removeAvatar` — любой вошедший, но ВСЕГДА только своё
 *    фото: `user_id` берётся из контекста и не приходит во входных данных;
 *  - `stats`, `presenceToday`, `attendance`, `birthdays`, `performance` —
 *    кадровая аналитика, руководство;
 *  - `create`, `setActive`, `grantRole`, `revokeRole`, `resetPassword`,
 *    `update` — ТОЛЬКО CEO.
 *
 * Ролями управляет исключительно директор — это требование заказчика.
 * Администратор ролями не управляет, в том числе своими.
 *
 * Сотрудники не удаляются: увольнение — это `setActive(false)`, которое
 * дополнительно завершает все его сессии.
 */

/**
 * Публичное представление сотрудника.
 *
 * Экспортируется, потому что входит в тип `AppRouter`: без экспорта клиенты
 * не смогли бы назвать тип, который возвращают процедуры этого роутера.
 * Хеш пароля сюда не попадает никогда.
 */
export interface UserDto {
  readonly id: number;
  readonly employeeCode: string | null;
  readonly fullName: string;
  readonly phone: string;
  readonly jobTitle: string | null;
  readonly department: Department;
  readonly employmentType: EmploymentType;
  readonly birthDate: string | null;
  readonly isActive: boolean;
  readonly hiredAt: string | null;
  readonly firedAt: string | null;
  readonly lastLoginAt: Date | null;
  readonly avatarStorageKey: string | null;
  /** Готовая ссылка на фото; `null`, если фото не загружено. */
  readonly avatarUrl: string | null;
  readonly roles: readonly Role[];
  readonly branchIds: readonly number[];
  readonly primaryBranchId: number | null;
}

/**
 * Загружает сотрудников вместе с ролями и филиалами.
 *
 * Отдельная функция, а не повтор в каждой процедуре: форма ответа должна быть
 * одинаковой в списке, в карточке и после мутации, иначе фронтенду придётся
 * обрабатывать несколько вариантов одного и того же объекта.
 */
async function loadUsers(executor: DbExecutor, userIds: readonly number[]): Promise<UserDto[]> {
  if (userIds.length === 0) return [];

  const rows = await executor.query.users.findMany({
    where: inArray(users.id, [...userIds]),
    with: {
      roles: { columns: { role: true } },
      branches: { columns: { branchId: true, isPrimary: true } },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  /**
   * Ссылки на фото разрешаем одним проходом, а не по одной в цикле:
   * у disk-драйвера это сборка строки, у S3 — подпись, и в списке из ста
   * сотрудников последовательные вызовы дали бы сто ожиданий подряд.
   */
  const storage = getStorage();
  const avatarUrls = new Map(
    await Promise.all(
      rows
        .filter((row) => row.avatarStorageKey !== null)
        .map(async (row): Promise<[number, string]> => [
          row.id,
          await storage.getUrl(row.avatarStorageKey as string),
        ]),
    ),
  );

  // Сохраняем порядок, заданный запросом со страницей и сортировкой:
  // `inArray` его не гарантирует.
  return userIds.flatMap((id) => {
    const row = byId.get(id);
    if (row === undefined) return [];

    return [
      {
        id: row.id,
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        phone: row.phone,
        jobTitle: row.jobTitle,
        department: row.department,
        employmentType: row.employmentType,
        birthDate: row.birthDate,
        isActive: row.isActive,
        hiredAt: row.hiredAt,
        firedAt: row.firedAt,
        lastLoginAt: row.lastLoginAt,
        avatarStorageKey: row.avatarStorageKey,
        avatarUrl: avatarUrls.get(row.id) ?? null,
        roles: row.roles.map((entry) => entry.role),
        branchIds: row.branches.map((entry) => entry.branchId),
        primaryBranchId: row.branches.find((entry) => entry.isPrimary)?.branchId ?? null,
      },
    ];
  });
}

async function loadUserOrThrow(executor: DbExecutor, userId: number): Promise<UserDto> {
  const [user] = await loadUsers(executor, [userId]);
  if (user === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
  }
  return user;
}

/**
 * Не даёт остаться без директора.
 *
 * Отзыв последней роли CEO или деактивация последнего директора заблокировали
 * бы управление ролями навсегда — восстановить систему можно было бы только
 * правкой БД вручную.
 */
async function assertNotLastCeo(executor: DbExecutor, userId: number): Promise<void> {
  const [row] = await executor
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, Role.CEO), eq(users.isActive, true), sql`${users.id} <> ${userId}`));

  if ((row?.value ?? 0) === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Это последний активный директор. Сначала назначьте другого',
    });
  }
}

export const usersRouter = router({
  /** Список сотрудников с фильтрами. Для раздела «Рабочие» веб-панели. */
  list: managementProcedure
    .input(
      paginationSchema
        .extend({
          search: z.string().trim().max(200).optional(),
          role: roleSchema.optional(),
          branchId: idSchema.optional(),
          department: departmentSchema.optional(),
          employmentType: employmentTypeSchema.optional(),
          isActive: z.boolean().optional(),
        })
        .default({ page: 1, pageSize: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        input.isActive === undefined ? undefined : eq(users.isActive, input.isActive),

        // Фильтры применяются в SQL, а не после выборки страницы: иначе
        // «Показано 1–10 из 48» считало бы не отфильтрованные записи.
        input.department === undefined ? undefined : eq(users.department, input.department),
        input.employmentType === undefined
          ? undefined
          : eq(users.employmentType, input.employmentType),

        input.search === undefined || input.search.length === 0
          ? undefined
          : or(
              ilike(users.fullName, `%${input.search}%`),
              ilike(users.phone, `%${input.search}%`),
            ),

        input.role === undefined
          ? undefined
          : exists(
              ctx.db
                .select({ one: sql`1` })
                .from(userRoles)
                .where(and(eq(userRoles.userId, users.id), eq(userRoles.role, input.role))),
            ),

        input.branchId === undefined
          ? undefined
          : exists(
              ctx.db
                .select({ one: sql`1` })
                .from(userBranches)
                .where(
                  and(eq(userBranches.userId, users.id), eq(userBranches.branchId, input.branchId)),
                ),
            ),
      ].filter((condition) => condition !== undefined);

      const where = conditions.length === 0 ? undefined : and(...conditions);

      const [idRows, [totalRow]] = await Promise.all([
        ctx.db
          .select({ id: users.id })
          .from(users)
          .where(where)
          .orderBy(asc(users.fullName))
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(users).where(where),
      ]);

      const items = await loadUsers(ctx.db, idRows.map((row) => row.id));
      return toPage(items, totalRow?.value ?? 0, input);
    }),

  /**
   * Компактный список сотрудников с указанной ролью.
   * Используется выпадающими списками назначения исполнителя на заказ.
   */
  listByRole: managementProcedure
    .input(z.object({ role: roleSchema, branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(users.isActive, true),
        eq(userRoles.role, input.role),
        input.branchId === undefined
          ? undefined
          : exists(
              ctx.db
                .select({ one: sql`1` })
                .from(userBranches)
                .where(
                  and(eq(userBranches.userId, users.id), eq(userBranches.branchId, input.branchId)),
                ),
            ),
      ].filter((condition) => condition !== undefined);

      return ctx.db
        .select({ id: users.id, fullName: users.fullName, phone: users.phone })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(users.fullName));
    }),

  /** Карточка сотрудника. Свой профиль доступен любому, чужой — руководству. */
  /**
   * Загрузка собственного фото.
   *
   * Только своё: чужие фото не меняет даже директор — это личные данные,
   * а не кадровый атрибут вроде должности. Прежний файл удаляется, иначе
   * при каждой смене фото хранилище прирастало бы ещё одним снимком,
   * на который никто не ссылается.
   */
  uploadAvatar: protectedProcedure
    .input(z.object({ file: base64FileSchema }))
    .mutation(async ({ ctx, input }) => {
      const env = getEnv();
      const body = decodeBase64Payload(input.file, {
        allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
        maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      });

      const [before] = await ctx.db
        .select({ avatarStorageKey: users.avatarStorageKey })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const storage = getStorage();
      const stored = await storage.upload({
        key: buildStorageKey(['avatars', ctx.user.id.toString()], input.file.mimeType),
        body,
        mimeType: input.file.mimeType,
      });

      try {
        await ctx.db
          .update(users)
          .set({ avatarStorageKey: stored.key, updatedAt: new Date() })
          .where(eq(users.id, ctx.user.id));
      } catch (error) {
        // Ссылку в БД поставить не удалось — убираем загруженный файл,
        // иначе он останется в хранилище навсегда и ничем не будет виден.
        await storage.delete(stored.key).catch(() => undefined);
        throw error;
      }

      const previousKey = before?.avatarStorageKey ?? null;
      if (previousKey !== null && previousKey !== stored.key) {
        await storage.delete(previousKey).catch(() => undefined);
      }

      return loadUserOrThrow(ctx.db, ctx.user.id);
    }),

  /** Удаление собственного фото: снова показываются инициалы. */
  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const [before] = await ctx.db
      .select({ avatarStorageKey: users.avatarStorageKey })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    await ctx.db
      .update(users)
      .set({ avatarStorageKey: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));

    const key = before?.avatarStorageKey ?? null;
    // Файл удаляем ПОСЛЕ снятия ссылки: обратный порядок оставил бы в БД
    // ключ на уже удалённый объект, и профиль отдавал бы битую ссылку.
    if (key !== null) await getStorage().delete(key).catch(() => undefined);

    return loadUserOrThrow(ctx.db, ctx.user.id);
  }),

  byId: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      if (input.id !== ctx.user.id && !isManagement(ctx.user.roles)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Профиль другого сотрудника доступен только руководству',
        });
      }

      return loadUserOrThrow(ctx.db, input.id);
    }),

  /** Создание сотрудника вместе с ролями и филиалами. */
  create: ceoProcedure
    .input(
      z.object({
        fullName: nonEmptyString(200, 'Укажите ФИО сотрудника'),
        phone: phoneSchema,
        password: passwordSchema,
        roles: z.array(roleSchema).min(1, 'Назначьте хотя бы одну роль'),
        branchIds: z.array(idSchema).min(1, 'Привяжите сотрудника хотя бы к одному филиалу'),
        primaryBranchId: idSchema.optional(),

        jobTitle: nonEmptyString(200).optional(),
        /** Если не указано — берётся подразделение по умолчанию для первой роли. */
        department: departmentSchema.optional(),
        employmentType: employmentTypeSchema.default('permanent'),
        birthDate: z.string().date().optional(),
        hiredAt: z.string().date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const primaryBranchId = input.primaryBranchId ?? input.branchIds[0];
      if (primaryBranchId === undefined || !input.branchIds.includes(primaryBranchId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Основной филиал должен быть среди привязанных',
        });
      }

      const passwordHash = await hashPassword(input.password);
      const firstRole = input.roles[0];
      const department =
        input.department ??
        (firstRole === undefined ? 'other' : DEFAULT_DEPARTMENT_BY_ROLE[firstRole]);

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            fullName: input.fullName,
            phone: input.phone,
            passwordHash,
            jobTitle: input.jobTitle ?? null,
            department,
            employmentType: input.employmentType,
            birthDate: input.birthDate ?? null,
            hiredAt: input.hiredAt ?? null,
          })
          .onConflictDoNothing()
          .returning({ id: users.id });

        if (created === undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Сотрудник с таким номером телефона уже заведён',
          });
        }

        // Табельный номер строится от `id`, а не от счётчика в году: `id`
        // уникален по построению, поэтому две параллельные регистрации
        // не могут получить один и тот же номер.
        const codeYear =
          input.hiredAt === undefined
            ? new Date().getUTCFullYear()
            : new Date(input.hiredAt).getUTCFullYear();

        await tx
          .update(users)
          .set({ employeeCode: formatEmployeeCode(codeYear, created.id) })
          .where(eq(users.id, created.id));

        await tx.insert(userRoles).values(
          [...new Set(input.roles)].map((role) => ({
            userId: created.id,
            role,
            grantedBy: ctx.user.id,
          })),
        );

        await tx.insert(userBranches).values(
          [...new Set(input.branchIds)].map((branchId) => ({
            userId: created.id,
            branchId,
            isPrimary: branchId === primaryBranchId,
          })),
        );

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.created',
          entityType: 'user',
          entityId: created.id,
          details: { fullName: input.fullName, roles: input.roles, branchIds: input.branchIds },
          ipAddress: ctx.ipAddress,
        });

        return loadUserOrThrow(tx, created.id);
      });
    }),

  /** Правка анкетных данных сотрудника. Роли меняются отдельными процедурами. */
  update: ceoProcedure
    .input(
      z.object({
        id: idSchema,
        fullName: nonEmptyString(200).optional(),
        phone: phoneSchema.optional(),
        jobTitle: nonEmptyString(200).nullable().optional(),
        department: departmentSchema.optional(),
        employmentType: employmentTypeSchema.optional(),
        birthDate: z.string().date().nullable().optional(),
        hiredAt: z.string().date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const patch = {
          ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
          ...(input.department === undefined ? {} : { department: input.department }),
          ...(input.employmentType === undefined
            ? {}
            : { employmentType: input.employmentType }),
          ...(input.birthDate === undefined ? {} : { birthDate: input.birthDate }),
          ...(input.hiredAt === undefined ? {} : { hiredAt: input.hiredAt }),
        };

        if (Object.keys(patch).length === 0) return loadUserOrThrow(tx, input.id);

        const [updated] = await tx
          .update(users)
          .set(patch)
          .where(eq(users.id, input.id))
          .returning({ id: users.id });

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.updated',
          entityType: 'user',
          entityId: input.id,
          details: patch,
          ipAddress: ctx.ipAddress,
        });

        return loadUserOrThrow(tx, input.id);
      }),
    ),

  /** Приём на работу и увольнение. Деактивация завершает все сессии сотрудника. */
  setActive: ceoProcedure
    .input(z.object({ id: idSchema, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.isActive && input.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Нельзя деактивировать собственную учётную запись',
        });
      }

      return ctx.db.transaction(async (tx) => {
        if (!input.isActive) await assertNotLastCeo(tx, input.id);

        const [updated] = await tx
          .update(users)
          .set({
            isActive: input.isActive,
            // Дата увольнения ставится и снимается вместе с признаком:
            // иначе восстановленный сотрудник остался бы с датой увольнения,
            // и отчёт «уволены в этом месяце» считал бы его дважды.
            firedAt: input.isActive ? null : new Date().toISOString().slice(0, 10),
          })
          .where(eq(users.id, input.id))
          .returning({ id: users.id });

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }

        // Уволенный сотрудник должен потерять доступ немедленно, а не через
        // время жизни access-токена.
        if (!input.isActive) await revokeAllSessions(tx, input.id);

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: input.isActive ? 'user.activated' : 'user.deactivated',
          entityType: 'user',
          entityId: input.id,
          ipAddress: ctx.ipAddress,
        });

        return loadUserOrThrow(tx, input.id);
      });
    }),

  /** Выдача роли. */
  grantRole: ceoProcedure
    .input(z.object({ id: idSchema, role: roleSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const target = await tx.query.users.findFirst({
          where: eq(users.id, input.id),
          columns: { id: true },
        });
        if (target === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }

        const inserted = await tx
          .insert(userRoles)
          .values({ userId: input.id, role: input.role, grantedBy: ctx.user.id })
          .onConflictDoNothing()
          .returning({ role: userRoles.role });

        // Роль уже была — не ошибка, но и уведомлять повторно не нужно.
        if (inserted.length === 0) return loadUserOrThrow(tx, input.id);

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.role_granted',
          entityType: 'user',
          entityId: input.id,
          details: { role: input.role },
          ipAddress: ctx.ipAddress,
        });

        await notifyRoleChanged(tx, input.id, {
          role: input.role,
          granted: true,
          actorName: ctx.user.fullName,
        });

        return loadUserOrThrow(tx, input.id);
      }),
    ),

  /** Отзыв роли. */
  revokeRole: ceoProcedure
    .input(z.object({ id: idSchema, role: roleSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        if (input.role === Role.CEO) await assertNotLastCeo(tx, input.id);

        const remaining = await tx
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, input.id));

        if (remaining.length <= 1 && remaining.some((entry) => entry.role === input.role)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'Нельзя снять последнюю роль. Назначьте другую роль или деактивируйте сотрудника',
          });
        }

        const deleted = await tx
          .delete(userRoles)
          .where(and(eq(userRoles.userId, input.id), eq(userRoles.role, input.role)))
          .returning({ role: userRoles.role });

        if (deleted.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `У сотрудника нет роли «${ROLE_LABELS_RU[input.role]}»`,
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.role_revoked',
          entityType: 'user',
          entityId: input.id,
          details: { role: input.role },
          ipAddress: ctx.ipAddress,
        });

        await notifyRoleChanged(tx, input.id, {
          role: input.role,
          granted: false,
          actorName: ctx.user.fullName,
        });

        return loadUserOrThrow(tx, input.id);
      }),
    ),

  /** Привязка сотрудника к филиалам. */
  setBranches: managementProcedure
    .input(
      z.object({
        id: idSchema,
        branchIds: z.array(idSchema).min(1, 'Нужен хотя бы один филиал'),
        primaryBranchId: idSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uniqueBranchIds = [...new Set(input.branchIds)];
      const primaryBranchId = input.primaryBranchId ?? uniqueBranchIds[0];

      if (primaryBranchId === undefined || !uniqueBranchIds.includes(primaryBranchId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Основной филиал должен быть среди привязанных',
        });
      }

      return ctx.db.transaction(async (tx) => {
        // Полная замена набора, а не точечные правки: так невозможно получить
        // состояние с двумя основными филиалами при частичном сбое.
        await tx.delete(userBranches).where(eq(userBranches.userId, input.id));

        await tx.insert(userBranches).values(
          uniqueBranchIds.map((branchId) => ({
            userId: input.id,
            branchId,
            isPrimary: branchId === primaryBranchId,
          })),
        );

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.branches_changed',
          entityType: 'user',
          entityId: input.id,
          details: { branchIds: uniqueBranchIds, primaryBranchId },
          ipAddress: ctx.ipAddress,
        });

        return loadUserOrThrow(tx, input.id);
      });
    }),

  /** Сброс пароля сотруднику. Текущий пароль не требуется. */
  resetPassword: ceoProcedure
    .input(z.object({ id: idSchema, newPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const target = await tx.query.users.findFirst({
          where: eq(users.id, input.id),
          columns: { id: true },
        });
        if (target === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
        }

        await resetPasswordByManager(tx, input.id, input.newPassword);

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'user.password_reset',
          entityType: 'user',
          entityId: input.id,
          ipAddress: ctx.ipAddress,
        });

        return { success: true } as const;
      }),
    ),

  /* ------------------------------------------------------------------------ */
  /*                       Кадровая аналитика (раздел «Рабочие»)              */
  /* ------------------------------------------------------------------------ */

  /**
   * Сводные показатели и разрезы штата: карточки сверху и четыре диаграммы
   * раздела «Ведомость рабочих».
   */
  stats: managementProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [summary, distributions] = await Promise.all([
      staffSummary(ctx.db, now),
      staffDistributions(ctx.db, now),
    ]);

    return { summary, distributions };
  }),

  /**
   * Статус присутствия на сегодня.
   *
   * Отдельная процедура, а не колонка в `list`: присутствие меняется в течение
   * дня, и его нужно перезапрашивать чаще, чем сам список сотрудников.
   */
  presenceToday: managementProcedure.query(async ({ ctx }) => {
    // Ключи Map — числа, а JSON их всё равно приводит к строкам,
    // поэтому отдаём объект с явно строковыми ключами.
    return Object.fromEntries(await presenceToday(ctx.db));
  }),

  /** Посещаемость по дням месяца — данные для тепловой карты. */
  attendance: managementProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const bounds = periodBounds(input);
    return {
      period: { year: input.year, month: input.month },
      days: await attendanceByDay(ctx.db, bounds),
    };
  }),

  /** Ближайшие дни рождения. */
  birthdays: managementProcedure
    .input(z.object({ withinDays: z.number().int().min(1).max(365).default(30) }).default({}))
    .query(async ({ ctx, input }) => upcomingBirthdays(ctx.db, input.withinDays)),

  /**
   * Выработка сотрудников за месяц: план, факт и начисленная зарплата.
   *
   * План берётся из активной схемы начисления по роли (`kpi_target`), а не из
   * персонального норматива: персональных планов в системе нет, и заводить их
   * ради трёх колонок означало бы придумать сущность, которой заказчик
   * не заказывал. Если у роли схема без KPI, план равен `null` — колонка
   * покажет прочерк, а не ноль, который читался бы как «план не выполнен».
   *
   * Факт — число закрытых за период заказов, где сотрудник был исполнителем
   * в этой роли.
   */
  performance: managementProcedure
    .input(periodSchema.extend({ userIds: z.array(idSchema).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const period = { year: input.year, month: input.month };
      const bounds = periodBounds(period);

      const staff = await ctx.db
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(
          and(
            eq(users.isActive, true),
            ...(input.userIds === undefined || input.userIds.length === 0
              ? []
              : [inArray(userRoles.userId, input.userIds)]),
          ),
        );

      const schemes = await ctx.db
        .select({
          role: payrollSchemes.role,
          kpiTarget: payrollSchemes.kpiTarget,
        })
        .from(payrollSchemes)
        .where(eq(payrollSchemes.isActive, true));

      const planByRole = new Map(
        schemes.map((scheme) => [
          scheme.role,
          scheme.kpiTarget === null ? null : Number.parseFloat(scheme.kpiTarget),
        ]),
      );

      const payrollRows = await ctx.db
        .select({
          userId: payrollRecords.userId,
          amount: sql<string>`coalesce(sum(${payrollRecords.calculatedAmount}), 0)`,
        })
        .from(payrollRecords)
        .where(
          and(
            eq(payrollRecords.periodYear, period.year),
            eq(payrollRecords.periodMonth, period.month),
          ),
        )
        .groupBy(payrollRecords.userId);

      const payrollByUser = new Map(payrollRows.map((row) => [row.userId, row.amount]));

      // Считаем факт по каждой паре «сотрудник + роль» и складываем в разрезе
      // сотрудника: человек с двумя ролями закрыл заказы и как мастер, и как швея.
      const byUser = new Map<number, { plan: number | null; completed: number }>();

      for (const entry of staff) {
        const completed = await calculateCompletedOrders(
          ctx.db,
          entry.userId,
          entry.role,
          bounds,
        );

        const current = byUser.get(entry.userId) ?? { plan: null, completed: 0 };
        const rolePlan = planByRole.get(entry.role) ?? null;

        byUser.set(entry.userId, {
          // Если ролей несколько, берём наибольший план: он и определяет
          // ожидания от сотрудника за месяц.
          plan:
            rolePlan === null
              ? current.plan
              : current.plan === null
                ? rolePlan
                : Math.max(current.plan, rolePlan),
          completed: current.completed + completed.count,
        });
      }

      return [...byUser.entries()].map(([userId, value]) => ({
        userId,
        plan: value.plan,
        completed: value.completed,
        percent:
          value.plan === null || value.plan === 0
            ? null
            : Math.round((value.completed / value.plan) * 1000) / 10,
        payrollAmount: payrollByUser.get(userId) ?? '0',
      }));
    }),
});

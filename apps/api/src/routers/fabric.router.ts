import { branches, catalogItems, fabricStock, type DbExecutor } from '@curtain-crm/db';
import { isManagement, MATERIAL_CODE_KIND_LIST, type Role } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, nonEmptyString, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { router } from '../trpc';

/**
 * Склад тканей: сколько метров какого кода лежит в цехе.
 *
 * Складского учёта в системе не было вовсе — закупки давали себестоимость
 * заказа, но на вопрос «сколько метров П-31 осталось» отвечали рулонами и
 * глазами. Здесь остаток ведётся по коду с этикетки: тому же самому, который
 * продавец вводит в заказе, а руководитель заводит в справочнике.
 *
 * Права:
 *  - `list` — любой вошедший: раскройщику нужно знать, есть ли ткань;
 *  - `receive`, `setMeters` — руководство: приход и пересчёт это деньги.
 *
 * Списание делает не эта процедура, а переход заказа в пошив
 * (`writeOffOrderFabric` в `orderWorkflow.service.ts`): ткань уходит со
 * склада тогда, когда её раскроили, а не когда кто-то вспомнил отметить.
 */

const kindSchema = z.enum([
  MATERIAL_CODE_KIND_LIST[0] ?? 'portiere_code',
  ...MATERIAL_CODE_KIND_LIST.slice(1),
]);

/** Метраж: до тысячных, как и колонка. Ноль запрещён — это не движение. */
const metersSchema = z.number().positive().max(100000);

const branchAllowed = (
  user: { roles: readonly Role[]; branchIds: readonly number[] },
  branchId: number,
): void => {
  if (isManagement(user.roles)) return;
  if (!user.branchIds.includes(branchId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Это склад филиала, к которому вы не привязаны',
    });
  }
};

async function loadRow(executor: DbExecutor, id: number) {
  const [row] = await executor.select().from(fabricStock).where(eq(fabricStock.id, id)).limit(1);
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция склада не найдена' });
  }
  return row;
}

export const fabricRouter = router({
  /**
   * Остатки.
   *
   * Описание кода приходит из справочника, который ведёт руководитель:
   * склад его не дублирует, иначе правка описания в справочнике оставляла бы
   * на складе прежнее. Соединение по нижнему регистру — код переписывают с
   * этикетки руками.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          branchId: idSchema.optional(),
          kind: kindSchema.optional(),
          search: optionalText(100),
          /** Нулевые остатки скрыты: на вопрос «что есть» ноль не отвечает. */
          includeEmpty: z.boolean().default(true),
        })
        .default({ includeEmpty: true }),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search ?? null;

      return ctx.db
        .select({
          id: fabricStock.id,
          branchId: fabricStock.branchId,
          branchName: branches.name,
          kind: fabricStock.kind,
          code: fabricStock.code,
          meters: fabricStock.meters,
          description: catalogItems.description,
          updatedAt: fabricStock.updatedAt,
        })
        .from(fabricStock)
        .innerJoin(branches, eq(branches.id, fabricStock.branchId))
        .leftJoin(
          catalogItems,
          and(
            eq(catalogItems.kind, fabricStock.kind),
            sql`lower(${catalogItems.name}) = lower(${fabricStock.code})`,
          ),
        )
        .where(
          and(
            ...(input.branchId === undefined ? [] : [eq(fabricStock.branchId, input.branchId)]),
            ...(input.kind === undefined ? [] : [eq(fabricStock.kind, input.kind)]),
            ...(input.includeEmpty ? [] : [sql`${fabricStock.meters} <> 0`]),
            ...(search === null
              ? []
              : [
                  or(
                    sql`${fabricStock.code} ilike ${`%${search}%`}`,
                    sql`${catalogItems.description} ilike ${`%${search}%`}`,
                  ),
                ]),
          ),
        )
        .orderBy(asc(fabricStock.kind), asc(fabricStock.code))
        .limit(500);
    }),

  /**
   * Приход: привезли рулон.
   *
   * Прибавляет к остатку, а не заменяет его: «привезли ещё шестьдесят три
   * метра» — то, что происходит на самом деле. Строки может не быть вовсе —
   * первый приход кода её и создаёт.
   */
  receive: managementProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        kind: kindSchema,
        code: nonEmptyString(100, 'Укажите код с этикетки'),
        meters: metersSchema,
        comment: optionalText(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchId = input.branchId ?? ctx.user.primaryBranchId;
      if (branchId === null || branchId === undefined) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Укажите филиал: у вас не задан основной филиал',
        });
      }
      branchAllowed(ctx.user, branchId);

      return ctx.db.transaction(async (tx) => {
        const updated = await addMeters(tx, {
          branchId,
          kind: input.kind,
          code: input.code,
          meters: input.meters,
          userId: ctx.user.id,
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'fabric_stock.received',
          entityType: 'fabric_stock',
          entityId: updated.id,
          details: {
            code: updated.code,
            kind: updated.kind,
            meters: input.meters,
            stockAfter: updated.meters,
            comment: input.comment ?? null,
          },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      });
    }),

  /**
   * Пересчёт: числом «сколько стало», а не «сколько прибавить».
   *
   * Кладовщик меряет рулон и вводит то, что намерил. Прибавление требовало бы
   * от него вычитания в уме, а ошибка в нём тихо разошлась бы с полкой.
   */
  setMeters: managementProcedure
    .input(
      z.object({
        id: idSchema,
        meters: z.number().min(-100000).max(100000),
        comment: optionalText(300),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const row = await loadRow(tx, input.id);
        branchAllowed(ctx.user, row.branchId);

        const [updated] = await tx
          .update(fabricStock)
          .set({ meters: input.meters.toFixed(3), updatedAt: new Date() })
          .where(eq(fabricStock.id, row.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция склада не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'fabric_stock.counted',
          entityType: 'fabric_stock',
          entityId: row.id,
          details: {
            code: row.code,
            from: row.meters,
            to: updated.meters,
            comment: input.comment ?? null,
          },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

/**
 * Прибавляет метры к остатку кода, создавая строку при первом приходе.
 *
 * Вынесено из процедуры: тем же путём списывается ткань при раскрое, только
 * с отрицательным числом (`orderWorkflow.service.ts`).
 */
export async function addMeters(
  executor: DbExecutor,
  input: {
    readonly branchId: number;
    readonly kind: (typeof MATERIAL_CODE_KIND_LIST)[number];
    readonly code: string;
    readonly meters: number;
    readonly userId: number;
  },
) {
  const code = input.code.trim();

  const [existing] = await executor
    .select()
    .from(fabricStock)
    .where(
      and(
        eq(fabricStock.branchId, input.branchId),
        eq(fabricStock.kind, input.kind),
        sql`lower(${fabricStock.code}) = lower(${code})`,
      ),
    )
    .limit(1);

  if (existing === undefined) {
    const [created] = await executor
      .insert(fabricStock)
      .values({
        branchId: input.branchId,
        kind: input.kind,
        code,
        meters: input.meters.toFixed(3),
        createdBy: input.userId,
      })
      .returning();

    if (created === undefined) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Не удалось создать позицию склада',
      });
    }
    return created;
  }

  const [updated] = await executor
    .update(fabricStock)
    .set({
      meters: sql`${fabricStock.meters} + ${input.meters.toFixed(3)}`,
      updatedAt: new Date(),
    })
    .where(eq(fabricStock.id, existing.id))
    .returning();

  if (updated === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция склада не найдена' });
  }
  return updated;
}

/** Виды, по которым ведётся склад — для проверки в сервисе списания. */
export const isFabricKind = (
  kind: string,
): kind is (typeof MATERIAL_CODE_KIND_LIST)[number] =>
  (MATERIAL_CODE_KIND_LIST as readonly string[]).includes(kind);

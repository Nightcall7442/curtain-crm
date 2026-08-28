import { purchaseItems, purchases, users } from '@curtain-crm/db';
import {
  formatMoney,
  moneyToDecimalString,
  isManagement,
  OrderStatus,
  parseMoney,
  PURCHASE_CATEGORIES,
  purchaseUnitSchema,
  Role,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, nonEmptyString, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure, roleProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { assertCanAccessOrder, loadOrderForUpdate } from '../services/orderWorkflow.service';
import { router } from '../trpc';

/**
 * Закупка материалов и себестоимость заказа.
 *
 * Права доступа:
 *  - `items.list` — любой вошедший сотрудник (нужен формой закупки);
 *  - `items.create`, `items.update`, `items.setActive` — руководство (CEO, админ):
 *    каталог закупочных товаров с ценами ведут именно они;
 *  - `listByOrder`, `orderCost` — участники заказа и руководство;
 *  - `add` — руководство, а также мастер-замерщик и швея: материалы под заказ
 *    покупают они, и заставлять их проводить закупку через админа означало бы
 *    терять чеки;
 *  - `remove` — только руководство: удаление строки меняет себестоимость.
 */

const categorySchema = z.enum(PURCHASE_CATEGORIES);

/** Кто может проводить закупку по заказу. */
const purchaseProcedure = roleProcedure(Role.CEO, Role.ADMIN, Role.MASTER, Role.SEWER);

const itemsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          category: categorySchema.optional(),
          includeInactive: z.boolean().default(false),
        })
        .default({ includeInactive: false }),
    )
    .query(async ({ ctx, input }) =>
      ctx.db
        .select()
        .from(purchaseItems)
        .where(
          and(
            ...(input.category === undefined ? [] : [eq(purchaseItems.category, input.category)]),
            ...(input.includeInactive ? [] : [eq(purchaseItems.isActive, true)]),
          ),
        )
        .orderBy(asc(purchaseItems.category), asc(purchaseItems.name)),
    ),

  create: managementProcedure
    .input(
      z.object({
        name: nonEmptyString(200, 'Укажите название товара'),
        unit: purchaseUnitSchema,
        price: moneySchema,
        category: categorySchema.default('other'),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(purchaseItems)
          .values({
            name: input.name,
            unit: input.unit,
            price: moneyToDecimalString(parseMoney(input.price)),
            category: input.category,
            createdBy: ctx.user.id,
          })
          .onConflictDoNothing()
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Товар «${input.name}» уже есть в каталоге`,
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'purchase_item.created',
          entityType: 'purchase_item',
          entityId: created.id,
          details: { name: created.name, price: created.price, unit: created.unit },
          ipAddress: ctx.ipAddress,
        });

        return created;
      }),
    ),

  /**
   * Правка товара, включая цену.
   *
   * Изменение цены НЕ затрагивает уже проведённые закупки: в `purchases`
   * хранится снимок цены на момент закупки.
   */
  update: managementProcedure
    .input(
      z.object({
        id: idSchema,
        name: nonEmptyString(200).optional(),
        unit: purchaseUnitSchema.optional(),
        price: moneySchema.optional(),
        category: categorySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const existing = await tx.query.purchaseItems.findFirst({
          where: eq(purchaseItems.id, input.id),
        });
        if (existing === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
        }

        const patch = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.unit === undefined ? {} : { unit: input.unit }),
          ...(input.price === undefined
            ? {}
            : { price: moneyToDecimalString(parseMoney(input.price)) }),
          ...(input.category === undefined ? {} : { category: input.category }),
        };

        if (Object.keys(patch).length === 0) return existing;

        const [updated] = await tx
          .update(purchaseItems)
          .set(patch)
          .where(eq(purchaseItems.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: input.price === undefined ? 'purchase_item.created' : 'purchase_item.price_changed',
          entityType: 'purchase_item',
          entityId: updated.id,
          details: { from: { price: existing.price }, to: patch },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  setActive: managementProcedure
    .input(z.object({ id: idSchema, isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(purchaseItems)
          .set({ isActive: input.isActive })
          .where(eq(purchaseItems.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: input.isActive ? 'purchase_item.activated' : 'purchase_item.deactivated',
          entityType: 'purchase_item',
          entityId: updated.id,
          details: { isActive: input.isActive },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),
});

export const purchasesRouter = router({
  items: itemsRouter,

  /** Закупки по заказу с расшифровкой. */
  listByOrder: protectedProcedure
    .input(z.object({ orderId: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: (table, { eq: equals }) => equals(table.id, input.orderId),
      });

      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      return ctx.db
        .select({
          id: purchases.id,
          itemId: purchases.itemId,
          itemName: purchaseItems.name,
          unit: purchaseItems.unit,
          quantity: purchases.quantity,
          unitPrice: purchases.unitPrice,
          totalPrice: purchases.totalPrice,
          comment: purchases.comment,
          createdBy: purchases.createdBy,
          createdByName: users.fullName,
          createdAt: purchases.createdAt,
        })
        .from(purchases)
        .innerJoin(purchaseItems, eq(purchaseItems.id, purchases.itemId))
        .innerJoin(users, eq(users.id, purchases.createdBy))
        .where(eq(purchases.orderId, input.orderId))
        .orderBy(desc(purchases.createdAt));
    }),

  /**
   * Проведение закупки по заказу.
   *
   * Цена берётся из каталога на момент проведения и сохраняется в строке:
   * дальнейшее изменение цены товара не меняет себестоимость этого заказа.
   */
  add: purchaseProcedure
    .input(
      z.object({
        orderId: idSchema,
        itemId: idSchema,
        quantity: z.number().positive('Количество должно быть больше нуля').max(1_000_000),
        /** Цена за единицу. Если не указана — берётся текущая цена из каталога. */
        unitPrice: moneySchema.optional(),
        comment: optionalText(500),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.orderId);
        assertCanAccessOrder(order, ctx.user);

        if (order.status === OrderStatus.CANCELLED) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Нельзя проводить закупку по отменённому заказу',
          });
        }

        const item = await tx.query.purchaseItems.findFirst({
          where: eq(purchaseItems.id, input.itemId),
        });

        if (item === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден в каталоге' });
        }
        if (!item.isActive && input.unitPrice === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Товар «${item.name}» выведен из обращения. Укажите цену вручную или выберите другой`,
          });
        }

        const unitPrice =
          input.unitPrice === undefined
            ? item.price
            : moneyToDecimalString(parseMoney(input.unitPrice));

        const [created] = await tx
          .insert(purchases)
          .values({
            orderId: input.orderId,
            itemId: input.itemId,
            quantity: input.quantity.toFixed(3),
            unitPrice,
            comment: input.comment ?? null,
            createdBy: ctx.user.id,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось провести закупку',
          });
        }

        return created;
      }),
    ),

  remove: managementProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(purchases)
        .where(eq(purchases.id, input.id))
        .returning();

      if (deleted === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Закупка не найдена' });
      }

      return { success: true } as const;
    }),

  /**
   * Себестоимость заказа и маржа.
   *
   * Себестоимость — сумма закупок по заказу. Маржа считается от `work_price`,
   * то есть от суммы работ для клиента.
   *
   * Участник заказа видит ТОЛЬКО закупки: сколько потрачено на его заказ —
   * рабочая информация, она нужна швее и мастеру. Выручка, маржа и
   * рентабельность возвращаются `null` всем, кроме руководства: это
   * управленческие цифры, и знать, сколько мастерская заработала на конкретном
   * клиенте, исполнителю этапа незачем.
   *
   * Процедура намеренно осталась `protectedProcedure`, а не стала
   * управленческой: иначе у рядового сотрудника пропала бы и себестоимость,
   * ради которой блок закупок в карточке и существует.
   */
  orderCost: protectedProcedure
    .input(z.object({ orderId: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: (table, { eq: equals }) => equals(table.id, input.orderId),
      });

      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      const [row] = await ctx.db
        .select({
          total: sql<string>`coalesce(sum(${purchases.totalPrice}), 0)`,
          lines: sql<string>`count(*)`,
        })
        .from(purchases)
        .where(eq(purchases.orderId, input.orderId));

      const cost = parseMoney(row?.total ?? '0');
      const revenue = parseMoney(order.workPrice);
      const margin = revenue - cost;
      const showsManagementFigures = isManagement(ctx.user.roles);

      return {
        orderId: order.id,
        purchaseLines: Number.parseInt(row?.lines ?? '0', 10),

        // Закупки — всем участникам заказа.
        costMinor: cost,
        costFormatted: formatMoney(cost),

        // Управленческие цифры — только руководству.
        revenueMinor: showsManagementFigures ? revenue : null,
        revenueFormatted: showsManagementFigures ? formatMoney(revenue) : null,
        marginMinor: showsManagementFigures ? margin : null,
        marginFormatted: showsManagementFigures ? formatMoney(margin) : null,
        /**
         * Рентабельность в процентах. `null` и когда цифра не положена
         * вызывающему, и когда сумма работ ещё не проставлена.
         */
        marginPercent:
          !showsManagementFigures || revenue === 0
            ? null
            : Math.round((margin / revenue) * 10_000) / 100,
      };
    }),
});

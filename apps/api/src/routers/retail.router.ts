import {
  retailItems,
  retailSaleItems,
  retailSales,
  users,
  type DbExecutor,
} from '@curtain-crm/db';
import {
  isManagement,
  moneyToDecimalString,
  parseMoney,
  purchaseCategorySchema,
  purchaseUnitSchema,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  idSchema,
  moneySchema,
  nonEmptyString,
  optionalText,
  paginationSchema,
  phoneSchema,
} from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure, orderIntakeProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Розничная касса: продажа тюля, аксессуаров и прочей мелочи с витрины.
 *
 * Отличается от `orders.sellReadyMade` тем, что это ЧЕК из нескольких
 * позиций, а не одна вещь: за тюлем заходят вместе с держателями и сачаком,
 * и три отдельных «продажи» вместо одной покупки — это три записи там, где
 * произошло одно событие.
 *
 * Права доступа:
 *  - `items.list` — любой вошедший: продавцу нужен прайс, руководству —
 *    остатки. Закупочной цены здесь нет вовсе, поэтому скрывать нечего;
 *  - `items.upsert`, `items.setActive`, `items.addStock` — руководство:
 *    цену на витрине и приход товара назначает оно;
 *  - `sell` — приёмка (продавец, админ, директор);
 *  - `sales.list` — руководство; `sales.mine` — свои чеки продавца.
 *
 * Остаток списывается тем же запросом, что и проверяется
 * (`... where stock >= qty`), поэтому две кассы не продадут последний
 * рулон одновременно. Последнее слово всё равно за check-констрейнтом.
 */

/** Количество товара в чеке: дробное — тюль продают метрами. */
const quantitySchema = z
  .number()
  .positive('Количество должно быть больше нуля')
  .max(100_000, 'Слишком большое количество');

const toQuantity = (value: number): string => value.toFixed(3);

export const retailRouter = router({
  items: router({
    /** Прайс витрины. По умолчанию — только то, что продаётся. */
    list: protectedProcedure
      .input(
        z
          .object({
            includeInactive: z.boolean().default(false),
            category: purchaseCategorySchema.optional(),
          })
          .default({ includeInactive: false }),
      )
      .query(async ({ ctx, input }) =>
        ctx.db
          .select()
          .from(retailItems)
          .where(
            and(
              ...(input.includeInactive ? [] : [eq(retailItems.isActive, true)]),
              ...(input.category === undefined ? [] : [eq(retailItems.category, input.category)]),
            ),
          )
          .orderBy(retailItems.category, retailItems.name),
      ),

    /**
     * Завести позицию или изменить цену существующей.
     *
     * Остаток здесь НЕ меняется: цена и приход товара — разные события с
     * разными причинами, и общая форма провоцировала бы «поправить заодно».
     * Для прихода есть `addStock`.
     */
    upsert: managementProcedure
      .input(
        z.object({
          id: idSchema.optional(),
          name: nonEmptyString(200, 'Укажите название товара'),
          unit: purchaseUnitSchema.default('pcs'),
          category: purchaseCategorySchema.default('other'),
          price: moneySchema,
        }),
      )
      .mutation(async ({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const values = {
            name: input.name,
            unit: input.unit,
            category: input.category,
            price: moneyToDecimalString(parseMoney(input.price)),
          };

          if (input.id === undefined) {
            const [created] = await tx
              .insert(retailItems)
              .values({ ...values, createdBy: ctx.user.id })
              .returning();

            if (created === undefined) {
              throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Товар не создан' });
            }

            await recordAudit(tx, {
              actorId: ctx.user.id,
              action: 'retail_item.created',
              entityType: 'retail_item',
              entityId: created.id,
              details: { name: created.name, price: created.price },
              ipAddress: ctx.ipAddress,
            });

            return created;
          }

          const before = await tx.query.retailItems.findFirst({
            where: eq(retailItems.id, input.id),
          });
          if (before === undefined) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
          }

          const [updated] = await tx
            .update(retailItems)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(retailItems.id, input.id))
            .returning();

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: 'retail_item.updated',
            entityType: 'retail_item',
            entityId: input.id,
            details: { from: { name: before.name, price: before.price }, to: values },
            ipAddress: ctx.ipAddress,
          });

          return updated ?? before;
        }),
      ),

    /** Снять с продажи или вернуть на витрину. */
    setActive: managementProcedure
      .input(z.object({ id: idSchema, isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const [updated] = await tx
            .update(retailItems)
            .set({ isActive: input.isActive, updatedAt: new Date() })
            .where(eq(retailItems.id, input.id))
            .returning();

          if (updated === undefined) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
          }

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: input.isActive ? 'retail_item.activated' : 'retail_item.deactivated',
            entityType: 'retail_item',
            entityId: input.id,
            details: { name: updated.name },
            ipAddress: ctx.ipAddress,
          });

          return updated;
        }),
      ),

    /**
     * Приход товара на витрину.
     *
     * Прибавляет к остатку, а не заменяет его: «привезли ещё 20 метров» —
     * то, что происходит на самом деле, а установка числа поверх старого
     * потеряла бы то, что оставалось. Списание недостачи делается тем же
     * действием с отрицательным количеством, и оно тоже попадёт в журнал.
     */
    addStock: managementProcedure
      .input(
        z.object({
          id: idSchema,
          // `refine` идёт последним: он возвращает не `ZodNumber`, и
          // диапазон после него уже не навесить.
          quantity: z
            .number()
            .min(-100_000)
            .max(100_000)
            .refine((value) => value !== 0, 'Количество не может быть нулевым'),
          comment: optionalText(500),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const [updated] = await tx
            .update(retailItems)
            .set({
              stockQuantity: sql`${retailItems.stockQuantity} + ${toQuantity(input.quantity)}`,
              updatedAt: new Date(),
            })
            .where(eq(retailItems.id, input.id))
            .returning();

          if (updated === undefined) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден' });
          }

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: 'retail_item.stock_changed',
            entityType: 'retail_item',
            entityId: input.id,
            details: {
              name: updated.name,
              delta: toQuantity(input.quantity),
              stockAfter: updated.stockQuantity,
              comment: input.comment ?? null,
            },
            ipAddress: ctx.ipAddress,
          });

          return updated;
        }),
      ),
  }),

  /**
   * Пробить чек.
   *
   * Всё одной транзакцией: списание остатков и запись чека либо происходят
   * вместе, либо не происходят вовсе. Наполовину пробитый чек — товар ушёл,
   * а продажи нет — худший исход из возможных.
   */
  sell: orderIntakeProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        clientName: optionalText(200),
        clientPhone: phoneSchema.optional(),
        comment: optionalText(500),
        lines: z
          .array(z.object({ itemId: idSchema, quantity: quantitySchema }))
          .min(1, 'Добавьте хотя бы один товар')
          .max(50),
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
      if (!isManagement(ctx.user.roles) && !ctx.user.branchIds.includes(branchId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нельзя продавать в филиале, к которому вы не привязаны',
        });
      }

      /*
        Один товар дважды в одном чеке — это одна строка с суммарным
        количеством. Иначе остаток списался бы двумя запросами, и второй
        мог бы не пройти, когда первый уже прошёл.
      */
      const merged = new Map<number, number>();
      for (const line of input.lines) {
        merged.set(line.itemId, (merged.get(line.itemId) ?? 0) + line.quantity);
      }

      return ctx.db.transaction(async (tx) => {
        const catalog = await tx
          .select()
          .from(retailItems)
          .where(inArray(retailItems.id, [...merged.keys()]));

        const byId = new Map(catalog.map((item) => [item.id, item]));

        for (const [itemId] of merged) {
          const item = byId.get(itemId);
          if (item === undefined) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Товар не найден в прайсе' });
          }
          if (!item.isActive) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `«${item.name}» снят с продажи`,
            });
          }
        }

        const [sale] = await tx
          .insert(retailSales)
          .values({
            branchId,
            sellerId: ctx.user.id,
            clientName: input.clientName ?? null,
            clientPhone: input.clientPhone ?? null,
            comment: input.comment ?? null,
          })
          .returning();

        if (sale === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Чек не создан' });
        }

        for (const [itemId, quantity] of merged) {
          const item = byId.get(itemId);
          if (item === undefined) continue;

          /*
            Проверка и списание — один запрос.

            Прочитать остаток, сравнить и потом списать значило бы оставить
            зазор, в который проходит вторая касса: обе увидят «есть один» и
            обе продадут. Условие `>=` в самом UPDATE закрывает этот зазор.
          */
          const decremented = await tx
            .update(retailItems)
            .set({
              stockQuantity: sql`${retailItems.stockQuantity} - ${toQuantity(quantity)}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(retailItems.id, itemId),
                sql`${retailItems.stockQuantity} >= ${toQuantity(quantity)}`,
              ),
            )
            .returning({ id: retailItems.id });

          if (decremented.length === 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                `«${item.name}»: на витрине осталось ${item.stockQuantity}, ` +
                `а продаётся ${toQuantity(quantity)}. Оприходуйте поступление.`,
            });
          }

          await tx.insert(retailSaleItems).values({
            saleId: sale.id,
            itemId,
            itemName: item.name,
            unit: item.unit,
            unitPrice: item.price,
            quantity: toQuantity(quantity),
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'retail_sale.created',
          entityType: 'retail_sale',
          entityId: sale.id,
          details: { lines: merged.size },
          ipAddress: ctx.ipAddress,
        });

        return loadSale(tx, sale.id);
      });
    }),

  sales: router({
    /** Чеки за период — сводка для руководства. */
    list: managementProcedure
      .input(
        paginationSchema
          .extend({ sellerId: idSchema.optional() })
          .default({ page: 1, pageSize: 20 }),
      )
      .query(async ({ ctx, input }) => {
        const where =
          input.sellerId === undefined ? undefined : eq(retailSales.sellerId, input.sellerId);

        /*
          Итог считается соединением со строками, а не коррелированным
          подзапросом: подзапрос, собранный шаблоном `sql`, отрендерился
          так, что корреляция потерялась, и в списке стояла сумма одной
          строки вместо всего чека. Соединение с `group by` читается
          однозначно и проверяется тем же запросом в psql.
        */
        const [rows, [totalRow]] = await Promise.all([
          ctx.db
            .select({
              id: retailSales.id,
              sellerName: users.fullName,
              clientName: retailSales.clientName,
              comment: retailSales.comment,
              createdAt: retailSales.createdAt,
              total: sql<string>`coalesce(sum(${retailSaleItems.lineTotal}), 0)`,
              lines: sql<string>`count(${retailSaleItems.id})`,
            })
            .from(retailSales)
            .innerJoin(users, eq(users.id, retailSales.sellerId))
            .leftJoin(retailSaleItems, eq(retailSaleItems.saleId, retailSales.id))
            .where(where)
            .groupBy(
              retailSales.id,
              users.fullName,
              retailSales.clientName,
              retailSales.comment,
              retailSales.createdAt,
            )
            .orderBy(desc(retailSales.createdAt))
            .limit(input.pageSize)
            .offset(toOffset(input)),
          ctx.db.select({ value: sql<string>`count(*)` }).from(retailSales).where(where),
        ]);

        return toPage(rows, Number.parseInt(totalRow?.value ?? '0', 10), input);
      }),

    /** Свои чеки продавца — что он пробил сегодня. */
    mine: protectedProcedure
      .input(paginationSchema.default({ page: 1, pageSize: 20 }))
      .query(async ({ ctx, input }) => {
        const where = eq(retailSales.sellerId, ctx.user.id);

        const [rows, [totalRow]] = await Promise.all([
          ctx.db
            .select({
              id: retailSales.id,
              clientName: retailSales.clientName,
              createdAt: retailSales.createdAt,
              total: sql<string>`coalesce(sum(${retailSaleItems.lineTotal}), 0)`,
              lines: sql<string>`count(${retailSaleItems.id})`,
            })
            .from(retailSales)
            .leftJoin(retailSaleItems, eq(retailSaleItems.saleId, retailSales.id))
            .where(where)
            .groupBy(retailSales.id, retailSales.clientName, retailSales.createdAt)
            .orderBy(desc(retailSales.createdAt))
            .limit(input.pageSize)
            .offset(toOffset(input)),
          ctx.db.select({ value: sql<string>`count(*)` }).from(retailSales).where(where),
        ]);

        return toPage(rows, Number.parseInt(totalRow?.value ?? '0', 10), input);
      }),

    /** Чек целиком: строки и итог. Свой — продавцу, любой — руководству. */
    byId: protectedProcedure
      .input(z.object({ id: idSchema }))
      .query(async ({ ctx, input }) => {
        const sale = await ctx.db.query.retailSales.findFirst({
          where: eq(retailSales.id, input.id),
        });

        if (sale === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Чек не найден' });
        }
        if (sale.sellerId !== ctx.user.id && !isManagement(ctx.user.roles)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Это чек другого продавца' });
        }

        return loadSale(ctx.db, sale.id);
      }),
  }),
});

/** Чек со строками и итогом. Итог считается по строкам, а не хранится. */
async function loadSale(executor: DbExecutor, saleId: number) {
  const sale = await executor.query.retailSales.findFirst({
    where: eq(retailSales.id, saleId),
  });

  if (sale === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Чек не найден' });
  }

  const lines = await executor
    .select()
    .from(retailSaleItems)
    .where(eq(retailSaleItems.saleId, saleId))
    .orderBy(retailSaleItems.id);

  const total = lines.reduce((sum, line) => sum + parseMoney(line.lineTotal ?? '0'), 0);

  return { ...sale, lines, total: moneyToDecimalString(total) };
}

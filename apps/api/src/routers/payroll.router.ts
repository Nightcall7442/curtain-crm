import { payrollRecords, payrollSchemes, userRoles, users } from '@curtain-crm/db';
import {
  canTransitionPayrollStatus,
  formatMoney,
  moneyToDecimalString,
  parseMoney,
  payrollSchemeTypeSchema,
  PAYROLL_SCHEME_REQUIRED_FIELDS,
  PayrollRecordStatus,
  roleSchema,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, optionalText, periodSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { ceoProcedure, managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { notifyPayroll } from '../services/notifications.service';
import { calculateForUserRole, payableRoles, saveDraft } from '../services/payroll.service';
import { formatPeriod } from '../services/shifts.service';
import { router } from '../trpc';

/**
 * Зарплата: схемы начисления и расчёты по периодам.
 *
 * Права доступа:
 *  - `schemes.list`, `calculate`, `list` — руководство (CEO, админ):
 *    админ считает ведомость, но не утверждает её;
 *  - `schemes.upsert`, `approve`, `approveMany`, `markPaid` — ТОЛЬКО CEO:
 *    ставки и факт выплаты — зона директора;
 *  - `my` — любой вошедший сотрудник, только свои начисления.
 *
 * Утверждённые и выплаченные записи не пересчитываются: в
 * `payroll_records.scheme_snapshot` лежит снимок параметров схемы на момент
 * расчёта, поэтому изменение ставок не переписывает закрытые месяцы.
 */

const schemesRouter = router({
  list: managementProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select()
        .from(payrollSchemes)
        .where(input.includeInactive ? undefined : eq(payrollSchemes.isActive, true))
        .orderBy(asc(payrollSchemes.role), desc(payrollSchemes.effectiveFrom)),
    ),

  /**
   * Заведение или замена схемы начисления для роли.
   *
   * Действующая схема у роли одна: старая деактивируется, новая создаётся.
   * Схемы не правятся на месте — иначе перерасчёт черновика за прошлый месяц
   * дал бы другой результат, чем исходный, без единого следа.
   */
  upsert: ceoProcedure
    .input(
      z
        .object({
          role: roleSchema,
          type: payrollSchemeTypeSchema,
          baseAmount: moneySchema.optional(),
          rate: moneySchema.optional(),
          kpiTarget: z.number().positive().max(100_000).optional(),
          commissionPercent: z.number().min(0).max(100).optional(),
          effectiveFrom: z.string().date(),
        })
        .superRefine((value, ctx) => {
          // Проверяем ровно те поля, которых требует выбранный тип, —
          // тот же список, что и в check-констрейнте таблицы.
          for (const field of PAYROLL_SCHEME_REQUIRED_FIELDS[value.type]) {
            if (value[field] === undefined) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `Для схемы «${value.type}» это поле обязательно`,
              });
            }
          }
        }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await tx
          .update(payrollSchemes)
          .set({ isActive: false })
          .where(and(eq(payrollSchemes.role, input.role), eq(payrollSchemes.isActive, true)));

        const [created] = await tx
          .insert(payrollSchemes)
          .values({
            role: input.role,
            type: input.type,
            baseAmount:
              input.baseAmount === undefined
                ? null
                : moneyToDecimalString(parseMoney(input.baseAmount)),
            rate: input.rate === undefined ? null : moneyToDecimalString(parseMoney(input.rate)),
            kpiTarget: input.kpiTarget === undefined ? null : input.kpiTarget.toFixed(4),
            commissionPercent:
              input.commissionPercent === undefined ? null : input.commissionPercent.toFixed(3),
            effectiveFrom: input.effectiveFrom,
            createdBy: ctx.user.id,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось сохранить схему начисления',
          });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payroll.scheme_changed',
          entityType: 'payroll_scheme',
          entityId: created.id,
          details: { role: input.role, type: input.type },
          ipAddress: ctx.ipAddress,
        });

        return created;
      }),
    ),
});

export const payrollRouter = router({
  schemes: schemesRouter,

  /**
   * Расчёт черновиков за период.
   *
   * Считает по каждой роли каждого активного сотрудника. Уже утверждённые
   * записи пропускаются — их число возвращается отдельно, чтобы в интерфейсе
   * было видно, что часть ведомости не пересчитывалась.
   */
  calculate: managementProcedure
    .input(periodSchema.extend({ userId: idSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const period = { year: input.year, month: input.month };

      const staff = await ctx.db
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(
          and(
            eq(users.isActive, true),
            ...(input.userId === undefined ? [] : [eq(userRoles.userId, input.userId)]),
          ),
        );

      let calculated = 0;
      let skipped = 0;
      const failures: { userId: number; role: string; reason: string }[] = [];

      for (const entry of staff) {
        if (payableRoles([entry.role]).length === 0) continue;

        try {
          await ctx.db.transaction(async (tx) => {
            const result = await calculateForUserRole(tx, entry.userId, entry.role, period);
            const saved = await saveDraft(tx, result);
            if (saved) calculated += 1;
            else skipped += 1;
          });
        } catch (error) {
          // Одна ненастроенная схема не должна ронять весь расчёт по компании:
          // собираем проблемы и возвращаем их вместе с результатом.
          failures.push({
            userId: entry.userId,
            role: entry.role,
            reason: error instanceof TRPCError ? error.message : 'Ошибка расчёта',
          });
        }
      }

      await recordAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'payroll.calculated',
        entityType: 'payroll_record',
        details: { period, calculated, skipped, failures: failures.length },
        ipAddress: ctx.ipAddress,
      });

      return { period, calculated, skippedApproved: skipped, failures };
    }),

  /** Ведомость за период. */
  list: managementProcedure
    .input(periodSchema.extend({ userId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: payrollRecords.id,
          userId: payrollRecords.userId,
          userFullName: users.fullName,
          role: payrollRecords.role,
          calculatedAmount: payrollRecords.calculatedAmount,
          kpiPercent: payrollRecords.kpiPercent,
          paidAmount: payrollRecords.paidAmount,
          status: payrollRecords.status,
          schemeSnapshot: payrollRecords.schemeSnapshot,
          comment: payrollRecords.comment,
        })
        .from(payrollRecords)
        .innerJoin(users, eq(users.id, payrollRecords.userId))
        .where(
          and(
            eq(payrollRecords.periodYear, input.year),
            eq(payrollRecords.periodMonth, input.month),
            ...(input.userId === undefined ? [] : [eq(payrollRecords.userId, input.userId)]),
          ),
        )
        .orderBy(asc(users.fullName), asc(payrollRecords.role));

      const [totals] = await ctx.db
        .select({
          calculated: sql<string>`coalesce(sum(${payrollRecords.calculatedAmount}), 0)`,
          paid: sql<string>`coalesce(sum(${payrollRecords.paidAmount}), 0)`,
        })
        .from(payrollRecords)
        .where(
          and(
            eq(payrollRecords.periodYear, input.year),
            eq(payrollRecords.periodMonth, input.month),
          ),
        );

      return {
        period: { year: input.year, month: input.month },
        items: rows,
        totalCalculated: totals?.calculated ?? '0',
        totalPaid: totals?.paid ?? '0',
      };
    }),

  /** Собственные начисления сотрудника. */
  my: protectedProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2100).optional() }).default({}))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select({
          id: payrollRecords.id,
          role: payrollRecords.role,
          periodYear: payrollRecords.periodYear,
          periodMonth: payrollRecords.periodMonth,
          calculatedAmount: payrollRecords.calculatedAmount,
          kpiPercent: payrollRecords.kpiPercent,
          paidAmount: payrollRecords.paidAmount,
          status: payrollRecords.status,
          schemeSnapshot: payrollRecords.schemeSnapshot,
        })
        .from(payrollRecords)
        .where(
          and(
            eq(payrollRecords.userId, ctx.user.id),
            ...(input.year === undefined ? [] : [eq(payrollRecords.periodYear, input.year)]),
          ),
        )
        .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth)),
    ),

  /** Утверждение расчёта. После утверждения пересчёт запрещён. */
  approve: ceoProcedure
    .input(z.object({ id: idSchema, comment: optionalText(1000) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const record = await tx.query.payrollRecords.findFirst({
          where: eq(payrollRecords.id, input.id),
        });

        if (record === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
        }

        if (!canTransitionPayrollStatus(record.status, PayrollRecordStatus.APPROVED)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Нельзя утвердить расчёт в статусе «${record.status}»`,
          });
        }

        const [updated] = await tx
          .update(payrollRecords)
          .set({
            status: PayrollRecordStatus.APPROVED,
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
            comment: input.comment ?? record.comment,
          })
          .where(eq(payrollRecords.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payroll.approved',
          entityType: 'payroll_record',
          entityId: updated.id,
          details: { amount: updated.calculatedAmount },
          ipAddress: ctx.ipAddress,
        });

        await notifyPayroll(tx, updated.userId, {
          paid: false,
          period: formatPeriod({ year: updated.periodYear, month: updated.periodMonth }),
          amount: formatMoney(parseMoney(updated.calculatedAmount)),
        });

        return updated;
      }),
    ),

  /**
   * Массовое утверждение — конец месяца одним подтверждением, а не 22-мя.
   *
   * Каждая запись обрабатывается в СВОЕЙ транзакции с теми же проверками,
   * что и одиночное `approve`: чужой статус или пропавшая запись валят
   * только свою строку, остальные утверждаются. Клиент получает пофамильный
   * отчёт — как у `orders.changeStatusBatch`, и по той же причине: тихо
   * проглоченный отказ в зарплатной ведомости хуже явного.
   */
  approveMany: ceoProcedure
    .input(z.object({ ids: z.array(idSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const results: {
        readonly id: number;
        readonly ok: boolean;
        readonly message?: string;
      }[] = [];

      for (const id of input.ids) {
        try {
          await ctx.db.transaction(async (tx) => {
            const record = await tx.query.payrollRecords.findFirst({
              where: eq(payrollRecords.id, id),
            });

            if (record === undefined) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
            }

            if (!canTransitionPayrollStatus(record.status, PayrollRecordStatus.APPROVED)) {
              throw new TRPCError({
                code: 'CONFLICT',
                message: `Нельзя утвердить расчёт в статусе «${record.status}»`,
              });
            }

            const [updated] = await tx
              .update(payrollRecords)
              .set({
                status: PayrollRecordStatus.APPROVED,
                approvedBy: ctx.user.id,
                approvedAt: new Date(),
              })
              .where(eq(payrollRecords.id, id))
              .returning();

            if (updated === undefined) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
            }

            await recordAudit(tx, {
              actorId: ctx.user.id,
              action: 'payroll.approved',
              entityType: 'payroll_record',
              entityId: updated.id,
              details: { amount: updated.calculatedAmount, batch: true },
              ipAddress: ctx.ipAddress,
            });

            await notifyPayroll(tx, updated.userId, {
              paid: false,
              period: formatPeriod({ year: updated.periodYear, month: updated.periodMonth }),
              amount: formatMoney(parseMoney(updated.calculatedAmount)),
            });
          });

          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            message: error instanceof TRPCError ? error.message : 'Не удалось утвердить расчёт',
          });
        }
      }

      return { results, approved: results.filter((entry) => entry.ok).length };
    }),

  /** Отметка о выплате. Сумма может отличаться от расчётной — с комментарием. */
  markPaid: ceoProcedure
    .input(
      z.object({
        id: idSchema,
        paidAmount: moneySchema.optional(),
        comment: optionalText(1000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const record = await tx.query.payrollRecords.findFirst({
          where: eq(payrollRecords.id, input.id),
        });

        if (record === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
        }

        if (!canTransitionPayrollStatus(record.status, PayrollRecordStatus.PAID)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              record.status === PayrollRecordStatus.DRAFT
                ? 'Сначала утвердите расчёт'
                : 'Расчёт уже выплачен',
          });
        }

        const paidAmount =
          input.paidAmount === undefined
            ? record.calculatedAmount
            : moneyToDecimalString(parseMoney(input.paidAmount));

        const [updated] = await tx
          .update(payrollRecords)
          .set({
            status: PayrollRecordStatus.PAID,
            paidAmount,
            paidAt: new Date(),
            comment: input.comment ?? record.comment,
          })
          .where(eq(payrollRecords.id, input.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'payroll.paid',
          entityType: 'payroll_record',
          entityId: updated.id,
          details: { calculated: updated.calculatedAmount, paid: updated.paidAmount },
          ipAddress: ctx.ipAddress,
        });

        await notifyPayroll(tx, updated.userId, {
          paid: true,
          period: formatPeriod({ year: updated.periodYear, month: updated.periodMonth }),
          amount: formatMoney(parseMoney(updated.paidAmount)),
        });

        return updated;
      }),
    ),
});

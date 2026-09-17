import { payrollPayouts, payrollRecords, payrollSchemes, userRoles, users } from '@curtain-crm/db';
import {
  canTransitionPayrollStatus,
  formatMoney,
  isManagement,
  moneyToDecimalString,
  parseMoney,
  payrollSchemeTypeSchema,
  PAYROLL_SCHEME_REQUIRED_FIELDS,
  PayrollRecordStatus,
  ROLE_LABELS_RU,
  roleSchema,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, moneySchema, optionalText, periodSchema } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { notifyPayroll } from '../services/notifications.service';
import {
  calculateForDay,
  calculateForUserRole,
  listCompletedOrdersForPayroll,
  payableRoles,
  saveDraft,
} from '../services/payroll.service';
import { calculateWorkedHours, formatPeriod, periodBounds } from '../services/shifts.service';
import { router } from '../trpc';

/**
 * Зарплата: схемы начисления и расчёты по периодам.
 *
 * Права доступа:
 *  - всё, кроме `my`, — руководство (CEO и админ). Директор передал админу
 *    и назначение условий, и утверждение, и отметку о выплате: раньше
 *    каждый месяц упирался в директора лично;
 *  - `my` — любой вошедший сотрудник, только свои начисления.
 *
 * Условия оплаты принадлежат КОНКРЕТНОМУ сотруднику в конкретной его роли,
 * а не роли целиком: у опытной швеи ставка выше, чем у новенькой.
 *
 * Утверждённые и выплаченные записи не пересчитываются: в
 * `payroll_records.scheme_snapshot` лежит снимок параметров схемы на момент
 * расчёта, поэтому изменение ставок не переписывает закрытые месяцы.
 */

const schemesRouter = router({
  /**
   * Схемы с именами сотрудников.
   *
   * Имя присоединяется здесь, а не подтягивается страницей отдельно: список
   * условий без фамилий читать невозможно, а второй запрос за именами
   * означал бы, что список и подписи к нему могут разойтись.
   */
  list: managementProcedure
    .input(
      z
        .object({
          includeInactive: z.boolean().default(false),
          userId: idSchema.optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) =>
      ctx.db
        .select({
          id: payrollSchemes.id,
          userId: payrollSchemes.userId,
          userFullName: users.fullName,
          role: payrollSchemes.role,
          type: payrollSchemes.type,
          baseAmount: payrollSchemes.baseAmount,
          rate: payrollSchemes.rate,
          kpiTarget: payrollSchemes.kpiTarget,
          commissionPercent: payrollSchemes.commissionPercent,
          shiftStart: payrollSchemes.shiftStart,
          shiftEnd: payrollSchemes.shiftEnd,
          isActive: payrollSchemes.isActive,
          effectiveFrom: payrollSchemes.effectiveFrom,
        })
        .from(payrollSchemes)
        .innerJoin(users, eq(users.id, payrollSchemes.userId))
        .where(
          and(
            ...(input.includeInactive ? [] : [eq(payrollSchemes.isActive, true)]),
            ...(input.userId === undefined ? [] : [eq(payrollSchemes.userId, input.userId)]),
          ),
        )
        .orderBy(asc(users.fullName), asc(payrollSchemes.role), desc(payrollSchemes.effectiveFrom)),
    ),

  /**
   * Заведение или замена условий оплаты СОТРУДНИКУ в одной его роли.
   *
   * Действующая схема у пары «сотрудник + роль» одна: старая деактивируется,
   * новая создаётся. Схемы не правятся на месте — иначе перерасчёт черновика
   * за прошлый месяц дал бы другой результат, чем исходный, без единого следа.
   *
   * Роль проверяется: назначить швее условия установщика нельзя — она по ним
   * ничего не заработает, потому что заказов в этой роли у неё не будет,
   * и ошибку заметят только в день выплаты.
   */
  upsert: managementProcedure
    .input(
      z
        .object({
          userId: idSchema,
          role: roleSchema,
          type: payrollSchemeTypeSchema,
          baseAmount: moneySchema.optional(),
          rate: moneySchema.optional(),
          kpiTarget: z.number().positive().max(100_000).optional(),
          commissionPercent: z.number().min(0).max(100).optional(),
          /** Смена по графику для почасовика: `HH:MM`. Оба или ни одного. */
          shiftStart: z.string().regex(/^\d{2}:\d{2}$/, 'Время в формате ЧЧ:ММ').optional(),
          shiftEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Время в формате ЧЧ:ММ').optional(),
          effectiveFrom: z.string().date(),
        })
        .superRefine((value, ctx) => {
          // Проверяем ровно те поля, которых требует выбранный тип, —
          // тот же список, что и в check-констрейнте таблицы.
          if ((value.shiftStart === undefined) !== (value.shiftEnd === undefined)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shiftEnd'], message: 'Укажите и начало, и конец смены' });
          }
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
        const [holdsRole] = await tx
          .select({ role: userRoles.role })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(
            and(
              eq(userRoles.userId, input.userId),
              eq(userRoles.role, input.role),
              eq(users.isActive, true),
            ),
          )
          .limit(1);

        if (holdsRole === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `У сотрудника нет роли «${ROLE_LABELS_RU[input.role]}» — условия по ней не нужны`,
          });
        }

        await tx
          .update(payrollSchemes)
          .set({ isActive: false })
          .where(
            and(
              eq(payrollSchemes.userId, input.userId),
              eq(payrollSchemes.role, input.role),
              eq(payrollSchemes.isActive, true),
            ),
          );

        const [created] = await tx
          .insert(payrollSchemes)
          .values({
            userId: input.userId,
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
            shiftStart: input.shiftStart ?? null,
            shiftEnd: input.shiftEnd ?? null,
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
          // Подтверждение получения — рядом со статусом: «выплачено» и
          // «получил» говорят разные люди, и руководству нужны оба.
          receiptConfirmedAt: payrollRecords.receiptConfirmedAt,
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

  /**
   * Из чего сложилось начисление: часы, условия оплаты и поимённо заказы.
   *
   * Ведомость отвечает «сколько», а спорят обычно про «за что»: установщик
   * хочет видеть номера заказов, за которые ему посчитали сдельную, а
   * почасовик — сколько часов ему засчитали и по какой ставке.
   *
   * Состав заказов восстанавливается повторным запросом: связи
   * `payroll_records → orders` в базе нет, в записи лежит только количество
   * и сумма. Поэтому заказ, переназначенный после расчёта, из разбивки
   * уйдёт, хотя в начисленной сумме останется. Первична сумма, разбивка —
   * пояснение к ней, и это честнее, чем хранить второй список, который
   * разойдётся с первым.
   *
   * Свою разбивку видит и сам сотрудник: спор о зарплате начинается с того,
   * что человеку нечего посмотреть.
   */
  breakdown: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const [record] = await ctx.db
        .select({
          id: payrollRecords.id,
          userId: payrollRecords.userId,
          userFullName: users.fullName,
          role: payrollRecords.role,
          periodYear: payrollRecords.periodYear,
          periodMonth: payrollRecords.periodMonth,
          calculatedAmount: payrollRecords.calculatedAmount,
          paidAmount: payrollRecords.paidAmount,
          kpiPercent: payrollRecords.kpiPercent,
          status: payrollRecords.status,
          schemeSnapshot: payrollRecords.schemeSnapshot,
          comment: payrollRecords.comment,
          approvedAt: payrollRecords.approvedAt,
          paidAt: payrollRecords.paidAt,
          receiptConfirmedAt: payrollRecords.receiptConfirmedAt,
        })
        .from(payrollRecords)
        .innerJoin(users, eq(users.id, payrollRecords.userId))
        .where(eq(payrollRecords.id, input.id))
        .limit(1);

      if (record === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Начисление не найдено' });
      }

      if (record.userId !== ctx.user.id && !isManagement(ctx.user.roles)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Это чужое начисление' });
      }

      const period = { year: record.periodYear, month: record.periodMonth };
      const bounds = periodBounds(period);

      const [orders, workedHours] = await Promise.all([
        listCompletedOrdersForPayroll(ctx.db, record.userId, record.role, bounds),
        /*
          Часы пересчитываются, а не берутся из снимка: снимок писался в
          момент расчёта, а смены за незакрытый месяц с тех пор прибавились.
          Расхождение с суммой в ведомости здесь — не ошибка, а ответ на
          вопрос «пора ли пересчитать».
        */
        calculateWorkedHours(ctx.db, record.userId, bounds),
      ]);

      return { record, period, orders, workedHours };
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
  approve: managementProcedure
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
          payrollRecordId: updated.id,
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
  approveMany: managementProcedure
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
              payrollRecordId: updated.id,
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

  /**
   * Отметка о выплате — целиком или частью.
   *
   * Зарплату в цехе выдают частями, а то и по дням: аванс, за сегодняшнее,
   * остаток в конце. Каждая отметка ПРИБАВЛЯЕТСЯ к выплаченному; пока
   * выплачено меньше начисленного, расчёт остаётся утверждённым с остатком,
   * а «выплачен» он становится, когда остатка нет. Без суммы — выплачивается
   * весь остаток. Каждая часть записана в журнал своей суммой.
   *
   * Черновик утверждается самой выплатой: руководитель, выдающий деньги,
   * тем самым и подтверждает расчёт — заставлять его нажимать две кнопки
   * при ежедневных расчётах незачем. Массовое «Утвердить» в конце месяца
   * остаётся для тех, кому удобнее так.
   */
  /**
   * Неделя выплат: начислено по дням, что уже выдано, что можно выдать.
   *
   * Директор рассчитывается с людьми каждый день: отмечает дни недели и
   * выдаёт за них. День — календарный по Ташкенту; в клетке — строки
   * начисления (этапы по расценке — по заказам, часы, заказы) и итог.
   * Выплаченный день помечен и второй раз не выбирается.
   *
   * Каждый день привязан к месячному расчёту (`recordId`): неделя может
   * зацепить два месяца, и выдать за день без рассчитанного месяца нельзя —
   * панель скажет «рассчитайте месяц».
   */
  week: managementProcedure
    .input(z.object({ userId: idSchema, role: roleSchema, weekStart: z.string().date() }))
    .query(async ({ ctx, input }) => {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const TASHKENT_MS = 5 * 60 * 60 * 1000;
      const firstStart = new Date(new Date(`${input.weekStart}T00:00:00Z`).getTime() - TASHKENT_MS);

      const records = await ctx.db
        .select({
          id: payrollRecords.id,
          periodYear: payrollRecords.periodYear,
          periodMonth: payrollRecords.periodMonth,
        })
        .from(payrollRecords)
        .where(and(eq(payrollRecords.userId, input.userId), eq(payrollRecords.role, input.role)));
      const recordIds = records.map((record) => record.id);
      const payouts =
        recordIds.length === 0
          ? []
          : await ctx.db
              .select({ day: payrollPayouts.day, amount: payrollPayouts.amount })
              .from(payrollPayouts)
              .where(inArray(payrollPayouts.recordId, recordIds));
      const paidByDay = new Map(payouts.map((payout) => [payout.day, parseMoney(payout.amount)]));

      let monthlyBase = false;
      let hasScheme = true;
      const days = [];
      for (let index = 0; index < 7; index += 1) {
        const start = new Date(firstStart.getTime() + index * DAY_MS);
        const bounds = { start, end: new Date(start.getTime() + DAY_MS) };
        const day = new Date(start.getTime() + TASHKENT_MS).toISOString().slice(0, 10);
        const [year, month] = day.split('-').map((part) => Number.parseInt(part, 10));
        const record = records.find((entry) => entry.periodYear === year && entry.periodMonth === month);

        const result = await calculateForDay(ctx.db, input.userId, input.role, bounds);
        if (result === null) {
          hasScheme = false;
          days.push({ day, recordId: record?.id ?? null, lines: [], total: '0.00', paid: null });
          continue;
        }
        monthlyBase = result.monthlyBase;

        // Сдельные — по заказам, а не одной строкой: директор сверяет
        // с тем, что видел в цехе, а не с суммой.
        const orders = await listCompletedOrdersForPayroll(ctx.db, input.userId, input.role, bounds);
        const orderLines = orders
          .filter((order) => parseMoney(order.stageFee) > 0)
          .map((order) => ({
            label: order.orderNumber ?? `#${order.id.toString()}`,
            amount: order.stageFee,
          }));
        const otherLines = result.calculation.breakdown
          .filter((line) => orderLines.length === 0 || line.label !== 'Сдельно за этапы заказов')
          .map((line) => ({ label: line.label, amount: moneyToDecimalString(line.amount) }));

        const paid = paidByDay.get(day);
        days.push({
          day,
          recordId: record?.id ?? null,
          lines: [...otherLines, ...orderLines],
          total: moneyToDecimalString(result.calculation.amount),
          paid: paid === undefined ? null : moneyToDecimalString(paid),
        });
      }

      return { hasScheme, monthlyBase, days };
    }),

  markPaid: managementProcedure
    .input(
      z.object({
        id: idSchema,
        paidAmount: moneySchema.optional(),
        /** Выплата по дням: сумма — сумма дней, дни запоминаются как выплаченные. */
        days: z
          .array(z.object({ day: z.string().date(), amount: moneySchema }))
          .max(31)
          .optional(),
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

        if (record.status === PayrollRecordStatus.PAID) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Расчёт уже выплачен' });
        }

        const calculated = parseMoney(record.calculatedAmount);
        const alreadyPaid = parseMoney(record.paidAmount);
        const remaining = Math.max(0, calculated - alreadyPaid);
        const days = input.days ?? [];
        if (days.length > 0) {
          const [dup] = await tx
            .select({ day: payrollPayouts.day })
            .from(payrollPayouts)
            .where(
              and(
                eq(payrollPayouts.recordId, record.id),
                inArray(payrollPayouts.day, days.map((entry) => entry.day)),
              ),
            )
            .limit(1);
          if (dup !== undefined) {
            throw new TRPCError({ code: 'CONFLICT', message: `День ${dup.day} уже выплачен` });
          }
          await tx.insert(payrollPayouts).values(
            days.map((entry) => ({
              recordId: record.id,
              day: entry.day,
              amount: moneyToDecimalString(parseMoney(entry.amount)),
              paidBy: ctx.user.id,
            })),
          );
        }
        const part =
          days.length > 0
            ? days.reduce((sum, entry) => sum + parseMoney(entry.amount), 0)
            : input.paidAmount === undefined
              ? remaining
              : parseMoney(input.paidAmount);

        if (part <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Сумма выплаты должна быть больше нуля' });
        }

        const paidTotal = alreadyPaid + part;
        // Переплата допустима (премия сверх расчёта), но закрывает расчёт.
        const settled = paidTotal >= calculated;

        const [updated] = await tx
          .update(payrollRecords)
          .set({
            status: settled ? PayrollRecordStatus.PAID : PayrollRecordStatus.APPROVED,
            ...(record.status === PayrollRecordStatus.DRAFT
              ? { approvedBy: ctx.user.id, approvedAt: new Date() }
              : {}),
            paidAmount: moneyToDecimalString(paidTotal),
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
          action: settled ? 'payroll.paid' : 'payroll.paid_part',
          entityType: 'payroll_record',
          entityId: updated.id,
          details: {
            calculated: updated.calculatedAmount,
            payment: moneyToDecimalString(part),
            paid: updated.paidAmount,
          },
          ipAddress: ctx.ipAddress,
        });

        await notifyPayroll(tx, updated.userId, {
          paid: true,
          period: formatPeriod({ year: updated.periodYear, month: updated.periodMonth }),
          amount: formatMoney(part),
          payrollRecordId: updated.id,
        });

        return updated;
      }),
    ),

  /**
   * Сотрудник подтверждает, что деньги получил.
   *
   * Отметка отдельная от `paid_at`, и это главное в ней: «выплачено» —
   * слова того, кто платил, а подтверждение — слова того, кому платили.
   * Расхождение между ними и есть предмет спора, ради которого отметка
   * заводится. Свести их в одно поле значило бы стереть сам вопрос.
   *
   * Подтверждает только адресат расчёта и только сам: руководство не может
   * отметить получение за сотрудника — иначе подтверждение не значило бы
   * ничего.
   *
   * Повторное подтверждение отбивается, а не проходит молча: нажатие на
   * уже подтверждённый расчёт означает, что человек не увидел результата
   * первого, и об этом честнее сказать.
   */
  confirmReceipt: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.query.payrollRecords.findFirst({
        where: eq(payrollRecords.id, input.id),
      });

      if (record === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Расчёт не найден' });
      }
      if (record.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Это расчёт другого сотрудника' });
      }
      if (record.status !== PayrollRecordStatus.PAID) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Расчёт ещё не выплачен — подтверждать нечего',
        });
      }
      if (record.receiptConfirmedAt !== null) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Получение уже подтверждено' });
      }

      const [updated] = await ctx.db
        .update(payrollRecords)
        .set({ receiptConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(payrollRecords.id, record.id))
        .returning();

      return updated ?? record;
    }),
});

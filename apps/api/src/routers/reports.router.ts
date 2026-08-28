import {
  orderItems,
  orders,
  orderStatusHistory,
  payrollRecords,
  purchases,
  shifts,
  users,
} from '@curtain-crm/db';
import {
  ARCHIVED_ORDER_STATUSES,
  formatMoney,
  ORDER_STATUS_LABELS_RU,
  ORDER_STATUS_PHASE,
  OrderStatus,
  parseMoney,
  PRODUCTION_STAGES,
} from '@curtain-crm/shared';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, periodSchema } from '../lib/schemas';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { topPerformers } from '../services/performance.service';
import { periodBounds, sqlTimestamp } from '../services/shifts.service';
import { router } from '../trpc';

/**
 * Аналитика для руководства.
 *
 * Права доступа: ВСЕ процедуры — только руководство (CEO, админ).
 * Сотрудник видит свои показатели через `payroll.my`, `shifts.mySummary`
 * и `orders.list`; сводные цифры по компании ему не нужны.
 *
 * Агрегация выполняется в SQL, а не в приложении: выгружать все заказы,
 * чтобы посчитать их количество, недопустимо уже на нескольких тысячах строк.
 */
export const reportsRouter = router({
  /** Показатели для главного экрана веб-панели. */
  dashboard: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const branchFilter = input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];

      const now = new Date();
      const day = 24 * 60 * 60 * 1000;

      const startOfToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const startOfYesterday = new Date(startOfToday.getTime() - day);
      const startOfWeek = new Date(startOfToday.getTime() - 6 * day);
      const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * day);
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const startOfPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

      /** Заказы, созданные в интервале. */
      const countCreated = async (from: Date, to: Date): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to), ...branchFilter));
        return row?.value ?? 0;
      };

      const [
        byStatus,
        [activeRow],
        [todayRow],
        [monthRow],
        [openShiftsRow],
        ordersYesterday,
        ordersThisWeek,
        ordersPrevWeek,
        ordersThisMonth,
        ordersPrevMonth,
        [prevMonthRevenueRow],
      ] = await Promise.all([
        ctx.db
          .select({ status: orders.status, value: count() })
          .from(orders)
          .where(and(...branchFilter))
          .groupBy(orders.status),

        ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(notInArray(orders.status, [...ARCHIVED_ORDER_STATUSES]), ...branchFilter)),

        ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(gte(orders.createdAt, startOfToday), ...branchFilter)),

        ctx.db
          .select({
            completed: count(),
            revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.status, OrderStatus.COMPLETED),
              gte(orders.completedAt, startOfMonth),
              ...branchFilter,
            ),
          ),

        // Фильтр по филиалу применяется и здесь: без него руководитель,
        // выбравший филиал, видел правильные заказы и число сотрудников
        // по всей компании — расхождение внутри одной карточки.
        ctx.db
          .select({ value: count() })
          .from(shifts)
          .where(
            and(
              isNull(shifts.endedAt),
              ...(input.branchId === undefined ? [] : [eq(shifts.branchId, input.branchId)]),
            ),
          ),

        countCreated(startOfYesterday, startOfToday),
        countCreated(startOfWeek, new Date(startOfToday.getTime() + day)),
        countCreated(startOfPrevWeek, startOfWeek),
        countCreated(startOfMonth, new Date(startOfToday.getTime() + day)),
        countCreated(startOfPrevMonth, startOfMonth),

        ctx.db
          .select({ revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)` })
          .from(orders)
          .where(
            and(
              eq(orders.status, OrderStatus.COMPLETED),
              gte(orders.completedAt, startOfPrevMonth),
              lt(orders.completedAt, startOfMonth),
              ...branchFilter,
            ),
          ),
      ]);

      const statusCounts = byStatus.map((row) => ({
        status: row.status,
        label: ORDER_STATUS_LABELS_RU[row.status],
        phase: ORDER_STATUS_PHASE[row.status],
        count: row.value,
      }));

      const monthRevenue = parseMoney(monthRow?.revenue ?? '0');

      // Виджет «Этапы производства заказов»: восемь плиток конвейера.
      // Раскладку статусов по этапам задаёт `PRODUCTION_STAGES` в shared,
      // поэтому она одинакова на дашборде и в фильтрах списка заказов.
      const countByStatus = new Map(byStatus.map((row) => [row.status, row.value]));
      const productionStages = PRODUCTION_STAGES.map((stage) => ({
        key: stage.key,
        label: stage.label,
        count: (stage.statuses as readonly OrderStatus[]).reduce(
          (total, status) => total + (countByStatus.get(status) ?? 0),
          0,
        ),
      }));

      const prevMonthRevenue = parseMoney(prevMonthRevenueRow?.revenue ?? '0');

      /**
       * Изменение в процентах.
       *
       * `null`, если сравнивать не с чем: рост «на 100 %» с нуля до одного
       * заказа не несёт смысла и только вводит в заблуждение.
       */
      const delta = (current: number, previous: number): number | null =>
        previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

      return {
        activeOrders: activeRow?.value ?? 0,
        ordersToday: todayRow?.value ?? 0,
        ordersYesterday,
        ordersTodayDelta: delta(todayRow?.value ?? 0, ordersYesterday),

        ordersThisWeek,
        ordersPrevWeek,
        ordersWeekDelta: delta(ordersThisWeek, ordersPrevWeek),

        ordersThisMonth,
        ordersPrevMonth,
        ordersMonthDelta: delta(ordersThisMonth, ordersPrevMonth),

        completedThisMonth: monthRow?.completed ?? 0,
        revenueThisMonthMinor: monthRevenue,
        revenueThisMonthFormatted: formatMoney(monthRevenue),
        revenuePrevMonthMinor: prevMonthRevenue,
        revenuePrevMonthFormatted: formatMoney(prevMonthRevenue),
        revenueMonthDelta: delta(monthRevenue, prevMonthRevenue),

        employeesOnShift: openShiftsRow?.value ?? 0,
        statusCounts,
        productionStages,
      };
    }),

  /**
   * Состояние швейного цеха и участка установки.
   *
   * Одна процедура на два соседних блока дашборда: показатели считаются
   * по одной и той же таблице заказов, и разносить их по двум запросам
   * значило бы дважды пройти по ней ради одного экрана.
   *
   * Плана в ответе НЕТ. В системе нет сущности производственного плана —
   * ни в метрах, ни в заказах на период, — а «выполнение 87 %» без плана
   * можно только выдумать. Появится план — появится и процент.
   *
   * Объём работы даётся в квадратных метрах: это то, что действительно
   * посчитано в `order_items.area_m2` из размеров позиции. Погонных метров
   * ткани система не знает — они зависят от раскроя.
   */
  workshops: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const branchFilter =
        input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];

      const countByStatus = async (status: OrderStatus): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(eq(orders.status, status), ...branchFilter));
        return row?.value ?? 0;
      };

      /** Суммарная площадь позиций заказов, находящихся в этих статусах. */
      const areaInStatuses = async (statuses: readonly OrderStatus[]): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: sql<string>`coalesce(sum(${orderItems.areaM2} * ${orderItems.quantity}), 0)` })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(and(inArray(orders.status, [...statuses]), ...branchFilter));
        return Math.round(Number.parseFloat(row?.value ?? '0') * 10) / 10;
      };

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      /** Сколько раз сегодня заказ переводили в этот статус. */
      const doneToday = async (status: OrderStatus): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: count() })
          .from(orderStatusHistory)
          .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
          .where(
            and(
              eq(orderStatusHistory.toStatus, status),
              gte(orderStatusHistory.createdAt, startOfToday),
              ...branchFilter,
            ),
          );
        return row?.value ?? 0;
      };

      const [
        sewingQueue,
        sewingInProgress,
        sewingDone,
        sewingAreaM2,
        sewingDoneToday,
        installQueue,
        installAssigned,
        installInProgress,
        installDoneToday,
      ] = await Promise.all([
        countByStatus(OrderStatus.PENDING_SEWING_ASSIGNMENT),
        countByStatus(OrderStatus.SEWING_IN_PROGRESS),
        countByStatus(OrderStatus.SEWING_DONE),
        areaInStatuses([
          OrderStatus.PENDING_SEWING_ASSIGNMENT,
          OrderStatus.SEWING_IN_PROGRESS,
        ]),
        doneToday(OrderStatus.SEWING_DONE),
        countByStatus(OrderStatus.PENDING_INSTALLATION_ASSIGNMENT),
        countByStatus(OrderStatus.INSTALLATION_ASSIGNED),
        countByStatus(OrderStatus.INSTALLATION_IN_PROGRESS),
        doneToday(OrderStatus.INSTALLATION_DONE),
      ]);

      return {
        sewing: {
          /** Раскроено и ждёт швеи. */
          queue: sewingQueue,
          inProgress: sewingInProgress,
          done: sewingDone,
          /** Площадь ещё не сшитого — объём работы, стоящий перед цехом. */
          pendingAreaM2: sewingAreaM2,
          doneToday: sewingDoneToday,
        },
        installation: {
          queue: installQueue,
          assigned: installAssigned,
          inProgress: installInProgress,
          doneToday: installDoneToday,
        },
      };
    }),

  /**
   * Очередь на установку по срочности.
   *
   * Считается по сроку заказа (`deadline`), а не по отдельной дате монтажа:
   * даты монтажа в модели нет, и договорённость с клиентом фиксирует именно
   * срок заказа. Заказы без срока попадают в `undated` — их не видно
   * ни в одной корзине, и молча терять их нельзя.
   */
  installationQueue: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const branchFilter =
        input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      /** Заказы, которые ещё предстоит установить. */
      const awaitingInstall = inArray(orders.status, [
        OrderStatus.QC_PASSED,
        OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
        OrderStatus.INSTALLATION_ASSIGNED,
        OrderStatus.INSTALLATION_IN_PROGRESS,
      ]);

      const countWhere = async (
        extra: ReturnType<typeof and> | ReturnType<typeof eq>,
      ): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(awaitingInstall, extra, ...branchFilter));
        return row?.value ?? 0;
      };

      const [overdue, dueToday, dueThisWeek, undated, total] = await Promise.all([
        countWhere(lt(orders.deadline, today)),
        countWhere(eq(orders.deadline, today)),
        countWhere(and(gt(orders.deadline, today), lte(orders.deadline, endOfWeek))),
        countWhere(isNull(orders.deadline)),
        (async () => {
          const [row] = await ctx.db
            .select({ value: count() })
            .from(orders)
            .where(and(awaitingInstall, ...branchFilter));
          return row?.value ?? 0;
        })(),
      ]);

      return { overdue, dueToday, dueThisWeek, undated, total };
    }),

  /**
   * Лучшие сотрудники периода — по одному на роль.
   *
   * Метрики у ролей разные намеренно: продавца меряют выручкой, швею —
   * площадью, мастера — сроком замера, установщика — числом установок.
   * Сводить их к одному «баллу» значило бы придумать веса, которых никто
   * не задавал.
   *
   * Процента выполнения плана здесь нет — плана в системе нет. Что есть —
   * см. `performance.service.ts`.
   */
  topPerformers: managementProcedure
    .input(periodSchema.extend({ branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);
      const result = await topPerformers(ctx.db, bounds, input.branchId);

      return {
        ...result,
        seller:
          result.seller === null
            ? null
            : { ...result.seller, revenueFormatted: formatMoney(result.seller.revenueMinor) },
      };
    }),

  /**
   * Виджет «Требует внимания».
   *
   * Возвращает только то, что подтверждается данными. Пункта про
   * заканчивающиеся рулоны ткани здесь нет: складского учёта в системе нет,
   * и показывать выдуманное число было бы хуже, чем не показывать ничего.
   */
  attention: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const branchFilter = input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];
      const today = new Date().toISOString().slice(0, 10);
      const notClosed = notInArray(orders.status, [...ARCHIVED_ORDER_STATUSES]);

      const countWhere = async (extra: ReturnType<typeof eq>): Promise<number> => {
        const [row] = await ctx.db
          .select({ value: count() })
          .from(orders)
          .where(and(notClosed, extra, ...branchFilter));
        return row?.value ?? 0;
      };

      const [overdue, waitingSewing, waitingInstall, waitingQc] = await Promise.all([
        (async () => {
          const [row] = await ctx.db
            .select({ value: count() })
            .from(orders)
            .where(and(notClosed, lt(orders.deadline, today), ...branchFilter));
          return row?.value ?? 0;
        })(),
        countWhere(eq(orders.status, OrderStatus.PENDING_SEWING_ASSIGNMENT)),
        countWhere(eq(orders.status, OrderStatus.PENDING_INSTALLATION_ASSIGNMENT)),
        countWhere(eq(orders.status, OrderStatus.PENDING_QC)),
      ]);

      return [
        { key: 'overdue', label: 'заказов просрочено', count: overdue, severity: 'high' as const },
        { key: 'waiting_sewing', label: 'заказов ждут шитья', count: waitingSewing, severity: 'medium' as const },
        { key: 'waiting_install', label: 'заказов в очереди на установку', count: waitingInstall, severity: 'medium' as const },
        { key: 'waiting_qc', label: 'заказов ждут контроля качества', count: waitingQc, severity: 'low' as const },
      ].filter((entry) => entry.count > 0);
    }),

  /**
   * Самые продаваемые модели за период.
   *
   * Считается по позициям заказов (`order_items.model`), а число заказов —
   * через `count(distinct order_id)`: заказ с тремя окнами одной модели
   * должен считаться одним заказом, а не тремя.
   */
  topProducts: managementProcedure
    .input(periodSchema.extend({ limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);

      return ctx.db
        .select({
          model: orderItems.model,
          ordersCount: sql<string>`count(distinct ${orderItems.orderId})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            isNotNull(orderItems.model),
            gte(orders.createdAt, bounds.start),
            lt(orders.createdAt, bounds.end),
          ),
        )
        .groupBy(orderItems.model)
        .orderBy(desc(sql`count(distinct ${orderItems.orderId})`))
        .limit(input.limit)
        .then((rows) =>
          rows.map((row) => ({
            model: row.model ?? '—',
            ordersCount: Number.parseInt(row.ordersCount, 10),
          })),
        );
    }),

  /**
   * Динамика заказов и выручки нарастающим итогом по дням месяца,
   * текущий период против предыдущего.
   */
  dynamics: managementProcedure
    .input(periodSchema.extend({ branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const current = periodBounds(input);
      const previous = periodBounds(
        input.month === 1
          ? { year: input.year - 1, month: 12 }
          : { year: input.year, month: input.month - 1 },
      );

      const branchFilter =
        input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];

      const seriesFor = async (bounds: { start: Date; end: Date }) =>
        ctx.db
          .select({
            day: sql<string>`extract(day from ${orders.createdAt} at time zone 'UTC')`,
            orders: sql<string>`count(*)`,
            revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
          })
          .from(orders)
          .where(
            and(
              gte(orders.createdAt, bounds.start),
              lt(orders.createdAt, bounds.end),
              ...branchFilter,
            ),
          )
          .groupBy(sql`extract(day from ${orders.createdAt} at time zone 'UTC')`)
          .orderBy(sql`extract(day from ${orders.createdAt} at time zone 'UTC')`);

      const [currentRows, previousRows] = await Promise.all([
        seriesFor(current),
        seriesFor(previous),
      ]);

      /** Нарастающий итог считаем здесь: оконная функция ради этого избыточна. */
      const cumulate = (rows: { day: string; orders: string; revenue: string }[]) => {
        let orderTotal = 0;
        let revenueTotal = 0;

        return rows.map((row) => {
          orderTotal += Number.parseInt(row.orders, 10);
          revenueTotal += parseMoney(row.revenue);
          return {
            day: Number.parseInt(row.day, 10),
            orders: orderTotal,
            revenueMinor: revenueTotal,
          };
        });
      };

      return { current: cumulate(currentRows), previous: cumulate(previousRows) };
    }),

  /**
   * Рейтинг продавцов за период.
   *
   * Конверсии в ответе НЕТ: в системе нет ни лидов, ни неоформленных
   * обращений — делить закрытые заказы не на что. Поле, всегда равное `null`,
   * держали в контракте зря: клиент не может отличить «нет данных» от
   * «конверсия ноль», а на тип ответа такое поле влияет как настоящее.
   * Появятся обращения — появится и поле, вместе с источником.
   */
  sellerRating: managementProcedure
    .input(periodSchema.extend({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);

      const rows = await ctx.db
        .select({
          userId: users.id,
          fullName: users.fullName,
          ordersCount: sql<string>`count(*)`,
          revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
        })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.createdBy))
        .where(
          and(
            eq(orders.status, OrderStatus.COMPLETED),
            gte(orders.completedAt, bounds.start),
            lt(orders.completedAt, bounds.end),
          ),
        )
        .groupBy(users.id, users.fullName)
        .orderBy(desc(sql`coalesce(sum(${orders.workPrice}), 0)`))
        .limit(input.limit);

      return rows.map((row, index) => {
        const revenue = parseMoney(row.revenue);
        return {
          place: index + 1,
          userId: row.userId,
          fullName: row.fullName,
          ordersCount: Number.parseInt(row.ordersCount, 10),
          revenueMinor: revenue,
          revenueFormatted: formatMoney(revenue),
        };
      });
    }),

  /** Динамика фонда заработной платы по месяцам года. */
  payrollFund: managementProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2100) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          month: payrollRecords.periodMonth,
          calculated: sql<string>`coalesce(sum(${payrollRecords.calculatedAmount}), 0)`,
          paid: sql<string>`coalesce(sum(${payrollRecords.paidAmount}), 0)`,
        })
        .from(payrollRecords)
        .where(eq(payrollRecords.periodYear, input.year))
        .groupBy(payrollRecords.periodMonth)
        .orderBy(payrollRecords.periodMonth);

      const byMonth = new Map(rows.map((row) => [row.month, row]));

      // Возвращаем все двенадцать месяцев: график не должен «схлопываться»
      // на месяцах без расчёта — это тоже информация.
      return Array.from({ length: 12 }, (_unused, index) => {
        const row = byMonth.get(index + 1);
        return {
          month: index + 1,
          calculatedMinor: parseMoney(row?.calculated ?? '0'),
          paidMinor: parseMoney(row?.paid ?? '0'),
        };
      });
    }),

  /** Количество заказов по укрупнённым фазам — для воронки на дашборде. */
  ordersByPhase: managementProcedure
    .input(z.object({ branchId: idSchema.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({ status: orders.status, value: count() })
        .from(orders)
        .where(input.branchId === undefined ? undefined : eq(orders.branchId, input.branchId))
        .groupBy(orders.status);

      const byPhase = new Map<string, number>();
      for (const row of rows) {
        const phase = ORDER_STATUS_PHASE[row.status];
        byPhase.set(phase, (byPhase.get(phase) ?? 0) + row.value);
      }

      return [...byPhase.entries()].map(([phase, value]) => ({ phase, count: value }));
    }),

  /**
   * Выручка, себестоимость и маржа за месяц.
   *
   * Себестоимость считается отдельным запросом по закупкам: соединять её
   * с заказами одним запросом означало бы умножение строк и завышенную сумму
   * работ при нескольких закупках на заказ.
   */
  finance: managementProcedure
    .input(periodSchema.extend({ branchId: idSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);
      const branchFilter =
        input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)];

      const completedInPeriod = and(
        eq(orders.status, OrderStatus.COMPLETED),
        gte(orders.completedAt, bounds.start),
        lt(orders.completedAt, bounds.end),
        ...branchFilter,
      );

      const [[revenueRow], [costRow]] = await Promise.all([
        ctx.db
          .select({
            ordersCount: count(),
            revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
            deposits: sql<string>`coalesce(sum(${orders.deposit}), 0)`,
          })
          .from(orders)
          .where(completedInPeriod),

        ctx.db
          .select({ cost: sql<string>`coalesce(sum(${purchases.totalPrice}), 0)` })
          .from(purchases)
          .innerJoin(orders, eq(orders.id, purchases.orderId))
          .where(completedInPeriod),
      ]);

      const revenue = parseMoney(revenueRow?.revenue ?? '0');
      const cost = parseMoney(costRow?.cost ?? '0');
      const margin = revenue - cost;

      return {
        period: { year: input.year, month: input.month },
        ordersCompleted: revenueRow?.ordersCount ?? 0,
        revenueMinor: revenue,
        costMinor: cost,
        marginMinor: margin,
        depositsMinor: parseMoney(revenueRow?.deposits ?? '0'),
        revenueFormatted: formatMoney(revenue),
        costFormatted: formatMoney(cost),
        marginFormatted: formatMoney(margin),
        marginPercent: revenue === 0 ? null : Math.round((margin / revenue) * 10_000) / 100,
      };
    }),

  /**
   * Выработка сотрудников за месяц: закрытые заказы по каждой роли участия
   * и отработанные часы.
   */
  employeePerformance: managementProcedure
    .input(periodSchema)
    .query(async ({ ctx, input }) => {
      const bounds = periodBounds(input);

      const completedInPeriod = and(
        eq(orders.status, OrderStatus.COMPLETED),
        gte(orders.completedAt, bounds.start),
        lt(orders.completedAt, bounds.end),
      );

      const [rows, hours] = await Promise.all([
        ctx.db
          .select({
            userId: users.id,
            fullName: users.fullName,
            asSeller: sql<string>`count(*) filter (where ${orders.createdBy} = ${users.id})`,
            asMaster: sql<string>`count(*) filter (where ${orders.masterId} = ${users.id})`,
            asSewer: sql<string>`count(*) filter (where ${orders.sewerId} = ${users.id})`,
            asQc: sql<string>`count(*) filter (where ${orders.qcId} = ${users.id})`,
            asInstaller: sql<string>`count(*) filter (where ${orders.installerId} = ${users.id})`,
          })
          .from(users)
          .innerJoin(
            orders,
            and(
              completedInPeriod,
              sql`${users.id} in (${orders.createdBy}, ${orders.masterId}, ${orders.sewerId}, ${orders.qcId}, ${orders.installerId})`,
            ),
          )
          .groupBy(users.id, users.fullName),

        ctx.db
          .select({
            userId: shifts.userId,
            workedHours: sql<string>`round(coalesce(sum(
              extract(epoch from (
                least(${shifts.endedAt}, ${sqlTimestamp(bounds.end)}::timestamptz)
                - greatest(${shifts.startedAt}, ${sqlTimestamp(bounds.start)}::timestamptz)
              ))
            ), 0) / 3600, 2)`,
          })
          .from(shifts)
          .where(and(lt(shifts.startedAt, bounds.end), gte(shifts.endedAt, bounds.start)))
          .groupBy(shifts.userId),
      ]);

      const hoursByUser = new Map(hours.map((row) => [row.userId, row.workedHours]));

      return rows.map((row) => ({
        userId: row.userId,
        fullName: row.fullName,
        completedAsSeller: Number.parseInt(row.asSeller, 10),
        completedAsMaster: Number.parseInt(row.asMaster, 10),
        completedAsSewer: Number.parseInt(row.asSewer, 10),
        completedAsQc: Number.parseInt(row.asQc, 10),
        completedAsInstaller: Number.parseInt(row.asInstaller, 10),
        workedHours: Number.parseFloat(hoursByUser.get(row.userId) ?? '0'),
      }));
    }),
});

import {
  orderInstallationTeam,
  orderItems,
  orderPhotos,
  orders,
  orderStatusHistory,
  readyMadeItems,
  users,
  type DbExecutor,
} from '@curtain-crm/db';
import {
  areaM2FromCm,
  ARCHIVED_ORDER_STATUSES,
  assignableRoleSchema,
  availableTransitions,
  corniceRotationSchema,
  CorniceStatus,
  isManagement,
  MAX_ACCESSORIES_PER_ITEM,
  MAX_PORTIERES_PER_ITEM,
  MAX_BATCH_ORDERS,
  moneyToDecimalString,
  ORDER_PHASES,
  ORDER_STAGE_FEES,
  ORDER_STATUS_PHASE,
  PhotoStage,
  orderItemAccessorySchema,
  OrderItemKind,
  orderItemKindSchema,
  orderItemMaterialSchema,
  type OrderItemMaterial,
  orderStatusSchema,
  parseDimensions,
  OrderStatus,
  OrderType,
  parseMoney,
  prioritySchema,
  TransitionKind,
  type OrderPhase,
  Role,
  type OrderStageFee,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  idSchema,
  moneySchema,
  nonEmptyString,
  optionalText,
  paginationSchema,
  phoneSchema,
  reasonSchema,
} from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure, orderIntakeProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import {
  assertCanAccessOrder,
  assignExecutor,
  changeOrderStatus,
  loadOrderForUpdate,
} from '../services/orderWorkflow.service';
import { router } from '../trpc';
import { toOffset, toPage } from '../types';

/**
 * Заказы — центральный модуль системы.
 *
 * Права доступа:
 *  - `list`, `byId`, `history`, `availableTransitions` — любой вошедший
 *    сотрудник, но видит он ТОЛЬКО заказы, в которых участвует. Руководство
 *    (CEO, админ) видит все;
 *  - `create` — продавец, админ, директор (`orderIntakeProcedure`);
 *  - `update` — руководство, а также автор заказа, пока заказ не ушёл дальше
 *    проверки админом;
 *  - `changeStatus` — участник заказа; не участвующий сотрудник проходит
 *    только в общий пул этапа (статус, где исполнитель ещё не назначен, а
 *    роль сотрудника совпадает с ролью этапа). Сверх того конкретный переход
 *    разрешён только ролям из таблицы `ORDER_TRANSITIONS` и только
 *    «владельцу» заказа на этом этапе. Вся проверка — в
 *    `orderWorkflow.service.ts`;
 *  - `assign`, `setPrice`, `addTeamMember`, `removeTeamMember` — руководство.
 *
 * Статус НИКОГДА не пишется здесь напрямую — только через
 * `changeOrderStatus()`, которая ведёт историю и рассылает уведомления.
 */

/**
 * Статусы, в которых автор ещё вправе править собственный заказ.
 *
 * Типизирован как `OrderStatus[]`, а не `string[]`: с обычным массивом строк
 * переименование статуса прошло бы мимо компилятора, и правка молча стала бы
 * недоступна автору — без единой ошибки сборки.
 */
const AUTHOR_EDITABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.PENDING_ADMIN_REVIEW,
  OrderStatus.REJECTED_TO_CEO,
];

/* -------------------------------------------------------------------------- */
/*                             Позиции заказа                                 */
/* -------------------------------------------------------------------------- */

const orderItemInputSchema = z
  .object({
    kind: orderItemKindSchema.default('window'),
    model: optionalText(200),
    materials: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    materialOptions: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    color: optionalText(100),
    characteristics: optionalText(1000),

    /** Размеры свободным текстом: `150x200`, `150 см х 200 см`. */
    dimensions: z.string().trim().max(100).optional(),
    /** Явные размеры в сантиметрах. Имеют приоритет над `dimensions`. */
    widthCm: z.number().positive().max(2000).optional(),
    heightCm: z.number().positive().max(2000).optional(),

    /** Портьеры — коды тканей с этикеток; на одну позицию их бывает несколько. */
    portieres: z.array(orderItemMaterialSchema).max(MAX_PORTIERES_PER_ITEM).default([]),

    /*
      Тюль, защита, карниз, пластик и труба — по одной строке материала:
      код с этикетки, метраж и описание. Справочника нет ни у одного из них,
      продавец переписывает код руками — потому форма у всех одна.
    */
    tulle: orderItemMaterialSchema.optional(),
    protection: orderItemMaterialSchema.optional(),
    cornice: orderItemMaterialSchema.optional(),
    plastic: orderItemMaterialSchema.optional(),
    pipe: orderItemMaterialSchema.optional(),
    /** Сторона открывания — перечисление, а не свободный текст. */
    corniceRotation: corniceRotationSchema.optional(),
    accessories: z.array(orderItemAccessorySchema).max(MAX_ACCESSORIES_PER_ITEM).default([]),

    quantity: z.number().int().positive().max(1000).default(1),
    comment: optionalText(500),
  })
  .refine(
    (item) =>
      item.dimensions !== undefined ||
      (item.widthCm !== undefined && item.heightCm !== undefined) ||
      (item.widthCm === undefined && item.heightCm === undefined),
    { message: 'Укажите обе стороны или оставьте размеры пустыми', path: ['heightCm'] },
  );

type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/**
 * Приводит позицию из формы к строке БД.
 *
 * Размеры разбираются `parseDimensions()` из `@curtain-crm/shared` — той же
 * функцией, что и в боте, — а площадь считается, а не вводится: посчитанная
 * вручную площадь регулярно расходилась с размерами.
 */
function toOrderItemValues(item: OrderItemInput, orderId: number, position: number) {
  let widthCm = item.widthCm ?? null;
  let heightCm = item.heightCm ?? null;

  if ((widthCm === null || heightCm === null) && item.dimensions !== undefined) {
    const parsed = parseDimensions(item.dimensions);
    if (!parsed.ok) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.message });
    }
    widthCm = parsed.value.widthCm;
    heightCm = parsed.value.heightCm;
  }

  const areaM2 =
    widthCm === null || heightCm === null ? null : areaM2FromCm(widthCm, heightCm);

  return {
    orderId,
    position,
    kind: item.kind,
    model: item.model ?? null,
    materials: item.materials,
    materialOptions: item.materialOptions,
    color: item.color ?? null,
    characteristics: item.characteristics ?? null,
    widthCm: widthCm === null ? null : widthCm.toFixed(1),
    heightCm: heightCm === null ? null : heightCm.toFixed(1),
    areaM2: areaM2 === null ? null : areaM2.toFixed(4),
    portieres: item.portieres,
    tulle: item.tulle ?? null,
    protection: item.protection ?? null,
    cornice: item.cornice ?? null,
    plastic: item.plastic ?? null,
    pipe: item.pipe ?? null,
    corniceRotation: item.corniceRotation ?? null,
    accessories: item.accessories,
    quantity: item.quantity,
    comment: item.comment ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*                        Сдельные расценки по этапам                         */
/* -------------------------------------------------------------------------- */

/**
 * Сколько получит исполнитель каждого этапа за этот заказ.
 *
 * Назначает ТОЛЬКО руководство и только процедурой `setStageFees`. При
 * создании заказа расценок нет: продавец их не вводит и не видит — сколько
 * получает цех, к приёму заказа отношения не имеет.
 *
 * Незаполненное поле — ноль, а не ошибка: у заказа без монтажа установки
 * действительно нет, а забытую сумму руководство дописывает позже.
 */

/**
 * Расценки в виде, пригодном и для создания заказа, и для точечной правки.
 *
 * `| undefined` у каждого поля выписано явно: при `exactOptionalPropertyTypes`
 * `Partial<>` даёт «ключа нет», а из `setStageFees` приходит именно
 * «ключ есть, значение `undefined`» — это разные типы.
 */
interface StageFeesInput {
  readonly measurementFee?: number | undefined;
  readonly cuttingFee?: number | undefined;
  readonly sewingFee?: number | undefined;
  readonly qcFee?: number | undefined;
  readonly corniceFee?: number | undefined;
  readonly installationFee?: number | undefined;
}

/** Значения расценок для записи в БД. Пропущенные поля не трогаются. */
function toStageFeeValues(input: StageFeesInput) {
  const toColumn = (value: number | undefined) =>
    value === undefined ? undefined : moneyToDecimalString(parseMoney(value));

  return {
    ...(toColumn(input.measurementFee) === undefined
      ? {}
      : { measurementFee: toColumn(input.measurementFee) }),
    ...(toColumn(input.cuttingFee) === undefined ? {} : { cuttingFee: toColumn(input.cuttingFee) }),
    ...(toColumn(input.sewingFee) === undefined ? {} : { sewingFee: toColumn(input.sewingFee) }),
    ...(toColumn(input.qcFee) === undefined ? {} : { qcFee: toColumn(input.qcFee) }),
    ...(toColumn(input.corniceFee) === undefined
      ? {}
      : { corniceFee: toColumn(input.corniceFee) }),
    ...(toColumn(input.installationFee) === undefined
      ? {}
      : { installationFee: toColumn(input.installationFee) }),
  };
}

/** Колонка заказа, хранящая расценку этапа. */
const STAGE_FEE_COLUMN = {
  measurement: 'measurementFee',
  cutting: 'cuttingFee',
  sewing: 'sewingFee',
  qc: 'qcFee',
  cornice: 'corniceFee',
  installation: 'installationFee',
} as const satisfies Record<OrderStageFee, keyof typeof orders.$inferSelect>;

/** Колонка заказа с исполнителем этапа — по ней решается, чья это расценка. */
const STAGE_EXECUTOR_COLUMN = {
  measurement: 'masterId',
  // У раскроя своего исполнителя нет: закройщика в штате пока нет, и
  // раскраивает та же швея. Поэтому и расценку за раскрой видит она.
  cutting: 'sewerId',
  sewing: 'sewerId',
  qc: 'qcId',
  // У карниза свой исполнитель: его берёт карнизчик, и расценку за карниз
  // видит и получает он, а не назначенный на установку.
  cornice: 'corniceInstallerId',
  installation: 'installerId',
} as const satisfies Record<OrderStageFee, keyof typeof orders.$inferSelect>;

type StageFeeField = (typeof STAGE_FEE_COLUMN)[OrderStageFee];

/** Заказ, у которого скрытые от сотрудника расценки заменены на `null`. */
export type OrderWithVisibleFees<T> = Omit<T, StageFeeField> &
  Readonly<Record<StageFeeField, string | null>>;

/**
 * Скрывает чужие расценки.
 *
 * Кто что видит, решил владелец: все расценки заказа — только руководство
 * (CEO и админ); исполнитель видит свою и ничью больше. Продавец не видит
 * ни одной, хотя заказ завёл он: сколько получает цех — не его дело.
 *
 * Раньше продавец видел все — он же их и проставлял при приёме. Владелец
 * это отменил: расценки назначает руководство, и продавцу они не показыва-
 * ются даже в собственном заказе. Поэтому `createdBy` здесь больше не при
 * чём — проверять его было бы возвратом прежнего правила.
 *
 * Скрытое поле становится `null`, а не нулём: «не показываем» и «не платим»
 * обязаны различаться, иначе интерфейс честно напишет исполнителю, что за
 * его этап не платят ничего.
 *
 * Фильтрация здесь, а не в компонентах: скрытая в вёрстке сумма всё равно
 * уехала бы клиенту в ответе tRPC.
 */
function maskStageFees<T extends typeof orders.$inferSelect>(
  order: T,
  user: { readonly id: number; readonly roles: readonly Role[] },
): OrderWithVisibleFees<T> {
  const seesEverything = isManagement(user.roles);

  const visible = Object.fromEntries(
    ORDER_STAGE_FEES.map((stage) => [
      STAGE_FEE_COLUMN[stage],
      seesEverything || order[STAGE_EXECUTOR_COLUMN[stage]] === user.id
        ? order[STAGE_FEE_COLUMN[stage]]
        : null,
    ]),
  ) as Record<StageFeeField, string | null>;

  return { ...order, ...visible };
}

/* -------------------------------------------------------------------------- */
/*                                Видимость                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ограничение выборки заказов для рядового сотрудника.
 *
 * Возвращает `undefined` для руководства — оно видит все заказы.
 * Условие повторяет `canUserAccessOrder()`, но в виде SQL: фильтровать
 * в приложении означало бы выгружать чужие заказы из базы.
 */
function visibilityFilter(user: { id: number; roles: readonly Role[] }) {
  if (isManagement(user.roles)) return undefined;

  return or(
    eq(orders.createdBy, user.id),
    eq(orders.masterId, user.id),
    eq(orders.sewerId, user.id),
    eq(orders.qcId, user.id),
    eq(orders.installerId, user.id),
    /*
      Карниз — общая работа карнизчиков, и заказ с непоставленным карнизом
      принадлежит всей бригаде, а не назначенному человеку. То же исключение
      стоит в `canUserAccessOrder`: список и карточка заказа должны
      сходиться, иначе заказ виден в очереди, но не открывается.
    */
    ...(user.roles.includes(Role.CORNICE_INSTALLER)
      ? [ne(orders.corniceStatus, CorniceStatus.NOT_REQUIRED)]
      : []),
  );
}

/** Позиции заказа одним запросом. */
async function loadItems(executor: DbExecutor, orderIds: readonly number[]) {
  if (orderIds.length === 0) return [];
  return executor
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, [...orderIds]))
    .orderBy(asc(orderItems.orderId), asc(orderItems.position));
}

/* -------------------------------------------------------------------------- */

/**
 * Метраж одного материала: то же ограничение, что и в самой строке
 * материала (`orderItemMaterialSchema`), — потолок один на всю систему.
 */
const materialMetersSchema = z.number().positive().max(10000).nullable();

/**
 * Проставляет метраж в строку материала.
 *
 * Материала нет (код не заполнен) — метражу неоткуда взяться; поле не
 * прислано — прежнее значение остаётся.
 */
function withMeters(
  material: OrderItemMaterial | null,
  meters: number | null | undefined,
): OrderItemMaterial | null {
  if (material === null || meters === undefined) return material;
  return { ...material, meters };
}

export const ordersRouter = router({
  /** Список заказов с фильтрами. Основная выдача раздела «Заказы». */
  list: protectedProcedure
    .input(
      paginationSchema
        .extend({
          status: z.array(orderStatusSchema).optional(),
          phase: z.enum(ORDER_PHASES).optional(),
          priority: prioritySchema.optional(),
          branchId: idSchema.optional(),
          assigneeId: idSchema.optional(),
          search: z.string().trim().max(200).optional(),
          deadlineFrom: z.string().date().optional(),
          deadlineTo: z.string().date().optional(),
          /** По умолчанию выполненные и отменённые скрыты — они в «Архиве». */
          includeArchived: z.boolean().default(false),
        })
        .default({ page: 1, pageSize: 20, includeArchived: false }),
    )
    .query(async ({ ctx, input }) => {
      const statusesByPhase =
        input.phase === undefined
          ? undefined
          : (Object.entries(ORDER_STATUS_PHASE) as [keyof typeof ORDER_STATUS_PHASE, OrderPhase][])
              .filter(([, phase]) => phase === input.phase)
              .map(([status]) => status);

      const where = and(
        visibilityFilter(ctx.user),
        ...(input.status === undefined || input.status.length === 0
          ? []
          : [inArray(orders.status, input.status)]),
        ...(statusesByPhase === undefined || statusesByPhase.length === 0
          ? []
          : [inArray(orders.status, statusesByPhase)]),
        ...(input.status !== undefined || input.phase !== undefined || input.includeArchived
          ? []
          : [notInArray(orders.status, [...ARCHIVED_ORDER_STATUSES])]),
        ...(input.priority === undefined ? [] : [eq(orders.priority, input.priority)]),
        ...(input.branchId === undefined ? [] : [eq(orders.branchId, input.branchId)]),
        ...(input.deadlineFrom === undefined ? [] : [gte(orders.deadline, input.deadlineFrom)]),
        ...(input.deadlineTo === undefined ? [] : [lte(orders.deadline, input.deadlineTo)]),
        ...(input.assigneeId === undefined
          ? []
          : [
              or(
                eq(orders.masterId, input.assigneeId),
                eq(orders.sewerId, input.assigneeId),
                eq(orders.qcId, input.assigneeId),
                eq(orders.installerId, input.assigneeId),
              ),
            ]),
        ...(input.search === undefined || input.search.length === 0
          ? []
          : [
              or(
                ilike(orders.orderNumber, `%${input.search}%`),
                ilike(orders.clientName, `%${input.search}%`),
                ilike(orders.clientPhone, `%${input.search}%`),
              ),
            ]),
      );

      const [rows, [totalRow]] = await Promise.all([
        ctx.db
          .select()
          .from(orders)
          .where(where)
          // Срочные заказы сверху, затем свежие: приоритет для того и заводится.
          .orderBy(
            sql`case ${orders.priority} when 'critical' then 2 when 'urgent' then 1 else 0 end desc`,
            desc(orders.createdAt),
          )
          .limit(input.pageSize)
          .offset(toOffset(input)),
        ctx.db.select({ value: count() }).from(orders).where(where),
      ]);

      return toPage(
        rows.map((row) => maskStageFees(row, ctx.user)),
        totalRow?.value ?? 0,
        input,
      );
    }),

  /** Карточка заказа со всеми позициями и назначенными исполнителями. */
  byId: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.id),
        with: {
          items: true,
          branch: { columns: { id: true, name: true } },
          creator: { columns: { id: true, fullName: true, phone: true } },
          master: { columns: { id: true, fullName: true, phone: true } },
          sewer: { columns: { id: true, fullName: true, phone: true } },
          qc: { columns: { id: true, fullName: true, phone: true } },
          installer: { columns: { id: true, fullName: true, phone: true } },
          corniceInstaller: { columns: { id: true, fullName: true, phone: true } },
        },
      });

      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      return maskStageFees(order, ctx.user);
    }),

  /**
   * Создание заказа.
   *
   * Заказ создаётся в статусе `new` и сразу отправляется на проверку админу:
   * так путь у всех заказов один, включая заведённые самим админом.
   * В истории остаются обе записи — создание и отправка на проверку.
   */
  create: orderIntakeProcedure
    .input(
      z.object({
        branchId: idSchema.optional(),
        clientName: nonEmptyString(200, 'Укажите имя клиента'),
        clientPhone: phoneSchema,
        clientComment: optionalText(2000),

        installAddress: optionalText(500),
        installLatitude: z.number().min(-90).max(90).optional(),
        installLongitude: z.number().min(-180).max(180).optional(),

        deadline: z.string().date().optional(),
        priority: prioritySchema.default('normal'),

        workPrice: moneySchema.default(0),
        deposit: moneySchema.default(0),

        /*
          Расценок здесь нет намеренно.

          Сначала их вписывал продавец при приёме, а руководство утверждало.
          Владелец решил иначе: сколько получает цех — дело CEO и админа, и
          продавцу этого знать не нужно. Поле убрано из ВХОДА процедуры, а не
          спрятано в форме: иначе достаточно было бы отправить запрос мимо
          интерфейса, чтобы назначить чужую зарплату.

          Проставляет суммы руководство отдельной процедурой `setStageFees`,
          у неё свой guard.
        */

        items: z.array(orderItemInputSchema).min(1, 'Добавьте хотя бы одну позицию').max(50),
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
          message: 'Нельзя создать заказ в филиале, к которому вы не привязаны',
        });
      }

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            branchId,
            clientName: input.clientName,
            clientPhone: input.clientPhone,
            clientComment: input.clientComment ?? null,
            installAddress: input.installAddress ?? null,
            installLatitude: input.installLatitude ?? null,
            installLongitude: input.installLongitude ?? null,
            deadline: input.deadline ?? null,
            priority: input.priority,
            workPrice: moneyToDecimalString(parseMoney(input.workPrice)),
            deposit: moneyToDecimalString(parseMoney(input.deposit)),
            createdBy: ctx.user.id,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось создать заказ',
          });
        }

        await tx
          .insert(orderItems)
          .values(input.items.map((item, index) => toOrderItemValues(item, created.id, index)));

        // Первая запись истории: у создания нет исходного статуса.
        await tx.insert(orderStatusHistory).values({
          orderId: created.id,
          fromStatus: null,
          toStatus: OrderStatus.NEW,
          changedBy: ctx.user.id,
          comment: 'Заказ создан',
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.created',
          entityType: 'order',
          entityId: created.id,
          details: { clientName: created.clientName, itemsCount: input.items.length },
          ipAddress: ctx.ipAddress,
        });

        const { order } = await changeOrderStatus(tx, {
          orderId: created.id,
          toStatus: OrderStatus.PENDING_ADMIN_REVIEW,
          actor: ctx.user,
          ipAddress: ctx.ipAddress,
        });

        // Автор заказа и так видит все расценки, так что здесь маскировка
        // ничего не скрывает. Она стоит ради инварианта: заказ не покидает
        // роутер в обход `maskStageFees`. Одно исключение «здесь-то можно» —
        // и следующий, кто скопирует этот `return`, унесёт чужие суммы.
        return maskStageFees(order, ctx.user);
      });
    }),

  /**
   * Продажа готовых штор — товар с витрины, минуя цех.
   *
   * Схема бизнеса, которую попросил заказчик: продавец выбирает готовые
   * шторы и продаёт их сразу. Требуется установка? Если нет — заказ
   * закрывается тем же действием. Если да — заказ уходит в статус «ждёт
   * установщика» с указанным адресом, и админ назначает установщика обычным
   * порядком, как в пошиве.
   *
   * Заказ создаётся и сразу переводится нужным путём ОДНОЙ транзакцией:
   * `orderType: 'ready_made'` в статусе `new` не должен существовать сам по
   * себе — оба перехода из `new` для готовых штор открыты только продавцу
   * этой процедурой, а не общей `changeStatus`, чтобы адрес установки не
   * потерялся между «создали» и «перевели».
   */
  sellReadyMade: orderIntakeProcedure
    .input(
      z
        .object({
          branchId: idSchema.optional(),
          clientName: nonEmptyString(200, 'Укажите имя клиента'),
          clientPhone: phoneSchema,
          clientComment: optionalText(2000),

          workPrice: moneySchema.default(0),
          deposit: moneySchema.default(0),

          /**
           * Позиции продажи.
           *
           * Раньше здесь было одно поле «модель» на весь заказ: считалось,
           * что готовые шторы отдают комплектом. На деле в одну продажу
           * попадает и комплект, и тюль, и карниз — и всё это уезжало в
           * одну строку текстом, после чего в отчёте нельзя было понять,
           * что именно продано.
           */
          items: z
            .array(
              z.object({
                /*
                  Штора со склада: остаток списывается, а модель, размер и
                  цвет берутся из складской записи, а не с формы. Продавец
                  выбирает вещь, а не переписывает её описание — переписанное
                  расходится с полкой на второй продаже.
                */
                readyMadeItemId: idSchema.optional(),
                model: optionalText(200),
                /*
                  Карниз в продаже готовых штор.

                  К шторе с полки его берут тут же, а иногда покупают и один
                  карниз, без штор. Хранится той же строкой материала, что и
                  в пошиве, — карточка заказа показывает его одинаково, и
                  установщику незачем знать, откуда заказ пришёл.
                */
                cornice: optionalText(200),
                quantity: z.number().int().positive().max(1000).default(1),
                comment: optionalText(500),
              }),
            )
            .min(1, 'Добавьте хотя бы одну позицию')
            .max(20, 'Слишком много позиций в одной продаже'),

          needsInstallation: z.boolean(),
          /* Расценки установщику здесь нет — её назначает руководство,
             см. комментарий в `create`. */
          /** Обязателен, если нужна установка; иначе заказ закрывается сразу. */
          installAddress: optionalText(500),
          installLatitude: z.number().min(-90).max(90).optional(),
          installLongitude: z.number().min(-180).max(180).optional(),
          deadline: z.string().date().optional(),
        })
        .refine((input) => !input.needsInstallation || input.installAddress !== undefined, {
          message: 'Укажите адрес установки',
          path: ['installAddress'],
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
          message: 'Нельзя создать заказ в филиале, к которому вы не привязаны',
        });
      }

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            branchId,
            orderType: OrderType.READY_MADE,
            clientName: input.clientName,
            clientPhone: input.clientPhone,
            clientComment: input.clientComment ?? null,
            installAddress: input.needsInstallation ? (input.installAddress ?? null) : null,
            installLatitude: input.needsInstallation ? (input.installLatitude ?? null) : null,
            installLongitude: input.needsInstallation ? (input.installLongitude ?? null) : null,
            deadline: input.deadline ?? null,
            workPrice: moneyToDecimalString(parseMoney(input.workPrice)),
            deposit: moneyToDecimalString(parseMoney(input.deposit)),
            createdBy: ctx.user.id,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось создать заказ',
          });
        }

        /*
          Позиции со склада списываются ДО вставки строк заказа: если штук
          не хватило, продажа не должна оставить за собой ни заказа, ни
          половины списанного остатка.
        */
        const soldFromStock = new Map<number, typeof readyMadeItems.$inferSelect>();

        for (const item of input.items) {
          if (item.readyMadeItemId === undefined) continue;

          const [stock] = await tx
            .select()
            .from(readyMadeItems)
            .where(eq(readyMadeItems.id, item.readyMadeItemId))
            .for('update')
            .limit(1);

          if (stock === undefined) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Готовая штора не найдена' });
          }
          if (stock.branchId !== branchId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `«${stock.model}» лежит в другом филиале`,
            });
          }
          if (stock.quantity < item.quantity) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                `«${stock.model}»: на складе ${stock.quantity.toString()} шт, ` +
                `продать ${item.quantity.toString()} нельзя`,
            });
          }

          await tx
            .update(readyMadeItems)
            .set({ quantity: stock.quantity - item.quantity, updatedAt: new Date() })
            .where(eq(readyMadeItems.id, stock.id));

          await recordAudit(tx, {
            actorId: ctx.user.id,
            action: 'ready_made_item.sold',
            entityType: 'ready_made_item',
            entityId: stock.id,
            details: {
              model: stock.model,
              quantity: item.quantity,
              stockAfter: stock.quantity - item.quantity,
              orderId: created.id,
            },
            ipAddress: ctx.ipAddress,
          });

          soldFromStock.set(stock.id, stock);
        }

        await tx.insert(orderItems).values(
          input.items.map((item, index) => {
            const stock =
              item.readyMadeItemId === undefined
                ? undefined
                : soldFromStock.get(item.readyMadeItemId);
            const model = stock?.model ?? item.model;

            return toOrderItemValues(
              {
                kind: OrderItemKind.OTHER,
                materials: [],
                materialOptions: [],
                portieres: [],
                accessories: [],
                quantity: item.quantity,
                ...(model === undefined ? {} : { model }),
                ...(stock === undefined
                  ? {}
                  : {
                      widthCm: Number.parseFloat(stock.widthCm),
                      heightCm: Number.parseFloat(stock.heightCm),
                    }),
                ...(item.cornice === undefined || item.cornice === null
                  ? {}
                  : { cornice: { code: item.cornice, meters: null, description: null } }),
                ...(item.comment === undefined ? {} : { comment: item.comment }),
              },
              created.id,
              index,
            );
          }),
        );

        await tx.insert(orderStatusHistory).values({
          orderId: created.id,
          fromStatus: null,
          toStatus: OrderStatus.NEW,
          changedBy: ctx.user.id,
          comment: 'Продажа готовых штор',
        });

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.created',
          entityType: 'order',
          entityId: created.id,
          details: { clientName: created.clientName, orderType: OrderType.READY_MADE },
          ipAddress: ctx.ipAddress,
        });

        const { order } = await changeOrderStatus(tx, {
          orderId: created.id,
          toStatus: input.needsInstallation
            ? OrderStatus.PENDING_INSTALLATION_ASSIGNMENT
            : OrderStatus.COMPLETED,
          actor: ctx.user,
          comment: input.needsInstallation ? null : 'Продано без установки',
          ipAddress: ctx.ipAddress,
        });

        return maskStageFees(order, ctx.user);
      });
    }),

  /**
   * Правка заказа.
   *
   * Автор может править заказ, пока тот не ушёл дальше проверки админом:
   * менять состав позиций у заказа, который уже шьют, нельзя — швея работает
   * по тому, что видела. Руководство не ограничено, но каждая правка попадает
   * в `audit_log`.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        clientName: nonEmptyString(200).optional(),
        clientPhone: phoneSchema.optional(),
        clientComment: optionalText(2000),
        installAddress: optionalText(500),
        installLatitude: z.number().min(-90).max(90).nullable().optional(),
        installLongitude: z.number().min(-180).max(180).nullable().optional(),
        deadline: z.string().date().nullable().optional(),
        priority: prioritySchema.optional(),
        /** Полная замена состава позиций. */
        items: z.array(orderItemInputSchema).min(1).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);
        if (!isManagement(ctx.user.roles)) {
          if (order.createdBy !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Править заказ может его автор или руководство',
            });
          }
          if (!AUTHOR_EDITABLE_STATUSES.includes(order.status)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Заказ уже в работе — правки вносит администратор',
            });
          }
        }

        const patch = {
          ...(input.clientName === undefined ? {} : { clientName: input.clientName }),
          ...(input.clientPhone === undefined ? {} : { clientPhone: input.clientPhone }),
          ...(input.clientComment === undefined ? {} : { clientComment: input.clientComment }),
          ...(input.installAddress === undefined ? {} : { installAddress: input.installAddress }),
          ...(input.installLatitude === undefined ? {} : { installLatitude: input.installLatitude }),
          ...(input.installLongitude === undefined
            ? {}
            : { installLongitude: input.installLongitude }),
          ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
        };

        if (Object.keys(patch).length > 0) {
          await tx
            .update(orders)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(orders.id, order.id));
        }

        if (input.items !== undefined) {
          // Полная замена, а не сверка: у позиций нет устойчивых
          // идентификаторов на стороне формы, и частичное обновление
          // порождало бы дубли при перестановке строк.
          await tx.delete(orderItems).where(eq(orderItems.orderId, order.id));
          await tx
            .insert(orderItems)
            .values(input.items.map((item, index) => toOrderItemValues(item, order.id, index)));
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.updated',
          entityType: 'order',
          entityId: order.id,
          details: { ...patch, itemsReplaced: input.items !== undefined },
          ipAddress: ctx.ipAddress,
        });

        const [updated] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
        return maskStageFees(updated ?? order, ctx.user);
      }),
    ),

  /** Изменение суммы работ и предоплаты. Остаток пересчитывается самой БД. */
  setPrice: managementProcedure
    .input(
      z.object({
        id: idSchema,
        workPrice: moneySchema.optional(),
        deposit: moneySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);

        const patch = {
          ...(input.workPrice === undefined
            ? {}
            : { workPrice: moneyToDecimalString(parseMoney(input.workPrice)) }),
          ...(input.deposit === undefined
            ? {}
            : { deposit: moneyToDecimalString(parseMoney(input.deposit)) }),
        };

        if (Object.keys(patch).length === 0) return maskStageFees(order, ctx.user);

        const [updated] = await tx
          .update(orders)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(orders.id, order.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.price_changed',
          entityType: 'order',
          entityId: order.id,
          details: {
            from: { workPrice: order.workPrice, deposit: order.deposit },
            to: patch,
          },
          ipAddress: ctx.ipAddress,
        });

        return maskStageFees(updated, ctx.user);
      }),
    ),

  /**
   * Правка сдельных расценок по этапам.
   *
   * Отдельная процедура, а не поля в `setPrice`: это разные деньги с разными
   * правами. `workPrice` — сколько платит клиент, расценки — сколько получает
   * цех, и продавец, который вправе назвать цену клиенту, не должен
   * переназначать чужую зарплату задним числом.
   *
   * Статусом не ограничена намеренно: заказ закрывают раньше, чем считают
   * зарплату, и забытую сумму дописывают до конца месяца. Каждая правка
   * попадает в `audit_log` с прежними значениями — этого достаточно, чтобы
   * спор «мне обещали больше» решался записью, а не памятью.
   */
  setStageFees: managementProcedure
    .input(
      z.object({
        id: idSchema,
        measurementFee: moneySchema.optional(),
        cuttingFee: moneySchema.optional(),
        sewingFee: moneySchema.optional(),
        qcFee: moneySchema.optional(),
        corniceFee: moneySchema.optional(),
        installationFee: moneySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);
        const patch = toStageFeeValues(input);

        if (Object.keys(patch).length === 0) return maskStageFees(order, ctx.user);

        const [updated] = await tx
          .update(orders)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(orders.id, order.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.stage_fees_changed',
          entityType: 'order',
          entityId: order.id,
          details: {
            from: {
              measurementFee: order.measurementFee,
              sewingFee: order.sewingFee,
              qcFee: order.qcFee,
              corniceFee: order.corniceFee,
              installationFee: order.installationFee,
            },
            to: patch,
          },
          ipAddress: ctx.ipAddress,
        });

        return maskStageFees(updated, ctx.user);
      }),
    ),

  /**
   * Метраж материалов позиции.
   *
   * Продавец вводит только код с этикетки: сколько метров ткани уйдёт, он у
   * клиента дома не считает, а цифра «на глазок» потом всплывает в раскрое.
   * Метраж проставляет админ или директор — уже по заказу целиком, когда
   * позиции пересчитаны.
   *
   * `null` в поле снимает ранее проставленный метраж, отсутствующее поле не
   * трогает его вовсе: это разные вещи, и `??` их бы склеил.
   */
  setItemMeters: managementProcedure
    .input(
      z.object({
        itemId: idSchema,
        /* По одному значению на портьеру, в том же порядке, что и в позиции. */
        portieres: z.array(materialMetersSchema).max(MAX_PORTIERES_PER_ITEM).optional(),
        tulle: materialMetersSchema.optional(),
        protection: materialMetersSchema.optional(),
        cornice: materialMetersSchema.optional(),
        plastic: materialMetersSchema.optional(),
        pipe: materialMetersSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.id, input.itemId))
          .limit(1);

        if (item === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция заказа не найдена' });
        }

        // Блокируем заказ, а не позицию: метраж — часть его состава.
        const order = await loadOrderForUpdate(tx, item.orderId);

        /* Локальная привязка: внутри `map` сужение по `input` уже не живёт. */
        const portiereMeters = input.portieres;

        const patch = {
          portieres:
            portiereMeters === undefined
              ? item.portieres
              : item.portieres.map((portiere, index) => {
                  const meters = portiereMeters[index];
                  return meters === undefined ? portiere : { ...portiere, meters };
                }),
          tulle: withMeters(item.tulle, input.tulle),
          protection: withMeters(item.protection, input.protection),
          cornice: withMeters(item.cornice, input.cornice),
          plastic: withMeters(item.plastic, input.plastic),
          pipe: withMeters(item.pipe, input.pipe),
        };

        const [updated] = await tx
          .update(orderItems)
          .set(patch)
          .where(eq(orderItems.id, item.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Позиция заказа не найдена' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.item_meters_changed',
          entityType: 'order',
          entityId: order.id,
          details: { itemId: item.id, meters: input },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  /**
   * Перевод заказа в новый статус, включая откат на предыдущий этап.
   *
   * Вся проверка (легальность перехода, роль, обязательность комментария,
   * наличие исполнителя, принадлежность заказа) выполняется в
   * `changeOrderStatus()` — здесь только транзакция.
   */
  changeStatus: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        toStatus: orderStatusSchema,
        /** Причина. Обязательна для откатов, отклонений и отмен. */
        comment: z.string().trim().max(1000).optional(),
        /**
         * Исполнитель, назначаемый вместе с переходом.
         * Роль задаёт целевой статус, поэтому здесь только человек.
         */
        assigneeId: idSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const result = await changeOrderStatus(tx, {
          orderId: input.id,
          toStatus: input.toStatus,
          actor: ctx.user,
          comment: input.comment ?? null,
          assigneeId: input.assigneeId ?? null,
          ipAddress: ctx.ipAddress,
        });

        // Переход возвращает заказ целиком — вместе с расценками всех этапов.
        // Швея, отправившая работу на контроль, получила бы в ответе сумму
        // установщика, даже не открывая карточку.
        return { ...result, order: maskStageFees(result.order, ctx.user) };
      }),
    ),

  /**
   * Один и тот же переход по нескольким заказам сразу.
   *
   * Каждый заказ — В СВОЕЙ транзакции, последовательно. Это принципиально:
   *
   *  - Общая транзакция означала бы «всё или ничего»: один заказ, успевший
   *    уйти вперёд с чужого устройства, отменил бы работу по остальным
   *    сорока девяти. Для массовой операции это худший исход из возможных.
   *  - Параллельный запуск (`Promise.all`) взял бы полсотни блокировок строк
   *    вперемешку и дал бы недетерминированный порядок в отчёте.
   *
   * Поэтому ответ — не «успех», а ПОИМЁННЫЙ отчёт: по каждому заказу видно,
   * прошёл он или нет и почему. Молча проглотить отказ нельзя — человек
   * должен узнать, что три заказа из десяти остались на месте, сразу, а не
   * при следующем открытии списка.
   */
  changeStatusBatch: protectedProcedure
    .input(
      z.object({
        ids: z.array(idSchema).min(1).max(MAX_BATCH_ORDERS),
        toStatus: orderStatusSchema,
        comment: z.string().trim().max(1000).optional(),
        assigneeId: idSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: {
        id: number;
        ok: boolean;
        message: string | null;
      }[] = [];

      // Повторы в списке убираем: два одинаковых `id` дали бы «уже находится
      // в статусе» вторым проходом, и отчёт врал бы про неудачу.
      for (const id of [...new Set(input.ids)]) {
        try {
          await ctx.db.transaction(async (tx) =>
            changeOrderStatus(tx, {
              orderId: id,
              toStatus: input.toStatus,
              actor: ctx.user,
              comment: input.comment ?? null,
              assigneeId: input.assigneeId ?? null,
              ipAddress: ctx.ipAddress,
            }),
          );
          results.push({ id, ok: true, message: null });
        } catch (error) {
          /* Сообщение сервера сохраняем как есть: оно на русском и объясняет
             причину («Сначала назначьте исполнителя…», «Заказ закрыт»).
             Заменять его на «не удалось» значит выбросить единственное, что
             подсказывает человеку, что делать дальше. */
          results.push({
            id,
            ok: false,
            message:
              error instanceof TRPCError
                ? error.message
                : 'Не удалось изменить статус заказа',
          });
        }
      }

      return {
        results,
        succeeded: results.filter((entry) => entry.ok).length,
        failed: results.filter((entry) => !entry.ok).length,
      };
    }),

  /**
   * Действия, доступные текущему сотруднику по этому заказу.
   * Веб-панель и мобильное приложение рисуют кнопки строго по этому ответу,
   * а не по собственным догадкам о правах.
   */
  availableTransitions: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.id) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      return availableTransitions(order.status, ctx.user.roles, order.orderType).map((transition) => ({
        to: transition.to,
        label: transition.label,
        kind: transition.kind,
        requiresComment: transition.kind !== TransitionKind.FORWARD,
      }));
    }),

  /** Назначение или снятие исполнителя. */
  assign: managementProcedure
    .input(
      z.object({
        id: idSchema,
        role: assignableRoleSchema,
        assigneeId: idSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) =>
        assignExecutor(tx, {
          orderId: input.id,
          role: input.role,
          assigneeId: input.assigneeId,
          actor: ctx.user,
          ipAddress: ctx.ipAddress,
        }),
      ),
    ),

  /** Полная история переходов статуса. Только добавление, никогда перезапись. */
  history: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.id) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      return ctx.db
        .select({
          id: orderStatusHistory.id,
          fromStatus: orderStatusHistory.fromStatus,
          toStatus: orderStatusHistory.toStatus,
          comment: orderStatusHistory.comment,
          createdAt: orderStatusHistory.createdAt,
          changedBy: orderStatusHistory.changedBy,
          changedByName: users.fullName,
        })
        .from(orderStatusHistory)
        .innerJoin(users, eq(users.id, orderStatusHistory.changedBy))
        .where(eq(orderStatusHistory.orderId, input.id))
        // Второй ключ обязателен: `created_at` по умолчанию `now()`, а в
        // PostgreSQL это время НАЧАЛА транзакции. Все записи, сделанные одной
        // транзакцией, получают одинаковую метку — при создании заказа это
        // `null -> new` и `new -> pending_admin_review`, при автозакрытии
        // `installation_done` и `completed`. По одному времени они могли
        // выстроиться в обратном порядке, а история — то, чем разбирают спор
        // с клиентом. `id` монотонно растёт и разрешает ничью однозначно.
        .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id));
    }),

  /**
   * Состав бригады установщиков.
   *
   * Ответственный установщик — это `assign({ role: 'installer' })`. Здесь
   * фиксируются остальные участники: список опционален и ни на что не влияет,
   * кроме отчётности.
   */
  installationTeam: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.id) });
      if (order === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
      }
      assertCanAccessOrder(order, ctx.user);

      return ctx.db
        .select({
          userId: orderInstallationTeam.userId,
          fullName: users.fullName,
          addedAt: orderInstallationTeam.addedAt,
        })
        .from(orderInstallationTeam)
        .innerJoin(users, eq(users.id, orderInstallationTeam.userId))
        .where(eq(orderInstallationTeam.orderId, input.id))
        .orderBy(asc(users.fullName));
    }),

  addTeamMember: managementProcedure
    .input(z.object({ id: idSchema, userId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(orderInstallationTeam)
        .values({ orderId: input.id, userId: input.userId, addedBy: ctx.user.id })
        .onConflictDoNothing();

      return { success: true } as const;
    }),

  removeTeamMember: managementProcedure
    .input(z.object({ id: idSchema, userId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(orderInstallationTeam)
        .where(
          and(
            eq(orderInstallationTeam.orderId, input.id),
            eq(orderInstallationTeam.userId, input.userId),
          ),
        );

      return { success: true } as const;
    }),

  /**
   * Отмена заказа. Отдельная процедура, а не `changeStatus`, чтобы причина
   * была обязательна на уровне схемы ввода и форма подсказывала это сразу.
   */
  cancel: managementProcedure
    .input(z.object({ id: idSchema, reason: reasonSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) =>
        changeOrderStatus(tx, {
          orderId: input.id,
          toStatus: OrderStatus.CANCELLED,
          actor: ctx.user,
          comment: input.reason,
          ipAddress: ctx.ipAddress,
        }),
      ),
    ),

  /* ------------------------------- Карниз -------------------------------- */

  /**
   * Очередь карнизчиков.
   *
   * Отдельная выдача, а не фильтр общего списка: карниз идёт мимо цепочки
   * статусов, и по статусу заказа его не найти — заказ на карнизе может
   * быть в любом производственном статусе сразу.
   *
   * `done: true` показывает уже сделанные — владелец просил, чтобы
   * карнизчики видели, кто какой заказ выполнил, а не только свободную
   * работу.
   */
  corniceQueue: protectedProcedure
    .input(z.object({ done: z.boolean().default(false) }).default({ done: false }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          clientName: orders.clientName,
          clientPhone: orders.clientPhone,
          installAddress: orders.installAddress,
          deadline: orders.deadline,
          priority: orders.priority,
          status: orders.status,
          workPrice: orders.workPrice,
          corniceStatus: orders.corniceStatus,
          corniceDoneAt: orders.corniceDoneAt,
          corniceInstallerId: orders.corniceInstallerId,
          corniceInstallerName: users.fullName,
        })
        .from(orders)
        .leftJoin(users, eq(users.id, orders.corniceInstallerId))
        .where(
          and(
            inArray(
              orders.corniceStatus,
              input.done
                ? [CorniceStatus.DONE]
                : [CorniceStatus.PENDING, CorniceStatus.IN_PROGRESS],
            ),
            notInArray(orders.status, [OrderStatus.CANCELLED]),
            visibilityFilter(ctx.user),
          ),
        )
        .orderBy(input.done ? desc(orders.corniceDoneAt) : asc(orders.createdAt))
        .limit(100);

      return rows;
    }),

  /**
   * Карнизчик берёт работу себе.
   *
   * Берёт сам, а не получает от админа: карнизы разбирает бригада между
   * собой, и лишний шаг «попроси, чтобы назначили» означал бы, что заказ
   * ждёт админа вместо того, чтобы ждать свободного человека. Кто взял —
   * записано, и повторно взять чужой карниз нельзя.
   */
  takeCornice: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.roles.includes(Role.CORNICE_INSTALLER)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Карниз ставит карнизчик',
        });
      }

      return ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);
        assertCanAccessOrder(order, ctx.user);

        if (order.corniceStatus !== CorniceStatus.PENDING) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              order.corniceStatus === CorniceStatus.NOT_REQUIRED
                ? 'В этом заказе карниза нет'
                : 'Карниз уже взят в работу',
          });
        }

        const [updated] = await tx
          .update(orders)
          .set({
            corniceStatus: CorniceStatus.IN_PROGRESS,
            corniceInstallerId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.cornice_taken',
          entityType: 'order',
          entityId: order.id,
          details: { corniceInstallerId: ctx.user.id },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      });
    }),

  /**
   * Карниз готов — с фотоподтверждением.
   *
   * Фото обязательно и проверяется здесь, а не в интерфейсе: «сделано» без
   * снимка — это слово против слова, а спорят о карнизе уже на объекте, где
   * переделывать дороже всего. Загружается фото обычной загрузкой на стадию
   * «Карниз», её же видят остальные карнизчики.
   */
  finishCornice: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const order = await loadOrderForUpdate(tx, input.id);
        assertCanAccessOrder(order, ctx.user);

        if (order.corniceStatus !== CorniceStatus.IN_PROGRESS) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              order.corniceStatus === CorniceStatus.DONE
                ? 'Карниз уже отмечен готовым'
                : 'Сначала возьмите карниз в работу',
          });
        }

        // Чужую работу закрывает только руководство: иначе один карнизчик
        // закрыл бы наряд другого, и в записи остался бы не тот человек.
        if (order.corniceInstallerId !== ctx.user.id && !isManagement(ctx.user.roles)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Этот карниз взял другой сотрудник',
          });
        }

        const [photo] = await tx
          .select({ id: orderPhotos.id })
          .from(orderPhotos)
          .where(
            and(eq(orderPhotos.orderId, order.id), eq(orderPhotos.stage, PhotoStage.CORNICE)),
          )
          .limit(1);

        if (photo === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Загрузите фото карниза — без снимка работа не принимается',
          });
        }

        const [updated] = await tx
          .update(orders)
          .set({
            corniceStatus: CorniceStatus.DONE,
            corniceDoneAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        if (updated === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'order.cornice_done',
          entityType: 'order',
          entityId: order.id,
          details: { corniceInstallerId: order.corniceInstallerId },
          ipAddress: ctx.ipAddress,
        });

        return updated;
      }),
    ),

  /** Позиции нескольких заказов сразу — для списка с раскрытием. */
  itemsByOrderIds: protectedProcedure
    .input(z.object({ orderIds: z.array(idSchema).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const visible = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(inArray(orders.id, input.orderIds), visibilityFilter(ctx.user)));

      return loadItems(ctx.db, visible.map((row) => row.id));
    }),
});

/**
 * Интеграционная проверка на живой базе.
 *
 * Юнит-тесты покрывают чистые функции, но не SQL. Этот скрипт прогоняет
 * именно то, что нельзя проверить без PostgreSQL: генерируемые колонки,
 * check-констрейнты, частичные уникальные индексы, `SELECT ... FOR UPDATE`
 * в переходах статуса, оконные выражения по сменам и агрегаты отчётов
 * (`count(*) filter`, `bool_or`, `date_trunc`).
 *
 * Скрипт создаёт собственные данные с префиксом `SMOKE` и убирает за собой
 * в `finally` — на рабочую базу он не влияет и его можно запускать повторно.
 *
 * Запуск: `pnpm --filter @curtain-crm/api run smoke`
 */
import {
  auditLog,
  boardPhotos,
  branches,
  catalogItems,
  closeDatabase,
  createDatabase,
  dayOffRequests,
  disciplineEvents,
  displayLinks,
  hashPassword,
  installationTrips,
  lateCheckIns,
  lateRequests,
  notifications,
  orderComments,
  orderItems,
  orderPackChecks,
  orderPhotos,
  orders,
  orderStatusHistory,
  payments,
  payrollRecords,
  payrollSchemes,
  personalBreaks,
  purchases,
  refreshTokens,
  shifts,
  userBranches,
  userRoles,
  users,
  workPlans,
  type Database,
} from '@curtain-crm/db';
import {
  BoardPhotoKind,
  CorniceStatus,
  DayOffStatus,
  isoWeekdayOf,
  LiveStatus,
  MonitorGroup,
  moneyToDecimalString,
  NotificationType,
  ORDER_STATUS_LABELS_RU,
  OrderItemKind,
  OrderStatus,
  OrderType,
  parseMoney,
  PaymentKind,
  PaymentMethod,
  PayrollOrderPayStatus,
  PayrollRecordStatus,
  PayrollSchemeType,
  planPercent,
  QueueStatus,
  TerminalPayType,
  Role,
  workshopDayIso,
  workshopToday,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { config as loadEnv } from 'dotenv';
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { loadAuthenticatedUser } from '../context';
import { login, refreshSession } from '../services/auth.service';
import {
  calculateCompletedOrders,
  calculateForDay,
  calculateForUserRole,
  gatherPayrollInputs,
  saveDraft,
} from '../services/payroll.service';
import { assignExecutor, changeOrderStatus } from '../services/orderWorkflow.service';
import { loadPackList } from '../services/packList.service';
import { describeForGroup } from '../services/groupFeed.service';
import { lockLatenessOf, recordLatenessIfAny } from '../services/lateness.service';
import { scheduledShiftStartOn } from '../services/shiftSchedule';
import { employeesMissingShift, employeesWithOpenShift } from '../services/reminders.service';
import { balance, dayReport, onHands, orderPaid, post } from '../services/ledger.service';
import { employeeRating } from '../services/rating.service';
import { deadlinesReport } from '../services/reports.service';
import { TRPCError } from '@trpc/server';

import { appRouter } from '../routers';
import { terminalChecksToday } from '../routers/terminalChecks.router';
import { createCallerFactory } from '../trpc';
import { calculateWorkedHours, periodBounds } from '../services/shifts.service';
import { workshopPeriodStarts } from '../services/periods';
import {
  attendanceByDay,
  presenceToday,
  staffDistributions,
  staffSummary,
} from '../services/staff.service';
import type { AuthenticatedUser } from '../types';

loadEnv({ path: ['.env', '../../.env'] });

const PREFIX = 'SMOKE';

/** Пароль тестовых сотрудников — нужен проверке сессий ниже. */
const SMOKE_PASSWORD = 'SmokeTest123!';

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  process.stdout.write(
    `${ok ? '  OK  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`,
  );
}

/** Ожидает, что операция будет отбита проверкой. */
async function expectRejected(name: string, action: () => Promise<unknown>): Promise<void> {
  const passed = await action().then(
    () => false,
    () => true,
  );
  check(name, passed);
}

/**
 * Ожидает отказ С КОНКРЕТНОЙ формулировкой.
 *
 * `expectRejected` довольствуется любым исключением, а для утечек этого мало:
 * отказ по «неверному переходу» и отказ по «нет доступа» одинаково выглядят
 * как брошенная ошибка, но первый попутно называет статус чужого заказа.
 */
async function expectRejectedWith(
  name: string,
  action: () => Promise<unknown>,
  matches: (message: string) => boolean,
): Promise<void> {
  const message = await action().then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  check(
    name,
    message !== null && matches(message),
    message === null ? 'операция НЕ была отбита' : message,
  );
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL не задана — скопируйте .env.example в .env');
  }

  const { db, client } = createDatabase(url, { maxConnections: 4 });

  try {
    await cleanup(db);
    await run(db);
  } finally {
    await cleanup(db).catch(() => undefined);
    await closeDatabase(client);
  }

  const failed = results.filter((entry) => !entry.ok);
  process.stdout.write(
    `\n${(results.length - failed.length).toString()} из ${results.length.toString()} проверок пройдено\n`,
  );

  if (failed.length > 0) process.exitCode = 1;
}

/**
 * Убирает триггер, которым смоук срывает пересчёт опоздания.
 *
 * Триггер срабатывает только на записи одного смоук-сотрудника, но и он не
 * должен пережить запуск: удалить дисциплину этого сотрудника он не даст.
 */
async function dropRecountTrap(db: Database): Promise<void> {
  await db.execute(sql`drop trigger if exists smoke_fail_recount on discipline_events`);
  await db.execute(sql`drop function if exists smoke_fail_recount()`);
}

/**
 * Удаляет данные предыдущего запуска.
 *
 * Порядок обязателен и сам по себе показателен: `audit_log`, `order_photos`,
 * `order_comments` и `purchases` ссылаются на сотрудников с
 * `onDelete: 'restrict'`, поэтому удалить сотрудника, не убрав их, база
 * не даст — ровно как и задумано для рабочей эксплуатации, где сотрудников
 * деактивируют, а не удаляют.
 */
async function cleanup(db: Database): Promise<void> {
  // Ловушка проверки «пересчёт упал»: если прошлый запуск оборвался, она мешала бы удалить дисциплину.
  await dropRecountTrap(db);

  /*
    Уведомления о смоук-сотрудниках, ушедшие НАСТОЯЩИМ людям: руководству —
    «SMOKE Опоздает просит опоздать…», «SMOKE Швея просит выходные…»,
    «SMOKE Продавец: сегодня 2 из 3…». По получателю и заказу их не найти —
    получатель живой, заказа нет, — и каждый запуск оставлял в демо-ленте
    десятки таких строк. Имя смоук-сотрудника начинается с PREFIX, а
    уведомление о нём — с имени, отсюда и признак.
  */
  await db
    .delete(notifications)
    .where(or(like(notifications.title, `${PREFIX}%`), like(notifications.body, `${PREFIX}%`)));

  const smokeOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(like(orders.clientName, `${PREFIX}%`));
  const orderIds = smokeOrders.map((row) => row.id);

  const smokeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.fullName, `${PREFIX}%`));
  const userIds = smokeUsers.map((row) => row.id);

  if (orderIds.length > 0) {
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    // Инкассации, выплаты и прочие проводки смоука — по их авторам, до удаления людей.
    await db
      .delete(payments)
      .where(
        inArray(
          payments.receivedBy,
          db.select({ id: users.id }).from(users).where(like(users.fullName, `${PREFIX}%`)),
        ),
      );
    await db.delete(purchases).where(inArray(purchases.orderId, orderIds));
    await db.delete(orderPhotos).where(inArray(orderPhotos.orderId, orderIds));
    await db.delete(orderComments).where(inArray(orderComments.orderId, orderIds));
    await db.delete(notifications).where(inArray(notifications.relatedOrderId, orderIds));
    await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  if (userIds.length > 0) {
    // audit_log и ссылки для ТВ — restrict: без явного удаления сотрудника не убрать.
    await db.delete(auditLog).where(inArray(auditLog.actorId, userIds));
    await db.delete(displayLinks).where(inArray(displayLinks.createdBy, userIds));
    await db.delete(workPlans).where(or(inArray(workPlans.userId, userIds), inArray(workPlans.createdBy, userIds)));
    await db.delete(notifications).where(inArray(notifications.userId, userIds));
    await db.delete(boardPhotos).where(or(inArray(boardPhotos.userId, userIds), inArray(boardPhotos.uploadedBy, userIds)));
    await db.delete(payrollRecords).where(inArray(payrollRecords.userId, userIds));
    await db.delete(payrollSchemes).where(inArray(payrollSchemes.userId, userIds));
    // Коды склада ссылаются на автора — удаляются раньше пользователей.
    await db.delete(catalogItems).where(like(catalogItems.name, `${PREFIX}%`));
    await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds));
    // Отгулы ссылаются и на просившего, и на решившего — оба restrict.
    await db
      .delete(dayOffRequests)
      .where(or(inArray(dayOffRequests.userId, userIds), inArray(dayOffRequests.reviewedBy, userIds)));
    // Факты опоздания — на сотрудника и на простившего руководителя, restrict.
    await db
      .delete(lateCheckIns)
      .where(or(inArray(lateCheckIns.userId, userIds), inArray(lateCheckIns.forgivenBy, userIds)));
    // Запросы на опоздание и записи дисциплины (опоздание при отметке) — тоже restrict.
    await db
      .delete(lateRequests)
      .where(or(inArray(lateRequests.userId, userIds), inArray(lateRequests.reviewedBy, userIds)));
    await db
      .delete(disciplineEvents)
      .where(or(inArray(disciplineEvents.userId, userIds), inArray(disciplineEvents.recordedBy, userIds)));
    await db.delete(shifts).where(inArray(shifts.userId, userIds));
    await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await db.delete(userBranches).where(inArray(userBranches.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }

  await db.delete(branches).where(like(branches.name, `${PREFIX}%`));
}

async function run(db: Database): Promise<void> {
  /* ---------------------- 1. Схема и констрейнты ------------------------ */

  const [branch] = await db
    .insert(branches)
    .values({ name: `${PREFIX} Цех`, latitude: 41.2995, longitude: 69.2401, radiusMeters: 100 })
    .returning();

  if (branch === undefined) throw new Error('филиал не создан');
  check('branches: вставка', branch.radiusMeters === 100);

  await expectRejected('branches: check на радиус отбивает 5 м', () =>
    db
      .insert(branches)
      .values({ name: `${PREFIX} Плохой`, latitude: 0, longitude: 0, radiusMeters: 5 }),
  );

  const passwordHash = await hashPassword(SMOKE_PASSWORD);

  const makeUser = async (name: string, role: RoleName, phone: string) => {
    const [row] = await db
      .insert(users)
      .values({ fullName: `${PREFIX} ${name}`, phone, passwordHash, hiredAt: '2024-01-15' })
      .returning();

    if (row === undefined) throw new Error(`сотрудник ${name} не создан`);

    await db.insert(userRoles).values({ userId: row.id, role, grantedBy: row.id });
    await db.insert(userBranches).values({ userId: row.id, branchId: branch.id, isPrimary: true });

    return row;
  };

  const seller = await makeUser('Продавец', Role.SELLER, '+998900000101');
  const master = await makeUser('Мастер', Role.MASTER, '+998900000102');
  const sewer = await makeUser('Швея', Role.SEWER, '+998900000103');
  const qc = await makeUser('Контролёр', Role.QC, '+998900000104');
  const installer = await makeUser('Установщик', Role.INSTALLER, '+998900000105');
  const admin = await makeUser('Админ', Role.ADMIN, '+998900000106');
  const corniceMan = await makeUser('Карнизчик', Role.CORNICE_INSTALLER, '+998900000107');

  check('users: создание с ролями и филиалом', true);

  await expectRejected('users: check на формат телефона отбивает "12345"', () =>
    db.insert(users).values({ fullName: `${PREFIX} Плохой`, phone: '12345', passwordHash }),
  );

  await expectRejected('users: уникальный индекс отбивает дубль телефона', () =>
    db
      .insert(users)
      .values({ fullName: `${PREFIX} Дубль`, phone: '+998900000101', passwordHash }),
  );

  /* ------------------- 2. Вычисляемые колонки заказа --------------------- */

  const [order] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Клиент`,
      clientPhone: '+998901112233',
      createdBy: seller.id,
      workPrice: '5000000.00',
      deadline: '2026-12-31',
      // Сдельные расценки: их получат исполнители этапов, когда заказ закроют.
      measurementFee: '100000.00',
      sewingFee: '400000.00',
      qcFee: '50000.00',
      installationFee: '250000.00',
    })
    .returning();

  if (order === undefined) throw new Error('заказ не создан');

  check(
    'orders: order_number вычисляется базой',
    order.orderNumber !== null && order.orderNumber.startsWith('DH-'),
    order.orderNumber ?? 'null',
  );
  // «Оплачено» у заказа поднимает база от проводки: приложение колонку не пишет.
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.ORDER_DEPOSIT,
    method: PaymentMethod.CASH,
    amount: parseMoney('2000000'),
    orderId: order.id,
    actorId: seller.id,
  });
  const [orderAfterDeposit] = await db.select().from(orders).where(eq(orders.id, order.id));
  check(
    'ledger: проводка по заказу поднимает paid_amount и remaining_payment триггером',
    orderAfterDeposit?.paidAmount === '2000000.00' && orderAfterDeposit.remainingPayment === '3000000.00',
    `оплачено ${orderAfterDeposit?.paidAmount ?? 'null'}, остаток ${orderAfterDeposit?.remainingPayment ?? 'null'}`,
  );
  await expectRejected('ledger: база не даёт вернуть больше, чем оплачено', () =>
    post(db, {
      branchId: branch.id,
      kind: PaymentKind.REFUND,
      method: PaymentMethod.CASH,
      amount: parseMoney('2000001'),
      orderId: order.id,
      actorId: admin.id,
    }),
  );
  await expectRejected('ledger: выплата без расчёта отклоняется базой', () =>
    post(db, {
      branchId: branch.id,
      kind: PaymentKind.PAYROLL,
      method: PaymentMethod.CASH,
      amount: parseMoney('1'),
      actorId: admin.id,
    }),
  );

  await expectRejected('orders: check не даёт отменить заказ без причины', () =>
    db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id)),
  );

  /*
    Отрицательная расценка означала бы удержание с исполнителя за то, что он
    выполнил этап. Удержания в системе появятся, но это другая сущность —
    сюда они не должны просачиваться через минус в поле формы.
  */
  await expectRejected('orders: check не даёт отрицательную расценку этапа', () =>
    db.update(orders).set({ sewingFee: '-1.00' }).where(eq(orders.id, order.id)),
  );

  await db.insert(orderItems).values({
    orderId: order.id,
    model: 'Прямые',
    materials: ['Блэкаут', 'Тюль'],
    materialOptions: ['Матовый'],
    widthCm: '150.0',
    heightCm: '200.0',
    areaM2: '3.0000',
  });

  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  check(
    'order_items: массив text[] сохраняется и читается',
    item?.materials.length === 2 && item.materials[0] === 'Блэкаут',
    item?.materials.join(', ') ?? 'null',
  );

  /* ---------------- 3. Жизненный цикл заказа через сервис ---------------- */

  const actorOf = async (id: number): Promise<AuthenticatedUser> => {
    const user = await loadAuthenticatedUser(db, id);
    if (user === null) throw new Error(`сотрудник ${id.toString()} не загрузился`);
    return user;
  };

  const adminActor = await actorOf(admin.id);
  const sellerActor = await actorOf(seller.id);
  const masterActor = await actorOf(master.id);
  const sewerActor = await actorOf(sewer.id);
  const qcActor = await actorOf(qc.id);
  const installerActor = await actorOf(installer.id);

  check('context: роли и филиалы читаются', adminActor.roles.includes(Role.ADMIN));

  const move = async (
    toStatus: (typeof OrderStatus)[keyof typeof OrderStatus],
    actor: AuthenticatedUser,
    comment?: string,
  ): Promise<void> => {
    await db.transaction(async (tx) => {
      await changeOrderStatus(tx, {
        orderId: order.id,
        toStatus,
        actor,
        comment: comment ?? null,
      });
    });
  };

  await move(OrderStatus.PENDING_ADMIN_REVIEW, sellerActor);

  await db.transaction(async (tx) => {
    await assignExecutor(tx, {
      orderId: order.id,
      role: 'master',
      assigneeId: master.id,
      actor: adminActor,
    });
  });
  await move(OrderStatus.MEASUREMENT_ASSIGNED, adminActor);

  await expectRejected('workflow: нелегальный переход отбивается', () =>
    move(OrderStatus.COMPLETED, adminActor),
  );

  await expectRejected('workflow: чужой сотрудник не двигает заказ', () =>
    move(OrderStatus.MEASUREMENT_DONE, sewerActor),
  );

  /*
   * Регрессия 27.08.2026: проверка доступа шла ПОСЛЕ разбора перехода, и
   * посторонний сотрудник, перебирая `id`, получал 409 с названием статуса и
   * номером чужого заказа. Сама мутация не проходила — утекало чтение.
   * Поэтому проверяем не факт отказа, а его текст: с прежним поведением
   * обычный `expectRejected` прошёл бы и с утечкой.
   */
  await expectRejectedWith(
    'workflow: отказ постороннему не выдаёт статус и номер чужого заказа',
    () => move(OrderStatus.COMPLETED, sewerActor),
    (message) =>
      message.includes('не участвуете') &&
      !message.includes(ORDER_STATUS_LABELS_RU[OrderStatus.MEASUREMENT_ASSIGNED]) &&
      !message.includes(order.orderNumber ?? ' '),
  );

  await move(OrderStatus.MEASUREMENT_DONE, masterActor);
  await move(OrderStatus.PENDING_SEWING_ASSIGNMENT, masterActor);

  await expectRejected('workflow: статус без обязательного исполнителя отбивается', () =>
    move(OrderStatus.SEWING_IN_PROGRESS, adminActor),
  );

  await db.transaction(async (tx) => {
    await assignExecutor(tx, {
      orderId: order.id,
      role: 'sewer',
      assigneeId: sewer.id,
      actor: adminActor,
    });
  });

  await move(OrderStatus.SEWING_IN_PROGRESS, sewerActor);
  await move(OrderStatus.SEWING_DONE, sewerActor);
  await move(OrderStatus.PENDING_QC, sewerActor);

  await expectRejected('workflow: отклонение без причины отбивается', () =>
    move(OrderStatus.QC_FAILED, qcActor),
  );

  await move(OrderStatus.QC_FAILED, qcActor, 'Кривой шов по нижнему краю');

  const [afterFail] = await db.select().from(orders).where(eq(orders.id, order.id));
  check('workflow: ОТК записан автоматически при браке', afterFail?.qcId === qc.id);

  await move(OrderStatus.SEWING_IN_PROGRESS, qcActor, 'На переделку');
  await move(OrderStatus.SEWING_DONE, sewerActor);
  await move(OrderStatus.PENDING_QC, sewerActor);
  await move(OrderStatus.QC_PASSED, qcActor);
  await move(OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, qcActor);

  await db.transaction(async (tx) => {
    await assignExecutor(tx, {
      orderId: order.id,
      role: 'installer',
      assigneeId: installer.id,
      actor: adminActor,
    });
  });

  /*
   * Сбор на выезд: пока установщик не отметил по листу всё, что везёт,
   * «Установка идёт» отбивается — забытый держатель это второй выезд.
   */
  await expectRejectedWith(
    'workflow: без сборки на выезд установка не начинается',
    () =>
      db.transaction(async (tx) => {
        await changeOrderStatus(tx, {
          orderId: order.id,
          toStatus: OrderStatus.INSTALLATION_ASSIGNED,
          actor: adminActor,
        });
        await changeOrderStatus(tx, {
          orderId: order.id,
          toStatus: OrderStatus.INSTALLATION_IN_PROGRESS,
          actor: adminActor,
        });
      }),
    (message) => message.includes('соберитесь на выезд'),
  );

  for (const row of await loadPackList(db, order.id)) {
    await db
      .insert(orderPackChecks)
      .values({ orderId: order.id, key: row.key, checkedBy: installer.id });
  }

  /*
   * Два перехода ОДНОЙ транзакцией — это не украшение сценария, а условие
   * проверки порядка истории ниже: только так обе записи получают одинаковый
   * `created_at` (в PostgreSQL `now()` — время начала транзакции). Сценарий
   * при этом житейский: админ назначает установщика и сразу отмечает выезд.
   */
  await db.transaction(async (tx) => {
    await changeOrderStatus(tx, {
      orderId: order.id,
      toStatus: OrderStatus.INSTALLATION_ASSIGNED,
      actor: adminActor,
    });
    await changeOrderStatus(tx, {
      orderId: order.id,
      toStatus: OrderStatus.INSTALLATION_IN_PROGRESS,
      actor: adminActor,
    });
  });

  /*
   * Регрессия 27.08.2026: `systemInitiated` снимал не только проверку роли,
   * но и проверку исполнителя, хотя комментарий рядом обещал только первое.
   * Участник заказа с ролью установщика мог закрыть ЧУЖУЮ установку, а
   * закрытие заказа влияет на расчёт зарплаты. Здесь роль у актора есть,
   * а установка закреплена за другим — системный переход обязан быть отбит.
   */
  await expectRejectedWith(
    'workflow: системный переход не отменяет проверку исполнителя',
    () =>
      db.transaction(async (tx) => {
        await changeOrderStatus(tx, {
          orderId: order.id,
          toStatus: OrderStatus.INSTALLATION_DONE,
          actor: masterActor,
          systemInitiated: true,
        });
      }),
    (message) => message.includes('закреплён за другим сотрудником'),
  );

  await move(OrderStatus.INSTALLATION_DONE, installerActor);
  // С долгом заказ не закрывается: сначала остаток, потом «Закрыть заказ».
  await expectRejectedWith(
    'долг: заказ с остатком не закрывается',
    () => move(OrderStatus.COMPLETED, adminActor),
    (message) => message.startsWith('Остаток 3') && message.endsWith('сначала примите оплату'),
  );
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.ORDER_BALANCE,
    method: PaymentMethod.CASH,
    amount: parseMoney('3000000'),
    orderId: order.id,
    actorId: admin.id,
  });
  await move(OrderStatus.COMPLETED, adminActor);

  const [finished] = await db.select().from(orders).where(eq(orders.id, order.id));
  check('workflow: заказ дошёл до completed', finished?.status === OrderStatus.COMPLETED);
  check('workflow: completed_at проставлен', finished?.completedAt !== null);

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id));

  /*
   * Регрессия 27.08.2026: сортировка шла только по `created_at`, а это
   * `now()` — время НАЧАЛА транзакции. Записи одной транзакции делят метку,
   * и порядок между ними был не определён.
   *
   * Проверяем не сам порядок id — по нему список и отсортирован, такая
   * проверка была бы тавтологией, — а СМЫСЛОВУЮ связность: у каждой записи
   * `from_status` обязан совпадать с `to_status` предыдущей. Именно это
   * читает человек, разбирающий спор с клиентом, и именно это разваливается,
   * если убрать второй ключ сортировки: пара «назначен установщик» и
   * «установка идёт» из одной транзакции встанет в обратном порядке.
   */
  const isContinuous = (rows: typeof history): boolean =>
    rows.every((entry, index) => index === 0 || entry.fromStatus === rows[index - 1]?.toStatus);

  const sameStampPairs = history.filter(
    (entry, index) =>
      index > 0 && entry.createdAt.getTime() === history[index - 1]?.createdAt.getTime(),
  ).length;

  /*
   * Второй ключ проверяем от противного.
   *
   * Просто прочитать историю и убедиться, что она связна, недостаточно:
   * без второго ключа PostgreSQL чаще всего всё равно отдаёт строки в порядке
   * вставки, и такая проверка проходит даже со сломанной сортировкой —
   * я это проверил, временно убрав ключ. Поэтому читаем ещё раз с ОБРАТНЫМ
   * вторым ключом: если он ни на что не влияет, цепочка останется связной,
   * и значит проверка ничего не доказывает. Разрыв здесь — доказательство,
   * что ключ несущий, а связность выше — что направление выбрано верно.
   */
  const reversedTiebreak = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(asc(orderStatusHistory.createdAt), desc(orderStatusHistory.id));

  check(
    'history: цепочка переходов связна при верной сортировке',
    sameStampPairs > 0 && isContinuous(history),
    `пар с одинаковой меткой: ${sameStampPairs.toString()}`,
  );

  check(
    'history: второй ключ сортировки несущий, а не декоративный',
    !isContinuous(reversedTiebreak),
    'с обратным ключом цепочка рвётся — значит порядок задаёт именно он',
  );

  check(
    'history: все переходы записаны',
    history.length >= 14,
    `${history.length.toString()} записей`,
  );
  check(
    'history: у отклонения сохранена причина',
    history.some((entry) => entry.toStatus === OrderStatus.QC_FAILED && entry.comment !== null),
  );

  /* ------------------ 3a. Готовые шторы: продажа мимо цеха --------------- */

  /*
   * Таблица переходов — чистая функция, и то, что у готовых штор есть свои
   * два перехода, уже проверено юнит-тестом. Здесь проверяется другое, чего
   * без базы не проверить: `changeOrderStatus` читает `order_type` ИЗ СТРОКИ
   * заказа (`SELECT ... FOR UPDATE`), а не получает его аргументом, — и
   * значит короткая дорога открывается ровно тем заказам, у которых этот тип
   * действительно записан, а не тем, кому его приписал вызывающий код.
   *
   * Обратная половина проверки важнее прямой: у колонки `order_type`
   * умолчание `custom`, и обычный пошив обязан упереться в те же переходы
   * как в несуществующие. Пока это держится только на умолчании колонки,
   * ошибка в миграции открыла бы цеху дорогу в обход всех этапов молча.
   */
  const makeReadyMadeOrder = async (suffix: string, phone: string) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} Готовые ${suffix}`,
        clientPhone: phone,
        createdBy: seller.id,
        orderType: OrderType.READY_MADE,
        workPrice: '900000.00',
      })
      .returning();

    if (row === undefined) throw new Error(`заказ готовых штор (${suffix}) не создан`);
    return row;
  };

  const readyDirect = await makeReadyMadeOrder('прямая', '+998901112244');
  check(
    'ready_made: тип заказа сохранён в базе',
    readyDirect.orderType === OrderType.READY_MADE,
    readyDirect.orderType,
  );

  // Без установки готовые шторы уходят только оплаченными целиком.
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.READY_MADE,
    method: PaymentMethod.CASH,
    amount: parseMoney('900000'),
    orderId: readyDirect.id,
    actorId: admin.id,
  });
  await db.transaction(async (tx) => {
    await changeOrderStatus(tx, {
      orderId: readyDirect.id,
      toStatus: OrderStatus.COMPLETED,
      actor: sellerActor,
      comment: 'Продано без установки',
    });
  });

  const [soldDirect] = await db.select().from(orders).where(eq(orders.id, readyDirect.id));
  check(
    'ready_made: продажа без установки закрывает заказ сразу',
    soldDirect?.status === OrderStatus.COMPLETED,
    soldDirect?.status ?? 'null',
  );
  check('ready_made: completed_at проставлен', soldDirect?.completedAt != null);

  const readyHistory = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, readyDirect.id));

  check(
    'ready_made: скачок мимо цеха записан в историю',
    readyHistory.some(
      (entry) => entry.fromStatus === OrderStatus.NEW && entry.toStatus === OrderStatus.COMPLETED,
    ),
    `${readyHistory.length.toString()} записей`,
  );

  const readyInstall = await makeReadyMadeOrder('с установкой', '+998901112255');

  // Карниз к готовым шторам: продажа минует проверку админом, и карниз
  // должен уйти карнизчикам на первом же переходе — иначе о нём не узнают.
  await db.insert(orderItems).values({
    orderId: readyInstall.id,
    position: 0,
    kind: OrderItemKind.OTHER,
    quantity: 1,
    cornice: { code: 'К-104', meters: null, description: 'Круглый металл' },
    plastic: { code: 'ПЛ-12', meters: null, description: null },
  });

  await db.transaction(async (tx) => {
    await changeOrderStatus(tx, {
      orderId: readyInstall.id,
      toStatus: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
      actor: sellerActor,
      comment: 'Продано, требуется установка',
    });
  });

  const [sentToInstall] = await db.select().from(orders).where(eq(orders.id, readyInstall.id));
  check(
    'ready_made: продажа с установкой уходит на назначение установщика',
    sentToInstall?.status === OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    sentToInstall?.status ?? 'null',
  );
  check(
    'ready_made: карниз к продаже уходит карнизчикам',
    sentToInstall?.corniceStatus === CorniceStatus.PENDING,
    sentToInstall?.corniceStatus ?? 'null',
  );

  const [customDraft] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Пошив без обхода`,
      clientPhone: '+998901112266',
      createdBy: seller.id,
    })
    .returning();

  if (customDraft === undefined) throw new Error('заказ пошива не создан');

  check(
    'ready_made: у заказа без явного типа умолчание — пошив',
    customDraft.orderType === OrderType.CUSTOM,
    customDraft.orderType,
  );

  await expectRejectedWith(
    'ready_made: пошиву переход «Новый → Выполнен» недоступен',
    () =>
      db.transaction(async (tx) => {
        await changeOrderStatus(tx, {
          orderId: customDraft.id,
          toStatus: OrderStatus.COMPLETED,
          actor: adminActor,
        });
      }),
    (message) => message.includes('нельзя перейти'),
  );

  await expectRejectedWith(
    'ready_made: пошив не перепрыгивает цех к установке',
    () =>
      db.transaction(async (tx) => {
        await changeOrderStatus(tx, {
          orderId: customDraft.id,
          toStatus: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
          actor: adminActor,
        });
      }),
    (message) => message.includes('нельзя перейти'),
  );

  /* --------------------------- 4. Смены ---------------------------------- */

  const now = new Date();
  const shiftStart = new Date(now.getTime() - 8 * 60 * 60 * 1000);

  await db.insert(shifts).values({
    userId: sewer.id,
    branchId: branch.id,
    startedAt: shiftStart,
    startLatitude: 41.2995,
    startLongitude: 69.2401,
    startDistanceMeters: 12,
  });

  await expectRejected('shifts: частичный индекс не даёт две открытые смены', () =>
    db.insert(shifts).values({ userId: sewer.id, branchId: branch.id, startedAt: now }),
  );

  await db
    .update(shifts)
    .set({ endedAt: now })
    .where(and(eq(shifts.userId, sewer.id), isNull(shifts.endedAt)));

  const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const bounds = periodBounds(period);

  const hours = await calculateWorkedHours(db, sewer.id, bounds);
  check(
    'shifts: часы считаются оконным выражением',
    hours > 7 && hours < 9,
    `${hours.toString()} ч`,
  );

  /* ------------- 4a. Сессии: обнаружение кражи refresh-токена ------------- */

  /**
   * Регрессия. Раньше отзыв сессий выполнялся ВНУТРИ транзакции, а следом
   * бросалось исключение — и `throw` откатывал отзыв. В логе SQL `UPDATE`
   * был виден, поэтому по логу дефект не читался: украденный токен
   * оставался рабочим. Проверяем не текст ответа, а факт смерти сессий.
   */
  const openSession = async (): Promise<string> => {
    const result = await login(db, { phone: sewer.phone, password: SMOKE_PASSWORD });
    return result.refreshToken;
  };

  const sessionA = await openSession();
  const sessionB = await openSession();

  await refreshSession(db, sessionA, null);

  const reuseRejected = await refreshSession(db, sessionA, null).then(
    () => false,
    () => true,
  );
  check('сессии: повторное предъявление отозванного токена отбивается', reuseRejected);

  const parallelDead = await refreshSession(db, sessionB, null).then(
    () => false,
    () => true,
  );
  check(
    'сессии: обнаружение кражи ГАСИТ параллельные сессии, а не только сообщает',
    parallelDead,
  );

  /* ---------------------- 5. Кадровая аналитика -------------------------- */

  const summary = await staffSummary(db);
  check(
    'staff: сводка (count filter)',
    summary.total >= 6,
    `всего ${summary.total.toString()}, активных ${summary.active.toString()}`,
  );

  const distributions = await staffDistributions(db);
  check(
    'staff: разрезы по подразделениям и стажу',
    distributions.byDepartment.length === 7 && distributions.byTenure.length === 5,
  );

  const attendance = await attendanceByDay(db, bounds);
  check('staff: посещаемость по дням (date_trunc)', attendance.length >= 1);

  const presence = await presenceToday(db);
  check('staff: присутствие (bool_or)', presence instanceof Map);

  /* --------------------------- 6. Зарплата ------------------------------- */

  const completed = await calculateCompletedOrders(db, seller.id, Role.SELLER, bounds);
  check(
    'payroll: закрытые заказы продавца',
    completed.count >= 1,
    `${completed.count.toString()} заказ(ов)`,
  );

  const inputs = await gatherPayrollInputs(db, sewer.id, Role.SEWER, period);
  check('payroll: исходные данные собраны', inputs.workedHours > 0);

  /*
    Сдельная расценка за этап попадает в зарплату исполнителю этого этапа —
    швея получает `sewing_fee` заказа, который сама и шила. Проверяем именно
    привязку: суммировать все расценки заказа каждому исполнителю — ошибка,
    которая обнаружилась бы только при выплате.
  */
  check(
    'payroll: расценка за пошив засчитана швее',
    inputs.stageFeesAmount === parseMoney('400000'),
    moneyToDecimalString(inputs.stageFeesAmount),
  );

  const sellerInputs = await gatherPayrollInputs(db, seller.id, Role.SELLER, period);
  check(
    'payroll: продавцу сдельные за этапы не начисляются',
    sellerInputs.stageFeesAmount === 0,
    moneyToDecimalString(sellerInputs.stageFeesAmount),
  );

  /* ------------------ 6a. Рейтинг: балл за задачу, а не за заказ ---------- */

  /*
    Швея сдала пошив, а заказ ещё не закрыт — установки не было. Раньше балл
    шёл только за `completed`, и до установки у неё стоял ноль.
  */
  const [sewnOpen] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Пошив сдан, не закрыт`,
      clientPhone: '+998901112277',
      createdBy: seller.id,
      status: OrderStatus.SEWING_DONE,
      sewerId: sewer.id,
      sewingFee: '150000.00',
    })
    .returning();
  if (sewnOpen === undefined) throw new Error('заказ со сданным пошивом не создан');
  await db.insert(orderStatusHistory).values({
    orderId: sewnOpen.id,
    fromStatus: OrderStatus.SEWING_IN_PROGRESS,
    toStatus: OrderStatus.SEWING_DONE,
    changedBy: sewer.id,
  });

  const [sewerRating] = await employeeRating(
    db,
    [{ id: sewer.id, fullName: sewer.fullName, avatarStorageKey: null, roles: [Role.SEWER] }],
    bounds,
  );
  const sewerEntry = sewerRating?.byRole.find((entry) => entry.role === Role.SEWER);
  const sewerTasks = sewerEntry?.ordersCount ?? 0;
  // Швее балл — за комплект (позиция × количество), без карты категорий — по
  // единице: заказов не меньше двух, комплектов не меньше, чем заказов.
  const sewerPieces = sewerEntry?.piecesCount ?? 0;
  check(
    'rating: сданный пошив идёт в балл до закрытия заказа, за каждый комплект',
    sewerTasks >= 2 && sewerPieces >= sewerTasks && sewerRating?.score === sewerPieces,
    `заказов ${sewerTasks.toString()}, комплектов ${sewerPieces.toString()}, балл ${String(sewerRating?.score ?? null)}`,
  );

  // Карнизчику — один балл за заказ («заказ (резка) = 1 балл»), сколько бы
  // карнизов в нём ни было: позиция с карнизом на три окна (quantity 3) плюс
  // позиция с трубой — это всё равно один заказ.
  await db.insert(orderItems).values([
    {
      orderId: sewnOpen.id,
      position: 0,
      kind: OrderItemKind.OTHER,
      quantity: 3,
      cornice: { code: 'К-1', meters: null, description: null },
    },
    {
      orderId: sewnOpen.id,
      position: 1,
      kind: OrderItemKind.OTHER,
      quantity: 1,
      pipe: { code: 'Т-1', meters: null, description: null },
    },
  ]);
  await db
    .update(orders)
    .set({
      corniceStatus: CorniceStatus.DONE,
      corniceInstallerId: corniceMan.id,
      corniceDoneAt: new Date(),
    })
    .where(eq(orders.id, sewnOpen.id));
  const [corniceRating] = await employeeRating(
    db,
    [{ id: corniceMan.id, fullName: corniceMan.fullName, avatarStorageKey: null, roles: [Role.CORNICE_INSTALLER] }],
    bounds,
  );
  const corniceOrders = corniceRating?.byRole.find((entry) => entry.role === Role.CORNICE_INSTALLER)?.ordersCount ?? 0;
  check(
    'rating: карнизчику один балл за заказ, сколько бы карнизов в нём ни было',
    corniceOrders === 1 && corniceRating?.score === 1,
    `заказов ${corniceOrders.toString()}, балл ${String(corniceRating?.score ?? null)}`,
  );

  // И в зарплату: сдельная за сданный пошив — в месяц сдачи, не закрытия.
  const sewerInputsAfter = await gatherPayrollInputs(db, sewer.id, Role.SEWER, period);
  check(
    'payroll: сдельная за сданный пошив начисляется до закрытия заказа',
    sewerInputsAfter.stageFeesAmount === parseMoney('550000'),
    moneyToDecimalString(sewerInputsAfter.stageFeesAmount),
  );

  /* ---------------- 6a. Склад: импорт файла с ценой и единицей ------------ */

  // Через роутер, как с панели: файл с ценой заводит коды с ценой, а повторный
  // файл дополняет описание и цену, не трогая то, чего в нём нет.
  const caller = createCallerFactory(appRouter)({
    db,
    user: adminActor,
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });
  const imported = await caller.catalog.importItems({
    items: [
      { kind: 'portiere_code', name: `${PREFIX} П-1`, description: 'Тёмная', price: 150000, unit: 'm' },
      { kind: 'portiere_code', name: `${PREFIX} П-1`, description: 'дубль в файле' },
      { kind: 'cornice_code', name: `${PREFIX} К-1`, description: null },
    ],
  });
  // Выведенный код возвращается в работу, если пришёл в новом файле.
  await db
    .update(catalogItems)
    .set({ isActive: false })
    .where(and(eq(catalogItems.kind, 'cornice_code'), like(catalogItems.name, `${PREFIX}%`)));
  const reimported = await caller.catalog.importItems({
    items: [
      { kind: 'portiere_code', name: `${PREFIX} п-1`, description: null, price: 175000 },
      { kind: 'cornice_code', name: `${PREFIX} К-1`, description: 'Круглый', unit: 'pcs' },
    ],
  });
  const importedRows = await db
    .select({
      name: catalogItems.name,
      description: catalogItems.description,
      price: catalogItems.price,
      unit: catalogItems.unit,
      isActive: catalogItems.isActive,
    })
    .from(catalogItems)
    .where(like(catalogItems.name, `${PREFIX}%`));
  const p1 = importedRows.find((row) => row.name.endsWith('П-1'));
  const k1 = importedRows.find((row) => row.name.endsWith('К-1'));
  check(
    'склад: импорт заводит коды с ценой, повтор дополняет и не стирает',
    imported.created === 2 &&
      reimported.created === 0 &&
      reimported.updated === 2 &&
      p1?.description === 'Тёмная' &&
      p1.price === '175000.00' &&
      p1.unit === 'm' &&
      k1?.description === 'Круглый' &&
      k1.unit === 'pcs' &&
      k1.isActive,
    `создано ${imported.created.toString()}, обновлено ${reimported.updated.toString()}, П-1 ${p1?.price ?? 'null'}/${p1?.unit ?? 'null'}`,
  );

  /* ---------------- 6b. Ежедневный расчёт: запись не замирает ------------- */

  /*
    Директор платит по дням: выдал за сданное сегодня, завтра сдали ещё.
    Запись, уже утверждённая и даже выплаченная целиком, должна принять
    новое начисление — переоткрыться с остатком, а не замереть.
  */
  await db.insert(payrollSchemes).values({
    userId: sewer.id,
    role: Role.SEWER,
    type: PayrollSchemeType.PIECE_RATE,
    effectiveFrom: '2020-01-01',
    createdBy: admin.id,
  });
  const firstDraft = await calculateForUserRole(db, sewer.id, Role.SEWER, period);
  await saveDraft(db, firstDraft);
  await db
    .update(payrollRecords)
    .set({
      status: PayrollRecordStatus.PAID,
      paidAmount: moneyToDecimalString(firstDraft.calculation.amount),
      approvedBy: admin.id,
      approvedAt: new Date(),
      paidAt: new Date(),
    })
    .where(and(eq(payrollRecords.userId, sewer.id), eq(payrollRecords.role, Role.SEWER)));

  await db
    .update(orders)
    .set({ sewingFee: '250000.00' })
    .where(eq(orders.id, sewnOpen.id));
  const secondDraft = await calculateForUserRole(db, sewer.id, Role.SEWER, period);
  const reopened = await saveDraft(db, secondDraft);
  const [record] = await db
    .select()
    .from(payrollRecords)
    .where(and(eq(payrollRecords.userId, sewer.id), eq(payrollRecords.role, Role.SEWER)));
  check(
    'payroll: выплаченная запись переоткрывается новым начислением с остатком',
    reopened &&
      record?.status === PayrollRecordStatus.APPROVED &&
      parseMoney(record.calculatedAmount) - parseMoney(record.paidAmount) === parseMoney('100000'),
    `${record?.status ?? 'null'}, остаток ${
      record === undefined
        ? '—'
        : moneyToDecimalString(parseMoney(record.calculatedAmount) - parseMoney(record.paidAmount))
    }`,
  );

  // За день: сданное сегодня считается сегодняшним днём — тем, что директор
  // выдаёт вечером; ставки те же, что за месяц, границы — сутки.
  const dayStart = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const dayCalc = await calculateForDay(db, sewer.id, Role.SEWER, {
    start: dayStart,
    end: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
  });
  check(
    'payroll: начисление за день складывается из сданного за сутки',
    dayCalc !== null &&
      dayCalc.inputs.stageFeesAmount === parseMoney(secondDraft.snapshot.inputs.stageFeesAmount ?? '0') &&
      dayCalc.calculation.amount === secondDraft.calculation.amount,
    `за день ${moneyToDecimalString(dayCalc?.calculation.amount ?? 0)}, за месяц ${moneyToDecimalString(secondDraft.calculation.amount)}`,
  );

  // Неделя выплат через роутер: сегодняшний день видно с итогом и расчётом,
  // выплата по дню закрывает его, второй раз тот же день не выплатить.
  const todayTashkent = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const mondayDate = new Date(`${todayTashkent}T00:00:00Z`);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - ((mondayDate.getUTCDay() + 6) % 7));
  const weekStart = mondayDate.toISOString().slice(0, 10);
  const weekBefore = await caller.payroll.week({ userId: sewer.id, role: Role.SEWER, weekStart });
  const todayCell = weekBefore.days.find((entry) => entry.day === todayTashkent);
  await caller.payroll.markPaid({
    id: record?.id ?? 0,
    days: [{ day: todayTashkent, amount: parseMoney(todayCell?.total ?? '0') / 100 }],
  });
  const weekAfter = await caller.payroll.week({ userId: sewer.id, role: Role.SEWER, weekStart });
  const paidCell = weekAfter.days.find((entry) => entry.day === todayTashkent);
  const secondPay = await caller.payroll
    .markPaid({ id: record?.id ?? 0, days: [{ day: todayTashkent, amount: 1 }] })
    .then(() => 'ok')
    .catch((error: unknown) => (error instanceof TRPCError ? error.code : 'other'));
  check(
    'payroll: неделя выплат — день выплачивается один раз и помечается',
    todayCell?.recordId === record?.id &&
      todayCell?.total === moneyToDecimalString(secondDraft.calculation.amount) &&
      paidCell?.paid === todayCell?.total &&
      secondPay === 'CONFLICT',
    `день ${todayCell?.total ?? 'null'}, выплачено ${paidCell?.paid ?? 'null'}, повтор ${secondPay}`,
  );

  /* ---------------------------- 6c. Касса -------------------------------- */

  /*
    Продавец принял предоплату у ящика — сразу в кассе. Установщик принял
    остаток наличными у двери — на руках, пока директор не отметил сдачу.
    Карта сдачи не требует. Отчёт дня должен разложить это по способам.
  */
  const [cashOrder] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Касса`,
      clientPhone: '+998901112288',
      createdBy: seller.id,
      workPrice: '1000000.00',
      installerId: installer.id,
    })
    .returning();
  if (cashOrder === undefined) throw new Error('заказ для кассы не создан');

  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.ORDER_DEPOSIT,
    method: PaymentMethod.CASH,
    amount: parseMoney('300000'),
    orderId: cashOrder.id,
    actorId: seller.id,
  });
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.ORDER_BALANCE,
    method: PaymentMethod.CASH,
    amount: parseMoney('500000'),
    orderId: cashOrder.id,
    actorId: installer.id,
  });
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.ORDER_BALANCE,
    method: PaymentMethod.CARD,
    amount: parseMoney('200000'),
    orderId: cashOrder.id,
    actorId: installer.id,
  });

  // Установщик сдал 400 000 из 500 000 наличных — инкассация: проводка в ту же книгу.
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.COLLECTION,
    method: PaymentMethod.CASH,
    amount: parseMoney('400000'),
    actorId: installer.id,
  });
  // Руководство вернуло клиенту 50 000 наличными — из кассы, «оплачено» уменьшилось.
  await post(db, {
    branchId: branch.id,
    kind: PaymentKind.REFUND,
    method: PaymentMethod.CASH,
    amount: parseMoney('50000'),
    orderId: cashOrder.id,
    actorId: admin.id,
  });

  const today = new Date();
  const cashRange = {
    from: new Date(today.getTime() - 60 * 60 * 1000),
    to: new Date(today.getTime() + 60 * 60 * 1000),
  };
  const cash = await dayReport(db, cashRange, branch.id, [admin.id]);
  const depositRow = cash.rows.find((row) => row.kind === PaymentKind.ORDER_DEPOSIT);
  const balanceRow = cash.rows.find((row) => row.kind === PaymentKind.ORDER_BALANCE);
  check(
    'касса: приходы разложены по источнику и способу, оплата картой в норму терминальных чеков не идёт',
    depositRow?.byMethod.cash === parseMoney('2300000') &&
      // 500 000 по этому заказу + 3 000 000 остатка заказа из раздела 2,
      // принятые руководством перед закрытием.
      balanceRow?.byMethod.cash === parseMoney('3500000') &&
      balanceRow.byMethod.card === parseMoney('200000') &&
      // 1 000 000 по этому заказу + 5 000 000 заказа из раздела 2 (2 000 000
      // первой оплаты и 3 000 000 остатка) + 900 000 продажи готовых штор.
      cash.total === parseMoney('6900000') &&
      // Касса и терминал разведены: приход по карте — не чек, чеком его делает
      // только отдельная запись (см. ниже), так что здесь их ноль.
      cash.terminalChecks === 0 &&
      cash.out.refunds === parseMoney('50000') &&
      cash.collected === parseMoney('400000'),
    `итого ${moneyToDecimalString(cash.total)}, чеков ${cash.terminalChecks.toString()}, возвратов ${moneyToDecimalString(cash.out.refunds)}`,
  );
  const installerCash = await onHands(db, installer.id);
  const sellerCash = await onHands(db, seller.id);
  check(
    'касса: на руках — принятые наличные минус инкассация',
    // У продавца ещё 2 000 000 первой оплаты из раздела 2 — тоже наличными на руках.
    installerCash === parseMoney('100000') && sellerCash === parseMoney('2300000'),
    `установщик ${moneyToDecimalString(installerCash)}, продавец ${moneyToDecimalString(sellerCash)}`,
  );
  const cashPaid = await orderPaid(db, cashOrder.id);
  const [cashOrderRow] = await db.select().from(orders).where(eq(orders.id, cashOrder.id));
  check(
    'ledger: «оплачено» = приходы − возврат, и в заказе, и в книге',
    cashPaid === parseMoney('950000') && cashOrderRow?.paidAmount === '950000.00',
    `книга ${moneyToDecimalString(cashPaid)}, заказ ${cashOrderRow?.paidAmount ?? 'null'}`,
  );
  // Касса и счёт — накопленным итогом на конец дня: на базе с историей в них
  // и чужие дни, поэтому сверяются слагаемые и то, что сегодняшнее попало.
  const till = await balance(db, { at: cashRange.to, branchId: branch.id, managementIds: [admin.id] });
  check(
    'касса: в кассе — сдано и принято руководством минус закупки и возвраты (зарплата — отдельно); на счёте — безнал',
    till.cash.collected >= parseMoney('400000') &&
      till.cash.refunds >= parseMoney('50000') &&
      // Выплаты зарплаты из кассы не вычитаются: владелец ведёт их отдельным учётом.
      till.cash.total === till.cash.collected + till.cash.byManagement - till.cash.purchases - till.cash.refunds &&
      till.cashless.card >= parseMoney('200000') &&
      till.cashless.total === till.cashless.card + till.cashless.qr + till.cashless.click,
    `в кассе ${moneyToDecimalString(till.cash.total)}, на счёте ${moneyToDecimalString(till.cashless.total)}`,
  );

  // Терминальный чек — фото к приходу по карте, а не второй приход: установщик
  // принял 200 000 картой по заказу, продавец пробил чек с фото на этот приход —
  // норма дня растёт на ноль, деньги не удваиваются. Чек без прихода — новый приход.
  // Без открытой смены сервер действий по работе не принимает — открываем обоим.
  await db.insert(shifts).values([
    { userId: seller.id, branchId: branch.id, startedAt: new Date(), startLatitude: 41.2995, startLongitude: 69.2401, startDistanceMeters: 5 },
    { userId: installer.id, branchId: branch.id, startedAt: new Date(), startLatitude: 41.2995, startLongitude: 69.2401, startDistanceMeters: 5 },
  ]);
  const installerCaller = createCallerFactory(appRouter)({
    db,
    user: installerActor,
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });
  const sellerCaller = createCallerFactory(appRouter)({
    db,
    user: sellerActor,
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });
  const pixel = {
    mimeType: 'image/png',
    content:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  };
  const beforeStandalone = await terminalChecksToday(db, null);
  await sellerCaller.terminalChecks.create({ photo: pixel, amount: 150000, comment: 'чек без заказа', payType: TerminalPayType.PAYME });
  const afterStandalone = await terminalChecksToday(db, null);
  const cardRowsAfter = await installerCaller.payments.byOrder({ orderId: cashOrder.id });
  /* Чек не должен добавить прочий приход по карте — проверяем напрямую по книге. */
  const [cardOther] = await db.execute(
    sql`select coalesce(sum(amount), 0)::text as amount from payments
        where kind = 'other' and method = 'card' and photo_key is not null`,
  );
  const cardOtherAmount = typeof cardOther?.['amount'] === 'string' ? cardOther['amount'] : '0';
  check(
    'ledger: терминальный чек — своя запись, в кассу и на счёт не идёт',
    afterStandalone === beforeStandalone + 1 &&
      cardRowsAfter.filter((row) => row.photoUrl !== null).length === 0 &&
      Number.parseFloat(cardOtherAmount) === 0,
    `чеков ${beforeStandalone.toString()} → ${afterStandalone.toString()}, приходов по карте с фото на ${cardOtherAmount}`,
  );

  /* ------------------ 6d. Фото сотрудника: превью для табло --------------- */

  const avatarKeys = async (userId: number) => {
    const [row] = await db
      .select({ original: users.avatarStorageKey, preview: users.avatarPreviewKey })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? { original: null, preview: null };
  };
  await caller.users.setAvatar({ userId: sewer.id, file: pixel });
  const withPreview = await avatarKeys(sewer.id);
  check(
    'фото: к оригиналу сохраняется превью',
    withPreview.original !== null && withPreview.preview !== null,
    JSON.stringify(withPreview),
  );
  // Сервер проверяет только заявленный тип: мусор под видом PNG раньше
  // сохранялся как есть, и превью не должно делать такую загрузку ошибкой.
  await caller.users.setAvatar({
    userId: sewer.id,
    file: { mimeType: 'image/png', content: Buffer.from('not an image').toString('base64') },
  });
  const broken = await avatarKeys(sewer.id);
  check(
    'фото: нечитаемый файл сохранён без превью',
    broken.original !== null && broken.preview === null,
    JSON.stringify(broken),
  );
  await caller.users.setAvatar({ userId: sewer.id, file: pixel });
  await caller.users.removeAvatar({ userId: sewer.id });
  const removed = await avatarKeys(sewer.id);
  check('фото: удаление снимает и оригинал, и превью', removed.original === null && removed.preview === null);

  /* ---------------------------- 7. Отчёты -------------------------------- */

  const [revenue] = await db
    .select({
      count: sql<string>`count(*)`,
      revenue: sql<string>`coalesce(sum(${orders.workPrice}), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.status, OrderStatus.COMPLETED), like(orders.clientName, `${PREFIX}%`)));

  check('reports: агрегат выручки', Number.parseInt(revenue?.count ?? '0', 10) >= 1);

  const performance = await db
    .select({
      userId: users.id,
      asSeller: sql<string>`count(*) filter (where ${orders.createdBy} = ${users.id})`,
    })
    .from(users)
    .innerJoin(
      orders,
      and(
        eq(orders.status, OrderStatus.COMPLETED),
        sql`${users.id} in (${orders.createdBy}, ${orders.masterId}, ${orders.sewerId}, ${orders.qcId}, ${orders.installerId})`,
      ),
    )
    .where(like(users.fullName, `${PREFIX}%`))
    .groupBy(users.id);

  check(
    'reports: выработка сотрудников (filter + in)',
    performance.length >= 1,
    `${performance.length.toString()} строк`,
  );

  /* ----------------------------- 8. Табло -------------------------------- */

  const [otherBranch] = await db
    .insert(branches)
    .values({ name: `${PREFIX} Второй цех`, latitude: 41.3, longitude: 69.25, radiusMeters: 100 })
    .returning();
  if (otherBranch === undefined) throw new Error('второй филиал не создан');

  const manager = await makeUser('Менеджер', Role.MANAGER, '+998900000120');
  const sewerA = await makeUser('Швея с заказом', Role.SEWER, '+998900000121');
  const sewerB = await makeUser('Швея ушла', Role.SEWER, '+998900000122');
  const sewerC = await makeUser('Швея другого цеха', Role.SEWER, '+998900000123');
  await db.delete(userBranches).where(eq(userBranches.userId, sewerC.id));
  await db.insert(userBranches).values({ userId: sewerC.id, branchId: otherBranch.id, isPrimary: true });
  const both = await makeUser('Установщик-карнизчик', Role.INSTALLER, '+998900000124');
  await db.insert(userRoles).values({ userId: both.id, role: Role.CORNICE_INSTALLER, grantedBy: both.id });

  const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);
  const point = { startLatitude: 41.2995, startLongitude: 69.2401, startDistanceMeters: 5 };
  const closedStart = new Date(Math.max(workshopPeriodStarts(new Date()).today.getTime(), hoursAgo(2).getTime()));
  const closedEnd = new Date((closedStart.getTime() + Date.now()) / 2);
  await db.insert(shifts).values([
    { userId: sewerA.id, branchId: branch.id, startedAt: hoursAgo(1), ...point },
    // Смена сегодняшняя по Ташкенту, даже если смоук запущен сразу после
    // полуночи: вчерашняя закрытая смена на табло — уже «нет отметки».
    { userId: sewerB.id, branchId: branch.id, startedAt: closedStart, endedAt: closedEnd, ...point },
    { userId: both.id, branchId: branch.id, startedAt: hoursAgo(2), ...point },
  ]);

  const [sewingNow] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Табло: шьётся`,
      clientPhone: '+998901112291',
      createdBy: seller.id,
      status: OrderStatus.SEWING_IN_PROGRESS,
      sewerId: sewerA.id,
    })
    .returning();
  if (sewingNow === undefined) throw new Error('заказ в пошиве не создан');
  await db.insert(orderItems).values([
    { orderId: sewingNow.id, position: 0, kind: OrderItemKind.WINDOW, quantity: 1 },
    { orderId: sewingNow.id, position: 1, kind: OrderItemKind.WINDOW, quantity: 1 },
  ]);
  await db.insert(orderStatusHistory).values({
    orderId: sewingNow.id,
    fromStatus: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    toStatus: OrderStatus.SEWING_IN_PROGRESS,
    changedBy: admin.id,
  });

  // Человеку с двумя ролями сегодня засчитаны установка и карниз — разными заказами.
  const [installedToday] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Табло: установлено`,
      clientPhone: '+998901112292',
      createdBy: seller.id,
      status: OrderStatus.INSTALLATION_DONE,
      installerId: both.id,
    })
    .returning();
  if (installedToday === undefined) throw new Error('установленный заказ не создан');
  await db.insert(orderStatusHistory).values({
    orderId: installedToday.id,
    fromStatus: OrderStatus.INSTALLATION_IN_PROGRESS,
    toStatus: OrderStatus.INSTALLATION_DONE,
    changedBy: both.id,
  });
  await db.insert(orders).values({
    branchId: branch.id,
    clientName: `${PREFIX} Табло: карниз`,
    clientPhone: '+998901112293',
    createdBy: seller.id,
    status: OrderStatus.SEWING_IN_PROGRESS,
    corniceStatus: CorniceStatus.DONE,
    corniceInstallerId: both.id,
    corniceDoneAt: new Date(),
  });

  // Карниз взят час назад, а сам заказ в пошиве третьи сутки: «в работе» — от взятия карниза.
  const [corniceNow] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Табло: карниз в работе`,
      clientPhone: '+998901112294',
      createdBy: seller.id,
      status: OrderStatus.SEWING_IN_PROGRESS,
      corniceStatus: CorniceStatus.IN_PROGRESS,
      corniceInstallerId: both.id,
    })
    .returning();
  if (corniceNow === undefined) throw new Error('заказ с карнизом в работе не создан');
  await db.insert(orderStatusHistory).values({
    orderId: corniceNow.id,
    fromStatus: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    toStatus: OrderStatus.SEWING_IN_PROGRESS,
    changedBy: admin.id,
    createdAt: hoursAgo(72),
  });
  await db.insert(auditLog).values({
    actorId: both.id,
    action: 'order.cornice_taken',
    entityType: 'order',
    entityId: corniceNow.id,
    createdAt: hoursAgo(1),
  });

  // Установка того же человека в другом филиале: в выработку табло филиала она не идёт.
  const [installedElsewhere] = await db
    .insert(orders)
    .values({
      branchId: otherBranch.id,
      clientName: `${PREFIX} Табло: установлено в другом филиале`,
      clientPhone: '+998901112295',
      createdBy: seller.id,
      status: OrderStatus.INSTALLATION_DONE,
      installerId: both.id,
    })
    .returning();
  if (installedElsewhere === undefined) throw new Error('установка в другом филиале не создана');
  await db.insert(orderStatusHistory).values({
    orderId: installedElsewhere.id,
    fromStatus: OrderStatus.INSTALLATION_IN_PROGRESS,
    toStatus: OrderStatus.INSTALLATION_DONE,
    changedBy: both.id,
  });

  const managerCaller = createCallerFactory(appRouter)({
    db,
    user: await actorOf(manager.id),
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });
  const sewerCaller = createCallerFactory(appRouter)({
    db,
    user: sewerActor,
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });

  const workshopStarted = Date.now();
  const workshopBoard = await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP, branchId: branch.id });
  const workshopMs = Date.now() - workshopStarted;
  const personA = workshopBoard.people.find((person) => person.userId === sewerA.id);
  check(
    'табло: швея с заказом — работает, заказ и состав',
    personA?.status === LiveStatus.WORKING && personA.current[0]?.items.text === 'Окно ×2',
    `${String(personA?.status)} / ${String(personA?.current[0]?.items.text)} · снимок ${workshopMs.toString()} мс`,
  );
  const personB = workshopBoard.people.find((person) => person.userId === sewerB.id);
  check('табло: закрытая смена — смена закрыта', personB?.status === LiveStatus.FINISHED, String(personB?.status));
  check(
    'табло: швея другого филиала не видна',
    !workshopBoard.people.some((person) => person.userId === sewerC.id),
  );

  const installationBoard = await managerCaller.monitor.board({
    group: MonitorGroup.INSTALLATION,
    branchId: branch.id,
  });
  const bothCards = installationBoard.people.filter((person) => person.userId === both.id);
  check(
    'табло: две роли — одна карточка, выработка сложена',
    bothCards.length === 1 && bothCards[0]?.counts.today === 2,
    `карточек ${bothCards.length.toString()}, сегодня ${String(bothCards[0]?.counts.today)}`,
  );
  const corniceWork = bothCards[0]?.current.find((work) => work.orderId === corniceNow.id);
  const corniceHours = corniceWork?.since == null ? null : (Date.now() - corniceWork.since.getTime()) / 3_600_000;
  check(
    'табло: карниз в работе — время от взятия карниза, а не от статуса заказа',
    corniceHours !== null && corniceHours > 0.5 && corniceHours < 2,
    corniceHours === null ? 'нет времени' : `${corniceHours.toFixed(1)} ч`,
  );
  const allBranches = await managerCaller.monitor.board({ group: MonitorGroup.INSTALLATION });
  check(
    'табло: установка в другом филиале не идёт в выработку филиала, но видна на общем табло',
    bothCards[0]?.counts.today === 2 &&
      allBranches.people.find((person) => person.userId === both.id)?.counts.today === 3,
    `филиал ${String(bothCards[0]?.counts.today)}, все ${String(allBranches.people.find((person) => person.userId === both.id)?.counts.today)}`,
  );
  const bothDetail = await managerCaller.monitor.person({ userId: both.id, branchId: branch.id });
  check(
    'табло: панель человека с филиалом — те же цифры и место, что на карточке',
    bothDetail.counts.today === bothCards[0]?.counts.today &&
      bothDetail.place === bothCards[0]?.place &&
      bothDetail.daily[29]?.value === bothCards[0]?.counts.today,
    `панель ${bothDetail.counts.today.toString()}/${String(bothDetail.daily[29]?.value)}, карточка ${String(bothCards[0]?.counts.today)}`,
  );
  await expectRejected('табло: швее закрыто', () =>
    sewerCaller.monitor.board({ group: MonitorGroup.WORKSHOP }),
  );

  const detail = await managerCaller.monitor.person({ userId: sewerA.id });
  check(
    'табло: карточка человека — 30 дней, сегодня последним',
    detail.daily.length === 30 && detail.daily[29]?.value === detail.counts.today,
    `${detail.daily.length.toString()} дней`,
  );
  check(
    'табло: карточка человека — смена сегодня',
    detail.shiftToday !== null && detail.shiftToday.endedAt === null,
  );
  await expectRejectedWith(
    'табло: продавца на табло нет',
    () => managerCaller.monitor.person({ userId: seller.id }),
    (message) => message === 'Сотрудника нет на табло',
  );

  /* ---------------------- 8a. Табло для ТВ по ссылке ---------------------- */

  const ceo = await makeUser('Директор', Role.CEO, '+998900000125');
  const ceoCaller = createCallerFactory(appRouter)({
    db,
    user: await actorOf(ceo.id),
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });
  const tvCaller = createCallerFactory(appRouter)({
    db,
    user: null,
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'ru',
  });

  const tvLink = await ceoCaller.displayLinks.create({
    label: 'ТВ в цеху',
    branchId: branch.id,
    showWorkshop: true,
    showInstallation: false,
    locale: 'ru',
  });
  // Фото без превью: руководство видит оригинал, на публичный ТВ он не уходит —
  // в оригинале с телефона метаданные (место съёмки) и мегабайты веса.
  await db
    .update(users)
    .set({ avatarStorageKey: `avatars/${sewerA.id.toString()}/smoke-original.jpg`, avatarPreviewKey: null })
    .where(eq(users.id, sewerA.id));
  const withOriginal = await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP, branchId: branch.id });
  const tvBoard = await tvCaller.display.board({ token: tvLink.token, group: MonitorGroup.WORKSHOP });
  check(
    'ТВ: фото без превью — на ТВ нет, у руководства оригинал',
    withOriginal.people.find((person) => person.userId === sewerA.id)?.photoUrl != null &&
      tvBoard.people.find((person) => person.fullName === sewerA.fullName)?.photoUrl === null,
  );
  const tvJson = JSON.stringify(tvBoard);
  check(
    'ТВ: по ссылке видно цех своего филиала',
    tvBoard.people.some((person) => person.fullName === sewerA.fullName) &&
      !tvBoard.people.some((person) => person.fullName === sewerC.fullName),
    `людей ${tvBoard.people.length.toString()}`,
  );
  check(
    'ТВ: номер заказа есть, клиента и id заказа нет',
    tvBoard.people.find((person) => person.fullName === sewerA.fullName)?.current[0]?.orderNumber ===
      sewingNow.orderNumber &&
      !tvJson.includes(`${PREFIX} Табло`) &&
      !tvJson.includes('"orderId"'),
  );
  await expectRejectedWith(
    'ТВ: выключенная группа закрыта',
    () => tvCaller.display.board({ token: tvLink.token, group: MonitorGroup.INSTALLATION }),
    (message) => message === 'Эта группа на ссылке не показывается',
  );
  await expectRejectedWith(
    'ТВ: чужой токен не подходит',
    () => tvCaller.display.board({ token: `${tvLink.token.slice(0, -4)}AAAA`, group: MonitorGroup.WORKSHOP }),
    (message) => message === 'Ссылка недействительна',
  );
  // 404, а не 401: на 401 панель обновляет токен и выходит из сессии, и руководитель,
  // открывший отозванную ссылку у себя в браузере, вылетел бы из панели.
  const unknownCode = await tvCaller.display
    .board({ token: `${tvLink.token.slice(0, -4)}AAAA`, group: MonitorGroup.WORKSHOP })
    .then(
      () => null,
      (error: unknown) => (error instanceof TRPCError ? error.code : String(error)),
    );
  check('ТВ: неизвестная ссылка — NOT_FOUND, а не UNAUTHORIZED', unknownCode === 'NOT_FOUND', String(unknownCode));
  await ceoCaller.displayLinks.revoke({ id: tvLink.id });
  await expectRejectedWith(
    'ТВ: отозванная ссылка гаснет',
    () => tvCaller.display.board({ token: tvLink.token, group: MonitorGroup.WORKSHOP }),
    (message) => message === 'Ссылка недействительна',
  );

  /* ------------------------ 8b. Номер машинки ---------------------------- */

  await ceoCaller.users.update({ id: sewer.id, workstation: 3 });
  const withWorkstation = await ceoCaller.users.byId({ id: sewer.id });
  check('машинка: номер сохраняется и отдаётся в карточке', withWorkstation.workstation === 3, String(withWorkstation.workstation));
  await expectRejected('машинка: 0 отбивается проверкой входа', () =>
    ceoCaller.users.update({ id: sewer.id, workstation: 0 }),
  );
  await expectRejected('машинка: 100 отбивается проверкой входа', () =>
    ceoCaller.users.update({ id: sewer.id, workstation: 100 }),
  );
  await expectRejectedWith(
    'машинка: check-ограничение отбивает 100 мимо API',
    () => db.execute(sql`update users set workstation = 100 where id = ${sewer.id}`),
    (message) => message.includes('users_workstation_range'),
  );

  /* ------------------------- 8c. План на месяц --------------------------- */

  // Месяц далеко впереди: норма роли общая на всех, и смоук не должен
  // переписать настоящую норму текущего месяца в базе разработчика.
  const planMonth = '2098-03';
  const sewerPlans = async () =>
    (await ceoCaller.monitor.plans.list({ month: planMonth })).roles.find((entry) => entry.role === Role.SEWER);
  const planOf = async (userId: number) =>
    (await sewerPlans())?.people.find((person) => person.userId === userId)?.plan ?? null;

  // Дважды в один месяц: вторая запись обновляет строку нормы (user_id null).
  await ceoCaller.monitor.plans.setRoleNorm({ role: Role.SEWER, month: planMonth, target: 35 });
  await ceoCaller.monitor.plans.setRoleNorm({ role: Role.SEWER, month: planMonth, target: 40 });
  const normPlans = await sewerPlans();
  check(
    'план: норма роли достаётся всем швеям смоука',
    normPlans?.norm?.target === 40 &&
      [sewer.id, sewerA.id, sewerB.id, sewerC.id].every((id) => {
        const plan = normPlans.people.find((person) => person.userId === id)?.plan;
        return plan?.target === 40 && plan.source === 'role';
      }),
    JSON.stringify(normPlans?.norm),
  );
  await ceoCaller.monitor.plans.setPersonal({ userId: sewerA.id, role: Role.SEWER, month: planMonth, target: 55 });
  const personalPlan = await planOf(sewerA.id);
  check(
    'план: личный план важнее нормы',
    personalPlan?.target === 55 && personalPlan.source === 'personal',
    JSON.stringify(personalPlan),
  );
  await ceoCaller.monitor.plans.setPersonal({ userId: sewerA.id, role: Role.SEWER, month: planMonth, target: null });
  const backToNorm = await planOf(sewerA.id);
  check(
    'план: личный null с того же месяца — снова норма',
    backToNorm?.target === 40 && backToNorm.source === 'role',
    JSON.stringify(backToNorm),
  );
  const [planAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.actorId, ceo.id), eq(auditLog.action, 'work_plan.personal_set')))
    .orderBy(desc(auditLog.id))
    .limit(1);
  check('план: правка личного плана в журнале', JSON.stringify(planAudit?.details ?? null).includes('"to":null'));
  await expectRejectedWith(
    'план: личный план по роли, которой у человека нет',
    () => ceoCaller.monitor.plans.setPersonal({ userId: sewerA.id, role: Role.INSTALLER, month: planMonth, target: 10 }),
    (message) => message === 'У сотрудника нет этой роли',
  );
  await expectRejected('план: менеджеру планы закрыты', () => managerCaller.monitor.plans.list({ month: planMonth }));
  const planRow = { role: Role.SEWER, userId: sewerA.id, target: 10, createdBy: ceo.id };
  await expectRejectedWith(
    'план: check отбивает не первое число месяца',
    () => db.insert(workPlans).values({ ...planRow, effectiveFrom: '2098-04-15' }),
    (message) => message.includes('work_plans_effective_from_first_day'),
  );
  await expectRejectedWith(
    'план: check отбивает нулевой план',
    () => db.insert(workPlans).values({ ...planRow, effectiveFrom: '2098-04-01', target: 0 }),
    (message) => message.includes('work_plans_target_positive'),
  );
  await expectRejectedWith(
    'план: норма роли без цели отбита',
    () => db.insert(workPlans).values({ ...planRow, userId: null, effectiveFrom: '2098-04-01', target: null }),
    (message) => message.includes('work_plans_norm_has_target'),
  );

  /* ------------------ 8d. «Рабочие»: план из work_plans ------------------- */

  // Личный план — только у одной швеи и только её строкой: норму текущего
  // месяца смоук не трогает, вторая швея получает ту, что действует в базе.
  const planToday = workshopToday();
  const currentMonth = `${planToday.year.toString()}-${planToday.month.toString().padStart(2, '0')}`;
  await ceoCaller.monitor.plans.setPersonal({ userId: sewer.id, role: Role.SEWER, month: currentMonth, target: 77 });
  const currentNorm =
    (await ceoCaller.monitor.plans.list({ month: currentMonth })).roles.find((entry) => entry.role === Role.SEWER)
      ?.norm?.target ?? null;
  const performanceRows = await ceoCaller.users.performance({
    year: planToday.year,
    month: planToday.month,
    userIds: [sewer.id, sewerB.id],
  });
  const performanceOf = (userId: number) => performanceRows.find((row) => row.userId === userId);
  check(
    'рабочие: у каждой швеи свой план — личный или норма роли',
    performanceOf(sewer.id)?.plan === 77 && performanceOf(sewerB.id)?.plan === currentNorm,
    `личный ${String(performanceOf(sewer.id)?.plan)}, норма ${String(performanceOf(sewerB.id)?.plan)} (ждали ${String(currentNorm)})`,
  );
  const sewerOnBoard = (await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP })).people.find(
    (person) => person.userId === sewer.id,
  );
  check(
    'рабочие: «сделано» швеи совпадает с выработкой месяца на табло',
    sewerOnBoard !== undefined && performanceOf(sewer.id)?.completed === sewerOnBoard.counts.month,
    `рабочие ${String(performanceOf(sewer.id)?.completed)}, табло ${String(sewerOnBoard?.counts.month)}`,
  );

  /* ------------------- 8e. План и машинка в снимке табло ----------------- */

  await ceoCaller.monitor.plans.setPersonal({ userId: sewerA.id, role: Role.SEWER, month: currentMonth, target: 55 });
  const workshopNow = await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP });
  const sewerACard = workshopNow.people.find((person) => person.userId === sewerA.id);
  check(
    'табло: процент личного плана швеи',
    sewerACard?.plan?.target === 55 &&
      sewerACard.plan.source === 'personal' &&
      sewerACard.plan.percent === planPercent(sewerACard.counts.month, 55),
    JSON.stringify(sewerACard?.plan ?? null),
  );
  check(
    'табло: машинка швеи на карточке',
    workshopNow.people.find((person) => person.userId === sewer.id)?.workstation === 3,
  );
  // Две роли: план — сумма планов ролей. Личные строки, а не нормы: нормы
  // текущего месяца общие, и смоук не должен их переписывать.
  await ceoCaller.monitor.plans.setPersonal({ userId: both.id, role: Role.INSTALLER, month: currentMonth, target: 10 });
  await ceoCaller.monitor.plans.setPersonal({
    userId: both.id,
    role: Role.CORNICE_INSTALLER,
    month: currentMonth,
    target: 6,
  });
  const bothPlan = async () =>
    (await managerCaller.monitor.board({ group: MonitorGroup.INSTALLATION })).people.find(
      (person) => person.userId === both.id,
    )?.plan ?? null;
  const summed = await bothPlan();
  check('табло: две роли — план суммой', summed?.target === 16, JSON.stringify(summed));
  await ceoCaller.monitor.plans.setPersonal({
    userId: both.id,
    role: Role.CORNICE_INSTALLER,
    month: currentMonth,
    target: null,
  });
  const corniceNorm =
    (await ceoCaller.monitor.plans.list({ month: currentMonth })).roles.find(
      (entry) => entry.role === Role.CORNICE_INSTALLER,
    )?.norm?.target ?? 0;
  const afterReset = await bothPlan();
  check(
    'табло: без плана карнизчика остаётся план установщика',
    afterReset?.target === 10 + corniceNorm,
    `${JSON.stringify(afterReset)}, норма карнизчика ${corniceNorm.toString()}`,
  );

  /* -------------------- 8f. Дата и время установки ----------------------- */

  const makeInstallOrder = async (label: string, status: OrderStatus, installerId: number | null) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} ${label}`,
        clientPhone: '+998901112292',
        createdBy: seller.id,
        status,
        installerId,
        installAddress: 'ул. Смоука, 1',
      })
      .returning();
    if (row === undefined) throw new Error(`заказ «${label}» не создан`);
    return row;
  };
  const installationAtOf = async (orderId: number) =>
    (await db.select({ at: orders.installationAt }).from(orders).where(eq(orders.id, orderId)))[0]?.at ?? null;
  const scheduleNotes = (orderId: number) =>
    db
      .select({ type: notifications.type, title: notifications.title })
      .from(notifications)
      .where(and(eq(notifications.userId, installer.id), eq(notifications.relatedOrderId, orderId)));
  // Послезавтра в 10:30 по Ташкенту.
  const slotAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  slotAt.setUTCHours(5, 30, 0, 0);

  const scheduled = await makeInstallOrder('Установка по времени', OrderStatus.INSTALLATION_ASSIGNED, installer.id);
  await ceoCaller.orders.scheduleInstallation({ orderId: scheduled.id, at: slotAt });
  check('установка: время записано', (await installationAtOf(scheduled.id))?.getTime() === slotAt.getTime());
  const [scheduleAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'order.installation_scheduled'), eq(auditLog.entityId, scheduled.id)));
  const scheduleDetails = JSON.stringify(scheduleAudit?.details ?? null);
  check(
    'установка: в журнале «было» и «стало»',
    scheduleDetails.includes('"from":null') && scheduleDetails.includes(slotAt.toISOString()),
    scheduleDetails,
  );
  const scheduledNotes = (await scheduleNotes(scheduled.id)).filter(
    (note) => note.type === NotificationType.INSTALLATION_SCHEDULED,
  );
  check(
    'установка: установщику одно уведомление со временем по Ташкенту',
    scheduledNotes.length === 1 && scheduledNotes[0]?.title.endsWith('в 10:30') === true,
    JSON.stringify(scheduledNotes),
  );

  const unassigned = await makeInstallOrder('Установка без установщика', OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, null);
  await ceoCaller.orders.scheduleInstallation({ orderId: unassigned.id, at: slotAt });
  const unassignedNotes = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.relatedOrderId, unassigned.id));
  check(
    'установка: без установщика время пишется, уведомлений нет',
    (await installationAtOf(unassigned.id))?.getTime() === slotAt.getTime() && unassignedNotes.length === 0,
    `уведомлений ${unassignedNotes.length.toString()}`,
  );

  await ceoCaller.orders.scheduleInstallation({ orderId: scheduled.id, at: null });
  check('установка: null убирает время', (await installationAtOf(scheduled.id)) === null);
  await expectRejectedWith(
    'установка: в пошиве время не меняется',
    () => ceoCaller.orders.scheduleInstallation({ orderId: sewingNow.id, at: slotAt }),
    (message) => message === 'Время установки меняется до выезда',
  );
  await expectRejectedWith(
    'установка: двое суток назад — отказ',
    () => ceoCaller.orders.scheduleInstallation({ orderId: scheduled.id, at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }),
    (message) => message === 'Время установки — не раньше вчерашнего дня',
  );
  await expectRejected('установка: швее процедура закрыта', () =>
    sewerCaller.orders.scheduleInstallation({ orderId: scheduled.id, at: slotAt }),
  );

  const viaStatus = await makeInstallOrder('Установка с переходом', OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, null);
  await ceoCaller.orders.changeStatus({
    id: viaStatus.id,
    toStatus: OrderStatus.INSTALLATION_ASSIGNED,
    assigneeId: installer.id,
    installationAt: slotAt,
  });
  const viaTypes = (await scheduleNotes(viaStatus.id)).map((note) => note.type);
  check(
    'установка: переход с временем — назначение, время и оба уведомления',
    (await installationAtOf(viaStatus.id))?.getTime() === slotAt.getTime() &&
      viaTypes.includes(NotificationType.ORDER_ASSIGNED) &&
      viaTypes.includes(NotificationType.INSTALLATION_SCHEDULED),
    viaTypes.join(', '),
  );

  const viaBatch = await makeInstallOrder('Установка пачкой', OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, null);
  const batch = await ceoCaller.orders.changeStatusBatch({
    ids: [viaBatch.id],
    toStatus: OrderStatus.INSTALLATION_ASSIGNED,
    assigneeId: installer.id,
    installationAt: slotAt,
  });
  check(
    'установка: массовый переход тоже ставит время',
    batch.succeeded === 1 && (await installationAtOf(viaBatch.id))?.getTime() === slotAt.getTime(),
    JSON.stringify(batch.results),
  );

  /* ------------------- 8g. «Установки сегодня» на табло ------------------ */

  const slotDayStart = workshopPeriodStarts(new Date()).today;
  const minutesAfterDayStart = (minutes: number): Date => new Date(slotDayStart.getTime() + minutes * 60_000);
  const slotOrder = async (label: string, status: OrderStatus, installerId: number, at: Date | null) => {
    const row = await makeInstallOrder(label, status, installerId);
    await db.update(orders).set({ installationAt: at }).where(eq(orders.id, row.id));
    return row;
  };
  // 00:30 по Ташкенту — это 19:30 UTC предыдущего дня: сутки считаются по Ташкенту.
  const afterMidnight = await slotOrder('Слот 00:30', OrderStatus.INSTALLATION_ASSIGNED, installer.id, minutesAfterDayStart(30));
  const lateYesterday = await slotOrder('Слот вчера 23:30', OrderStatus.INSTALLATION_ASSIGNED, installer.id, minutesAfterDayStart(-30));
  const cancelledSlot = await slotOrder('Слот отменён', OrderStatus.INSTALLATION_ASSIGNED, installer.id, minutesAfterDayStart(60));
  await db
    .update(orders)
    .set({ status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Смоук: клиент передумал' })
    .where(eq(orders.id, cancelledSlot.id));
  const onTheWay = await slotOrder('Слот в пути', OrderStatus.INSTALLATION_ASSIGNED, both.id, minutesAfterDayStart(20));
  const doneSlot = await slotOrder('Слот сделан', OrderStatus.INSTALLATION_DONE, installer.id, minutesAfterDayStart(45));
  const [bothShift] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, both.id), isNull(shifts.endedAt)));
  if (bothShift === undefined) throw new Error('открытой смены установщика-карнизчика нет');
  await db.insert(installationTrips).values({
    shiftId: bothShift.id,
    orderId: onTheWay.id,
    startedAt: new Date(Date.now() - 10 * 60_000),
    startLatitude: 41.2995,
    startLongitude: 69.2401,
  });

  const installBoard = await managerCaller.monitor.board({ group: MonitorGroup.INSTALLATION, branchId: branch.id });
  const slots = installBoard.schedule?.slots ?? [];
  const slotOf = (orderId: number) => slots.find((slot) => slot.orderId === orderId);
  check(
    'расписание: 00:30 по Ташкенту — сегодня, вчерашние 23:30 — нет',
    slotOf(afterMidnight.id) !== undefined && slotOf(lateYesterday.id) === undefined,
    slots.map((slot) => slot.orderNumber).join(', '),
  );
  check('расписание: отменённый заказ не в ленте', slotOf(cancelledSlot.id) === undefined);
  check('расписание: открытый выезд по заказу — идёт', slotOf(onTheWay.id)?.state === 'in_progress', String(slotOf(onTheWay.id)?.state));
  check('расписание: выполненная установка — сделано', slotOf(doneSlot.id)?.state === 'done', String(slotOf(doneSlot.id)?.state));
  check(
    'расписание: лента по времени',
    slots.every((slot, index) => index === 0 || (slots[index - 1]?.at.getTime() ?? 0) <= slot.at.getTime()),
  );
  const [unscheduledRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.branchId, branch.id),
        eq(orders.status, OrderStatus.INSTALLATION_ASSIGNED),
        isNull(orders.installationAt),
      ),
    );
  check(
    'расписание: «без времени» — назначенные без времени',
    installBoard.schedule?.unscheduled === unscheduledRow?.count && (unscheduledRow?.count ?? 0) >= 1,
    `табло ${String(installBoard.schedule?.unscheduled)}, база ${String(unscheduledRow?.count)}`,
  );
  check(
    'расписание: у цеха расписания нет',
    (await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP, branchId: branch.id })).schedule === null,
  );
  const installTv = await ceoCaller.displayLinks.create({
    label: `${PREFIX} ТВ установщиков`,
    branchId: branch.id,
    showWorkshop: false,
    showInstallation: true,
  });
  const installTvJson = JSON.stringify(
    await tvCaller.display.board({ token: installTv.token, group: MonitorGroup.INSTALLATION }),
  );
  check('расписание: на ТВ не уходит', !installTvJson.includes('"schedule"') && !installTvJson.includes('Смоука'));

  /* ------------- 8h. Время доходит до установщика при назначении ---------- */

  const timedFirst = await makeInstallOrder('Время до назначения', OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, null);
  await db
    .update(orders)
    .set({ sewingFee: '50000.00', installationFee: '70000.00' })
    .where(eq(orders.id, timedFirst.id));
  await ceoCaller.orders.scheduleInstallation({ orderId: timedFirst.id, at: slotAt });
  await ceoCaller.orders.changeStatus({
    id: timedFirst.id,
    toStatus: OrderStatus.INSTALLATION_ASSIGNED,
    assigneeId: installer.id,
  });
  const timedNotes = (await scheduleNotes(timedFirst.id)).filter(
    (note) => note.type === NotificationType.INSTALLATION_SCHEDULED,
  );
  check(
    'установка: назначенный после времени получает время',
    timedNotes.length === 1 && timedNotes[0]?.title.endsWith('в 10:30') === true,
    JSON.stringify(timedNotes),
  );
  await ceoCaller.orders.assign({ id: timedFirst.id, role: Role.INSTALLER, assigneeId: both.id });
  const reassignedNotes = await db
    .select({ title: notifications.title })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, both.id),
        eq(notifications.relatedOrderId, timedFirst.id),
        eq(notifications.type, NotificationType.INSTALLATION_SCHEDULED),
      ),
    );
  check(
    'установка: новый установщик при переназначении получает время',
    reassignedNotes.length === 1,
    JSON.stringify(reassignedNotes),
  );
  // Мутации заказов идут только при открытой смене.
  await db.insert(shifts).values({ userId: manager.id, branchId: branch.id, startedAt: hoursAgo(1), ...point });
  const managerAssign = await managerCaller.orders.assign({ id: timedFirst.id, role: Role.INSTALLER, assigneeId: both.id });
  check(
    'заказ: менеджеру ответ assign без расценок исполнителей',
    managerAssign.sewingFee === null && managerAssign.installationFee === null,
    `${String(managerAssign.sewingFee)} / ${String(managerAssign.installationFee)}`,
  );

  // Подработка: директор выдал швее роль установщика (вручную — назначение
  // ролей не выдаёт). План в «Рабочих» — по группе её табло (цех), а не сумма
  // штук и заказов.
  await db.insert(userRoles).values({ userId: sewerB.id, role: Role.INSTALLER, grantedBy: sewerB.id });
  await ceoCaller.monitor.plans.setPersonal({ userId: sewerB.id, role: Role.INSTALLER, month: currentMonth, target: 5 });
  const [mixed] = await ceoCaller.users.performance({
    year: planToday.year,
    month: planToday.month,
    userIds: [sewerB.id],
  });
  check(
    'рабочие: у швеи с подработкой установщика — план швеи',
    mixed?.plan === currentNorm,
    `${String(mixed?.plan)} (ждали ${String(currentNorm)})`,
  );

  /* ------------------ 9. Выпуск 3: роли, долги, правка ------------------- */

  const rolesOf = async (userId: number): Promise<string[]> =>
    (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)))
      .map((row) => row.role)
      .sort();

  // Назначение на заказ ролей не выдаёт: продавца установщиком не поставить.
  await expectRejectedWith(
    'роли: назначить продавца установщиком нельзя',
    () => managerCaller.orders.assign({ id: timedFirst.id, role: Role.INSTALLER, assigneeId: seller.id }),
    (message) => message === 'У сотрудника нет роли «Установщик». Роли меняет директор',
  );
  const [awaitingInstaller] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Без роли`,
      clientPhone: '+998901112255',
      createdBy: seller.id,
      workPrice: '100000.00',
      status: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    })
    .returning();
  if (awaitingInstaller === undefined) throw new Error('заказ без роли не создан');
  await expectRejectedWith(
    'роли: и вместе с переходом статуса — тоже',
    () =>
      managerCaller.orders.changeStatus({
        id: awaitingInstaller.id,
        toStatus: OrderStatus.INSTALLATION_ASSIGNED,
        assigneeId: seller.id,
      }),
    (message) => message.startsWith('У сотрудника нет роли «Установщик»'),
  );
  check('роли: у продавца по-прежнему одна роль', (await rolesOf(seller.id)).join() === Role.SELLER);

  // Старая автовыдача: роль и запись журнала остались с прошлых назначений.
  await db.insert(userRoles).values({ userId: seller.id, role: Role.INSTALLER, grantedBy: admin.id });
  await db.insert(auditLog).values({
    actorId: admin.id,
    action: 'user.role_granted',
    entityType: 'user',
    entityId: seller.id,
    details: { role: Role.INSTALLER, viaOrderAssignment: true },
  });
  const autoGranted = await ceoCaller.users.autoGrantedRoles();
  check(
    'роли: директор видит роль, выданную системой',
    autoGranted.some((row) => row.userId === seller.id && row.role === Role.INSTALLER),
    JSON.stringify(autoGranted.map((row) => [row.fullName, row.role])),
  );
  await expectRejected('роли: админ списка автовыдачи не видит', () => caller.users.autoGrantedRoles());
  await ceoCaller.users.revokeRole({ id: seller.id, role: Role.INSTALLER });
  check(
    'роли: снятая роль из списка уходит',
    !(await ceoCaller.users.autoGrantedRoles()).some((row) => row.userId === seller.id),
  );

  // Долг: заказ с остатком не закрывается ни одним путём.
  const makeDebtOrder = async (label: string, status: OrderStatus, price: string, paid: string) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} Долг ${label}`,
        clientPhone: '+998901112266',
        createdBy: seller.id,
        installerId: installer.id,
        status,
        workPrice: price,
        installAddress: 'ул. Смоука, 2',
      })
      .returning();
    if (row === undefined) throw new Error(`заказ «${label}» не создан`);
    if (parseMoney(paid) > 0) {
      await post(db, {
        branchId: branch.id,
        kind: PaymentKind.ORDER_DEPOSIT,
        method: PaymentMethod.CASH,
        amount: parseMoney(paid),
        orderId: row.id,
        actorId: seller.id,
      });
    }
    return row;
  };
  const statusOf = async (orderId: number) =>
    (await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)))[0]?.status;
  const isDebtMessage = (message: string): boolean =>
    message.startsWith('Остаток') && message.endsWith('сначала примите оплату');

  const debtor = await makeDebtOrder('после установки', OrderStatus.INSTALLATION_DONE, '300000.00', '0');
  const settled = await makeDebtOrder('оплачен', OrderStatus.INSTALLATION_DONE, '300000.00', '300000');
  await expectRejectedWith(
    'долг: «Закрыть заказ» с остатком отбивается',
    () => managerCaller.orders.changeStatus({ id: debtor.id, toStatus: OrderStatus.COMPLETED }),
    isDebtMessage,
  );
  const debtTransitions = await managerCaller.orders.availableTransitions({ id: debtor.id });
  const settledTransitions = await managerCaller.orders.availableTransitions({ id: settled.id });
  check(
    'долг: у перехода «Закрыть заказ» причина отказа — только у должника',
    isDebtMessage(debtTransitions.find((t) => t.to === OrderStatus.COMPLETED)?.blockedReason ?? '') &&
      settledTransitions.find((t) => t.to === OrderStatus.COMPLETED)?.blockedReason === null,
    JSON.stringify(debtTransitions.map((t) => [t.to, t.blockedReason])),
  );
  const debtBatch = await managerCaller.orders.changeStatusBatch({
    ids: [debtor.id, settled.id],
    toStatus: OrderStatus.COMPLETED,
  });
  check(
    'долг: массовое закрытие пропускает должника и объясняет почему',
    debtBatch.succeeded === 1 &&
      debtBatch.results.some((r) => r.id === debtor.id && !r.ok && isDebtMessage(r.message ?? '')) &&
      (await statusOf(settled.id)) === OrderStatus.COMPLETED,
    JSON.stringify(debtBatch.results),
  );

  // Фото «после установки» при долге: фото сохранено, заказ ждёт оплаты.
  const photoDebt = await makeDebtOrder('фото', OrderStatus.INSTALLATION_IN_PROGRESS, '400000.00', '100000');
  await installerCaller.orderPhotos.upload({ orderId: photoDebt.id, stage: 'install_after', file: pixel });
  await installerCaller.orderPhotos.upload({ orderId: photoDebt.id, stage: 'install_after', file: pixel });
  const photoRows = await db.select({ id: orderPhotos.id }).from(orderPhotos).where(eq(orderPhotos.orderId, photoDebt.id));
  check(
    'долг: фото после установки при долге — «Установка завершена», фото на месте',
    (await statusOf(photoDebt.id)) === OrderStatus.INSTALLATION_DONE && photoRows.length === 2,
    `${String(await statusOf(photoDebt.id))}, фото ${photoRows.length.toString()}`,
  );

  // Оплата частями: последняя закрывает заказ — даже принятая установщиком.
  await installerCaller.payments.acceptForOrder({ id: photoDebt.id, amount: 100000, method: PaymentMethod.CASH });
  check('долг: частичная оплата статус не меняет', (await statusOf(photoDebt.id)) === OrderStatus.INSTALLATION_DONE);
  await installerCaller.payments.acceptForOrder({ id: photoDebt.id, amount: 200000, method: PaymentMethod.CASH });
  const [settleNote] = await db
    .select({ comment: orderStatusHistory.comment })
    .from(orderStatusHistory)
    .where(and(eq(orderStatusHistory.orderId, photoDebt.id), eq(orderStatusHistory.toStatus, OrderStatus.COMPLETED)));
  check(
    'долг: последний платёж от установщика закрывает заказ',
    (await statusOf(photoDebt.id)) === OrderStatus.COMPLETED &&
      settleNote?.comment === 'Оплата получена полностью — заказ закрыт автоматически',
    `${String(await statusOf(photoDebt.id))}: ${String(settleNote?.comment)}`,
  );

  // Снижение цены до оплаченного закрывает ждущий оплаты заказ — и только его.
  const priceDebt = await makeDebtOrder('цена', OrderStatus.INSTALLATION_DONE, '500000.00', '200000');
  const priceSewing = await makeDebtOrder('цена в пошиве', OrderStatus.SEWING_IN_PROGRESS, '500000.00', '200000');
  await managerCaller.orders.setPrice({ id: priceDebt.id, workPrice: 200000 });
  await managerCaller.orders.setPrice({ id: priceSewing.id, workPrice: 200000 });
  check(
    'долг: цена снижена до оплаченного — заказ после установки закрыт, в пошиве — нет',
    (await statusOf(priceDebt.id)) === OrderStatus.COMPLETED &&
      (await statusOf(priceSewing.id)) === OrderStatus.SEWING_IN_PROGRESS,
  );
  await expectRejectedWith(
    'долг: цену закрытого заказа не изменить',
    () => managerCaller.orders.setPrice({ id: priceDebt.id, workPrice: 100000 }),
    (message) => message === 'Заказ закрыт — правка недоступна',
  );

  // Готовые шторы без установки — только с полной оплатой.
  const readySale = {
    clientName: `${PREFIX} Готовые долг`,
    clientPhone: '+998901112277',
    workPrice: 500000,
    depositMethod: PaymentMethod.CASH,
    items: [{ model: `${PREFIX} Модель`, quantity: 1 }],
  };
  await expectRejectedWith(
    'долг: готовые без установки с неполной оплатой не продаются',
    () => sellerCaller.orders.sellReadyMade({ ...readySale, deposit: 100000, needsInstallation: false }),
    (message) => message === 'Без установки готовые шторы продаются только при полной оплате',
  );
  const paidSale = await sellerCaller.orders.sellReadyMade({ ...readySale, deposit: 500000, needsInstallation: false });
  const installSale = await sellerCaller.orders.sellReadyMade({
    ...readySale,
    deposit: 100000,
    needsInstallation: true,
    installAddress: 'ул. Смоука, 3',
  });
  check(
    'долг: оплаченная продажа закрыта, с установкой — ждёт установщика',
    paidSale.status === OrderStatus.COMPLETED &&
      installSale.status === OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    `${paidSale.status} / ${installSale.status}`,
  );

  // Опоздание считается от завершения установки, а не от оплаты: заказ,
  // поставленный в срок и оплаченный позже, — вовремя.
  const daysAgoIso = (days: number): string => {
    const at = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { year, month, day } = workshopToday(at);
    return `${year.toString()}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };
  const deadlineIso = daysAgoIso(5);
  const lateFixture = async (label: string) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} Срок ${label}`,
        clientPhone: '+998901112288',
        createdBy: seller.id,
        status: OrderStatus.COMPLETED,
        completedAt: new Date(),
        deadline: deadlineIso,
      })
      .returning();
    if (row === undefined) throw new Error(`заказ «${label}» не создан`);
    return row;
  };
  const installedOnTime = await lateFixture('установлен в срок');
  await db.insert(orderStatusHistory).values({
    orderId: installedOnTime.id,
    fromStatus: OrderStatus.INSTALLATION_IN_PROGRESS,
    toStatus: OrderStatus.INSTALLATION_DONE,
    changedBy: installer.id,
    createdAt: new Date(`${deadlineIso}T10:00:00+05:00`),
  });
  const closedLate = await lateFixture('без установки');
  const nowPeriod = workshopToday();
  const lateness = await deadlinesReport(db, { year: nowPeriod.year, month: nowPeriod.month }, branch.id);
  const lateIds = lateness.lateOrders.map((row) => row.id);
  check(
    'сроки: установлен в срок и оплачен позже — вовремя; закрыт без установки позже срока — опоздал',
    !lateIds.includes(installedOnTime.id) && lateIds.includes(closedLate.id),
    JSON.stringify(lateness.lateOrders.filter((row) => [installedOnTime.id, closedLate.id].includes(row.id)).map((row) => [row.clientName, row.lateDays])),
  );
  // Список заказов: текущий исполнитель, «С долгом», просроченные, страницы.
  const listFixture = async (label: string, values: Partial<typeof orders.$inferInsert>) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} Список ${label}`,
        clientPhone: '+998901112299',
        createdBy: seller.id,
        ...values,
      })
      .returning();
    if (row === undefined) throw new Error(`заказ «${label}» не создан`);
    return row;
  };
  const inSewing = await listFixture('пошив', { status: OrderStatus.SEWING_IN_PROGRESS, sewerId: sewer.id });
  const inQcPool = await listFixture('пул ОТК', { status: OrderStatus.PENDING_QC });
  const fresh = await listFixture('новый', { status: OrderStatus.NEW });
  const listed = await managerCaller.orders.list({ search: `${PREFIX} Список`, pageSize: 100 });
  const executorOf = (id: number) => listed.items.find((row) => row.id === id)?.currentExecutor;
  check(
    'список: исполнитель — швея в пошиве, «не назначен» в пуле ОТК, никого у нового',
    executorOf(inSewing.id)?.userId === sewer.id &&
      executorOf(inSewing.id)?.role === Role.SEWER &&
      executorOf(inSewing.id)?.fullName === sewer.fullName &&
      executorOf(inQcPool.id)?.role === Role.QC &&
      executorOf(inQcPool.id)?.userId === null &&
      executorOf(fresh.id) === null,
    JSON.stringify([executorOf(inSewing.id), executorOf(inQcPool.id), executorOf(fresh.id)]),
  );

  const debts = await sellerCaller.orders.list({ withDebt: true, pageSize: 100 });
  check(
    'список: «С долгом» — только после установки и с остатком',
    debts.items.some((row) => row.id === debtor.id) &&
      !debts.items.some((row) => row.id === settled.id) &&
      debts.items.every(
        (row) =>
          (row.status === OrderStatus.INSTALLATION_DONE || row.status === OrderStatus.COMPLETED) &&
          parseMoney(row.remainingPayment ?? '0') > 0,
      ),
    `${debts.items.length.toString()} заказов`,
  );
  await expectRejectedWith(
    'список: швее фильтр «С долгом» недоступен',
    () => sewerCaller.orders.list({ withDebt: true }),
    (message) => message === 'Фильтр «С долгом» доступен только тем, кто видит оплаты',
  );

  const overdueOpen = await listFixture('просрочен', {
    status: OrderStatus.SEWING_IN_PROGRESS,
    sewerId: sewer.id,
    deadline: daysAgoIso(1),
  });
  const overdueClosed = await listFixture('просрочен закрыт', {
    status: OrderStatus.COMPLETED,
    completedAt: new Date(),
    deadline: daysAgoIso(1),
  });
  const overdue = await managerCaller.orders.list({ overdue: true, search: `${PREFIX} Список`, pageSize: 100 });
  check(
    'список: «Просрочены» — открытый со вчерашним сроком есть, закрытый — нет',
    overdue.items.some((row) => row.id === overdueOpen.id) &&
      !overdue.items.some((row) => row.id === overdueClosed.id) &&
      !overdue.items.some((row) => row.id === inSewing.id),
    `${overdue.items.length.toString()} заказов`,
  );

  const withCornice = await listFixture('карниз', {
    status: OrderStatus.SEWING_IN_PROGRESS,
    corniceStatus: CorniceStatus.IN_PROGRESS,
    corniceInstallerId: corniceMan.id,
  });
  const byCornice = await managerCaller.orders.list({ assigneeId: corniceMan.id, pageSize: 100 });
  check('список: фильтр по исполнителю находит карнизчика', byCornice.items.some((row) => row.id === withCornice.id));

  // Создатель: в каждой строке — id и имя автора; фильтр сужает, но не расширяет видимость.
  const byCreator = await managerCaller.orders.list({ creatorId: seller.id, search: `${PREFIX} Список`, pageSize: 100 });
  check(
    'список: фильтр «Создатель» — только заказы автора, с его именем в строке',
    byCreator.items.length > 0 &&
      byCreator.items.some((row) => row.id === inSewing.id) &&
      byCreator.items.every((row) => row.creator.id === seller.id && row.creator.fullName === seller.fullName),
    `${byCreator.items.length.toString()} заказов`,
  );
  const byOtherCreator = await managerCaller.orders.list({ creatorId: sewer.id, search: `${PREFIX} Список`, pageSize: 100 });
  check('список: чужой «Создатель» — пусто', byOtherCreator.total === 0, `${byOtherCreator.total.toString()} заказов`);
  // Швея видит только свои заказы — фильтр по автору не открывает ей остальные.
  const sewerByCreator = await sewerCaller.orders.list({ creatorId: seller.id, pageSize: 100 });
  check(
    'список: фильтр «Создатель» не расширяет видимость швее',
    sewerByCreator.items.every((row) => row.sewerId === sewer.id) &&
      !sewerByCreator.items.some((row) => row.id === inQcPool.id),
    `${sewerByCreator.items.length.toString()} заказов`,
  );

  // Архив — по дате закрытия, свежие сверху: заказ, заведённый давно, но
  // закрытый сегодня, стоит над закрытым неделю назад (а не по дате создания).
  const closedLongAgo = await listFixture('архив давно', {
    status: OrderStatus.COMPLETED,
    completedAt: new Date(Date.now() - 7 * 86_400_000),
  });
  const cancelledToday = await listFixture('архив отменён сегодня', {
    status: OrderStatus.CANCELLED,
    cancelledAt: new Date(),
    cancellationReason: `${PREFIX} отказ клиента`,
    createdAt: new Date(Date.now() - 30 * 86_400_000),
  });
  const archive = await managerCaller.orders.list({
    status: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    search: `${PREFIX} Список архив`,
    pageSize: 100,
  });
  const archiveIds = archive.items.map((row) => row.id);
  check(
    'список: архив — закрытые последними сверху',
    JSON.stringify(archiveIds) === JSON.stringify([cancelledToday.id, closedLongAgo.id]),
    JSON.stringify(archiveIds),
  );

  const secondPage = await managerCaller.orders.list({ search: `${PREFIX} Список`, pageSize: 1, cursor: 2 });
  check(
    'список: cursor — номер страницы для подгрузки',
    secondPage.page === 2 && secondPage.items.length === 1 && secondPage.totalPages >= 2,
    `стр. ${secondPage.page.toString()} из ${secondPage.totalPages.toString()}`,
  );
  // Правка заказа: права, цена, позиции с метражом, уведомление исполнителю.
  await expectRejectedWith(
    'правка: закрытый заказ не правит даже директор',
    () => ceoCaller.orders.update({ id: settled.id, clientName: `${PREFIX} Правка` }),
    (message) => message === 'Заказ закрыт — правка недоступна',
  );
  await sellerCaller.orders.update({ id: fresh.id, clientName: `${PREFIX} Список новый (правка)`, workPrice: 777000 });
  const freshAfter = (await db.select().from(orders).where(eq(orders.id, fresh.id)))[0];
  const freshAudit = (
    await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'order'), eq(auditLog.entityId, fresh.id)))
  ).map((row) => row.action);
  check(
    'правка: продавец правит свой новый заказ — клиента и цену, с аудитом',
    freshAfter?.workPrice === '777000.00' &&
      freshAfter.clientName.endsWith('(правка)') &&
      freshAudit.includes('order.updated') &&
      freshAudit.includes('order.price_changed'),
    `${String(freshAfter?.workPrice)}; ${freshAudit.join(', ')}`,
  );
  await expectRejectedWith(
    'правка: продавец не правит свой заказ в пошиве',
    () => sellerCaller.orders.update({ id: inSewing.id, clientName: `${PREFIX} Правка` }),
    (message) => message === 'Заказ уже в работе — правки вносит администратор',
  );

  await managerCaller.orders.update({
    id: inSewing.id,
    items: [
      {
        kind: OrderItemKind.WINDOW,
        widthCm: 200,
        heightCm: 250,
        portieres: [{ code: 'П-31', meters: 3.5, description: null }],
        quantity: 1,
      },
    ],
  });
  const editedItems = await db.select().from(orderItems).where(eq(orderItems.orderId, inSewing.id));
  const sewerNotes = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, sewer.id),
        eq(notifications.relatedOrderId, inSewing.id),
        eq(notifications.type, NotificationType.ORDER_UPDATED),
      ),
    );
  const managerNotes = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, manager.id), eq(notifications.type, NotificationType.ORDER_UPDATED)));
  check(
    'правка: позиции заменены с метражом, швея получила уведомление, менеджер — нет',
    editedItems.length === 1 &&
      editedItems[0]?.portieres[0]?.meters === 3.5 &&
      sewerNotes.some((note) => note.body === 'Изменён состав заказа — проверьте позиции') &&
      managerNotes.length === 0,
    JSON.stringify({ items: editedItems.length, notes: sewerNotes, managerNotes: managerNotes.length }),
  );
  await expectRejectedWith(
    'правка: состав продажи готовых штор не меняется',
    () =>
      managerCaller.orders.update({
        id: installSale.id,
        items: [{ kind: OrderItemKind.WINDOW, quantity: 2 }],
      }),
    (message) => message === 'Состав продажи готовых штор изменить нельзя',
  );
  const editDebt = await makeDebtOrder('правка цены', OrderStatus.INSTALLATION_DONE, '400000.00', '150000');
  await managerCaller.orders.update({ id: editDebt.id, workPrice: 150000 });
  check('правка: цена снижена до оплаченного — ждавший оплаты заказ закрыт', (await statusOf(editDebt.id)) === OrderStatus.COMPLETED);
  // Цех не узнаёт сумму долга даже прямым вызовом: отказ — по праву, а не по деньгам.
  const sewerDebt = await makeDebtOrder('цех', OrderStatus.INSTALLATION_DONE, '500000.00', '0');
  await db.update(orders).set({ sewerId: sewer.id }).where(eq(orders.id, sewerDebt.id));
  // Без открытой смены отказ пришёл бы раньше и проверка ничего бы не доказала.
  await db.insert(shifts).values({ userId: sewer.id, branchId: branch.id, startedAt: hoursAgo(1), ...point });
  await expectRejectedWith(
    'долг: швея при попытке закрыть не видит сумму остатка',
    () => sewerCaller.orders.changeStatus({ id: sewerDebt.id, toStatus: OrderStatus.COMPLETED }),
    (message) => !message.includes('Остаток') && !message.includes('500'),
  );

  // Роль, выданная директором после снятия автовыдачи, — не «выдана системой».
  await ceoCaller.users.grantRole({ id: seller.id, role: Role.INSTALLER });
  check(
    'роли: роль, выданная директором заново, в списке автовыдачи не появляется',
    !(await ceoCaller.users.autoGrantedRoles()).some((row) => row.userId === seller.id),
  );
  await ceoCaller.users.revokeRole({ id: seller.id, role: Role.INSTALLER });

  // Причина недоступного перехода — на языке клиента и с его валютой.
  const managerUzCaller = createCallerFactory(appRouter)({
    db,
    user: await actorOf(manager.id),
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'uz',
  });
  const uzTransitions = await managerUzCaller.orders.availableTransitions({ id: debtor.id });
  const uzReason = uzTransitions.find((t) => t.to === OrderStatus.COMPLETED)?.blockedReason ?? '';
  check(
    'долг: причина на узбекском — с «so\'m», без русского',
    uzReason.startsWith('Qoldiq') && uzReason.includes("so'm") && !/[А-Яа-яЁё]/.test(uzReason),
    uzReason,
  );

  /* ------------- 10. Выпуск 4: смены почасовика, оплата заказов ---------- */

  /*
    Пример заказчика (25.10): «100 000 за смену 9:00–18:00», то есть 11 111,11
    в час, и каждая смена — целыми сумами: 9 ч — 100 000, 8,5 ч — 94 444,
    7 ч — 77 778, 13 ч — 144 444. Сентябрь 2026 — прошлый месяц с
    фиксированными датами: проверка не зависит от того, когда её запустили.
  */
  const atTashkent = (day: string, time: string): Date => new Date(`${day}T${time}:00+05:00`);
  const september = { year: 2026, month: 9 };

  const hourlySewer = await makeUser('Почасовик', Role.SEWER, '+998900000131');
  await db.insert(payrollSchemes).values({
    userId: hourlySewer.id,
    role: Role.SEWER,
    type: PayrollSchemeType.HOURLY,
    rate: '11111.11',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    effectiveFrom: '2020-01-01',
    createdBy: admin.id,
  });

  const shiftPlan = [
    ['2026-09-01', '09:00', '18:00'],
    ['2026-09-02', '09:30', '18:00'],
    ['2026-09-03', '10:00', '17:00'],
    ['2026-09-04', '09:00', '22:00'],
    ['2026-09-05', '09:00', '18:00'],
  ] as const;
  const plannedShifts = [];
  for (const [day, from, to] of shiftPlan) {
    const [row] = await db
      .insert(shifts)
      .values({
        userId: hourlySewer.id,
        branchId: branch.id,
        startedAt: atTashkent(day, from),
        endedAt: atTashkent(day, to),
      })
      .returning();
    if (row === undefined) throw new Error(`смена ${day} не создана`);
    plannedShifts.push(row);
  }
  // На пятой смене — отлучка 30 минут: смена 9 ч, оплачено 8,5.
  await db.insert(personalBreaks).values({
    shiftId: plannedShifts[4]?.id ?? 0,
    plannedMinutes: 30,
    startedAt: atTashkent('2026-09-05', '13:00'),
    returnedAt: atTashkent('2026-09-05', '13:30'),
  });
  // Шестая смена ещё идёт: в таблице она есть, в расчёте — нет.
  await db
    .insert(shifts)
    .values({ userId: hourlySewer.id, branchId: branch.id, startedAt: atTashkent('2026-09-06', '09:00') });

  const hourlyCalc = await calculateForUserRole(db, hourlySewer.id, Role.SEWER, september);
  await saveDraft(db, hourlyCalc);
  check(
    'зарплата 4: почасовая — сумма смен, каждая целыми сумами',
    hourlyCalc.calculation.amount === parseMoney('511110'),
    moneyToDecimalString(hourlyCalc.calculation.amount),
  );

  const [hourlyRecord] = await db
    .select({ id: payrollRecords.id })
    .from(payrollRecords)
    .where(and(eq(payrollRecords.userId, hourlySewer.id), eq(payrollRecords.periodMonth, 9)));
  const hourlyBreakdown = await caller.payroll.breakdown({ id: hourlyRecord?.id ?? 0 });
  const shiftAmounts = hourlyBreakdown.shifts.map((row) => row.amount);
  check(
    'зарплата 4: разбивка — смены с суммами заказчика, открытая без суммы',
    JSON.stringify(shiftAmounts) ===
      JSON.stringify(['100000.00', '94444.00', '77778.00', '144444.00', '94444.00', null]),
    JSON.stringify(shiftAmounts),
  );
  const shiftTotal = shiftAmounts.reduce((sum, amount) => sum + (amount === null ? 0 : parseMoney(amount)), 0);
  check(
    'зарплата 4: сумма строк таблицы равна начисленному',
    shiftTotal === parseMoney(hourlyBreakdown.record.calculatedAmount),
    `${moneyToDecimalString(shiftTotal)} / ${hourlyBreakdown.record.calculatedAmount}`,
  );
  check(
    'зарплата 4: день по Ташкенту, перерыв виден, у открытой смены нет длительности',
    hourlyBreakdown.shifts[0]?.day === '2026-09-01' &&
      hourlyBreakdown.shifts[4]?.awaySeconds === 1800 &&
      hourlyBreakdown.shifts[4]?.workedSeconds === 8.5 * 3600 &&
      hourlyBreakdown.shifts[5]?.endedAt === null &&
      hourlyBreakdown.shifts[5]?.workedSeconds === null,
    JSON.stringify(hourlyBreakdown.shifts.map((row) => [row.day, row.workedSeconds, row.awaySeconds])),
  );
  check(
    'зарплата 4: в снимке — график смены',
    hourlyBreakdown.record.schemeSnapshot.shiftStart === '09:00' &&
      hourlyBreakdown.record.schemeSnapshot.shiftEnd === '18:00',
  );

  const firstDay = await calculateForDay(db, hourlySewer.id, Role.SEWER, {
    start: atTashkent('2026-09-01', '00:00'),
    end: atTashkent('2026-09-02', '00:00'),
  });
  check(
    'зарплата 4: за день — то же правило смены',
    firstDay?.calculation.amount === parseMoney('100000'),
    moneyToDecimalString(firstDay?.calculation.amount ?? 0),
  );

  /*
    Сдельщица: два заказа, пошив сдан 03.09 в 02:30 по Ташкенту (по UTC это
    ещё 02.09) и 04.09. Выплачен день 03.09 — первый заказ «Выплачен»,
    второй «На утверждении».
  */
  const pieceSewer = await makeUser('Сдельщица', Role.SEWER, '+998900000132');
  await db.insert(payrollSchemes).values({
    userId: pieceSewer.id,
    role: Role.SEWER,
    type: PayrollSchemeType.PIECE_RATE,
    effectiveFrom: '2020-01-01',
    createdBy: admin.id,
  });
  const sewnOn = async (name: string, at: Date) => {
    const [row] = await db
      .insert(orders)
      .values({
        branchId: branch.id,
        clientName: `${PREFIX} ${name}`,
        clientPhone: '+998901112266',
        createdBy: seller.id,
        workPrice: '500000.00',
        sewingFee: '50000.00',
        sewerId: pieceSewer.id,
        status: OrderStatus.SEWING_DONE,
      })
      .returning();
    if (row === undefined) throw new Error(`заказ ${name} не создан`);
    await db.insert(orderStatusHistory).values({
      orderId: row.id,
      fromStatus: OrderStatus.SEWING_IN_PROGRESS,
      toStatus: OrderStatus.SEWING_DONE,
      changedBy: pieceSewer.id,
      createdAt: at,
    });
    return row;
  };
  const paidPiece = await sewnOn('Сдельно выплачен', atTashkent('2026-09-03', '02:30'));
  const pendingPiece = await sewnOn('Сдельно ждёт', atTashkent('2026-09-04', '15:00'));

  await saveDraft(db, await calculateForUserRole(db, pieceSewer.id, Role.SEWER, september));
  const [pieceRecord] = await db
    .select({ id: payrollRecords.id })
    .from(payrollRecords)
    .where(and(eq(payrollRecords.userId, pieceSewer.id), eq(payrollRecords.periodMonth, 9)));
  await caller.payroll.markPaid({ id: pieceRecord?.id ?? 0, days: [{ day: '2026-09-03', amount: 50000 }] });

  const pieceBreakdown = await caller.payroll.breakdown({ id: pieceRecord?.id ?? 0 });
  const payStatusOf = (orderId: number) =>
    pieceBreakdown.orders.find((row) => row.id === orderId)?.paymentStatus ?? 'нет';
  check(
    'зарплата 4: заказ из выплаченного дня — «Выплачен», другой — «На утверждении»',
    payStatusOf(paidPiece.id) === PayrollOrderPayStatus.PAID &&
      payStatusOf(pendingPiece.id) === PayrollOrderPayStatus.PENDING,
    `${payStatusOf(paidPiece.id)} / ${payStatusOf(pendingPiece.id)}`,
  );
  check(
    'зарплата 4: у заказов — дата сдачи этапа, новые сверху; у сдельщицы смен нет',
    pieceBreakdown.orders.map((row) => row.id).join() === [pendingPiece.id, paidPiece.id].join() &&
      pieceBreakdown.orders.every((row) => row.doneAt !== null) &&
      pieceBreakdown.shifts.length === 0,
    JSON.stringify(pieceBreakdown.orders.map((row) => [row.id, row.doneAt])),
  );

  /*
    Выплату за день могли отметить раньше, чем сдали этап того же дня:
    директор выдал в 12:00, швея сдала в 16:00. Сдельная за этот заказ в
    дневную выплату не вошла — значит, «На утверждении», а не «Выплачен».
  */
  const lateSewn = await sewnOn('Сдельно после выплаты', atTashkent('2026-09-05', '16:00'));
  await saveDraft(db, await calculateForUserRole(db, pieceSewer.id, Role.SEWER, september));
  await caller.payroll.markPaid({ id: pieceRecord?.id ?? 0, days: [{ day: '2026-09-05', amount: 1000 }] });
  await db
    .update(payments)
    .set({ receivedAt: atTashkent('2026-09-05', '12:00') })
    .where(and(eq(payments.payrollRecordId, pieceRecord?.id ?? 0), eq(payments.day, '2026-09-05')));
  const afterEarlyPayout = await caller.payroll.breakdown({ id: pieceRecord?.id ?? 0 });
  const lateStatus = afterEarlyPayout.orders.find((row) => row.id === lateSewn.id)?.paymentStatus ?? 'нет';
  check(
    'зарплата 4: этап сдан после выплаты за тот же день — «На утверждении»',
    lateStatus === PayrollOrderPayStatus.PENDING,
    lateStatus,
  );

  /*
    Выплаченный месяц, пересчитанный без новой работы, остаётся выплаченным,
    даже если новое правило дало на несколько сумов больше: раньше первое же
    «Рассчитать» переоткрывало его с остатком в копейки.
  */
  await db
    .update(payrollRecords)
    .set({
      status: PayrollRecordStatus.PAID,
      paidAmount: moneyToDecimalString(hourlyCalc.calculation.amount - parseMoney('58')),
      calculatedAmount: moneyToDecimalString(hourlyCalc.calculation.amount - parseMoney('58')),
      approvedBy: admin.id,
      approvedAt: new Date(),
      paidAt: new Date(),
    })
    .where(eq(payrollRecords.id, hourlyRecord?.id ?? 0));
  const resaved = await saveDraft(db, await calculateForUserRole(db, hourlySewer.id, Role.SEWER, september));
  const [stillPaid] = await db
    .select({ status: payrollRecords.status })
    .from(payrollRecords)
    .where(eq(payrollRecords.id, hourlyRecord?.id ?? 0));
  check(
    'зарплата 4: выплаченный месяц без новой работы не переоткрывается',
    !resaved && stillPaid?.status === PayrollRecordStatus.PAID,
    `${String(resaved)} ${stillPaid?.status ?? 'null'}`,
  );

  // Снимок до выпуска 4 — без графика смены: разбивка открывается как раньше.
  await db.execute(
    sql`update payroll_records set scheme_snapshot = scheme_snapshot - 'shiftStart' - 'shiftEnd' where id = ${hourlyRecord?.id ?? 0}`,
  );
  const oldSnapshot = await caller.payroll.breakdown({ id: hourlyRecord?.id ?? 0 });
  check(
    'зарплата 4: старый снимок без графика — разбивка открывается, смены с суммами',
    oldSnapshot.record.schemeSnapshot.shiftStart === undefined && oldSnapshot.shifts[0]?.amount === '100000.00',
    String(oldSnapshot.shifts[0]?.amount),
  );

  /*
    Смена через границу месяца: 30.09 22:00 UTC → 01.10 02:00 UTC с
    отлучкой 00:30–01:00 UTC. Сентябрю — 2 ч, октябрю — 1,5 ч; ничего не
    потеряно и не посчитано дважды (отлучка за границей периода — ноль, а
    не отрицательное время).
  */
  const nightSewer = await makeUser('Ночная смена', Role.SEWER, '+998900000133');
  const [night] = await db
    .insert(shifts)
    .values({
      userId: nightSewer.id,
      branchId: branch.id,
      startedAt: new Date('2026-09-30T22:00:00Z'),
      endedAt: new Date('2026-10-01T02:00:00Z'),
    })
    .returning();
  await db.insert(personalBreaks).values({
    shiftId: night?.id ?? 0,
    plannedMinutes: 30,
    startedAt: new Date('2026-10-01T00:30:00Z'),
    returnedAt: new Date('2026-10-01T01:00:00Z'),
  });
  const septemberHours = await calculateWorkedHours(db, nightSewer.id, periodBounds(september));
  const octoberHours = await calculateWorkedHours(db, nightSewer.id, periodBounds({ year: 2026, month: 10 }));
  check(
    'зарплата 4: смена через границу месяца делится без потерь и двойного счёта',
    septemberHours === 2 && octoberHours === 1.5,
    `сентябрь ${septemberHours.toString()} ч, октябрь ${octoberHours.toString()} ч`,
  );

  /* ------------------ 11. Выпуск 5: фото табло по статусам ---------------- */

  /*
    Заказчик: «фото ставится по статусам — работает / без заказа / на
    перерыве; это фото не отображается в других разделах, как мой профиль».
    Швея на смене без заказа — табло показывает фото «Без заказа»; ушла на
    перерыв — фото «На перерыве»; профиль — всё время обычная аватарка.
  */
  const photoSewer = await makeUser('Швея с фото', Role.SEWER, '+998900000141');
  await caller.users.setAvatar({ userId: photoSewer.id, file: pixel });
  const [photoShift] = await db
    .insert(shifts)
    .values({ userId: photoSewer.id, branchId: branch.id, startedAt: new Date(Date.now() - 60 * 60 * 1000) })
    .returning();

  await caller.monitor.photos.set({ userId: photoSewer.id, kind: BoardPhotoKind.IDLE, file: pixel });
  await caller.monitor.photos.set({ userId: photoSewer.id, kind: BoardPhotoKind.BREAK, file: pixel });

  const boardPhotoOf = async (): Promise<{ status: string; url: string }> => {
    const board = await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP });
    const person = board.people.find((entry) => entry.userId === photoSewer.id);
    return { status: person?.status ?? 'нет', url: person?.photoUrl ?? '' };
  };
  const [idlePhoto] = await db
    .select({ key: boardPhotos.previewKey })
    .from(boardPhotos)
    .where(and(eq(boardPhotos.userId, photoSewer.id), eq(boardPhotos.kind, BoardPhotoKind.IDLE)));
  const idleOnBoard = await boardPhotoOf();
  check(
    'табло 5: без заказа — фото «Без заказа», а не аватарка',
    idleOnBoard.status === LiveStatus.IDLE &&
      idlePhoto?.key !== null &&
      idlePhoto?.key !== undefined &&
      idleOnBoard.url.includes(idlePhoto.key),
    `${idleOnBoard.status} ${idleOnBoard.url.slice(0, 80)}`,
  );

  await db.insert(personalBreaks).values({ shiftId: photoShift?.id ?? 0, plannedMinutes: 15 });
  const breakOnBoard = await boardPhotoOf();
  check(
    'табло 5: на перерыве — фото «На перерыве»',
    breakOnBoard.status === LiveStatus.BREAK &&
      breakOnBoard.url.includes('board-photos') &&
      breakOnBoard.url !== idleOnBoard.url,
    `${breakOnBoard.status} ${breakOnBoard.url.slice(0, 80)}`,
  );

  const profile = await caller.users.byId({ id: photoSewer.id });
  check(
    'табло 5: в профиле — обычная аватарка, фото табло туда не попадают',
    profile.avatarUrl !== null && profile.avatarUrl.includes('avatars') && !profile.avatarUrl.includes('board-photos'),
    profile.avatarUrl ?? 'null',
  );

  const photoSettings = await caller.monitor.photos.list();
  const listedSewer = photoSettings.people.find((entry) => entry.userId === photoSewer.id);
  check(
    'табло 5: в настройках у швеи два фото из трёх',
    listedSewer !== undefined &&
      listedSewer.photos.idle !== null &&
      listedSewer.photos.break !== null &&
      listedSewer.photos.working === null,
    JSON.stringify(listedSewer?.photos ?? null).slice(0, 120),
  );

  await caller.monitor.photos.remove({ userId: photoSewer.id, kind: BoardPhotoKind.BREAK });
  const afterRemove = await boardPhotoOf();
  check(
    'табло 5: фото убрали — снова аватарка',
    afterRemove.status === LiveStatus.BREAK && afterRemove.url.includes('avatars'),
    afterRemove.url.slice(0, 80),
  );

  await expectRejectedWith(
    'табло 5: продавцу фото табло не загрузить — его нет на табло',
    () => caller.monitor.photos.set({ userId: seller.id, kind: BoardPhotoKind.WORKING, file: pixel }),
    (message) => message.includes('табло'),
  );
  await expectRejected('табло 5: менеджер фото табло не меняет', () =>
    managerCaller.monitor.photos.set({ userId: photoSewer.id, kind: BoardPhotoKind.WORKING, file: pixel }),
  );

  /* ---------------- 11a. Выпуск 5: очереди ОТК и карнизов на ТВ ---------- */

  /*
    Заказчик: «справа — контроль качества, очередь с исполнителями; рядом
    очередь на карнизы: номер заказа, исполнитель, статус». На ТВ — без
    клиента и адреса.
  */
  const [atQc] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Клиент ОТК`,
      clientPhone: '+998901112277',
      installAddress: 'ул. Секретная, 7',
      createdBy: seller.id,
      workPrice: '700000.00',
      sewerId: photoSewer.id,
      status: OrderStatus.PENDING_QC,
    })
    .returning();
  if (atQc === undefined) throw new Error('заказ в ОТК не создан');
  await db.insert(orderStatusHistory).values({
    orderId: atQc.id,
    fromStatus: OrderStatus.SEWING_DONE,
    toStatus: OrderStatus.PENDING_QC,
    changedBy: photoSewer.id,
    createdAt: new Date(Date.now() - 40 * 60 * 1000),
  });
  const [atCornice] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Клиент карниза`,
      clientPhone: '+998901112288',
      createdBy: seller.id,
      workPrice: '300000.00',
      status: OrderStatus.SEWING_IN_PROGRESS,
      corniceStatus: CorniceStatus.IN_PROGRESS,
      corniceInstallerId: corniceMan.id,
    })
    .returning();
  if (atCornice === undefined) throw new Error('заказ с карнизом не создан');
  await db.insert(auditLog).values({
    actorId: corniceMan.id,
    action: 'order.cornice_taken',
    entityType: 'order',
    entityId: atCornice.id,
    details: {},
  });

  const queues = await managerCaller.monitor.queues({ branchId: branch.id });
  const qcRow = queues.qc.items.find((row) => row.orderNumber === atQc.orderNumber);
  const corniceRow = queues.cornice.items.find((row) => row.orderNumber === atCornice.orderNumber);
  check(
    'табло 5: заказ на контроле — в очереди ОТК со швеёй',
    qcRow?.status === QueueStatus.CHECKING &&
      qcRow.performers.some((person) => person.name === photoSewer.fullName) &&
      qcRow.since !== null,
    JSON.stringify(qcRow ?? null).slice(0, 160),
  );
  check(
    'табло 5: карниз в работе — в очереди карнизов с карнизчиком',
    corniceRow?.status === QueueStatus.TAKEN &&
      corniceRow.performers.some((person) => person.name === corniceMan.fullName) &&
      corniceRow.since !== null,
    JSON.stringify(corniceRow ?? null).slice(0, 160),
  );

  const installersTv = await ceoCaller.displayLinks.create({
    label: 'ТВ установщиков',
    branchId: branch.id,
    showWorkshop: false,
    showInstallation: true,
    locale: 'ru',
  });
  const tvQueues = await tvCaller.display.queues({ token: installersTv.token });
  const tvQueuesJson = JSON.stringify(tvQueues);
  check(
    'табло 5: ссылка без цеха — без очереди ОТК, очередь карнизов есть',
    tvQueues.qc === null && tvQueues.cornice !== null && tvQueues.cornice.items.some((row) => row.orderNumber === atCornice.orderNumber),
    tvQueuesJson.slice(0, 120),
  );
  check(
    'табло 5: в очередях на ТВ нет клиента, адреса и внутренних id',
    !tvQueuesJson.includes('Клиент') &&
      !tvQueuesJson.includes('Секретная') &&
      !tvQueuesJson.includes('orderId') &&
      !tvQueuesJson.includes('userId'),
    tvQueuesJson.slice(0, 120),
  );
  await expectRejected('табло 5: очереди по чужому токену — нет', () =>
    tvCaller.display.queues({ token: 'x'.repeat(40) }),
  );

  /*
    Готовые шторы закрываются сразу, а карниз ждёт карнизчика «как обычно»
    (orderWorkflow): в очереди на ТВ он должен быть, как в очереди самого
    карнизчика. И длина очереди — настоящая, а не обрезанная выдача.
  */
  const [closedWithCornice] = await db
    .insert(orders)
    .values({
      branchId: branch.id,
      clientName: `${PREFIX} Закрыт, карниз ждёт`,
      clientPhone: '+998901112299',
      createdBy: seller.id,
      workPrice: '200000.00',
      status: OrderStatus.COMPLETED,
      corniceStatus: CorniceStatus.PENDING,
    })
    .returning();
  const queuesAgain = await managerCaller.monitor.queues({ branchId: branch.id });
  const [corniceCount] = await db
    .select({ n: sql<string>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.branchId, branch.id),
        inArray(orders.corniceStatus, [CorniceStatus.PENDING, CorniceStatus.IN_PROGRESS]),
        sql`${orders.status} <> ${OrderStatus.CANCELLED}`,
      ),
    );
  check(
    'табло 5: карниз закрытого заказа — в очереди, как у карнизчика',
    queuesAgain.cornice.items.some((row) => row.orderNumber === closedWithCornice?.orderNumber),
  );
  check(
    'табло 5: длина очереди — все ждущие, а не только показанные',
    queuesAgain.cornice.total === Number.parseInt(corniceCount?.n ?? '-1', 10) &&
      queuesAgain.cornice.total >= queuesAgain.cornice.items.length,
    `${queuesAgain.cornice.total.toString()} / ${corniceCount?.n ?? '?'}`,
  );

  /* --------------- 12. Терминальные чеки: тип оплаты и сумма дня ---------- */

  /*
    Заказчик (05.11): у чека — значок типа оплаты (Click, Payme, Uzum, Humo,
    Uzcard, наличные), его спрашивают при новом чеке; под «День» — общая
    сумма за день.
  */
  await sellerCaller.terminalChecks.create({ photo: pixel, amount: 300000, payType: TerminalPayType.CLICK });
  await sellerCaller.terminalChecks.create({ photo: pixel, amount: 200000, payType: TerminalPayType.CASH });
  const todayChecks = await caller.terminalChecks.byDay({ day: workshopDayIso(new Date()) });
  const clickRow = todayChecks.rows.find((row) => row.payType === TerminalPayType.CLICK);
  check(
    'терминал: тип оплаты сохраняется у чека',
    clickRow !== undefined && todayChecks.rows.some((row) => row.payType === TerminalPayType.CASH),
    JSON.stringify(todayChecks.rows.map((row) => [row.amount, row.payType])),
  );
  const rowsTotal = todayChecks.rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const clickLine = todayChecks.summary.byType.find((line) => line.payType === TerminalPayType.CLICK);
  check(
    'терминал: сумма дня — все чеки дня, разбивка по типам',
    todayChecks.summary.total === rowsTotal &&
      todayChecks.summary.count === todayChecks.rows.length &&
      clickLine !== undefined &&
      clickLine.amount >= parseMoney('300000'),
    `${moneyToDecimalString(todayChecks.summary.total)} / ${moneyToDecimalString(rowsTotal)}`,
  );
  const sellerToday = await sellerCaller.terminalChecks.today();
  check(
    'терминал: на «Работе» у продавца — та же сумма дня',
    sellerToday.summary?.total === todayChecks.summary.total,
  );
  // Старое приложение (APK до 05.11) поля не знает: его чек принимается
  // без типа — ошибки у продавца быть не должно, тип спросит новая сборка.
  const legacy = await sellerCaller.terminalChecks.create({ photo: pixel, amount: 1000 });
  const afterLegacy = await caller.terminalChecks.byDay({ day: workshopDayIso(new Date()) });
  const legacyRow = afterLegacy.rows.find((row) => row.id === legacy.id);
  check(
    'терминал: чек старого приложения (без типа) принят и стоит «без типа»',
    legacyRow !== undefined &&
      legacyRow.payType === null &&
      afterLegacy.summary.byType.at(-1)?.payType === null,
    JSON.stringify(legacyRow?.payType),
  );
  await expectRejected('терминал: незнакомый тип оплаты не принимается', () =>
    sellerCaller.terminalChecks.create({ photo: pixel, amount: 1000, payType: 'visa' } as never),
  );
  const sewerToday = await sewerCaller.terminalChecks.today();
  check(
    'терминал: швея видит норму, но не суммы, типы и фото',
    sewerToday.count === afterLegacy.count && sewerToday.rows.length === 0 && sewerToday.summary === null,
    JSON.stringify({ count: sewerToday.count, rows: sewerToday.rows.length, summary: sewerToday.summary }),
  );
  await expectRejected('терминал: тип оплаты бывает только у терминального чека', () =>
    db.insert(payments).values({
      branchId: branch.id,
      kind: PaymentKind.OTHER,
      method: PaymentMethod.CARD,
      amount: '1000.00',
      receivedBy: seller.id,
      terminalPayType: TerminalPayType.PAYME,
    }),
  );

  /* -------------------- Отгулы: порядок в списках ------------------------ */
  // «Новые сверху» — по времени события, а не по дате отгула. Ждущие —
  // сверху, свежеподанные первыми. Решённые — по времени решения: только что
  // одобренный запрос на более раннюю дату должен оказаться над старой
  // историей, а не под ней (так было при сортировке по дате отгула).
  const dayOffRow = async (
    startDate: string,
    status: 'pending' | 'approved' | 'rejected',
    createdHoursAgo: number,
    reviewedHoursAgo?: number,
  ) => {
    const [row] = await db
      .insert(dayOffRequests)
      .values({
        userId: sewer.id,
        startDate,
        endDate: startDate,
        status,
        createdAt: hoursAgo(createdHoursAgo),
        ...(reviewedHoursAgo === undefined
          ? {}
          : { reviewedBy: ceo.id, reviewedAt: hoursAgo(reviewedHoursAgo) }),
        ...(status === 'rejected' ? { rejectionReason: `${PREFIX} отказ` } : {}),
      })
      .returning();
    if (row === undefined) throw new Error(`отгул ${startDate} не создан`);
    return row.id;
  };
  const oldApproved = await dayOffRow('2026-03-25', 'approved', 240, 216);
  const oldRejected = await dayOffRow('2026-04-01', 'rejected', 192, 168);
  const justApproved = await dayOffRow('2026-02-18', 'approved', 120, 1);
  const pendingOlder = await dayOffRow('2026-03-20', 'pending', 72);
  const pendingNewest = await dayOffRow('2026-03-01', 'pending', 24);
  const expectedOrder = [pendingNewest, pendingOlder, justApproved, oldRejected, oldApproved];
  const listedDaysOff = (await ceoCaller.dayOff.list({ userId: sewer.id })).items.map((row) => row.id);
  check(
    'отгулы: list — ждущие сверху (новые первыми), решённые по времени решения',
    JSON.stringify(listedDaysOff) === JSON.stringify(expectedOrder),
    JSON.stringify(listedDaysOff),
  );
  const myDaysOff = (await sewerCaller.dayOff.my()).map((row) => row.id);
  check(
    'отгулы: my — тот же порядок, что у руководства',
    JSON.stringify(myDaysOff) === JSON.stringify(expectedOrder),
    JSON.stringify(myDaysOff),
  );

  /* ---------- 13. Опоздание по запросу, лента в группе, напоминания ------- */

  /*
    Заказчик (09.11): на экране выходных — запрос на опоздание (дата и время
    прихода). Одобренный сдвигает порог опоздания на этот день; в группу
    уходят запрос, одобрение и отказ (без причины сотрудника); утром и
    вечером бот напоминает открыть и закрыть смену — только если есть кому.
  */
  const callerFor = async (person: { readonly id: number }) =>
    createCallerFactory(appRouter)({
      db,
      user: await actorOf(person.id),
      requestId: 'smoke',
      ipAddress: null,
      userAgent: null,
      locale: 'ru',
    });
  const lateSewer = await makeUser('Опоздает', Role.SEWER, '+998900000151');
  const otherSewer = await makeUser('Соседка', Role.SEWER, '+998900000152');
  const lateCaller = await callerFor(lateSewer);
  const otherCaller = await callerFor(otherSewer);

  /** День мастерской со сдвигом от сегодняшнего: −1 — вчера, 1 — завтра. */
  const lateDay = (offsetDays: number): string => {
    const { year, month, day } = workshopToday();
    return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
  };
  const lateToday = lateDay(0);
  const lateTomorrow = lateDay(1);

  // Без открытой смены: опоздание просят заранее, часто накануне вечером.
  const lateCreated = await lateCaller.lateRequests.create({
    date: lateTomorrow,
    arriveBy: '10:30',
    reason: `${PREFIX} к врачу`,
  });
  check(
    'опоздание: сотрудник просит без открытой смены, время — «ЧЧ:ММ»',
    lateCreated.status === DayOffStatus.PENDING &&
      lateCreated.arriveBy === '10:30' &&
      lateCreated.userId === lateSewer.id &&
      lateCreated.date === lateTomorrow,
    JSON.stringify(lateCreated),
  );
  const [lateRequestedNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, ceo.id), eq(notifications.type, NotificationType.LATE_REQUESTED)))
    .orderBy(desc(notifications.id))
    .limit(1);
  check(
    'опоздание: руководство получает уведомление — кто, день, время, без причины',
    lateRequestedNote !== undefined &&
      lateRequestedNote.body.includes(lateSewer.fullName) &&
      lateRequestedNote.body.includes('10:30') &&
      !lateRequestedNote.body.includes('к врачу'),
    lateRequestedNote?.body ?? 'уведомления нет',
  );
  const [lateRequestedAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'late.requested'), eq(auditLog.entityId, lateCreated.id)))
    .limit(1);
  const lateRequestedDetails = lateRequestedAudit?.details ?? {};
  check(
    'опоздание: в журнале (из него пишет лента группы) — кто, день и время, без причины',
    lateRequestedDetails['userId'] === lateSewer.id &&
      lateRequestedDetails['arriveBy'] === '10:30' &&
      !('reason' in lateRequestedDetails),
    JSON.stringify(lateRequestedDetails),
  );

  await expectRejectedWith(
    'опоздание: второй запрос на день с ждущим — «отзовите или дождитесь решения», а не 500',
    () => lateCaller.lateRequests.create({ date: lateTomorrow, arriveBy: '11:00' }),
    (message) =>
      message === 'На этот день уже есть запрос на опоздание — отзовите его или дождитесь решения',
  );
  await expectRejectedWith(
    'опоздание: на прошедший день не просят',
    () => lateCaller.lateRequests.create({ date: lateDay(-1), arriveBy: '10:30' }),
    (message) => message.includes('заранее'),
  );
  await expectRejected('опоздание: время не «ЧЧ:ММ» не принимается', () =>
    lateCaller.lateRequests.create({ date: lateDay(2), arriveBy: '25:00' }),
  );
  await expectRejectedWith(
    'опоздание: сотрудник не одобряет запросы',
    () => lateCaller.lateRequests.approve({ id: lateCreated.id }),
    (message) => message.includes('Недостаточно прав'),
  );
  await expectRejectedWith(
    'опоздание: общий список — только руководству',
    () => lateCaller.lateRequests.list({}),
    (message) => message.includes('Недостаточно прав'),
  );
  await expectRejectedWith(
    'опоздание: чужой запрос не отозвать',
    () => otherCaller.lateRequests.cancel({ id: lateCreated.id }),
    (message) => message.includes('не ваш'),
  );

  const lateApproved = await ceoCaller.lateRequests.approve({ id: lateCreated.id });
  check(
    'опоздание: руководство одобряет — решивший и время решения записаны',
    lateApproved.status === DayOffStatus.APPROVED &&
      lateApproved.reviewedBy === ceo.id &&
      lateApproved.reviewedAt !== null,
    JSON.stringify({ status: lateApproved.status, reviewedBy: lateApproved.reviewedBy }),
  );
  const [lateApprovedNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, lateSewer.id), eq(notifications.type, NotificationType.LATE_APPROVED)))
    .limit(1);
  check(
    'опоздание: сотрудник узнаёт об одобрении — день и время; день впереди — «Можно прийти …»',
    lateApprovedNote !== undefined &&
      lateApprovedNote.body.startsWith('Можно прийти ') &&
      lateApprovedNote.body.includes('10:30'),
    lateApprovedNote?.body ?? 'уведомления нет',
  );
  const [lateApprovedAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'late.approved'), eq(auditLog.entityId, lateCreated.id)))
    .limit(1);
  check(
    'опоздание: в журнале одобрения — о ком решение, а не только кто решал',
    lateApprovedAudit?.details?.['userId'] === lateSewer.id,
    JSON.stringify(lateApprovedAudit?.details),
  );
  await expectRejectedWith(
    'опоздание: решённый запрос второй раз не решается',
    () => ceoCaller.lateRequests.reject({ id: lateCreated.id, reason: 'Передумали' }),
    (message) => message.includes('уже рассмотрен'),
  );
  await expectRejectedWith(
    // «Отзовите или дождитесь решения» тут было бы неправдой: ждать нечего, а отозвать одобренное сотрудник не может.
    'опоздание: на день с одобренным опозданием — отказ называет, до которого часа уже можно',
    () => lateCaller.lateRequests.create({ date: lateTomorrow, arriveBy: '12:00' }),
    (message) => message === 'На этот день опоздание уже одобрено — до 10:30',
  );

  const lateToReject = await lateCaller.lateRequests.create({ date: lateDay(2), arriveBy: '11:00' });
  await expectRejected('опоздание: отказ без причины не принимается', () =>
    ceoCaller.lateRequests.reject({ id: lateToReject.id, reason: ' ' }),
  );
  const lateRejected = await ceoCaller.lateRequests.reject({
    id: lateToReject.id,
    reason: `${PREFIX} много заказов`,
  });
  const [lateRejectedNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, lateSewer.id), eq(notifications.type, NotificationType.LATE_REJECTED)))
    .limit(1);
  check(
    'опоздание: отказ — с причиной руководителя, и сотрудник её видит',
    lateRejected.status === DayOffStatus.REJECTED &&
      lateRejected.rejectionReason === `${PREFIX} много заказов` &&
      lateRejectedNote?.body.includes('много заказов') === true,
    lateRejectedNote?.body ?? 'уведомления нет',
  );

  const lateAgain = await lateCaller.lateRequests.create({ date: lateDay(2), arriveBy: '11:30' });
  check('опоздание: после отказа на тот же день можно попросить снова', lateAgain.status === DayOffStatus.PENDING);
  const lateCancelled = await lateCaller.lateRequests.cancel({ id: lateAgain.id });
  check('опоздание: свой ждущий запрос сотрудник отзывает', lateCancelled.status === DayOffStatus.CANCELLED);
  await expectRejectedWith(
    'опоздание: отозванный запрос второй раз не отзывается',
    () => lateCaller.lateRequests.cancel({ id: lateAgain.id }),
    (message) => message.includes('уже рассмотрен'),
  );

  // Порядок — как у выходных: ждущий сверху, ниже решённые по времени решения
  // (у отозванного решения нет — его время подачи).
  const latePending = await lateCaller.lateRequests.create({ date: lateDay(3), arriveBy: '09:30' });
  const expectedLateOrder = [latePending.id, lateAgain.id, lateToReject.id, lateCreated.id];
  const listedLate = (await ceoCaller.lateRequests.list({ userId: lateSewer.id })).items;
  check(
    'опоздание: list — ждущий сверху, решённые по времени решения, с именем просившего',
    JSON.stringify(listedLate.map((row) => row.id)) === JSON.stringify(expectedLateOrder) &&
      listedLate[0]?.requester.fullName === lateSewer.fullName &&
      listedLate.find((row) => row.id === lateCreated.id)?.reviewer?.fullName === ceo.fullName,
    JSON.stringify(listedLate.map((row) => [row.id, row.status])),
  );
  const myLate = await lateCaller.lateRequests.my();
  check(
    'опоздание: my — тот же порядок, время «ЧЧ:ММ», имя решившего',
    JSON.stringify(myLate.map((row) => row.id)) === JSON.stringify(expectedLateOrder) &&
      myLate[0]?.arriveBy === '09:30' &&
      myLate.find((row) => row.id === lateToReject.id)?.reviewerName === ceo.fullName,
    JSON.stringify(myLate.map((row) => [row.id, row.arriveBy])),
  );

  // Лента в группе пишет из журнала: у решения по выходному — о ком оно, у запроса — без причины.
  const sewerDayOff = await sewerCaller.dayOff.request({
    startDate: lateTomorrow,
    endDate: lateTomorrow,
    reason: `${PREFIX} личное`,
  });
  await ceoCaller.dayOff.approve({ id: sewerDayOff.id });
  const dayOffAudit = await db
    .select({ action: auditLog.action, details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'day_off_request'), eq(auditLog.entityId, sewerDayOff.id)));
  const dayOffRequestedDetails = dayOffAudit.find((row) => row.action === 'dayoff.requested')?.details ?? {};
  const dayOffApprovedDetails = dayOffAudit.find((row) => row.action === 'dayoff.approved')?.details ?? {};
  check(
    'отгулы: в журнале запроса и одобрения — о ком и на какие дни, без причины',
    dayOffRequestedDetails['userId'] === sewer.id &&
      !('reason' in dayOffRequestedDetails) &&
      dayOffApprovedDetails['userId'] === sewer.id &&
      dayOffApprovedDetails['startDate'] === lateTomorrow,
    JSON.stringify(dayOffAudit),
  );

  /* Порог опоздания. Сегодняшние запросы — прямо в базе: через процедуру
     запрос на сегодня зависит от того, который сейчас час. Отмечаются
     отдельные люди: «Опоздает» и «Соседка» нужны напоминаниям ниже без смены. */
  const earlySewer = await makeUser('Пришла до «приду к»', Role.SEWER, '+998900000142');
  const pastArriveBySewer = await makeUser('Опоздала и от «приду к»', Role.SEWER, '+998900000143');
  const pendingSewer = await makeUser('Запрос ждёт решения', Role.SEWER, '+998900000144');
  await db.insert(payrollSchemes).values(
    [lateSewer, otherSewer, earlySewer, pastArriveBySewer, pendingSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  const approvedToday = (person: { readonly id: number }) => ({
    userId: person.id,
    date: lateToday,
    arriveBy: '10:30',
    status: DayOffStatus.APPROVED,
    reviewedBy: ceo.id,
    reviewedAt: new Date(),
  });
  await db.insert(lateRequests).values([
    approvedToday(lateSewer),
    approvedToday(earlySewer),
    approvedToday(pastArriveBySewer),
    // Ждущий решения запрос порог не сдвигает.
    { userId: otherSewer.id, date: lateToday, arriveBy: '10:30' },
    { userId: pendingSewer.id, date: lateToday, arriveBy: '10:30' },
  ]);
  const latenessToday = (userId: number) =>
    db
      .select({ id: disciplineEvents.id, kind: disciplineEvents.kind, description: disciplineEvents.description })
      .from(disciplineEvents)
      .where(and(eq(disciplineEvents.userId, userId), eq(disciplineEvents.occurredOn, lateToday)));
  /** Отметка сегодня — смена в базе и факт с оценкой месяца, как в `shifts.checkIn`. */
  const checkInToday = async (person: { readonly id: number }, time: string) => {
    const [shift] = await db
      .insert(shifts)
      .values({ userId: person.id, branchId: branch.id, startedAt: atTashkent(lateToday, time), ...point })
      .returning();
    if (shift === undefined) throw new Error('смена не создана');
    await recordLatenessIfAny(db, person.id, shift, null);
  };

  await checkInToday(earlySewer, '10:20');
  const excused = await latenessToday(earlySewer.id);
  const [excusedFact] = await db
    .select()
    .from(lateCheckIns)
    .where(and(eq(lateCheckIns.userId, earlySewer.id), eq(lateCheckIns.day, lateToday)));
  check(
    'опоздание: отметка до согласованного «приду к» — записи нет, но факт отметки от графика записан',
    excused.length === 0 &&
      excusedFact?.checkInTime === '10:20' &&
      excusedFact.scheduleStart === '09:00' &&
      excusedFact.shiftId !== null,
    JSON.stringify({ excused, excusedFact }),
  );
  await checkInToday(pastArriveBySewer, '10:45');
  const countedFromArriveBy = await latenessToday(pastArriveBySewer.id);
  check(
    'опоздание: после «приду к» — опоздание от него, а не от графика',
    countedFromArriveBy.length === 1 &&
      countedFromArriveBy[0]?.kind === 'late_under_15' &&
      countedFromArriveBy[0].description === 'Смена с 10:30, отметка в 10:45 — опоздание 15 мин',
    JSON.stringify(countedFromArriveBy),
  );
  await checkInToday(pendingSewer, '09:20');
  const countedFromSchedule = await latenessToday(pendingSewer.id);
  check(
    'опоздание: ждущий решения запрос порог не сдвигает — от графика',
    countedFromSchedule[0]?.kind === 'late_15_30' &&
      countedFromSchedule[0].description === 'Смена с 09:00, отметка в 09:20 — опоздание 20 мин',
    JSON.stringify(countedFromSchedule),
  );
  // Опоздание при отметке — пост в группу (из журнала) и уведомление сотруднику, как и раньше.
  const [checkInAudit] = await db
    .select({ actorId: auditLog.actorId, details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.recorded'), eq(auditLog.entityId, countedFromSchedule[0]?.id ?? 0)));
  const checkInPost =
    checkInAudit === undefined
      ? null
      : describeForGroup(
          {
            actorId: checkInAudit.actorId,
            action: 'discipline.recorded',
            entityType: 'discipline_event',
            entityId: countedFromSchedule[0]?.id ?? 0,
            details: checkInAudit.details ?? {},
          },
          { order: null, names: new Map([[pendingSewer.id, pendingSewer.fullName]]), actorRoles: [Role.SEWER] },
          'ru',
        );
  const [checkInNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, pendingSewer.id), eq(notifications.type, NotificationType.DISCIPLINE_RECORDED)));
  check(
    'опоздание при отметке: в группу — пост с именем, сотруднику — «Зафиксировано нарушение» от системы',
    checkInAudit?.actorId === pendingSewer.id &&
      checkInAudit.details?.['recomputed'] === undefined &&
      checkInAudit.details?.['lateBy'] === 20 &&
      checkInPost !== null &&
      checkInPost.body.includes(pendingSewer.fullName) &&
      checkInNote?.body.endsWith('— Система') === true,
    JSON.stringify({ details: checkInAudit?.details, checkInPost, checkInNote }),
  );

  /* Напоминания о смене. Решение — по своим людям смоука: в базе могут быть
     и другие сотрудники, и общий ответ «пора/не пора» от них зависел бы. */
  const restingSewer = await makeUser('Отдыхает', Role.SEWER, '+998900000153');
  const weeklySewer = await makeUser('Выходной по графику', Role.SEWER, '+998900000154');
  const onShiftSewer = await makeUser('Уже на смене', Role.SEWER, '+998900000155');
  const absentSewer = await makeUser('Не отметилась', Role.SEWER, '+998900000156');
  await db.insert(dayOffRequests).values({
    userId: restingSewer.id,
    startDate: lateToday,
    endDate: lateToday,
    status: DayOffStatus.APPROVED,
    reviewedBy: ceo.id,
    reviewedAt: new Date(),
  });
  await db
    .update(users)
    .set({ weeklyDayOff: isoWeekdayOf(new Date(`${lateToday}T00:00:00Z`)) })
    .where(eq(users.id, weeklySewer.id));
  await db.insert(shifts).values({ userId: onShiftSewer.id, branchId: branch.id, startedAt: new Date(), ...point });

  const missingAt0910 = await employeesMissingShift(db, atTashkent(lateToday, '09:10'));
  check(
    'напоминание «откройте смену»: кто должен и не отметился — пора (ждущий запрос не освобождает)',
    missingAt0910.includes(absentSewer.id) && missingAt0910.includes(otherSewer.id),
  );
  const notExpected = [restingSewer.id, weeklySewer.id, onShiftSewer.id, lateSewer.id, ceo.id, admin.id];
  check(
    'напоминание «откройте смену»: выходной, выходной по графику, уже на смене, «приду к 10:30», руководство — не в счёт',
    notExpected.every((id) => !missingAt0910.includes(id)),
    JSON.stringify(notExpected.filter((id) => missingAt0910.includes(id))),
  );
  const missingAt1040 = await employeesMissingShift(db, atTashkent(lateToday, '10:40'));
  check(
    'напоминание «откройте смену»: после согласованного «приду к» человек снова ждёт отметки',
    missingAt1040.includes(lateSewer.id),
  );

  check(
    'напоминание «закройте смену»: открытая смена — пора',
    (await employeesWithOpenShift(db)).includes(onShiftSewer.id),
  );
  await db
    .update(shifts)
    .set({ endedAt: new Date() })
    .where(and(eq(shifts.userId, onShiftSewer.id), isNull(shifts.endedAt)));
  check(
    'напоминание «закройте смену»: смену закрыли — не в счёт',
    !(await employeesWithOpenShift(db)).includes(onShiftSewer.id),
  );

  /* ------- 14. Снятие согласования, пересчёт опоздания, гонка решений ------ */

  /*
    Замечания проверки (09.11): одобренное опоздание нельзя было снять;
    одобрение после отметки не меняло уже записанное опоздание; вторая
    отметка за день после вовремя открытой первой считалась опозданием;
    два решения по одному выходному проходили оба.
  */
  const recountSewer = await makeUser('Пересчёт', Role.SEWER, '+998900000157');
  const manualSewer = await makeUser('Ручная запись', Role.SEWER, '+998900000158');
  const recheckSewer = await makeUser('Вернулась с обеда', Role.SEWER, '+998900000159');
  const recountCaller = await callerFor(recountSewer);
  const adminCaller = await callerFor(admin);
  await db.insert(payrollSchemes).values(
    [recountSewer, manualSewer, recheckSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );

  // Вчера по Ташкенту: согласовать можно и задним числом — так руководитель прощает опоздание.
  const pastDay = lateDay(-1);
  /** Отметка прихода: смена в базе, факт опоздания и сверка месяца — то же, что делает `shifts.checkIn`. */
  const checkInAt = async (person: { readonly id: number }, time: string, until: string) => {
    const startedAt = atTashkent(pastDay, time);
    const [shift] = await db
      .insert(shifts)
      .values({ userId: person.id, branchId: branch.id, startedAt, endedAt: atTashkent(pastDay, until), ...point })
      .returning();
    if (shift === undefined) throw new Error('смена не создана');
    await recordLatenessIfAny(db, person.id, shift, null);
  };
  const latenessOn = (userId: number) =>
    db
      .select({
        id: disciplineEvents.id,
        kind: disciplineEvents.kind,
        description: disciplineEvents.description,
        recordedBy: disciplineEvents.recordedBy,
      })
      .from(disciplineEvents)
      .where(and(eq(disciplineEvents.userId, userId), eq(disciplineEvents.occurredOn, pastDay)))
      .orderBy(asc(disciplineEvents.id));
  // Запрос на прошедший день — прямо в базе: через `create` прошлое не попросить.
  const pendingLateOn = async (person: { readonly id: number }, arriveBy: string) => {
    const [row] = await db.insert(lateRequests).values({ userId: person.id, date: pastDay, arriveBy }).returning();
    if (row === undefined) throw new Error('запрос на опоздание не создан');
    return row;
  };

  await checkInAt(recheckSewer, '08:55', '12:00');
  await checkInAt(recheckSewer, '14:00', '18:00');
  const afterRecheck = await latenessOn(recheckSewer.id);
  check(
    'опоздание: пришла вовремя, ушла и вернулась в 14:00 — вторая отметка не опоздание',
    afterRecheck.length === 0,
    JSON.stringify(afterRecheck),
  );

  await checkInAt(recountSewer, '10:40', '13:00');
  await checkInAt(recountSewer, '14:00', '18:00');
  const [lateFromSchedule, ...extraLate] = await latenessOn(recountSewer.id);
  check(
    'опоздание: при отметке — от графика, одно на день и при второй смене',
    lateFromSchedule?.kind === 'late_over_30' &&
      lateFromSchedule.description === 'Смена с 09:00, отметка в 10:40 — опоздание 100 мин' &&
      extraLate.length === 0,
    JSON.stringify([lateFromSchedule, ...extraLate]),
  );

  const recountRequest = await pendingLateOn(recountSewer, '10:30');
  await ceoCaller.lateRequests.approve({ id: recountRequest.id });
  const afterApprove = await latenessOn(recountSewer.id);
  check(
    'опоздание: одобрение после отметки пересчитывает запись на месте — от «приду к», а не от графика',
    afterApprove.length === 1 &&
      afterApprove[0]?.kind === 'late_under_15' &&
      afterApprove[0].description === 'Смена с 10:30, отметка в 10:40 — опоздание 10 мин' &&
      afterApprove[0].id === lateFromSchedule?.id,
    JSON.stringify(afterApprove),
  );
  const recountAudit = await db
    .select({ action: auditLog.action, actorId: auditLog.actorId, entityId: auditLog.entityId, details: auditLog.details })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'discipline_event'),
        inArray(auditLog.entityId, [lateFromSchedule?.id ?? 0, afterApprove[0]?.id ?? 0]),
      ),
    );
  check(
    'опоздание: правка записи — в журнале от имени решившего (discipline.adjusted), без удаления и новой записи',
    recountAudit.some(
      (row) =>
        row.action === 'discipline.adjusted' &&
        row.entityId === lateFromSchedule?.id &&
        row.actorId === ceo.id &&
        row.details?.['auto'] === true,
    ) && !recountAudit.some((row) => row.action === 'discipline.removed'),
    JSON.stringify(recountAudit),
  );
  const [recountApprovedNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, recountSewer.id), eq(notifications.type, NotificationType.LATE_APPROVED)))
    .orderBy(desc(notifications.id))
    .limit(1);
  check(
    'опоздание: в уведомлении об одобрении — что записанное нарушение пересчитано',
    recountApprovedNote?.body.endsWith('пересчитано: опоздание 10 мин.') === true,
    recountApprovedNote?.body ?? 'уведомления нет',
  );

  await expectRejectedWith(
    'опоздание: сотрудник согласование не снимает',
    () => recountCaller.lateRequests.withdraw({ id: recountRequest.id }),
    (message) => message.includes('Недостаточно прав'),
  );
  await expectRejectedWith(
    'опоздание: ждущий решения запрос не снимают — его отклоняют',
    () => ceoCaller.lateRequests.withdraw({ id: latePending.id }),
    (message) => message === 'Снять можно только одобренное опоздание',
  );

  const withdrawnLate = await adminCaller.lateRequests.withdraw({ id: recountRequest.id });
  check(
    'опоздание: снятое согласование — отозвано, рецензент и время решения стёрты',
    withdrawnLate.status === DayOffStatus.CANCELLED &&
      withdrawnLate.reviewedBy === null &&
      withdrawnLate.reviewedAt === null,
    JSON.stringify({ status: withdrawnLate.status, reviewedBy: withdrawnLate.reviewedBy }),
  );
  const afterWithdraw = await latenessOn(recountSewer.id);
  check(
    'опоздание: после снятия согласования опоздание снова считается от графика — в той же записи',
    afterWithdraw.length === 1 &&
      afterWithdraw[0]?.kind === 'late_over_30' &&
      afterWithdraw[0].description === 'Смена с 09:00, отметка в 10:40 — опоздание 100 мин' &&
      afterWithdraw[0].id === lateFromSchedule?.id,
    JSON.stringify(afterWithdraw),
  );
  const [withdrawnNote] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, recountSewer.id), eq(notifications.type, NotificationType.LATE_WITHDRAWN)))
    .limit(1);
  check(
    'опоздание: сотрудник узнаёт о снятии — день, время, кто снял и что нарушение пересчитано',
    withdrawnNote !== undefined &&
      withdrawnNote.body.includes('10:30') &&
      withdrawnNote.body.includes(admin.fullName) &&
      withdrawnNote.body.endsWith('пересчитано: опоздание 100 мин.'),
    withdrawnNote?.body ?? 'уведомления нет',
  );
  const [withdrawnAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'late.withdrawn'), eq(auditLog.entityId, recountRequest.id)))
    .limit(1);
  check(
    'опоздание: снятие — в журнале, о ком и на какой день',
    withdrawnAudit?.details?.['userId'] === recountSewer.id && withdrawnAudit.details['date'] === pastDay,
    JSON.stringify(withdrawnAudit?.details),
  );
  await expectRejectedWith(
    'опоздание: снятое согласование второй раз не снимается',
    () => ceoCaller.lateRequests.withdraw({ id: recountRequest.id }),
    (message) => message === 'Снять можно только одобренное опоздание',
  );

  // Опоздание, записанное руководителем руками, — его решение: пересчёт его не трогает.
  await checkInAt(manualSewer, '10:40', '18:00');
  await db.insert(disciplineEvents).values({
    userId: manualSewer.id,
    kind: 'late_15_30',
    points: '-1.0',
    occurredOn: pastDay,
    description: `${PREFIX} опоздание со слов бригадира`,
    recordedBy: ceo.id,
  });
  const manualRequest = await pendingLateOn(manualSewer, '11:00');
  await ceoCaller.lateRequests.approve({ id: manualRequest.id });
  const afterManual = await latenessOn(manualSewer.id);
  check(
    'опоздание: пересчёт убирает только запись системы, ручная запись руководителя остаётся',
    afterManual.length === 1 && afterManual[0]?.recordedBy === ceo.id,
    JSON.stringify(afterManual),
  );

  /* -- 15. Пересчёт не создаёт штраф, хранит объяснение, пересчитывает повторы -- */

  /*
    Замечания проверки (09.11, второй круг): одобрение СОЗДАВАЛО штраф,
    которого не было (смену завёл руководитель; опоздание он уже простил);
    удаление и новая запись теряли объяснение сотрудника; без графика запись
    стиралась молча; повторы следующих дней месяца не пересчитывались.
  */
  const enteredSewer = await makeUser('Смену завёл руководитель', Role.SEWER, '+998900000160');
  const forgivenSewer = await makeUser('Простили руками', Role.SEWER, '+998900000161');
  const explainedSewer = await makeUser('Объяснила опоздание', Role.SEWER, '+998900000162');
  const unscheduledSewer = await makeUser('График сняли', Role.SEWER, '+998900000163');
  const repeatSewer = await makeUser('Повтор в месяце', Role.SEWER, '+998900000164');
  const failedSewer = await makeUser('Пересчёт сорван', Role.SEWER, '+998900000165');
  await db.insert(payrollSchemes).values(
    [enteredSewer, forgivenSewer, explainedSewer, unscheduledSewer, repeatSewer, failedSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  // Дата в тексте уведомлений — «08.11», без года.
  const pastDayShort = `${pastDay.slice(8, 10)}.${pastDay.slice(5, 7)}`;
  const lateRows = (userId: number, day: string) =>
    db
      .select({
        id: disciplineEvents.id,
        kind: disciplineEvents.kind,
        points: disciplineEvents.points,
        isRepeat: disciplineEvents.isRepeat,
        description: disciplineEvents.description,
        employeeComment: disciplineEvents.employeeComment,
      })
      .from(disciplineEvents)
      .where(and(eq(disciplineEvents.userId, userId), eq(disciplineEvents.occurredOn, day)))
      .orderBy(asc(disciplineEvents.id));
  const disciplineNotes = (userId: number) =>
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, NotificationType.DISCIPLINE_RECORDED)));
  const latestNote = async (userId: number, type: NotificationType): Promise<string | null> => {
    const [note] = await db
      .select({ body: notifications.body })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type)))
      .orderBy(desc(notifications.id))
      .limit(1);
    return note?.body ?? null;
  };

  // Смену завёл руководитель: отметки не было, и опоздание при ней не оценивалось.
  await ceoCaller.shifts.adjustManually({
    userId: enteredSewer.id,
    branchId: branch.id,
    startedAt: atTashkent(pastDay, '09:20'),
    endedAt: atTashkent(pastDay, '18:00'),
    reason: `${PREFIX} забыла отметиться`,
  });
  const enteredRequest = await pendingLateOn(enteredSewer, '09:10');
  await ceoCaller.lateRequests.approve({ id: enteredRequest.id });
  const afterEnteredApprove = await lateRows(enteredSewer.id, pastDay);
  const enteredNotes = await disciplineNotes(enteredSewer.id);
  check(
    'опоздание: смену завёл руководитель — одобрение «приду к 09:10» штраф не создаёт и о нарушении не пишет',
    afterEnteredApprove.length === 0 && enteredNotes.length === 0,
    JSON.stringify({ afterEnteredApprove, enteredNotes }),
  );
  await ceoCaller.lateRequests.withdraw({ id: enteredRequest.id });
  const afterEnteredWithdraw = await lateRows(enteredSewer.id, pastDay);
  check(
    'опоздание: смену завёл руководитель — и снятие согласования штраф не создаёт',
    afterEnteredWithdraw.length === 0 && (await disciplineNotes(enteredSewer.id)).length === 0,
    JSON.stringify(afterEnteredWithdraw),
  );

  // Руководитель простил опоздание руками — одобрение и снятие его не возвращают.
  await checkInAt(forgivenSewer, '09:40', '18:00');
  const [forgivenLate] = await lateRows(forgivenSewer.id, pastDay);
  if (forgivenLate === undefined) throw new Error('опоздание при отметке не записано');
  await ceoCaller.discipline.remove({ id: forgivenLate.id });
  const forgivenRequest = await pendingLateOn(forgivenSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: forgivenRequest.id });
  const afterForgivenApprove = await lateRows(forgivenSewer.id, pastDay);
  check(
    'опоздание: руководитель уже простил опоздание — одобрение его не возвращает',
    afterForgivenApprove.length === 0,
    JSON.stringify(afterForgivenApprove),
  );
  await ceoCaller.lateRequests.withdraw({ id: forgivenRequest.id });
  const afterForgivenWithdraw = await lateRows(forgivenSewer.id, pastDay);
  const forgivenNotes = await disciplineNotes(forgivenSewer.id);
  check(
    'опоздание: прощение руками сильнее снятия согласования — записи нет, нового уведомления о нарушении нет',
    afterForgivenWithdraw.length === 0 && forgivenNotes.length === 1,
    JSON.stringify({ afterForgivenWithdraw, forgivenNotes }),
  );

  // Отметка в 10:25, пока запрос ждёт решения; сотрудник объяснил опоздание.
  const explainedRequest = await pendingLateOn(explainedSewer, '10:00');
  await checkInAt(explainedSewer, '10:25', '18:00');
  const [explainedLate] = await lateRows(explainedSewer.id, pastDay);
  if (explainedLate === undefined) throw new Error('опоздание при отметке не записано');
  const explanation = 'Автобус сломался на Чиланзаре';
  // Объяснение — мутация, а мутации сотрудника — только на открытой смене (сегодняшней).
  await db.insert(shifts).values({ userId: explainedSewer.id, branchId: branch.id, startedAt: new Date(), ...point });
  await (await callerFor(explainedSewer)).discipline.explain({ id: explainedLate.id, comment: explanation });
  await db
    .update(shifts)
    .set({ endedAt: new Date(Date.now() + 1000) })
    .where(and(eq(shifts.userId, explainedSewer.id), isNull(shifts.endedAt)));
  // Когда сотрудник объяснил — запись, созданная заново после снятия, должна нести ровно этот момент.
  const [explainedAt] = await db
    .select({ at: disciplineEvents.employeeCommentAt })
    .from(disciplineEvents)
    .where(eq(disciplineEvents.id, explainedLate.id));
  await ceoCaller.lateRequests.approve({ id: explainedRequest.id });
  const afterExplainedApprove = await lateRows(explainedSewer.id, pastDay);
  check(
    'опоздание: одобрение до 10:00 — та же запись пересчитана до 25 мин, объяснение сотрудника на месте',
    explainedLate.kind === 'late_over_30' &&
      afterExplainedApprove.length === 1 &&
      afterExplainedApprove[0]?.id === explainedLate.id &&
      afterExplainedApprove[0].kind === 'late_15_30' &&
      afterExplainedApprove[0].points === '-1.0' &&
      afterExplainedApprove[0].description === 'Смена с 10:00, отметка в 10:25 — опоздание 25 мин' &&
      afterExplainedApprove[0].employeeComment === explanation,
    JSON.stringify(afterExplainedApprove),
  );
  const recountedNote = await latestNote(explainedSewer.id, NotificationType.LATE_APPROVED);
  check(
    'опоздание: в одобрении сказано, что нарушение пересчитано',
    recountedNote ===
      `Опоздание ${pastDayShort} до 10:00 согласовано (${ceo.fullName}). Нарушение за ${pastDayShort} пересчитано: опоздание 25 мин.`,
    recountedNote ?? 'уведомления нет',
  );
  await ceoCaller.lateRequests.withdraw({ id: explainedRequest.id });
  const afterExplainedWithdraw = await lateRows(explainedSewer.id, pastDay);
  check(
    'опоздание: снятие согласования возвращает 85 мин в той же записи, объяснение не теряется',
    afterExplainedWithdraw.length === 1 &&
      afterExplainedWithdraw[0]?.id === explainedLate.id &&
      afterExplainedWithdraw[0].kind === 'late_over_30' &&
      afterExplainedWithdraw[0].description === 'Смена с 09:00, отметка в 10:25 — опоздание 85 мин' &&
      afterExplainedWithdraw[0].employeeComment === explanation,
    JSON.stringify(afterExplainedWithdraw),
  );
  const explainedSecond = await pendingLateOn(explainedSewer, '10:30');
  await ceoCaller.lateRequests.approve({ id: explainedSecond.id });
  const afterExplainedRemoval = await lateRows(explainedSewer.id, pastDay);
  const [explainedRemovalAudit] = await db
    .select({ actorId: auditLog.actorId, details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.removed'), eq(auditLog.entityId, explainedLate.id)))
    .limit(1);
  check(
    'опоздание: отметка до «приду к 10:30» — запись снята, в журнале от решившего и с объяснением сотрудника',
    afterExplainedRemoval.length === 0 &&
      explainedRemovalAudit?.actorId === ceo.id &&
      explainedRemovalAudit.details?.['auto'] === true &&
      explainedRemovalAudit.details['employeeComment'] === explanation,
    JSON.stringify({ afterExplainedRemoval, details: explainedRemovalAudit?.details }),
  );
  const removedNote = await latestNote(explainedSewer.id, NotificationType.LATE_APPROVED);
  check(
    'опоздание: в одобрении сказано, что нарушение снято',
    removedNote === `Опоздание ${pastDayShort} до 10:30 согласовано (${ceo.fullName}). Нарушение за ${pastDayShort} снято.`,
    removedNote ?? 'уведомления нет',
  );
  /*
    Замечание проверки (пятый круг): одобрение сняло запись вместе с
    объяснением сотрудника, а снятие согласования создавало её заново
    пустой. Сверка, снимая запись, откладывает объяснение и его время в факт
    дня, а вернувшаяся запись забирает их оттуда.
  */
  await ceoCaller.lateRequests.withdraw({ id: explainedSecond.id });
  const [explainedRecreated, ...explainedExtra] = await lateRows(explainedSewer.id, pastDay);
  const [explainedRecreatedAt] = await db
    .select({ at: disciplineEvents.employeeCommentAt })
    .from(disciplineEvents)
    .where(eq(disciplineEvents.id, explainedRecreated?.id ?? 0));
  check(
    'опоздание: снятие согласования создаёт снятую одобрением запись заново — с объяснением сотрудника и его временем',
    explainedRecreated !== undefined &&
      explainedExtra.length === 0 &&
      explainedRecreated.id !== explainedLate.id &&
      explainedRecreated.kind === 'late_over_30' &&
      explainedRecreated.description === 'Смена с 09:00, отметка в 10:25 — опоздание 85 мин' &&
      explainedRecreated.employeeComment === explanation &&
      explainedAt?.at instanceof Date &&
      explainedRecreatedAt?.at?.getTime() === explainedAt.at.getTime() &&
      typeof explainedRemovalAudit?.details?.['employeeCommentAt'] === 'string',
    JSON.stringify({ explainedRecreated, explainedExtra, explainedAt, explainedRecreatedAt }),
  );

  // График сняли после отметки: факт помнит начало 09:00, и решения по запросу судят по нему, а не по нынешнему «графика нет».
  await checkInAt(unscheduledSewer, '09:50', '18:00');
  const [unscheduledLate] = await lateRows(unscheduledSewer.id, pastDay);
  await db
    .update(payrollSchemes)
    .set({ shiftStart: null, shiftEnd: null })
    .where(eq(payrollSchemes.userId, unscheduledSewer.id));
  const unscheduledRequest = await pendingLateOn(unscheduledSewer, '10:00');
  await ceoCaller.lateRequests.approve({ id: unscheduledRequest.id });
  const afterUnscheduled = await lateRows(unscheduledSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: unscheduledRequest.id });
  const afterUnscheduledWithdraw = await lateRows(unscheduledSewer.id, pastDay);
  check(
    'опоздание: график сняли после отметки — факт помнит 09:00: одобрение «до 10:00» снимает, снятие возвращает ту же отметку',
    unscheduledLate !== undefined &&
      afterUnscheduled.length === 0 &&
      afterUnscheduledWithdraw.length === 1 &&
      afterUnscheduledWithdraw[0]?.description === unscheduledLate.description,
    JSON.stringify({ afterUnscheduled, afterUnscheduledWithdraw }),
  );

  /* Повтор в месяце: прошлый месяц — оба дня точно уже прошли и лежат в одном месяце. */
  const { year: todayYear, month: todayMonth } = workshopToday();
  const prevMonth = new Date(Date.UTC(todayYear, todayMonth - 2, 1)).toISOString().slice(0, 7);
  const repeatFirst = `${prevMonth}-05`;
  const repeatSecond = `${prevMonth}-09`;
  const checkInOn = async (person: { readonly id: number }, day: string, time: string) => {
    const startedAt = atTashkent(day, time);
    const [shift] = await db
      .insert(shifts)
      .values({ userId: person.id, branchId: branch.id, startedAt, endedAt: atTashkent(day, '18:00'), ...point })
      .returning();
    if (shift === undefined) throw new Error('смена не создана');
    await recordLatenessIfAny(db, person.id, shift, null);
  };
  const repeatState = async () => {
    const [first] = await lateRows(repeatSewer.id, repeatFirst);
    const [second] = await lateRows(repeatSewer.id, repeatSecond);
    return { first, second };
  };
  await checkInOn(repeatSewer, repeatFirst, '10:40');
  await checkInOn(repeatSewer, repeatSecond, '10:40');
  const beforeExcuse = await repeatState();
  check(
    'опоздание: два опоздания больше 30 мин в месяце — второе повтор, −3',
    beforeExcuse.first?.points === '-2.0' &&
      !beforeExcuse.first.isRepeat &&
      beforeExcuse.second?.isRepeat === true &&
      beforeExcuse.second.points === '-3.0',
    JSON.stringify(beforeExcuse),
  );
  const [repeatRequest] = await db
    .insert(lateRequests)
    .values({ userId: repeatSewer.id, date: repeatFirst, arriveBy: '11:00' })
    .returning();
  if (repeatRequest === undefined) throw new Error('запрос на опоздание не создан');
  await ceoCaller.lateRequests.approve({ id: repeatRequest.id });
  const afterExcuse = await repeatState();
  check(
    'опоздание: первое простили согласованием — второе уже не повтор, балл −2',
    afterExcuse.first === undefined &&
      afterExcuse.second?.id === beforeExcuse.second?.id &&
      afterExcuse.second?.isRepeat === false &&
      afterExcuse.second.points === '-2.0',
    JSON.stringify(afterExcuse),
  );
  await ceoCaller.lateRequests.withdraw({ id: repeatRequest.id });
  const afterRepeatWithdraw = await repeatState();
  const [recreatedAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.recorded'), eq(auditLog.entityId, afterRepeatWithdraw.first?.id ?? 0)))
    .limit(1);
  const repeatNotes = await disciplineNotes(repeatSewer.id);
  check(
    'опоздание: согласование сняли — первое вернулось (пересчётом, с уведомлением), второе снова повтор −3',
    afterRepeatWithdraw.first?.kind === 'late_over_30' &&
      !afterRepeatWithdraw.first.isRepeat &&
      afterRepeatWithdraw.first.points === '-2.0' &&
      afterRepeatWithdraw.second?.isRepeat === true &&
      afterRepeatWithdraw.second.points === '-3.0' &&
      recreatedAudit?.details?.['recomputed'] === true &&
      repeatNotes.length === 3,
    JSON.stringify({ ...afterRepeatWithdraw, recreated: recreatedAudit?.details, notes: repeatNotes.length }),
  );

  /*
    Пересчёт упал — решение откатывается целиком: запрос ждёт решения, журнала
    и уведомления нет. Сорвать пересчёт без крючков в коде продукта — триггером
    только на запись этого сотрудника; убирается сразу и ещё раз в `cleanup`.
  */
  await checkInAt(failedSewer, '10:40', '18:00');
  const failedRequest = await pendingLateOn(failedSewer, '10:30');
  const [failedLate] = await lateRows(failedSewer.id, pastDay);
  await db.execute(
    sql`create or replace function smoke_fail_recount() returns trigger language plpgsql as $$ begin raise exception 'smoke: пересчёт сорван'; end $$`,
  );
  await db.execute(
    sql`create trigger smoke_fail_recount before update or delete on discipline_events for each row when (old.user_id = ${sql.raw(failedSewer.id.toString())}) execute function smoke_fail_recount()`,
  );
  try {
    await expectRejectedWith(
      'опоздание: пересчёт упал — одобрение не проходит',
      () => ceoCaller.lateRequests.approve({ id: failedRequest.id }),
      (message) => message.includes('пересчёт сорван'),
    );
  } finally {
    await dropRecountTrap(db);
  }
  const [failedState] = await db
    .select({ status: lateRequests.status })
    .from(lateRequests)
    .where(eq(lateRequests.id, failedRequest.id));
  const failedAudit = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'late_request'), eq(auditLog.entityId, failedRequest.id)));
  const failedNote = await latestNote(failedSewer.id, NotificationType.LATE_APPROVED);
  const failedAfter = await lateRows(failedSewer.id, pastDay);
  check(
    'опоздание: после сорванного пересчёта запрос ждёт решения, журнала и уведомления нет, запись прежняя',
    failedState?.status === DayOffStatus.PENDING &&
      failedAudit.length === 0 &&
      failedNote === null &&
      failedAfter.length === 1 &&
      failedAfter[0]?.description === failedLate?.description,
    JSON.stringify({ failedState, failedAudit, failedNote, failedAfter }),
  );

  /* --- 16. Одобрение не утяжеляет, прощение — только записи системы, ручные опоздания, гонки --- */

  /*
    Замечания проверки (09.11, третий круг): одобрение после переноса смены
    руководителем делало штраф строже; о заново созданной при снятии записи
    сотрудник узнавал в Telegram раньше, чем решение зафиксировано; удаление
    своей ошибочной ручной записи считалось прощением; ручная запись считала
    повтор по любому событию месяца и не пересчитывала повторы системы;
    решение и отметка одного дня читали друг друга без блокировок.
  */
  const worsenSewer = await makeUser('График сдвинули', Role.SEWER, '+998900000166');
  const mistakeSewer = await makeUser('Ошибочная ручная запись', Role.SEWER, '+998900000167');
  const stepDownSewer = await makeUser('Ступенью ниже', Role.SEWER, '+998900000168');
  const manualRepeatSewer = await makeUser('Ручное опоздание раньше', Role.SEWER, '+998900000169');
  const raceSewer = await makeUser('Отметка во время решения', Role.SEWER, '+998900000170');
  await db.insert(payrollSchemes).values(
    [worsenSewer, mistakeSewer, stepDownSewer, manualRepeatSewer, raceSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );

  /*
    Отметка 09:10 при смене с 09:00 (10 мин, −0,5); потом график ЭТОГО дня
    в условиях оплаты переназначили на 08:00 (схема правится на месте — как
    если бы новая действовала и в тот день), и «приду к 08:30» дало бы от
    08:30 40 мин, −2. Смена графика с более поздней даты прошлый день не
    трогает вовсе (раздел 18); перенос самой смены руководителем сюда тоже
    не ведёт: опоздание оценивается по времени отметки (раздел 17).
  */
  await checkInAt(worsenSewer, '09:10', '18:00');
  const [worsenLate] = await lateRows(worsenSewer.id, pastDay);
  if (worsenLate === undefined) throw new Error('опоздание при отметке не записано');
  await db.update(payrollSchemes).set({ shiftStart: '08:00' }).where(eq(payrollSchemes.userId, worsenSewer.id));
  const worsenRequest = await pendingLateOn(worsenSewer, '08:30');
  await ceoCaller.lateRequests.approve({ id: worsenRequest.id });
  const afterWorsen = await lateRows(worsenSewer.id, pastDay);
  const worsenAudit = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'discipline_event'),
        eq(auditLog.entityId, worsenLate.id),
        inArray(auditLog.action, ['discipline.adjusted', 'discipline.removed']),
      ),
    );
  check(
    'опоздание: график сдвинули после отметки — одобрение штраф не утяжеляет: запись прежняя, правки в журнале нет',
    afterWorsen.length === 1 &&
      afterWorsen[0]?.id === worsenLate.id &&
      afterWorsen[0].kind === 'late_under_15' &&
      afterWorsen[0].points === '-0.5' &&
      afterWorsen[0].description === 'Смена с 09:00, отметка в 09:10 — опоздание 10 мин' &&
      worsenAudit.length === 0,
    JSON.stringify({ afterWorsen, worsenAudit }),
  );
  const worsenNote = await latestNote(worsenSewer.id, NotificationType.LATE_APPROVED);
  check(
    // «Можно прийти» — только про день впереди; про вчерашний день оно читалось бы странно, даже без пересчёта.
    'опоздание: одобрение за прошедший день без пересчёта — «Опоздание … согласовано», без «Можно прийти» и без «пересчитано»',
    worsenNote === `Опоздание ${pastDayShort} до 08:30 согласовано (${ceo.fullName})`,
    worsenNote ?? 'уведомления нет',
  );

  /*
    Руководитель стёр свою ошибочную ручную запись — это не прощение
    опоздания по отметке: снятие согласования его возвращает. О вернувшейся
    записи сотрудник узнаёт последним шагом — после уведомления о снятии.
  */
  await checkInAt(mistakeSewer, '09:40', '18:00');
  const mistakeRequest = await pendingLateOn(mistakeSewer, '09:50');
  await ceoCaller.lateRequests.approve({ id: mistakeRequest.id });
  const mistakeManual = await ceoCaller.discipline.record({
    userId: mistakeSewer.id,
    kind: 'late_15_30',
    occurredOn: pastDay,
    description: `${PREFIX} перепутали сотрудника`,
  });
  await ceoCaller.discipline.remove({ id: mistakeManual.id });
  const [mistakeRemovalAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.removed'), eq(auditLog.entityId, mistakeManual.id)))
    .limit(1);
  check(
    'дисциплина: ручное удаление пишет в журнал, чья была запись — recordedBy и auto (запись системы или нет)',
    mistakeRemovalAudit?.details?.['recordedBy'] === ceo.id && mistakeRemovalAudit.details['auto'] === false,
    JSON.stringify(mistakeRemovalAudit?.details),
  );
  await ceoCaller.lateRequests.withdraw({ id: mistakeRequest.id });
  const afterMistakeWithdraw = await lateRows(mistakeSewer.id, pastDay);
  check(
    'опоздание: стёртая ручная запись — не прощение; снятие согласования возвращает опоздание по отметке',
    afterMistakeWithdraw.length === 1 &&
      afterMistakeWithdraw[0]?.kind === 'late_over_30' &&
      afterMistakeWithdraw[0].description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify(afterMistakeWithdraw),
  );
  const mistakeNotes = await db
    .select({ id: notifications.id, type: notifications.type })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, mistakeSewer.id),
        inArray(notifications.type, [NotificationType.LATE_WITHDRAWN, NotificationType.DISCIPLINE_RECORDED]),
      ),
    )
    .orderBy(asc(notifications.id));
  const mistakeLastTwo = mistakeNotes.slice(-2).map((note) => note.type);
  check(
    'опоздание: о вернувшейся записи сотрудник узнаёт последним шагом — после уведомления о снятии',
    mistakeLastTwo[0] === NotificationType.LATE_WITHDRAWN && mistakeLastTwo[1] === NotificationType.DISCIPLINE_RECORDED,
    JSON.stringify(mistakeNotes),
  );

  /*
    Одобрение не утяжеляет и другой день. 12-го — 20 мин (−1), 16-го — 10 мин
    (−0,5). Одобрили 12-е «до 09:10» — там 10 мин, ступенью ниже; строгий
    пересчёт сделал бы 16-е повтором (−1,5), а одобрение другого дня — не повод.
  */
  const stepFirst = `${prevMonth}-12`;
  const stepSecond = `${prevMonth}-16`;
  await checkInOn(stepDownSewer, stepFirst, '09:20');
  await checkInOn(stepDownSewer, stepSecond, '09:10');
  const [stepRequest] = await db
    .insert(lateRequests)
    .values({ userId: stepDownSewer.id, date: stepFirst, arriveBy: '09:10' })
    .returning();
  if (stepRequest === undefined) throw new Error('запрос на опоздание не создан');
  await ceoCaller.lateRequests.approve({ id: stepRequest.id });
  const [stepFirstRow] = await lateRows(stepDownSewer.id, stepFirst);
  const [stepSecondRow] = await lateRows(stepDownSewer.id, stepSecond);
  check(
    'опоздание: одобрение увело день ступенью ниже — более поздний день той ступени повтором не становится',
    stepFirstRow?.kind === 'late_under_15' &&
      stepFirstRow.points === '-0.5' &&
      stepSecondRow?.kind === 'late_under_15' &&
      !stepSecondRow.isRepeat &&
      stepSecondRow.points === '-0.5',
    JSON.stringify({ stepFirstRow, stepSecondRow }),
  );

  /*
    Пример проверки (четвёртый круг): 16-е одобрение оставило не повтором.
    Руководитель записывает руками опоздание до 15 мин за 20-е, потом
    убирает его. Строгий обход всего месяца делал 16-е повтором (−1,5) — от
    имени руководителя и с днём 20-е, хотя запись за 20-е на 16-е повлиять не
    может. Оценка месяца считает повтор только по более ранним дням, а
    одобренное 12-е более ранним событием не считает вовсе.
  */
  const stepManualDay = `${prevMonth}-20`;
  const stepSecondAdjustments = async () =>
    (
      await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.action, 'discipline.adjusted'), eq(auditLog.entityId, stepSecondRow?.id ?? 0)))
    ).length;
  const stepSecondAdjustedBefore = await stepSecondAdjustments();
  const stepManual = await ceoCaller.discipline.record({
    userId: stepDownSewer.id,
    kind: 'late_under_15',
    occurredOn: stepManualDay,
    description: `${PREFIX} со слов бригадира`,
  });
  const [stepSecondAfterAdd] = await lateRows(stepDownSewer.id, stepSecond);
  const stepSecondAdjustedAfterAdd = await stepSecondAdjustments();
  check(
    'дисциплина: ручное опоздание за 20-е — само повтор (−1,5), а 16-е, оставленное одобрением не повтором, не трогает',
    stepManual.isRepeat &&
      stepManual.points === -1.5 &&
      stepSecondAfterAdd?.isRepeat === false &&
      stepSecondAfterAdd.points === '-0.5' &&
      stepSecondAdjustedAfterAdd === stepSecondAdjustedBefore,
    JSON.stringify({
      stepManual: { isRepeat: stepManual.isRepeat, points: stepManual.points },
      stepSecondAfterAdd,
      adjusted: [stepSecondAdjustedBefore, stepSecondAdjustedAfterAdd],
    }),
  );
  await ceoCaller.discipline.remove({ id: stepManual.id });
  const [stepSecondAfterRemove] = await lateRows(stepDownSewer.id, stepSecond);
  const stepSecondAdjustedAfterRemove = await stepSecondAdjustments();
  check(
    'дисциплина: и удаление ручной записи за 20-е 16-е не трогает',
    stepSecondAfterRemove?.isRepeat === false &&
      stepSecondAfterRemove.points === '-0.5' &&
      stepSecondAdjustedAfterRemove === stepSecondAdjustedBefore,
    JSON.stringify({ stepSecondAfterRemove, adjusted: stepSecondAdjustedAfterRemove }),
  );

  /*
    Ручная запись — повтор, только если такое же было РАНЬШЕ, и она
    пересчитывает повторы системы в месяце: системное опоздание больше 30 мин
    09-го, руководитель задним числом записывает такое же за 05-е.
  */
  const manualLater = `${prevMonth}-09`;
  const manualEarlier = `${prevMonth}-05`;
  await checkInOn(manualRepeatSewer, manualLater, '10:00');
  const manualEarly = await ceoCaller.discipline.record({
    userId: manualRepeatSewer.id,
    kind: 'late_over_30',
    occurredOn: manualEarlier,
    description: `${PREFIX} со слов бригадира`,
  });
  const [laterAfterAdd] = await lateRows(manualRepeatSewer.id, manualLater);
  check(
    'дисциплина: ручное опоздание задним числом — не повтор (09-е позже), а системное 09-го стало повтором, −3',
    !manualEarly.isRepeat &&
      manualEarly.points === -2 &&
      laterAfterAdd?.isRepeat === true &&
      laterAfterAdd.points === '-3.0',
    JSON.stringify({ manualEarly: { isRepeat: manualEarly.isRepeat, points: manualEarly.points }, laterAfterAdd }),
  );
  const [manualRepeatAudit] = await db
    .select({ actorId: auditLog.actorId, details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.adjusted'), eq(auditLog.entityId, laterAfterAdd?.id ?? 0)))
    .orderBy(desc(auditLog.id))
    .limit(1);
  check(
    'дисциплина: повтор после ручной записи — в журнале от руководителя, причина manual_discipline_change',
    manualRepeatAudit?.actorId === ceo.id &&
      manualRepeatAudit.details?.['reason'] === 'manual_discipline_change' &&
      manualRepeatAudit.details['reviewedDay'] === manualEarlier,
    JSON.stringify(manualRepeatAudit),
  );
  await ceoCaller.discipline.remove({ id: manualEarly.id });
  const [laterAfterRemove] = await lateRows(manualRepeatSewer.id, manualLater);
  check(
    'дисциплина: ручное опоздание убрали — системное 09-го больше не повтор, −2',
    laterAfterRemove?.isRepeat === false && laterAfterRemove.points === '-2.0',
    JSON.stringify(laterAfterRemove),
  );

  /*
    Ручная запись за день, где уже есть запись системы того же вида: запись
    руководителя заменяет системную (проекция её снимает), значит повтором
    ручную делать по ней нельзя — иначе одно опоздание дня стоит по ставке
    повтора, хотя оно первое в месяце (проверка 09.11: −2,0 вместо −1,0).
  */
  const sameDaySewer = await makeUser('Ручная запись поверх системной', Role.SEWER, '+998900000201');
  const excusedEarlierSewer = await makeUser('Ручная запись после согласованного', Role.SEWER, '+998900000202');
  await db.insert(payrollSchemes).values(
    [sameDaySewer, excusedEarlierSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  const sameDay = `${prevMonth}-02`;
  await checkInOn(sameDaySewer, sameDay, '09:20');
  const sameDayManual = await ceoCaller.discipline.record({
    userId: sameDaySewer.id,
    kind: 'late_15_30',
    occurredOn: sameDay,
    description: `${PREFIX} руководитель уточнил`,
  });
  const sameDayRows = await lateRows(sameDaySewer.id, sameDay);
  check(
    'дисциплина: ручная запись поверх системной того же дня — не повтор (−1,0), системная снята',
    !sameDayManual.isRepeat &&
      sameDayManual.points === -1 &&
      sameDayRows.length === 1 &&
      sameDayRows[0]?.id === sameDayManual.id,
    JSON.stringify({ manual: { isRepeat: sameDayManual.isRepeat, points: sameDayManual.points }, sameDayRows }),
  );

  /*
    Согласованное опоздание не делает следующие повторными — и для ручной
    записи тоже: 03-го пришла в 09:40, одобрено «до 09:30» (осталось до 15
    мин, −0,5); ручная запись того же вида за 05-е — первая, −0,5, а не −1,5.
  */
  const excusedDay = `${prevMonth}-03`;
  await checkInOn(excusedEarlierSewer, excusedDay, '09:40');
  const [excusedRequest] = await db
    .insert(lateRequests)
    .values({ userId: excusedEarlierSewer.id, date: excusedDay, arriveBy: '09:30' })
    .returning();
  if (excusedRequest === undefined) throw new Error('запрос на опоздание не создан');
  await ceoCaller.lateRequests.approve({ id: excusedRequest.id });
  const [excusedRow] = await lateRows(excusedEarlierSewer.id, excusedDay);
  const afterExcusedManual = await ceoCaller.discipline.record({
    userId: excusedEarlierSewer.id,
    kind: 'late_under_15',
    occurredOn: `${prevMonth}-05`,
    description: `${PREFIX} со слов бригадира`,
  });
  check(
    'дисциплина: ручная запись после согласованного опоздания того же вида — не повтор, −0,5',
    excusedRow?.kind === 'late_under_15' && !afterExcusedManual.isRepeat && afterExcusedManual.points === -0.5,
    JSON.stringify({ excusedRow, manual: { isRepeat: afterExcusedManual.isRepeat, points: afterExcusedManual.points } }),
  );

  /*
    Гонка из проверки: отметка записала опоздание от графика и ещё не
    зафиксирована, а руководитель тем временем одобряет запрос на этот день.
    Без общего замка одобрение не видело незафиксированную смену, пересчитывать
    ему было нечего, и после обоих коммитов оставались 100 минут при одобренном
    запросе. Отметка — как в `shifts.checkIn`: замок, смена, опоздание; одобрение
    запускается внутри её транзакции и должно дождаться коммита.
  */
  const raceRequest = await pendingLateOn(raceSewer, '10:30');
  let raceApproval: Promise<unknown> = Promise.resolve(null);
  await db.transaction(async (tx) => {
    await lockLatenessOf(tx, raceSewer.id);
    const startedAt = atTashkent(pastDay, '10:40');
    const [raceShift] = await tx
      .insert(shifts)
      .values({ userId: raceSewer.id, branchId: branch.id, startedAt, endedAt: atTashkent(pastDay, '18:00'), ...point })
      .returning();
    if (raceShift === undefined) throw new Error('смена не создана');
    await recordLatenessIfAny(tx, raceSewer.id, raceShift, null);
    // Ошибка одобрения — значением, а не отказом: отказ до конца отметки остался бы без обработчика.
    raceApproval = ceoCaller.lateRequests.approve({ id: raceRequest.id }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : 'не Error'),
    );
    // Время одобрению дойти до замка; без замка оно успело бы зафиксироваться раньше отметки.
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const raceError = await raceApproval;
  const afterRace = await lateRows(raceSewer.id, pastDay);
  check(
    'опоздание: одобрение во время отметки ждёт её коммита и пересчитывает записанное — от «приду к 10:30»',
    raceError === null &&
      afterRace.length === 1 &&
      afterRace[0]?.kind === 'late_under_15' &&
      afterRace[0].description === 'Смена с 10:30, отметка в 10:40 — опоздание 10 мин',
    JSON.stringify({ raceError, afterRace }),
  );

  // Двое руководителей одновременно решают за одного человека два дня месяца — без взаимной блокировки.
  const raceFirst = `${prevMonth}-20`;
  const raceSecond = `${prevMonth}-24`;
  await checkInOn(raceSewer, raceFirst, '10:40');
  await checkInOn(raceSewer, raceSecond, '10:40');
  const raceRequests = await db
    .insert(lateRequests)
    .values([raceFirst, raceSecond].map((date) => ({ userId: raceSewer.id, date, arriveBy: '10:30' })))
    .returning();
  const parallelDecisions = await Promise.allSettled(
    raceRequests.map((request, index) =>
      (index === 0 ? ceoCaller : adminCaller).lateRequests.approve({ id: request.id }),
    ),
  );
  const [raceFirstRow] = await lateRows(raceSewer.id, raceFirst);
  const [raceSecondRow] = await lateRows(raceSewer.id, raceSecond);
  check(
    'опоздание: два одновременных одобрения за одного человека — оба проходят, оба дня пересчитаны',
    parallelDecisions.every((outcome) => outcome.status === 'fulfilled') &&
      raceFirstRow?.kind === 'late_under_15' &&
      raceSecondRow?.kind === 'late_under_15',
    JSON.stringify({
      failed: parallelDecisions.flatMap((outcome) =>
        outcome.status === 'rejected' ? [outcome.reason instanceof Error ? outcome.reason.message : 'не Error'] : [],
      ),
      raceFirstRow,
      raceSecondRow,
    }),
  );

  /* ------- 17. Опоздание — по времени отметки, а не по смене в базе ------- */

  /*
    Замечания проверки (09.11, четвёртый круг): снятие согласования после
    переноса смены руководителем считало опоздание от перенесённого начала —
    отметка 09:05 (−0,5), смена перенесена на 10:30, и после снятия стояло
    «опоздание 90 мин», −2, которых отметка никогда не показывала; правка
    одного только ухода лишала снятие права вернуть штраф по отметке.
  */
  const movedSewer = await makeUser('Смену перенесли', Role.SEWER, '+998900000171');
  const loweredSewer = await makeUser('Одобрение смягчило', Role.SEWER, '+998900000172');
  const endFixedSewer = await makeUser('Поправили уход', Role.SEWER, '+998900000173');
  await db.insert(payrollSchemes).values(
    [movedSewer, loweredSewer, endFixedSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  /** Руководитель правит смену за прошедший день — как на сайте, через `shifts.adjustManually`. */
  const adjustShiftOf = async (person: { readonly id: number }, from: string, until: string) => {
    const [shift] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.userId, person.id)).limit(1);
    if (shift === undefined) throw new Error('смена не найдена');
    await ceoCaller.shifts.adjustManually({
      shiftId: shift.id,
      userId: person.id,
      branchId: branch.id,
      startedAt: atTashkent(pastDay, from),
      endedAt: atTashkent(pastDay, until),
      reason: `${PREFIX} поправили смену`,
    });
  };
  /** Правки записей сотрудника в журнале — пересчётом на месте или повторов. */
  const disciplineAdjustmentsOf = (userId: number) =>
    db
      .select({ id: auditLog.id, details: auditLog.details })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'discipline.adjusted'), sql`${auditLog.details}->>'userId' = ${userId.toString()}`));

  // Ровно сценарий проверки: отметка 09:05, смена перенесена на 10:30, одобрение «приду к 09:30», снятие.
  await checkInAt(movedSewer, '09:05', '18:00');
  await adjustShiftOf(movedSewer, '10:30', '18:00');
  const movedRequest = await pendingLateOn(movedSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: movedRequest.id });
  const afterMovedApprove = await lateRows(movedSewer.id, pastDay);
  const movedApprovedNote = await latestNote(movedSewer.id, NotificationType.LATE_APPROVED);
  check(
    'опоздание: смену перенесли на 10:30 — одобрение «приду к 09:30» судит по отметке 09:05: пришла вовремя, нарушение снято',
    afterMovedApprove.length === 0 &&
      movedApprovedNote ===
        `Опоздание ${pastDayShort} до 09:30 согласовано (${ceo.fullName}). Нарушение за ${pastDayShort} снято.`,
    JSON.stringify({ afterMovedApprove, movedApprovedNote }),
  );
  await ceoCaller.lateRequests.withdraw({ id: movedRequest.id });
  const afterMovedWithdraw = await lateRows(movedSewer.id, pastDay);
  const movedAdjustments = await disciplineAdjustmentsOf(movedSewer.id);
  const movedWithdrawnNote = await latestNote(movedSewer.id, NotificationType.LATE_WITHDRAWN);
  const movedDisciplineNote = await latestNote(movedSewer.id, NotificationType.DISCIPLINE_RECORDED);
  check(
    'опоздание: снятие согласования возвращает ровно опоздание по отметке — 5 мин, −0,5, а не 90 мин от перенесённой смены; правок записи в журнале нет',
    afterMovedWithdraw.length === 1 &&
      afterMovedWithdraw[0]?.kind === 'late_under_15' &&
      afterMovedWithdraw[0].points === '-0.5' &&
      afterMovedWithdraw[0].description === 'Смена с 09:00, отметка в 09:05 — опоздание 5 мин' &&
      movedAdjustments.length === 0 &&
      movedWithdrawnNote === `Опоздание ${pastDayShort} до 09:30 больше не согласовано (${ceo.fullName})` &&
      movedDisciplineNote?.endsWith(`(−0,5) за ${pastDayShort} — Система`) === true,
    JSON.stringify({ afterMovedWithdraw, movedAdjustments, movedWithdrawnNote, movedDisciplineNote }),
  );

  // Одобрение смягчает по-настоящему: отметка 09:40 (40 мин, −2), смена перенесена на 10:30, «приду к 09:30».
  await checkInAt(loweredSewer, '09:40', '18:00');
  const [loweredLate] = await lateRows(loweredSewer.id, pastDay);
  if (loweredLate === undefined) throw new Error('опоздание при отметке не записано');
  await adjustShiftOf(loweredSewer, '10:30', '18:00');
  const loweredRequest = await pendingLateOn(loweredSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: loweredRequest.id });
  const afterLoweredApprove = await lateRows(loweredSewer.id, pastDay);
  check(
    'опоздание: смену перенесли на 10:30 — одобрение «приду к 09:30» считает от отметки 09:40: 10 мин, −0,5 в той же записи',
    afterLoweredApprove.length === 1 &&
      afterLoweredApprove[0]?.id === loweredLate.id &&
      afterLoweredApprove[0].kind === 'late_under_15' &&
      afterLoweredApprove[0].points === '-0.5' &&
      afterLoweredApprove[0].description === 'Смена с 09:30, отметка в 09:40 — опоздание 10 мин',
    JSON.stringify(afterLoweredApprove),
  );
  await ceoCaller.lateRequests.withdraw({ id: loweredRequest.id });
  const afterLoweredWithdraw = await lateRows(loweredSewer.id, pastDay);
  const loweredWithdrawnNote = await latestNote(loweredSewer.id, NotificationType.LATE_WITHDRAWN);
  check(
    'опоздание: снятие согласования возвращает ровно исходные 40 мин, −2 в той же записи, а не 90 мин от перенесённой смены',
    afterLoweredWithdraw.length === 1 &&
      afterLoweredWithdraw[0]?.id === loweredLate.id &&
      afterLoweredWithdraw[0].kind === 'late_over_30' &&
      afterLoweredWithdraw[0].points === '-2.0' &&
      afterLoweredWithdraw[0].description === loweredLate.description &&
      loweredWithdrawnNote ===
        `Опоздание ${pastDayShort} до 09:30 больше не согласовано (${ceo.fullName}). Нарушение за ${pastDayShort} пересчитано: опоздание 40 мин.`,
    JSON.stringify({ afterLoweredWithdraw, original: loweredLate.description, loweredWithdrawnNote }),
  );

  // Руководитель поправил только уход: смена помечена правленой, но начало — отметка, и штраф возвращается.
  await checkInAt(endFixedSewer, '09:40', '18:00');
  await adjustShiftOf(endFixedSewer, '09:40', '17:00');
  const [endFixedShift] = await db
    .select({ isManuallyAdjusted: shifts.isManuallyAdjusted })
    .from(shifts)
    .where(eq(shifts.userId, endFixedSewer.id));
  const endFixedRequest = await pendingLateOn(endFixedSewer, '09:45');
  await ceoCaller.lateRequests.approve({ id: endFixedRequest.id });
  const afterEndFixedApprove = await lateRows(endFixedSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: endFixedRequest.id });
  const afterEndFixedWithdraw = await lateRows(endFixedSewer.id, pastDay);
  check(
    'опоздание: поправили только уход — одобрение «приду к 09:45» снимает, снятие согласования возвращает 40 мин, −2 по отметке',
    endFixedShift?.isManuallyAdjusted === true &&
      afterEndFixedApprove.length === 0 &&
      afterEndFixedWithdraw.length === 1 &&
      afterEndFixedWithdraw[0]?.kind === 'late_over_30' &&
      afterEndFixedWithdraw[0].points === '-2.0' &&
      afterEndFixedWithdraw[0].description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify({ endFixedShift, afterEndFixedApprove, afterEndFixedWithdraw }),
  );

  // Подпись системы в узбекской ленте — «Tizim», а не русское «Система».
  const endFixedUzCaller = createCallerFactory(appRouter)({
    db,
    user: await actorOf(endFixedSewer.id),
    requestId: 'smoke',
    ipAddress: null,
    userAgent: null,
    locale: 'uz',
  });
  const endFixedUzFeed = await endFixedUzCaller.notifications.list({ page: 1, pageSize: 20, unreadOnly: false });
  const endFixedUzDiscipline = endFixedUzFeed.items.find((item) => item.type === NotificationType.DISCIPLINE_RECORDED);
  check(
    'уведомления: опоздание, записанное системой, в узбекской ленте подписано «Tizim»',
    endFixedUzDiscipline?.body.endsWith('— Tizim') === true,
    endFixedUzDiscipline?.body ?? 'уведомления нет',
  );

  /* --- 18. График — того дня, повторы — где правка их меняет, отметка — самая ранняя по времени отметки --- */

  /*
    Замечания проверки (пятый круг): после смены графика снятие согласования
    переписывало прошлый день по новому графику, а одобрение за прошлый день
    после переноса графика позже снимало законное опоздание; строгий
    пересчёт повторов поднимал записи, которых правка не касалась; запись,
    созданная заново, искала отметку по нынешнему началу первой смены.
  */
  const earlierScheduleSewer = await makeUser('График сменили на раньше', Role.SEWER, '+998900000174');
  const laterScheduleSewer = await makeUser('График сменили на позже', Role.SEWER, '+998900000175');
  const futureScheduleSewer = await makeUser('График с завтрашнего дня', Role.SEWER, '+998900000176');
  const strictRepeatSewer = await makeUser('Повторы без лишнего подъёма', Role.SEWER, '+998900000177');
  const movedFirstSewer = await makeUser('Первую смену перенесли', Role.SEWER, '+998900000178');
  const addedEarlierSewer = await makeUser('Смену добавили раньше', Role.SEWER, '+998900000179');
  const otherDaySewer = await makeUser('Смену унесли в другой день', Role.SEWER, '+998900000180');
  const morningEnteredSewer = await makeUser('Утро завёл руководитель', Role.SEWER, '+998900000181');
  await db.insert(payrollSchemes).values(
    [
      earlierScheduleSewer,
      laterScheduleSewer,
      futureScheduleSewer,
      strictRepeatSewer,
      movedFirstSewer,
      addedEarlierSewer,
      otherDaySewer,
      morningEnteredSewer,
    ].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  /** Новый график — как на сайте: `payroll.schemes.upsert` гасит прежнюю схему и заводит новую со своей датой. */
  const rescheduleOf = (person: { readonly id: number }, shiftStart: string, effectiveFrom: string) =>
    adminCaller.payroll.schemes.upsert({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: 10_000,
      shiftStart,
      shiftEnd: '18:00',
      effectiveFrom,
    });

  // Ровно сценарий проверки: отметка 09:10 при 09:00 (−0,5), график с сегодня — 08:00, одобрение «приду к 08:30» за вчера, снятие.
  await checkInAt(earlierScheduleSewer, '09:10', '18:00');
  const [earlierScheduleLate] = await lateRows(earlierScheduleSewer.id, pastDay);
  if (earlierScheduleLate === undefined) throw new Error('опоздание при отметке не записано');
  await rescheduleOf(earlierScheduleSewer, '08:00', lateToday);
  const earlierScheduleRequest = await pendingLateOn(earlierScheduleSewer, '08:30');
  await ceoCaller.lateRequests.approve({ id: earlierScheduleRequest.id });
  const afterEarlierScheduleApprove = await lateRows(earlierScheduleSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: earlierScheduleRequest.id });
  const afterEarlierScheduleWithdraw = await lateRows(earlierScheduleSewer.id, pastDay);
  const earlierScheduleAdjustments = await disciplineAdjustmentsOf(earlierScheduleSewer.id);
  check(
    'опоздание: график сменили на 08:00 с сегодня — одобрение и снятие за вчера считают от вчерашнего графика: ровно 10 мин, −0,5, правок в журнале нет',
    [afterEarlierScheduleApprove, afterEarlierScheduleWithdraw].every(
      (rows) =>
        rows.length === 1 &&
        rows[0]?.id === earlierScheduleLate.id &&
        rows[0].kind === 'late_under_15' &&
        rows[0].points === '-0.5' &&
        !rows[0].isRepeat &&
        rows[0].description === 'Смена с 09:00, отметка в 09:10 — опоздание 10 мин',
    ) && earlierScheduleAdjustments.length === 0,
    JSON.stringify({ afterEarlierScheduleApprove, afterEarlierScheduleWithdraw, earlierScheduleAdjustments }),
  );

  // График перенесли на 10:00 с сегодня; «приду к 09:30» за вчера — от вчерашних 09:00, а не «пришла вовремя» по новому.
  await checkInAt(laterScheduleSewer, '09:40', '18:00');
  const [laterScheduleLate] = await lateRows(laterScheduleSewer.id, pastDay);
  if (laterScheduleLate === undefined) throw new Error('опоздание при отметке не записано');
  await rescheduleOf(laterScheduleSewer, '10:00', lateToday);
  const laterScheduleRequest = await pendingLateOn(laterScheduleSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: laterScheduleRequest.id });
  const afterLaterScheduleApprove = await lateRows(laterScheduleSewer.id, pastDay);
  check(
    'опоздание: график перенесли на 10:00 с сегодня — одобрение «приду к 09:30» за вчера законное опоздание не снимает: 10 мин от 09:30, −0,5',
    laterScheduleLate.kind === 'late_over_30' &&
      afterLaterScheduleApprove.length === 1 &&
      afterLaterScheduleApprove[0]?.id === laterScheduleLate.id &&
      afterLaterScheduleApprove[0].kind === 'late_under_15' &&
      afterLaterScheduleApprove[0].points === '-0.5' &&
      afterLaterScheduleApprove[0].description === 'Смена с 09:30, отметка в 09:40 — опоздание 10 мин',
    JSON.stringify({ laterScheduleLate, afterLaterScheduleApprove }),
  );

  // Отметка — по графику её дня: новый с сегодня уже действует, назначенный с завтра — ещё нет.
  await rescheduleOf(futureScheduleSewer, '10:00', lateTomorrow);
  await checkInToday(laterScheduleSewer, '09:40');
  await checkInToday(futureScheduleSewer, '09:40');
  const laterScheduleToday = await lateRows(laterScheduleSewer.id, lateToday);
  const futureScheduleToday = await lateRows(futureScheduleSewer.id, lateToday);
  check(
    'опоздание: отметка сегодня в 09:40 — по графику с сегодня (10:00) вовремя, а график с завтра (10:00) ещё не действует: 40 мин от 09:00',
    laterScheduleToday.length === 0 &&
      futureScheduleToday.length === 1 &&
      futureScheduleToday[0]?.description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify({ laterScheduleToday, futureScheduleToday }),
  );

  /*
    Пример проверки (E4): 02-го 09:40 (−2), 03-го 09:25 (−1), 06-го 09:10
    (−0,5). Одобрение 03-го «до 09:20» увело его в «до 15 мин», 06-е бережно
    осталось не повтором; одобрение 02-го «до 09:35» — тоже в «до 15 мин».
    Снятие согласования 02-го вернуло его в «больше 30», а строгий обход
    делал 06-е повтором (−1,5), хотя «до 15 мин» раньше 06-го было и до
    снятия, и после (03-е).
  */
  const e4Day2 = `${prevMonth}-02`;
  const e4Day3 = `${prevMonth}-03`;
  const e4Day6 = `${prevMonth}-06`;
  await checkInOn(strictRepeatSewer, e4Day2, '09:40');
  await checkInOn(strictRepeatSewer, e4Day3, '09:25');
  await checkInOn(strictRepeatSewer, e4Day6, '09:10');
  const e4State = async () => {
    const [day2] = await lateRows(strictRepeatSewer.id, e4Day2);
    const [day3] = await lateRows(strictRepeatSewer.id, e4Day3);
    const [day6] = await lateRows(strictRepeatSewer.id, e4Day6);
    return { day2, day3, day6 };
  };
  const e4RequestOn = async (date: string, arriveBy: string) => {
    const [request] = await db.insert(lateRequests).values({ userId: strictRepeatSewer.id, date, arriveBy }).returning();
    if (request === undefined) throw new Error('запрос на опоздание не создан');
    return request;
  };
  const e4Checked = await e4State();
  await ceoCaller.lateRequests.approve({ id: (await e4RequestOn(e4Day3, '09:20')).id });
  const e4Day2Request = await e4RequestOn(e4Day2, '09:35');
  await ceoCaller.lateRequests.approve({ id: e4Day2Request.id });
  const e4Approved = await e4State();
  check(
    'опоздание (E4): при отметке −2, −1, −0,5; одобрения 03-го и 02-го увели оба в «до 15 мин», 06-е бережно не повтор',
    e4Checked.day2?.points === '-2.0' &&
      e4Checked.day3?.points === '-1.0' &&
      e4Checked.day6?.points === '-0.5' &&
      e4Approved.day2?.kind === 'late_under_15' &&
      e4Approved.day2.points === '-0.5' &&
      e4Approved.day3?.kind === 'late_under_15' &&
      e4Approved.day3.points === '-0.5' &&
      !e4Approved.day3.isRepeat &&
      e4Approved.day6?.points === '-0.5' &&
      !e4Approved.day6.isRepeat,
    JSON.stringify({ e4Checked, e4Approved }),
  );
  await ceoCaller.lateRequests.withdraw({ id: e4Day2Request.id });
  const e4Withdrawn = await e4State();
  check(
    'опоздание (E4): снятие согласования 02-го возвращает ему −2, а 06-е не поднимает до повтора — «до 15 мин» раньше было и до снятия, и после',
    e4Withdrawn.day2?.kind === 'late_over_30' &&
      e4Withdrawn.day2.points === '-2.0' &&
      !e4Withdrawn.day2.isRepeat &&
      e4Withdrawn.day3?.points === '-0.5' &&
      !e4Withdrawn.day3.isRepeat &&
      e4Withdrawn.day6?.points === '-0.5' &&
      !e4Withdrawn.day6.isRepeat,
    JSON.stringify(e4Withdrawn),
  );

  // Отметки в 09:05 и 13:00; одобрение «приду к 09:30» сняло 5 мин; первую смену перенесли на 18:10; снятие.
  await checkInAt(movedFirstSewer, '09:05', '12:00');
  await checkInAt(movedFirstSewer, '13:00', '17:00');
  const movedFirstRequest = await pendingLateOn(movedFirstSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: movedFirstRequest.id });
  const afterMovedFirstApprove = await lateRows(movedFirstSewer.id, pastDay);
  const [firstShiftOfDay] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, movedFirstSewer.id), eq(shifts.startedAt, atTashkent(pastDay, '09:05'))));
  if (firstShiftOfDay === undefined) throw new Error('смена не найдена');
  await ceoCaller.shifts.adjustManually({
    shiftId: firstShiftOfDay.id,
    userId: movedFirstSewer.id,
    branchId: branch.id,
    startedAt: atTashkent(pastDay, '18:10'),
    endedAt: atTashkent(pastDay, '19:00'),
    reason: `${PREFIX} перенесли первую смену`,
  });
  await ceoCaller.lateRequests.withdraw({ id: movedFirstRequest.id });
  const afterMovedFirstWithdraw = await lateRows(movedFirstSewer.id, pastDay);
  check(
    // Снятие оценивает факт первой отметки, а не смены в базе: перенос смены его не трогает.
    'опоздание: первую смену перенесли на 18:10 — снятие согласования возвращает запись по отметке 09:05: 5 мин, −0,5, а не 240 мин от смены с 13:00',
    afterMovedFirstApprove.length === 0 &&
      afterMovedFirstWithdraw.length === 1 &&
      afterMovedFirstWithdraw[0]?.kind === 'late_under_15' &&
      afterMovedFirstWithdraw[0].points === '-0.5' &&
      afterMovedFirstWithdraw[0].description === 'Смена с 09:00, отметка в 09:05 — опоздание 5 мин',
    JSON.stringify({ afterMovedFirstApprove, afterMovedFirstWithdraw }),
  );

  // Отметка 09:40 (−2); руководитель добавил смену 08:00–09:30 без отметки; одобрение «приду к 09:45» сняло; снятие.
  await checkInAt(addedEarlierSewer, '09:40', '18:00');
  await ceoCaller.shifts.adjustManually({
    userId: addedEarlierSewer.id,
    branchId: branch.id,
    startedAt: atTashkent(pastDay, '08:00'),
    endedAt: atTashkent(pastDay, '09:30'),
    reason: `${PREFIX} добавили смену`,
  });
  const addedEarlierRequest = await pendingLateOn(addedEarlierSewer, '09:45');
  await ceoCaller.lateRequests.approve({ id: addedEarlierRequest.id });
  const afterAddedEarlierApprove = await lateRows(addedEarlierSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: addedEarlierRequest.id });
  const afterAddedEarlierWithdraw = await lateRows(addedEarlierSewer.id, pastDay);
  check(
    'опоздание: руководитель добавил смену 08:00–09:30 без отметки — снятие согласования пропускает её и возвращает 40 мин, −2 по отметке 09:40',
    afterAddedEarlierApprove.length === 0 &&
      afterAddedEarlierWithdraw.length === 1 &&
      afterAddedEarlierWithdraw[0]?.kind === 'late_over_30' &&
      afterAddedEarlierWithdraw[0].points === '-2.0' &&
      afterAddedEarlierWithdraw[0].description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify({ afterAddedEarlierApprove, afterAddedEarlierWithdraw }),
  );

  /*
    Отметка 09:40 (−2), смену руководитель унёс на позавчера: нынешнее начало
    уже не в этом дне. Одобрение и снятие судят по факту отметки — смена им
    не нужна.
  */
  await checkInAt(otherDaySewer, '09:40', '18:00');
  const [otherDayShift] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.userId, otherDaySewer.id));
  if (otherDayShift === undefined) throw new Error('смена не найдена');
  await ceoCaller.shifts.adjustManually({
    shiftId: otherDayShift.id,
    userId: otherDaySewer.id,
    branchId: branch.id,
    startedAt: atTashkent(lateDay(-2), '20:00'),
    endedAt: atTashkent(lateDay(-2), '23:00'),
    reason: `${PREFIX} перенесли смену на другой день`,
  });
  const otherDayRequest = await pendingLateOn(otherDaySewer, '09:45');
  await ceoCaller.lateRequests.approve({ id: otherDayRequest.id });
  const afterOtherDayApprove = await lateRows(otherDaySewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: otherDayRequest.id });
  const afterOtherDayWithdraw = await lateRows(otherDaySewer.id, pastDay);
  check(
    'опоздание: смену унесли в другой день — одобрение снимает запись по её пояснению, снятие возвращает те же 40 мин, −2',
    afterOtherDayApprove.length === 0 &&
      afterOtherDayWithdraw.length === 1 &&
      afterOtherDayWithdraw[0]?.kind === 'late_over_30' &&
      afterOtherDayWithdraw[0].points === '-2.0' &&
      afterOtherDayWithdraw[0].description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify({ afterOtherDayApprove, afterOtherDayWithdraw }),
  );

  /*
    Обратная сторона: утреннюю смену 08:00–12:00 руководитель завёл ДО
    отметки (человек забыл открыть), отметка в 14:00 — не первая за день, и
    опоздания она не писала. Снятие согласования не должно создать «опоздание
    300 мин» только потому, что у заведённой смены нет координат.
  */
  await ceoCaller.shifts.adjustManually({
    userId: morningEnteredSewer.id,
    branchId: branch.id,
    startedAt: atTashkent(pastDay, '08:00'),
    endedAt: atTashkent(pastDay, '12:00'),
    reason: `${PREFIX} забыла отметиться утром`,
  });
  await checkInAt(morningEnteredSewer, '14:00', '18:00');
  const morningEnteredRequest = await pendingLateOn(morningEnteredSewer, '10:00');
  await ceoCaller.lateRequests.approve({ id: morningEnteredRequest.id });
  await ceoCaller.lateRequests.withdraw({ id: morningEnteredRequest.id });
  const afterMorningEntered = await lateRows(morningEnteredSewer.id, pastDay);
  const morningEnteredNotes = await disciplineNotes(morningEnteredSewer.id);
  check(
    'опоздание: утреннюю смену завёл руководитель до отметки в 14:00 — снятие согласования опоздание не создаёт, как не писала его и отметка',
    afterMorningEntered.length === 0 && morningEnteredNotes.length === 0,
    JSON.stringify({ afterMorningEntered, morningEnteredNotes }),
  );

  /* ------ 19. Снятие согласования — ровно то, что было бы без одобрения ------ */

  /*
    Замечания проверки (шестой круг): снятие выводило запись заново и
    выходило не тем, что было до одобрения: (а) повтор самой записи
    пересчитывался строже; (б) схема, сохранённая позже, но с датой начала
    не позже дня, давала 70 мин вместо 10; (в) удалённая смена с отметкой не
    давала вернуть снятый штраф; (г) удалённая или переданная утренняя смена
    давала «опоздание 300 мин», которого не было. Теперь отметка один раз
    записывает факт (время и график того момента), а записи — оценка фактов
    и решений: ни смены, ни график задним числом в ней не участвуют.
  */
  const snapRepeatSewer = await makeUser('Снятие: повтор', Role.SEWER, '+998900000182');
  const snapSchemeSewer = await makeUser('Снятие: схема задним числом', Role.SEWER, '+998900000183');
  const snapDeletedSewer = await makeUser('Снятие: смену удалили', Role.SEWER, '+998900000184');
  const snapMorningSewer = await makeUser('Снятие: утро удалили', Role.SEWER, '+998900000185');
  const snapTransferSewer = await makeUser('Снятие: утро передали', Role.SEWER, '+998900000186');
  const snapExplainSewer = await makeUser('Снятие: объяснила после одобрения', Role.SEWER, '+998900000187');
  const snapForgivenSewer = await makeUser('Снятие: простили после одобрения', Role.SEWER, '+998900000188');
  const beforeCheckInSewer = await makeUser('Одобрили до отметки', Role.SEWER, '+998900000189');
  const beforeLateSewer = await makeUser('Одобрили до отметки, опоздала и от него', Role.SEWER, '+998900000190');
  const beforeGoneSewer = await makeUser('Одобрили до отметки, утро удалили', Role.SEWER, '+998900000191');
  const onTimeSewer = await makeUser('Вовремя до одобрения', Role.SEWER, '+998900000192');
  await db.insert(payrollSchemes).values(
    [
      snapRepeatSewer,
      snapSchemeSewer,
      snapDeletedSewer,
      snapMorningSewer,
      snapTransferSewer,
      snapExplainSewer,
      snapForgivenSewer,
      beforeCheckInSewer,
      beforeLateSewer,
      beforeGoneSewer,
      onTimeSewer,
    ].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      // У «вовремя до одобрения» смена с 09:30 — потом её задним числом передвинут на 09:00.
      shiftStart: person.id === onTimeSewer.id ? '09:30' : '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  /** Ждущий запрос на любой прошедший день — прямо в базе, как `pendingLateOn`. */
  const pendingLateOnDay = async (person: { readonly id: number }, date: string, arriveBy: string) => {
    const [row] = await db.insert(lateRequests).values({ userId: person.id, date, arriveBy }).returning();
    if (row === undefined) throw new Error('запрос на опоздание не создан');
    return row;
  };
  /** Запрос, одобренный вчера в 07:00 — ДО отметки; задним числом через процедуру так не одобрить. */
  const approvedBeforeCheckIn = async (person: { readonly id: number }, arriveBy: string) => {
    const [row] = await db
      .insert(lateRequests)
      .values({
        userId: person.id,
        date: pastDay,
        arriveBy,
        status: DayOffStatus.APPROVED,
        reviewedBy: ceo.id,
        reviewedAt: atTashkent(pastDay, '07:00'),
      })
      .returning();
    if (row === undefined) throw new Error('запрос на опоздание не создан');
    return row;
  };
  /** Факт опоздания сотрудника за день. */
  const factOn = async (person: { readonly id: number }, day: string) => {
    const [fact] = await db
      .select()
      .from(lateCheckIns)
      .where(and(eq(lateCheckIns.userId, person.id), eq(lateCheckIns.day, day)));
    return fact ?? null;
  };
  /** Единственная смена сотрудника, начатая в это время вчера. */
  const shiftAt = async (person: { readonly id: number }, time: string) => {
    const [shift] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.userId, person.id), eq(shifts.startedAt, atTashkent(pastDay, time))));
    if (shift === undefined) throw new Error('смена не найдена');
    return shift.id;
  };

  // (а) 02-го 09:40 (−2), 06-го 09:10 (−0,5); одобрение 02-го «до 09:35» увело его в «до 15 мин», 06-е бережно не повтор.
  const snapDay2 = `${prevMonth}-02`;
  const snapDay6 = `${prevMonth}-06`;
  await checkInOn(snapRepeatSewer, snapDay2, '09:40');
  await checkInOn(snapRepeatSewer, snapDay6, '09:10');
  await ceoCaller.lateRequests.approve({ id: (await pendingLateOnDay(snapRepeatSewer, snapDay2, '09:35')).id });
  const [day6Protected] = await lateRows(snapRepeatSewer.id, snapDay6);
  // «Приду к 08:30» раньше графика порог не сдвигает: одобрение запись 06-го не тронуло.
  const day6Untouched = await pendingLateOnDay(snapRepeatSewer, snapDay6, '08:30');
  await ceoCaller.lateRequests.approve({ id: day6Untouched.id });
  await ceoCaller.lateRequests.withdraw({ id: day6Untouched.id });
  const [day6AfterUntouched] = await lateRows(snapRepeatSewer.id, snapDay6);
  check(
    'опоздание (а): одобрение 06-го «до 08:30» запись не тронуло, и снятие не поднимает 06-е до повтора −1,5: та же запись, −0,5',
    day6Protected?.points === '-0.5' &&
      !day6Protected.isRepeat &&
      day6AfterUntouched?.id === day6Protected.id &&
      day6AfterUntouched.points === '-0.5' &&
      !day6AfterUntouched.isRepeat &&
      day6AfterUntouched.description === day6Protected.description,
    JSON.stringify({ day6Protected, day6AfterUntouched }),
  );
  // То же 06-е, но «до 09:15» запись снимает; снятие возвращает ровно её, а не новую −1,5 с повтором.
  const day6Removed = await pendingLateOnDay(snapRepeatSewer, snapDay6, '09:15');
  await ceoCaller.lateRequests.approve({ id: day6Removed.id });
  const afterDay6Removal = await lateRows(snapRepeatSewer.id, snapDay6);
  await ceoCaller.lateRequests.withdraw({ id: day6Removed.id });
  const [day6Restored, ...day6Extra] = await lateRows(snapRepeatSewer.id, snapDay6);
  check(
    'опоздание (а): одобрение 06-го «до 09:15» сняло запись — снятие возвращает ровно её: «до 15 мин», −0,5, не повтор, то же пояснение',
    afterDay6Removal.length === 0 &&
      day6Restored?.kind === 'late_under_15' &&
      day6Restored.points === '-0.5' &&
      !day6Restored.isRepeat &&
      day6Restored.description === day6Protected?.description &&
      day6Extra.length === 0,
    JSON.stringify({ afterDay6Removal, day6Restored, day6Extra }),
  );

  // (б) Отметка 09:10 (10 мин, −0,5); одобрение «до 09:30» сняло; схему 08:00 сохранили позже, но с датой начала — вчера.
  await checkInAt(snapSchemeSewer, '09:10', '18:00');
  const [schemeLate] = await lateRows(snapSchemeSewer.id, pastDay);
  if (schemeLate === undefined) throw new Error('опоздание при отметке не записано');
  const schemeRemoval = await pendingLateOn(snapSchemeSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: schemeRemoval.id });
  await rescheduleOf(snapSchemeSewer, '08:00', pastDay);
  const backdatedStart = await scheduledShiftStartOn(db, snapSchemeSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: schemeRemoval.id });
  const [schemeRestored, ...schemeExtra] = await lateRows(snapSchemeSewer.id, pastDay);
  check(
    'опоздание (б): график дня задним числом стал 08:00 — снятие возвращает снятую запись как была: 10 мин, −0,5, а не 70 мин, −2',
    backdatedStart === '08:00' &&
      schemeRestored?.kind === 'late_under_15' &&
      schemeRestored.points === '-0.5' &&
      !schemeRestored.isRepeat &&
      schemeRestored.description === schemeLate.description &&
      schemeExtra.length === 0,
    JSON.stringify({ backdatedStart, schemeRestored, schemeExtra }),
  );
  // Тот же день: «до 09:05» запись смягчает на месте (5 мин); снятие возвращает ту же строку к 10 мин, хотя график уже 08:00.
  const schemeAdjust = await pendingLateOn(snapSchemeSewer, '09:05');
  await ceoCaller.lateRequests.approve({ id: schemeAdjust.id });
  const [schemeAdjusted] = await lateRows(snapSchemeSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: schemeAdjust.id });
  const [schemeBack] = await lateRows(snapSchemeSewer.id, pastDay);
  const schemeBackNote = await latestNote(snapSchemeSewer.id, NotificationType.LATE_WITHDRAWN);
  check(
    'опоздание (б): поправленная одобрением запись возвращается в той же строке к 10 мин, −0,5 — не к 70 мин от графика задним числом',
    schemeAdjusted?.id === schemeRestored?.id &&
      schemeAdjusted?.description === 'Смена с 09:05, отметка в 09:10 — опоздание 5 мин' &&
      schemeBack !== undefined &&
      schemeBack.id === schemeRestored?.id &&
      schemeBack.kind === 'late_under_15' &&
      schemeBack.points === '-0.5' &&
      schemeBack.description === schemeLate.description &&
      schemeBackNote?.endsWith('пересчитано: опоздание 10 мин.') === true,
    JSON.stringify({ schemeAdjusted, schemeBack, schemeBackNote }),
  );

  // (в) Отметка 09:40 (−2), смену с отметкой удалили, одобрение «до 09:45» сняло запись; снятие — без смены.
  await checkInAt(snapDeletedSewer, '09:40', '18:00');
  const [deletedLate] = await lateRows(snapDeletedSewer.id, pastDay);
  if (deletedLate === undefined) throw new Error('опоздание при отметке не записано');
  await ceoCaller.shifts.remove({ id: await shiftAt(snapDeletedSewer, '09:40'), reason: `${PREFIX} дубль смены` });
  const deletedRequest = await pendingLateOn(snapDeletedSewer, '09:45');
  await ceoCaller.lateRequests.approve({ id: deletedRequest.id });
  const afterDeletedApprove = await lateRows(snapDeletedSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: deletedRequest.id });
  const [deletedRestored, ...deletedExtra] = await lateRows(snapDeletedSewer.id, pastDay);
  const deletedFact = await factOn(snapDeletedSewer, pastDay);
  check(
    'опоздание (в): смену с отметкой удалили — факт остался (без смены), одобрение сняло запись, снятие вернуло 40 мин, −2',
    deletedFact?.shiftId === null &&
      deletedFact.checkInTime === '09:40' &&
      afterDeletedApprove.length === 0 &&
      deletedRestored?.kind === 'late_over_30' &&
      deletedRestored.points === '-2.0' &&
      deletedRestored.description === deletedLate.description &&
      deletedExtra.length === 0,
    JSON.stringify({ deletedFact, afterDeletedApprove, deletedRestored, deletedExtra }),
  );

  // (г) Отметки в 09:00 (вовремя) и 14:00; одобрение после них; утреннюю смену удалили или передали другому сотруднику.
  for (const [person, gone] of [
    [snapMorningSewer, 'удалили'],
    [snapTransferSewer, 'передали другому сотруднику'],
  ] as const) {
    await checkInAt(person, '09:00', '12:00');
    await checkInAt(person, '14:00', '18:00');
    const request = await pendingLateOn(person, '10:00');
    await ceoCaller.lateRequests.approve({ id: request.id });
    const morning = await shiftAt(person, '09:00');
    if (person === snapMorningSewer) {
      await ceoCaller.shifts.remove({ id: morning, reason: `${PREFIX} утро по ошибке` });
    } else {
      await ceoCaller.shifts.adjustManually({
        shiftId: morning,
        userId: otherSewer.id,
        branchId: branch.id,
        startedAt: atTashkent(pastDay, '09:00'),
        endedAt: atTashkent(pastDay, '12:00'),
        reason: `${PREFIX} отметилась не за себя`,
      });
    }
    await ceoCaller.lateRequests.withdraw({ id: request.id });
    const after = await lateRows(person.id, pastDay);
    const notes = await disciplineNotes(person.id);
    check(
      `опоздание (г): утреннюю смену ${gone} — снятие согласования не создаёт «опоздание 300 мин» от отметки в 14:00`,
      after.length === 0 && notes.length === 0,
      JSON.stringify({ after, notes }),
    );
  }

  /*
    Одобрили вчера в 07:00 «приду к 10:00», отметки в 09:05 и 14:00, утреннюю
    удалили. Первая отметка была в 09:05 — это и есть факт: снятие даёт 5 мин
    от графика, а не 300 мин от 14:00 (и не «ничего», как было, пока отметку
    восстанавливали по сменам и терялась удалённая).
  */
  const goneRequest = await approvedBeforeCheckIn(beforeGoneSewer, '10:00');
  await checkInAt(beforeGoneSewer, '09:05', '12:00');
  await checkInAt(beforeGoneSewer, '14:00', '18:00');
  const goneAtCheckIn = await lateRows(beforeGoneSewer.id, pastDay);
  await ceoCaller.shifts.remove({ id: await shiftAt(beforeGoneSewer, '09:05'), reason: `${PREFIX} утро по ошибке` });
  await ceoCaller.lateRequests.withdraw({ id: goneRequest.id });
  const afterGone = await lateRows(beforeGoneSewer.id, pastDay);
  check(
    'опоздание: одобрили до отметки, утреннюю смену потом удалили — снятие считает по факту первой отметки 09:05: 5 мин, −0,5, а не 300 мин от 14:00',
    goneAtCheckIn.length === 0 &&
      afterGone.length === 1 &&
      afterGone[0]?.kind === 'late_under_15' &&
      afterGone[0].points === '-0.5' &&
      afterGone[0].description === 'Смена с 09:00, отметка в 09:05 — опоздание 5 мин' &&
      (await disciplineNotes(beforeGoneSewer.id)).length === 1,
    JSON.stringify({ goneAtCheckIn, afterGone }),
  );

  // Одобрили вчера в 07:00 «приду к 10:00»; отметка в 09:50 — от «приду к» вовремя, записи нет. Снятие оценивает её от графика.
  const beforeRequest = await approvedBeforeCheckIn(beforeCheckInSewer, '10:00');
  await checkInAt(beforeCheckInSewer, '09:50', '18:00');
  const beforeAtCheckIn = await lateRows(beforeCheckInSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: beforeRequest.id });
  const [beforeCreated, ...beforeExtra] = await lateRows(beforeCheckInSewer.id, pastDay);
  const [beforeCreatedAudit] = await db
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'discipline.recorded'), eq(auditLog.entityId, beforeCreated?.id ?? 0)));
  const beforeNotes = await db
    .select({ type: notifications.type })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, beforeCheckInSewer.id),
        inArray(notifications.type, [NotificationType.LATE_WITHDRAWN, NotificationType.DISCIPLINE_RECORDED]),
      ),
    )
    .orderBy(asc(notifications.id));
  check(
    'опоздание: одобрили до отметки — снятие оценивает отметку 09:50 от графика: 50 мин, −2, в группу не идёт, о записи — последним уведомлением',
    beforeAtCheckIn.length === 0 &&
      beforeCreated?.kind === 'late_over_30' &&
      beforeCreated.points === '-2.0' &&
      beforeCreated.description === 'Смена с 09:00, отметка в 09:50 — опоздание 50 мин' &&
      beforeExtra.length === 0 &&
      beforeCreatedAudit?.details?.['recomputed'] === true &&
      beforeCreatedAudit.details['lateRequestId'] === beforeRequest.id &&
      JSON.stringify(beforeNotes.map((note) => note.type)) ===
        JSON.stringify([NotificationType.LATE_WITHDRAWN, NotificationType.DISCIPLINE_RECORDED]),
    JSON.stringify({ beforeAtCheckIn, beforeCreated, details: beforeCreatedAudit?.details, beforeNotes }),
  );

  // Одобрили до отметки «приду к 10:00»; отметка в 10:20 — 20 мин от «приду к». Снятие: та же запись тяжелеет до 80 мин от графика.
  const beforeLateRequest = await approvedBeforeCheckIn(beforeLateSewer, '10:00');
  await checkInAt(beforeLateSewer, '10:20', '18:00');
  const [beforeLateRow] = await lateRows(beforeLateSewer.id, pastDay);
  await ceoCaller.lateRequests.withdraw({ id: beforeLateRequest.id });
  const [beforeLateRaised, ...beforeLateExtra] = await lateRows(beforeLateSewer.id, pastDay);
  const beforeLateNote = await latestNote(beforeLateSewer.id, NotificationType.LATE_WITHDRAWN);
  check(
    'опоздание: одобрили до отметки, пришла и позже «приду к» — снятие поднимает ту же запись до 80 мин от графика, а не оставляет 20',
    beforeLateRow?.description === 'Смена с 10:00, отметка в 10:20 — опоздание 20 мин' &&
      beforeLateRaised?.id === beforeLateRow.id &&
      beforeLateRaised.kind === 'late_over_30' &&
      beforeLateRaised.points === '-2.0' &&
      beforeLateRaised.description === 'Смена с 09:00, отметка в 10:20 — опоздание 80 мин' &&
      beforeLateExtra.length === 0 &&
      beforeLateNote?.endsWith('пересчитано: опоздание 80 мин.') === true,
    JSON.stringify({ beforeLateRow, beforeLateRaised, beforeLateNote }),
  );

  // Отметка в 09:10 при смене с 09:30 — вовремя; потом график дня задним числом стал 09:00; одобрение и снятие.
  await checkInAt(onTimeSewer, '09:10', '18:00');
  await rescheduleOf(onTimeSewer, '09:00', pastDay);
  const onTimeRequest = await pendingLateOn(onTimeSewer, '10:00');
  await ceoCaller.lateRequests.approve({ id: onTimeRequest.id });
  await ceoCaller.lateRequests.withdraw({ id: onTimeRequest.id });
  const afterOnTime = await lateRows(onTimeSewer.id, pastDay);
  check(
    'опоздание: отметка до одобрения была вовремя — снятие согласования ничего не создаёт, даже когда график дня задним числом стал раньше',
    afterOnTime.length === 0 && (await disciplineNotes(onTimeSewer.id)).length === 0,
    JSON.stringify(afterOnTime),
  );

  // Одобрение смягчило 40 мин до 10; сотрудник объяснил опоздание уже после одобрения; снятие.
  await checkInAt(snapExplainSewer, '09:40', '18:00');
  const [explainLate] = await lateRows(snapExplainSewer.id, pastDay);
  if (explainLate === undefined) throw new Error('опоздание при отметке не записано');
  const explainRequest = await pendingLateOn(snapExplainSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: explainRequest.id });
  const lateExplanation = 'Пробка на Беруни, предупреждала бригадира';
  await db.insert(shifts).values({ userId: snapExplainSewer.id, branchId: branch.id, startedAt: new Date(), ...point });
  await (await callerFor(snapExplainSewer)).discipline.explain({ id: explainLate.id, comment: lateExplanation });
  await db
    .update(shifts)
    .set({ endedAt: new Date(Date.now() + 1000) })
    .where(and(eq(shifts.userId, snapExplainSewer.id), isNull(shifts.endedAt)));
  await ceoCaller.lateRequests.withdraw({ id: explainRequest.id });
  const [explainBack] = await lateRows(snapExplainSewer.id, pastDay);
  check(
    'опоздание: объяснение, данное уже после одобрения, снятие не стирает — запись вернулась к 40 мин, −2 с ним',
    explainBack?.id === explainLate.id &&
      explainBack.kind === 'late_over_30' &&
      explainBack.points === '-2.0' &&
      explainBack.description === explainLate.description &&
      explainBack.employeeComment === lateExplanation,
    JSON.stringify(explainBack),
  );

  // Одобрение смягчило запись, а руководитель потом убрал её руками — простил; снятие прощение не отменяет.
  await checkInAt(snapForgivenSewer, '09:40', '18:00');
  const [forgivenLater] = await lateRows(snapForgivenSewer.id, pastDay);
  if (forgivenLater === undefined) throw new Error('опоздание при отметке не записано');
  const forgivenLaterRequest = await pendingLateOn(snapForgivenSewer, '09:30');
  await ceoCaller.lateRequests.approve({ id: forgivenLaterRequest.id });
  await ceoCaller.discipline.remove({ id: forgivenLater.id });
  await ceoCaller.lateRequests.withdraw({ id: forgivenLaterRequest.id });
  const afterForgivenLater = await lateRows(snapForgivenSewer.id, pastDay);
  check(
    'опоздание: запись, смягчённую одобрением, руководитель потом простил руками — снятие согласования её не воскрешает',
    afterForgivenLater.length === 0,
    JSON.stringify(afterForgivenLater),
  );

  /* ------ 20. Повтор — по состоянию месяца, а не по пути решений ------ */

  /*
    Замечания проверки (седьмой круг): повтор записи, вернувшейся после
    снятия согласования, застывал на моменте одобрения, хотя было ли раньше в
    месяце такое же, за время одобрения могло поменяться: (1) снятие
    одобрения 02-го раньше снятия 06-го, (2) ручная запись за 03-е, (3)
    прощение или одобрение 02-го. И снятие поднимало запись по чужой
    отметке (40 мин становились 684). Оценка месяца по фактам считает
    повтор по тому, что есть сейчас, и отметку берёт из факта дня.
  */
  const heldFifoSewer = await makeUser('Повтор: сняли по порядку', Role.SEWER, '+998900000193');
  const heldLifoSewer = await makeUser('Повтор: сняли в обратном порядке', Role.SEWER, '+998900000194');
  const heldManualSewer = await makeUser('Повтор: ручная запись раньше', Role.SEWER, '+998900000195');
  const heldForgivenSewer = await makeUser('Повтор: раньше простили', Role.SEWER, '+998900000196');
  const heldExcusedSewer = await makeUser('Повтор: раньше одобрили', Role.SEWER, '+998900000197');
  const heldLowerSewer = await makeUser('Повтор: одобрение раньше не утяжеляет', Role.SEWER, '+998900000198');
  const recheckLaterSewer = await makeUser('Отметилась заново после одобрения', Role.SEWER, '+998900000199');
  await db.insert(payrollSchemes).values(
    [
      heldFifoSewer,
      heldLifoSewer,
      heldManualSewer,
      heldForgivenSewer,
      heldExcusedSewer,
      heldLowerSewer,
      recheckLaterSewer,
    ].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  const snapDay3 = `${prevMonth}-03`;
  /** Запись дня — вид, повтор, балл: то, что сверяют проверки этого раздела. */
  const gradeOn = async (person: { readonly id: number }, day: string) => {
    const rows = await lateRows(person.id, day);
    return rows.map((row) => `${row.kind} ${row.points}${row.isRepeat ? ' повтор' : ''}`);
  };
  /** 02-го и 06-го отметка в 09:40: −2 и −3 с повтором. */
  const lateOn2And6 = async (person: { readonly id: number }) => {
    await checkInOn(person, snapDay2, '09:40');
    await checkInOn(person, snapDay6, '09:40');
  };

  // (1) Одобрили 02-е «до 09:35» (06-е бережно −2), потом 06-е «до 09:45» (снято); сняли 02-е, потом 06-е.
  await lateOn2And6(heldFifoSewer);
  const fifoBefore = [await gradeOn(heldFifoSewer, snapDay2), await gradeOn(heldFifoSewer, snapDay6)];
  const fifoDay2 = await pendingLateOnDay(heldFifoSewer, snapDay2, '09:35');
  const fifoDay6 = await pendingLateOnDay(heldFifoSewer, snapDay6, '09:45');
  await ceoCaller.lateRequests.approve({ id: fifoDay2.id });
  const fifoDay2Approved = [await gradeOn(heldFifoSewer, snapDay2), await gradeOn(heldFifoSewer, snapDay6)];
  await ceoCaller.lateRequests.approve({ id: fifoDay6.id });
  await ceoCaller.lateRequests.withdraw({ id: fifoDay2.id });
  await ceoCaller.lateRequests.withdraw({ id: fifoDay6.id });
  const fifoAfter = [await gradeOn(heldFifoSewer, snapDay2), await gradeOn(heldFifoSewer, snapDay6)];
  const [fifoDay6Back] = await lateRows(heldFifoSewer.id, snapDay6);
  check(
    'опоздание (1): одобрили 02-е (06-е бережно −2), потом 06-е, сняли в том же порядке — 06-е вернулось −3 с повтором, как до одобрений',
    JSON.stringify(fifoBefore) === JSON.stringify([['late_over_30 -2.0'], ['late_over_30 -3.0 повтор']]) &&
      JSON.stringify(fifoDay2Approved) === JSON.stringify([['late_under_15 -0.5'], ['late_over_30 -2.0']]) &&
      JSON.stringify(fifoAfter) === JSON.stringify(fifoBefore) &&
      fifoDay6Back?.description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
    JSON.stringify({ fifoBefore, fifoDay2Approved, fifoAfter }),
  );

  // То же, но снятия в обратном порядке: 06-е сначала −2 (02-е ещё одобрено), после снятия 02-го — −3 с повтором.
  await lateOn2And6(heldLifoSewer);
  const lifoDay2 = await pendingLateOnDay(heldLifoSewer, snapDay2, '09:35');
  const lifoDay6 = await pendingLateOnDay(heldLifoSewer, snapDay6, '09:45');
  await ceoCaller.lateRequests.approve({ id: lifoDay2.id });
  await ceoCaller.lateRequests.approve({ id: lifoDay6.id });
  await ceoCaller.lateRequests.withdraw({ id: lifoDay6.id });
  const lifoMiddle = await gradeOn(heldLifoSewer, snapDay6);
  await ceoCaller.lateRequests.withdraw({ id: lifoDay2.id });
  const lifoAfter = [await gradeOn(heldLifoSewer, snapDay2), await gradeOn(heldLifoSewer, snapDay6)];
  check(
    'опоздание (1): сняли в обратном порядке — 06-е −2, пока 02-е одобрено, и −3 с повтором после снятия 02-го',
    JSON.stringify(lifoMiddle) === JSON.stringify(['late_over_30 -2.0']) &&
      JSON.stringify(lifoAfter) === JSON.stringify([['late_over_30 -2.0'], ['late_over_30 -3.0 повтор']]),
    JSON.stringify({ lifoMiddle, lifoAfter }),
  );

  // (2) 06-е −2 одно; одобрение «до 09:45» сняло его; руководитель записал «больше 30» за 03-е; снятие.
  await checkInOn(heldManualSewer, snapDay6, '09:40');
  const manualDay6 = await pendingLateOnDay(heldManualSewer, snapDay6, '09:45');
  await ceoCaller.lateRequests.approve({ id: manualDay6.id });
  await ceoCaller.discipline.record({
    userId: heldManualSewer.id,
    kind: 'late_over_30',
    occurredOn: snapDay3,
    description: `${PREFIX} опоздание со слов бригадира`,
  });
  await ceoCaller.lateRequests.withdraw({ id: manualDay6.id });
  const manualAfter = [await gradeOn(heldManualSewer, snapDay3), await gradeOn(heldManualSewer, snapDay6)];
  check(
    'опоздание (2): пока одобрение 06-го в силе, руководитель записал «больше 30» за 03-е — после снятия 06-е −3 с повтором',
    JSON.stringify(manualAfter) === JSON.stringify([['late_over_30 -2.0'], ['late_over_30 -3.0 повтор']]),
    JSON.stringify(manualAfter),
  );

  // (3) 02-е −2, 06-е −3 с повтором; одобрение сняло 06-е; руководитель простил 02-е руками; снятие.
  await lateOn2And6(heldForgivenSewer);
  const [forgivenDay2Row] = await lateRows(heldForgivenSewer.id, snapDay2);
  if (forgivenDay2Row === undefined) throw new Error('опоздание при отметке не записано');
  const forgivenDay6 = await pendingLateOnDay(heldForgivenSewer, snapDay6, '09:45');
  await ceoCaller.lateRequests.approve({ id: forgivenDay6.id });
  await ceoCaller.discipline.remove({ id: forgivenDay2Row.id });
  await ceoCaller.lateRequests.withdraw({ id: forgivenDay6.id });
  const forgivenAfter = [await gradeOn(heldForgivenSewer, snapDay2), await gradeOn(heldForgivenSewer, snapDay6)];
  check(
    'опоздание (3): 02-е простили руками, пока 06-е снято одобрением, — 06-е вернулось −2 без повтора: раньше «больше 30» нет',
    JSON.stringify(forgivenAfter) === JSON.stringify([[], ['late_over_30 -2.0']]),
    JSON.stringify(forgivenAfter),
  );

  // (3) То же, но 02-е снято своим одобрением, и оно остаётся в силе.
  await lateOn2And6(heldExcusedSewer);
  const excusedDay6 = await pendingLateOnDay(heldExcusedSewer, snapDay6, '09:45');
  const excusedDay2 = await pendingLateOnDay(heldExcusedSewer, snapDay2, '09:45');
  await ceoCaller.lateRequests.approve({ id: excusedDay6.id });
  await ceoCaller.lateRequests.approve({ id: excusedDay2.id });
  await ceoCaller.lateRequests.withdraw({ id: excusedDay6.id });
  const excusedAfter = [await gradeOn(heldExcusedSewer, snapDay2), await gradeOn(heldExcusedSewer, snapDay6)];
  check(
    'опоздание (3): 02-е снято своим одобрением, пока 06-е снято, — снятие 06-го возвращает −2 без повтора',
    JSON.stringify(excusedAfter) === JSON.stringify([[], ['late_over_30 -2.0']]),
    JSON.stringify(excusedAfter),
  );

  /*
    Зеркало: 02-е 20 мин (−1), 06-е 10 мин (−0,5). Одобрение сняло 06-е,
    потом одобрение 02-го «до 09:10» увело его в «до 15 мин». Без одобрения
    06-го оно бы осталось −0,5: одобрение 02-го не утяжеляет другие дни.
    Значит, и снятие возвращает −0,5, а не −1,5 с повтором.
  */
  await checkInOn(heldLowerSewer, snapDay2, '09:20');
  await checkInOn(heldLowerSewer, snapDay6, '09:10');
  const lowerDay6 = await pendingLateOnDay(heldLowerSewer, snapDay6, '09:15');
  const lowerDay2 = await pendingLateOnDay(heldLowerSewer, snapDay2, '09:10');
  await ceoCaller.lateRequests.approve({ id: lowerDay6.id });
  await ceoCaller.lateRequests.approve({ id: lowerDay2.id });
  await ceoCaller.lateRequests.withdraw({ id: lowerDay6.id });
  const lowerMiddle = [await gradeOn(heldLowerSewer, snapDay2), await gradeOn(heldLowerSewer, snapDay6)];
  await ceoCaller.lateRequests.withdraw({ id: lowerDay2.id });
  const lowerAfter = [await gradeOn(heldLowerSewer, snapDay2), await gradeOn(heldLowerSewer, snapDay6)];
  check(
    'опоздание: одобрение 02-го в «до 15 мин» не делает вернувшееся 06-е повтором — −0,5, и после снятия 02-го тоже',
    JSON.stringify(lowerMiddle) === JSON.stringify([['late_under_15 -0.5'], ['late_under_15 -0.5']]) &&
      JSON.stringify(lowerAfter) === JSON.stringify([['late_15_30 -1.0'], ['late_under_15 -0.5']]),
    JSON.stringify({ lowerMiddle, lowerAfter }),
  );

  /*
    Отметка в 09:40 (40 мин, −2) до одобрения; одобрение «до 08:30» запись
    не трогало; смену с отметкой удалили, сотрудник отметился заново в 20:24
    — уже после одобрения. Факт за день один: повторная отметка его не
    переписывает, и снятие не поднимает запись до 684 мин.
  */
  await checkInAt(recheckLaterSewer, '09:40', '12:00');
  const [recheckLate] = await lateRows(recheckLaterSewer.id, pastDay);
  if (recheckLate === undefined) throw new Error('опоздание при отметке не записано');
  const [recheckRequest] = await db
    .insert(lateRequests)
    .values({
      userId: recheckLaterSewer.id,
      date: pastDay,
      arriveBy: '08:30',
      status: DayOffStatus.APPROVED,
      reviewedBy: ceo.id,
      reviewedAt: atTashkent(pastDay, '12:30'),
    })
    .returning();
  if (recheckRequest === undefined) throw new Error('запрос на опоздание не создан');
  await ceoCaller.shifts.remove({ id: await shiftAt(recheckLaterSewer, '09:40'), reason: `${PREFIX} смена по ошибке` });
  await checkInAt(recheckLaterSewer, '20:24', '21:00');
  await ceoCaller.lateRequests.withdraw({ id: recheckRequest.id });
  const recheckAfter = await lateRows(recheckLaterSewer.id, pastDay);
  const recheckAdjustments = await disciplineAdjustmentsOf(recheckLaterSewer.id);
  const recheckNote = await latestNote(recheckLaterSewer.id, NotificationType.LATE_WITHDRAWN);
  const recheckFact = await factOn(recheckLaterSewer, pastDay);
  check(
    'опоздание: утреннюю смену удалили, отметка заново после одобрения — факт прежний (09:40), снятие запись не поднимает: 40 мин, −2, правок нет',
    recheckFact?.checkInTime === '09:40' &&
      recheckAfter.length === 1 &&
      recheckAfter[0]?.id === recheckLate.id &&
      recheckAfter[0].points === '-2.0' &&
      recheckAfter[0].description === 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин' &&
      recheckAdjustments.length === 0 &&
      recheckNote !== null &&
      !recheckNote.includes('пересчитано'),
    JSON.stringify({ recheckFact, recheckAfter, recheckAdjustments, recheckNote }),
  );

  /*
    Сценарий проверки (восьмой круг): 07-е 09:55 (−2), 10-е и 11-е 09:05
    (−0,5 и −1,5 с повтором). Одобрили 11-е и сняли, одобрили 10-е, потом
    07-е, сняли 10-е, потом 07-е — правки по цепочке оставляли 11-му −0,5
    вместо −1,5 с повтором. Оценка по фактам возвращает месяц ровно к
    исходному — и в другом порядке тех же решений тоже.
  */
  const tripleFifoSewer = await makeUser('07/10/11 по порядку проверки', Role.SEWER, '+998900000145');
  const tripleOtherSewer = await makeUser('07/10/11 в другом порядке', Role.SEWER, '+998900000146');
  await db.insert(payrollSchemes).values(
    [tripleFifoSewer, tripleOtherSewer].map((person) => ({
      userId: person.id,
      role: Role.SEWER,
      type: PayrollSchemeType.HOURLY,
      rate: '10000.00',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      effectiveFrom: '2020-01-01',
      createdBy: admin.id,
    })),
  );
  const [day07, day10, day11] = [`${prevMonth}-07`, `${prevMonth}-10`, `${prevMonth}-11`] as const;
  const tripleOf = async (person: { readonly id: number }) => [
    await gradeOn(person, day07),
    await gradeOn(person, day10),
    await gradeOn(person, day11),
  ];
  const tripleRequests = async (person: { readonly id: number }) => {
    await checkInOn(person, day07, '09:55');
    await checkInOn(person, day10, '09:05');
    await checkInOn(person, day11, '09:05');
    return {
      d07: await pendingLateOnDay(person, day07, '09:45'),
      d10: await pendingLateOnDay(person, day10, '09:20'),
      d11: await pendingLateOnDay(person, day11, '09:25'),
    };
  };
  const fifoTriple = await tripleRequests(tripleFifoSewer);
  const tripleInitial = await tripleOf(tripleFifoSewer);
  await ceoCaller.lateRequests.approve({ id: fifoTriple.d11.id });
  await ceoCaller.lateRequests.withdraw({ id: fifoTriple.d11.id });
  await ceoCaller.lateRequests.approve({ id: fifoTriple.d10.id });
  await ceoCaller.lateRequests.approve({ id: fifoTriple.d07.id });
  const tripleAllApproved = await tripleOf(tripleFifoSewer);
  await ceoCaller.lateRequests.withdraw({ id: fifoTriple.d10.id });
  await ceoCaller.lateRequests.withdraw({ id: fifoTriple.d07.id });
  const tripleFifoAfter = await tripleOf(tripleFifoSewer);
  check(
    'опоздание (07/10/11): после всех снятий месяц ровно исходный — 11-е снова −1,5 с повтором',
    JSON.stringify(tripleInitial) ===
      JSON.stringify([['late_over_30 -2.0'], ['late_under_15 -0.5'], ['late_under_15 -1.5 повтор']]) &&
      JSON.stringify(tripleAllApproved) === JSON.stringify([['late_under_15 -0.5'], [], ['late_under_15 -0.5']]) &&
      JSON.stringify(tripleFifoAfter) === JSON.stringify(tripleInitial),
    JSON.stringify({ tripleInitial, tripleAllApproved, tripleFifoAfter }),
  );
  const otherTriple = await tripleRequests(tripleOtherSewer);
  await adminCaller.lateRequests.approve({ id: otherTriple.d07.id });
  await ceoCaller.lateRequests.approve({ id: otherTriple.d10.id });
  await adminCaller.lateRequests.withdraw({ id: otherTriple.d07.id });
  await ceoCaller.lateRequests.withdraw({ id: otherTriple.d10.id });
  const tripleOtherAfter = await tripleOf(tripleOtherSewer);
  check(
    'опоздание (07/10/11): те же одобрения и снятия в другом порядке и разными руководителями — тот же месяц',
    JSON.stringify(tripleOtherAfter) === JSON.stringify(tripleInitial),
    JSON.stringify(tripleOtherAfter),
  );

  /* Выходные: условие на статус — в самом UPDATE; второе решение не проходит и не попадает в журнал. */
  const decisionAudit = (id: number) =>
    db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'day_off_request'),
          eq(auditLog.entityId, id),
          inArray(auditLog.action, ['dayoff.approved', 'dayoff.rejected']),
        ),
      );
  const decidedDayOff = await sewerCaller.dayOff.request({ startDate: lateDay(5), endDate: lateDay(5) });
  await ceoCaller.dayOff.approve({ id: decidedDayOff.id });
  await expectRejectedWith(
    'отгулы: одобренный запрос второй раз не решается',
    () => adminCaller.dayOff.reject({ id: decidedDayOff.id, reason: `${PREFIX} поздно` }),
    (message) => message === 'Запрос уже рассмотрен',
  );
  const decidedAudit = await decisionAudit(decidedDayOff.id);
  check(
    'отгулы: после отбитого второго решения в журнале одно решение',
    decidedAudit.length === 1 && decidedAudit[0]?.action === 'dayoff.approved',
    JSON.stringify(decidedAudit),
  );

  // Двое руководителей решают один запрос одновременно — каждый в своей транзакции.
  const racedDayOff = await sewerCaller.dayOff.request({ startDate: lateDay(6), endDate: lateDay(6) });
  const outcomes = await Promise.allSettled([
    ceoCaller.dayOff.approve({ id: racedDayOff.id }),
    adminCaller.dayOff.reject({ id: racedDayOff.id, reason: `${PREFIX} гонка` }),
  ]);
  const lostMessages = outcomes.flatMap((outcome) =>
    outcome.status === 'rejected' ? [outcome.reason instanceof Error ? outcome.reason.message : 'не Error'] : [],
  );
  const racedAudit = await decisionAudit(racedDayOff.id);
  check(
    'отгулы: одновременные одобрение и отказ — проходит одно, второе «уже рассмотрен», в журнале одно решение',
    lostMessages.length === 1 && lostMessages[0] === 'Запрос уже рассмотрен' && racedAudit.length === 1,
    JSON.stringify({ lostMessages, racedAudit }),
  );

  const myDaysOffWithReview = await sewerCaller.dayOff.my();
  const approvedMine = myDaysOffWithReview.find((row) => row.id === sewerDayOff.id);
  const pendingMine = myDaysOffWithReview.find((row) => row.id === pendingNewest);
  check(
    'отгулы: my отдаёт время решения — у решённого есть, у ждущего нет',
    approvedMine?.reviewedAt instanceof Date && pendingMine !== undefined && pendingMine.reviewedAt === null,
    JSON.stringify({ approved: approvedMine?.reviewedAt, pending: pendingMine?.reviewedAt }),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`\nСМОУК УПАЛ: ${String(error)}\n`);
  if (error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});

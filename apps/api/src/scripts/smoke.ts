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
  branches,
  closeDatabase,
  createDatabase,
  hashPassword,
  notifications,
  orderComments,
  orderItems,
  orderPhotos,
  orders,
  orderStatusHistory,
  payrollRecords,
  purchases,
  refreshTokens,
  shifts,
  userBranches,
  userRoles,
  users,
  type Database,
} from '@curtain-crm/db';
import {
  ORDER_STATUS_LABELS_RU,
  OrderStatus,
  Role,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { config as loadEnv } from 'dotenv';
import { and, asc, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import { loadAuthenticatedUser } from '../context';
import { login, refreshSession } from '../services/auth.service';
import {
  calculateCompletedOrders,
  gatherPayrollInputs,
} from '../services/payroll.service';
import { assignExecutor, changeOrderStatus } from '../services/orderWorkflow.service';
import { calculateWorkedHours, periodBounds } from '../services/shifts.service';
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
 * Удаляет данные предыдущего запуска.
 *
 * Порядок обязателен и сам по себе показателен: `audit_log`, `order_photos`,
 * `order_comments` и `purchases` ссылаются на сотрудников с
 * `onDelete: 'restrict'`, поэтому удалить сотрудника, не убрав их, база
 * не даст — ровно как и задумано для рабочей эксплуатации, где сотрудников
 * деактивируют, а не удаляют.
 */
async function cleanup(db: Database): Promise<void> {
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
    await db.delete(purchases).where(inArray(purchases.orderId, orderIds));
    await db.delete(orderPhotos).where(inArray(orderPhotos.orderId, orderIds));
    await db.delete(orderComments).where(inArray(orderComments.orderId, orderIds));
    await db.delete(notifications).where(inArray(notifications.relatedOrderId, orderIds));
    await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  if (userIds.length > 0) {
    // audit_log — restrict: без явного удаления сотрудника не убрать.
    await db.delete(auditLog).where(inArray(auditLog.actorId, userIds));
    await db.delete(notifications).where(inArray(notifications.userId, userIds));
    await db.delete(payrollRecords).where(inArray(payrollRecords.userId, userIds));
    await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds));
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
      deposit: '2000000.00',
      deadline: '2026-12-31',
    })
    .returning();

  if (order === undefined) throw new Error('заказ не создан');

  check(
    'orders: order_number вычисляется базой',
    order.orderNumber !== null && order.orderNumber.startsWith('DH-'),
    order.orderNumber ?? 'null',
  );
  check(
    'orders: remaining_payment = work_price - deposit',
    order.remainingPayment === '3000000.00',
    order.remainingPayment ?? 'null',
  );

  await expectRejected('orders: check не даёт отменить заказ без причины', () =>
    db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id)),
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
}

main().catch((error: unknown) => {
  process.stderr.write(`\nСМОУК УПАЛ: ${String(error)}\n`);
  if (error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});

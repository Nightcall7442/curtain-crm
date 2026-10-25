/**
 * Демонстрационные данные.
 *
 * Отличие от `packages/db/src/seed.ts`: сид создаёт МИНИМУМ, необходимый для
 * работы системы (филиал, директор, справочники, схемы начисления), и его
 * безопасно выполнять на проде. Этот скрипт наполняет базу объёмом, на
 * котором видно интерфейс: два филиала, два десятка сотрудников, полсотни
 * заказов во всех статусах, смены за полтора месяца, закупки и зарплата.
 *
 * Данные создаются ЧЕРЕЗ РЕАЛЬНЫЕ СЕРВИСЫ, а не прямыми вставками: заказы
 * проходят по жизненному циклу функцией `changeOrderStatus`, поэтому история
 * статусов, уведомления и автоназначение ОТК получаются настоящими, а не
 * нарисованными. Побочный эффект — скрипт заодно прогоняет весь бэкенд.
 *
 * Повторный запуск сначала удаляет данные предыдущего: скрипт идемпотентен.
 *
 * Запуск: `pnpm --filter @curtain-crm/api run demo`
 */
import {
  auditLog,
  branches,
  closeDatabase,
  createDatabase,
  hashPassword,
  installationTrips,
  notifications,
  orderComments,
  orderItems,
  orderPackChecks,
  orderPhotos,
  orders,
  orderStatusHistory,
  payrollRecords,
  personalBreaks,
  purchaseItems,
  purchases,
  refreshTokens,
  shifts,
  userBranches,
  userRoles,
  users,
  workPlans,
  type Database,
  payments,
} from '@curtain-crm/db';
import {
  areaM2FromCm,
  DEFAULT_CATALOG_ITEMS,
  moneyToDecimalString,
  OrderStatus,
  Role,
  type Department,
  type EmploymentType,
  type OrderStatus as OrderStatusName,
  type Priority,
  type Role as RoleName,
  PaymentKind,
  PaymentMethod,
} from '@curtain-crm/shared';
import { config as loadEnv } from 'dotenv';
import { asc, eq, inArray, isNotNull, like } from 'drizzle-orm';

import { loadAuthenticatedUser } from '../context';
import { post } from '../services/ledger.service';
import { calculateForUserRole, payableRoles, saveDraft } from '../services/payroll.service';
import { assignExecutor, changeOrderStatus } from '../services/orderWorkflow.service';
import { loadPackList } from '../services/packList.service';
import { workshopDay, workshopPeriodStarts } from '../services/periods';
import { setWorkPlan } from '../services/workPlans.service';
import type { AuthenticatedUser } from '../types';

loadEnv({ path: ['.env', '../../.env'] });

/** Признак демо-данных: по нему же выполняется очистка. */
const DEMO_PHONE_PREFIX = '+99893';

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/* -------------------------------------------------------------------------- */
/*                        Детерминированная случайность                       */
/* -------------------------------------------------------------------------- */

/**
 * Генератор с фиксированным зерном (mulberry32).
 *
 * `Math.random()` дал бы разный набор на каждый запуск, и «у меня не
 * воспроизводится» стало бы обычным ответом на баг-репорт по демо-стенду.
 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260826);

const pick = <T>(items: readonly T[]): T => {
  const value = items[Math.floor(random() * items.length)];
  if (value === undefined) throw new Error('пустой список для выбора');
  return value;
};

const pickSome = <T>(items: readonly T[], max: number): T[] => {
  const count = 1 + Math.floor(random() * max);
  return [...new Set(Array.from({ length: count }, () => pick(items)))];
};

const between = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/*                                 Персонал                                   */
/* -------------------------------------------------------------------------- */

interface StaffSpec {
  readonly name: string;
  readonly role: RoleName;
  readonly jobTitle: string;
  readonly department: Department;
  readonly employment: EmploymentType;
  /** Сколько месяцев назад принят. */
  readonly tenureMonths: number;
  /** Возраст в годах — для возрастной диаграммы. */
  readonly age: number;
}

const STAFF: readonly StaffSpec[] = [
  { name: 'Малика Юсупова', role: Role.SELLER, jobTitle: 'Продавец-консультант', department: 'sales', employment: 'permanent', tenureMonths: 41, age: 29 },
  { name: 'Дилноза Турсунова', role: Role.SELLER, jobTitle: 'Продавец-консультант', department: 'sales', employment: 'probation', tenureMonths: 2, age: 24 },
  { name: 'Фарух Расулов', role: Role.SELLER, jobTitle: 'Продавец-консультант', department: 'sales', employment: 'permanent', tenureMonths: 18, age: 33 },
  { name: 'Севара Ким', role: Role.SELLER, jobTitle: 'Старший продавец', department: 'sales', employment: 'permanent', tenureMonths: 64, age: 38 },

  { name: 'Азиз Абдуллаев', role: Role.MASTER, jobTitle: 'Мастер-замерщик', department: 'sewing', employment: 'permanent', tenureMonths: 66, age: 35 },
  { name: 'Бобур Каримов', role: Role.MASTER, jobTitle: 'Мастер-замерщик', department: 'sewing', employment: 'permanent', tenureMonths: 27, age: 31 },
  { name: 'Шухрат Ибрагимов', role: Role.MASTER, jobTitle: 'Раскройщик', department: 'cutting', employment: 'permanent', tenureMonths: 47, age: 42 },

  { name: 'Зухра Нормуродова', role: Role.SEWER, jobTitle: 'Швея', department: 'sewing', employment: 'permanent', tenureMonths: 49, age: 27 },
  { name: 'Гулнора Сайфиева', role: Role.SEWER, jobTitle: 'Швея', department: 'sewing', employment: 'permanent', tenureMonths: 33, age: 30 },
  { name: 'Нигора Азизова', role: Role.SEWER, jobTitle: 'Швея', department: 'sewing', employment: 'temporary', tenureMonths: 8, age: 22 },
  { name: 'Феруза Хакимова', role: Role.SEWER, jobTitle: 'Швея', department: 'sewing', employment: 'permanent', tenureMonths: 72, age: 45 },
  { name: 'Мадина Юлдашева', role: Role.SEWER, jobTitle: 'Швея', department: 'sewing', employment: 'intern', tenureMonths: 3, age: 19 },
  { name: 'Ойша Рахимова', role: Role.SEWER, jobTitle: 'Швея-закройщица', department: 'cutting', employment: 'permanent', tenureMonths: 21, age: 34 },

  { name: 'Нилуфар Ахмедова', role: Role.QC, jobTitle: 'Контролёр ОТК', department: 'quality', employment: 'permanent', tenureMonths: 43, age: 37 },
  { name: 'Камола Рустамова', role: Role.QC, jobTitle: 'Контролёр ОТК', department: 'quality', employment: 'permanent', tenureMonths: 14, age: 28 },

  { name: 'Рустам Каримов', role: Role.INSTALLER, jobTitle: 'Установщик', department: 'installation', employment: 'permanent', tenureMonths: 52, age: 32 },
  { name: 'Жасур Тошматов', role: Role.INSTALLER, jobTitle: 'Установщик', department: 'installation', employment: 'permanent', tenureMonths: 29, age: 26 },
  { name: 'Отабек Нурматов', role: Role.INSTALLER, jobTitle: 'Установщик', department: 'installation', employment: 'temporary', tenureMonths: 5, age: 23 },

  { name: 'Шухрат Абдуллаев', role: Role.CORNICE_INSTALLER, jobTitle: 'Карнизчик', department: 'installation', employment: 'permanent', tenureMonths: 34, age: 30 },
  { name: 'Бекзод Эргашев', role: Role.CORNICE_INSTALLER, jobTitle: 'Карнизчик', department: 'installation', employment: 'permanent', tenureMonths: 8, age: 24 },

  { name: 'Дилшод Мирзаев', role: Role.ADMIN, jobTitle: 'Администратор производства', department: 'administration', employment: 'permanent', tenureMonths: 55, age: 40 },
  { name: 'Зарина Юсупова', role: Role.ADMIN, jobTitle: 'Администратор', department: 'administration', employment: 'permanent', tenureMonths: 19, age: 31 },

  { name: 'Санжар Холматов', role: Role.SMM, jobTitle: 'SMM-менеджер', department: 'other', employment: 'permanent', tenureMonths: 11, age: 25 },
];

const CLIENT_NAMES = [
  'Ахмедов Тимур', 'Собирова Гульнара', 'Юсупов Бахтиёр', 'Каримова Дилором',
  'Назаров Улугбек', 'Хамидова Зарина', 'Эргашев Санжар', 'Мирзоева Феруза',
  'Тошпулатов Азамат', 'Раззакова Малика', 'Юлдашев Дониёр', 'Икрамова Нодира',
  'Сафаров Жахонгир', 'Абдуллаева Севара', 'Нурматов Шерзод', 'Камолова Дилноза',
  'Бекмуродов Фаррух', 'Тураева Мохира', 'Рахмонов Икром', 'Салимова Гулбахор',
] as const;

const ADDRESSES = [
  'г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34',
  'г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7',
  'г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91',
  'г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108',
  'г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5',
  'г. Ургенч, ул. Ал-Хорезми, 56',
  'г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12',
] as const;

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL не задана — скопируйте .env.example в .env');
  }

  const { db, client } = createDatabase(url, { maxConnections: 4 });

  try {
    log('Очистка данных предыдущего запуска…');
    await cleanup(db);

    await build(db);
  } finally {
    await closeDatabase(client);
  }
}

/**
 * Удаляет ранее созданные демо-данные.
 *
 * Опознаются по телефону сотрудника (`+99893…`) и по филиалам с пометкой
 * «(демо)». Учётная запись директора из сида не трогается.
 */
async function cleanup(db: Database): Promise<void> {
  const demoUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.phone, `${DEMO_PHONE_PREFIX}%`));
  const userIds = demoUsers.map((row) => row.id);

  const demoOrders = await db.select({ id: orders.id }).from(orders);
  const orderIds = demoOrders.map((row) => row.id);

  if (orderIds.length > 0) {
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(purchases).where(inArray(purchases.orderId, orderIds));
    await db.delete(orderPhotos).where(inArray(orderPhotos.orderId, orderIds));
    await db.delete(orderComments).where(inArray(orderComments.orderId, orderIds));
    await db.delete(notifications).where(inArray(notifications.relatedOrderId, orderIds));
    await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  await db.delete(notifications);
  // Проводки по выплатам держат расчёты (restrict) — сначала они.
  await db.delete(payments).where(isNotNull(payments.payrollRecordId));
  if (userIds.length > 0) {
    await db.delete(payments).where(inArray(payments.receivedBy, userIds));
  }
  await db.delete(payrollRecords);

  // Планы держат и людей, и автора (restrict); демо задаёт их заново целиком.
  await db.delete(workPlans);

  if (userIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, userIds));
    await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds));
    await db.delete(shifts).where(inArray(shifts.userId, userIds));
    await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await db.delete(userBranches).where(inArray(userBranches.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }

  await db.delete(branches).where(like(branches.name, '%(демо)%'));
}

async function build(db: Database): Promise<void> {
  /* --- Филиалы -------------------------------------------------------- */

  const [mainBranch] = await db.select().from(branches).limit(1);
  if (mainBranch === undefined) {
    throw new Error('Не найден базовый филиал — сначала выполните `pnpm db:seed`');
  }

  const [secondBranch] = await db
    .insert(branches)
    .values({
      name: 'Цех №2 Ургенч (демо)',
      address: 'г. Ургенч, ул. Ал-Хорезми, 12',
      latitude: 41.5829,
      longitude: 60.6095,
      radiusMeters: 150,
    })
    .returning();
  if (secondBranch === undefined) throw new Error('второй филиал не создан');

  const branchIds = [mainBranch.id, secondBranch.id];
  log(`Филиалы: ${branchIds.length.toString()}`);

  /* --- Сотрудники ------------------------------------------------------ */

  const [ceo] = await db.select().from(users).limit(1);
  if (ceo === undefined) throw new Error('нет директора — выполните `pnpm db:seed`');

  const passwordHash = await hashPassword('Demo2026!');
  const staff = new Map<RoleName, { id: number; fullName: string }[]>();

  for (const [index, spec] of STAFF.entries()) {
    const hiredAt = new Date();
    hiredAt.setMonth(hiredAt.getMonth() - spec.tenureMonths);

    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - spec.age);
    // Раскидываем дни рождения по году, часть — в ближайший месяц,
    // чтобы виджет «Дни рождения» не был пустым.
    birth.setMonth((index * 5) % 12);
    birth.setDate(1 + ((index * 7) % 27));

    const [created] = await db
      .insert(users)
      .values({
        fullName: spec.name,
        phone: `${DEMO_PHONE_PREFIX}${(1000000 + index).toString()}`,
        passwordHash,
        jobTitle: spec.jobTitle,
        department: spec.department,
        employmentType: spec.employment,
        birthDate: isoDate(birth),
        hiredAt: isoDate(hiredAt),
      })
      .returning({ id: users.id });

    if (created === undefined) throw new Error(`сотрудник ${spec.name} не создан`);

    await db
      .update(users)
      .set({ employeeCode: `EMP-${hiredAt.getFullYear().toString()}-${created.id.toString().padStart(4, '0')}` })
      .where(eq(users.id, created.id));

    await db.insert(userRoles).values({ userId: created.id, role: spec.role, grantedBy: ceo.id });

    // Большинство — в главном цехе, часть — во втором филиале.
    const branchId = index % 5 === 4 ? secondBranch.id : mainBranch.id;
    await db.insert(userBranches).values({ userId: created.id, branchId, isPrimary: true });

    const bucket = staff.get(spec.role) ?? [];
    bucket.push({ id: created.id, fullName: spec.name });
    staff.set(spec.role, bucket);
  }

  log(`Сотрудники: ${STAFF.length.toString()}`);

  const roleUsers = (role: RoleName): { id: number; fullName: string }[] => staff.get(role) ?? [];

  /* --- Смены за 45 дней ------------------------------------------------- */

  const workers = [
    ...roleUsers(Role.SEWER),
    ...roleUsers(Role.MASTER),
    ...roleUsers(Role.QC),
    ...roleUsers(Role.INSTALLER),
    ...roleUsers(Role.CORNICE_INSTALLER),
    ...roleUsers(Role.SELLER),
  ];

  let shiftCount = 0;
  const shiftRows: (typeof shifts.$inferInsert)[] = [];

  for (let day = 45; day >= 1; day -= 1) {
    const date = daysAgo(day);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue; // воскресенье — выходной

    for (const worker of workers) {
      // ~12 % пропусков, чтобы тепловая карта не была однотонной
      if (random() < 0.12) continue;

      const start = new Date(date);
      start.setUTCHours(3, between(0, 25), 0, 0); // 08:00–08:25 по Ташкенту (UTC+5)

      const end = new Date(start);
      end.setUTCHours(start.getUTCHours() + between(7, 10), between(0, 55), 0, 0);

      shiftRows.push({
        userId: worker.id,
        branchId: mainBranch.id,
        startedAt: start,
        endedAt: end,
        startLatitude: 41.2995 + (random() - 0.5) * 0.0008,
        startLongitude: 69.2401 + (random() - 0.5) * 0.0008,
        startDistanceMeters: between(5, 95),
      });
      shiftCount += 1;
    }
  }

  // Вставляем пачками: одна вставка на 600 строк заметно быстрее, чем 600 вставок.
  for (let offset = 0; offset < shiftRows.length; offset += 200) {
    await db.insert(shifts).values(shiftRows.slice(offset, offset + 200));
  }

  log(`Смены: ${shiftCount.toString()} закрытых за прошлые дни`);

  /* --- Заказы ------------------------------------------------------------ */

  const actorCache = new Map<number, AuthenticatedUser>();
  const actorOf = async (id: number): Promise<AuthenticatedUser> => {
    const cached = actorCache.get(id);
    if (cached !== undefined) return cached;

    const user = await loadAuthenticatedUser(db, id);
    if (user === null) throw new Error(`сотрудник ${id.toString()} не загрузился`);
    actorCache.set(id, user);
    return user;
  };

  const adminActor = await actorOf(roleUsers(Role.ADMIN)[0]?.id ?? ceo.id);

  /**
   * Целевые статусы заказов и их доля.
   *
   * Набор подобран так, чтобы на дашборде был заполнен каждый этап конвейера,
   * а в архиве лежали и выполненные, и отменённые.
   */
  const TARGETS: readonly { status: OrderStatusName; count: number }[] = [
    { status: OrderStatus.PENDING_ADMIN_REVIEW, count: 5 },
    { status: OrderStatus.REJECTED_TO_CEO, count: 2 },
    { status: OrderStatus.MEASUREMENT_ASSIGNED, count: 4 },
    { status: OrderStatus.MEASUREMENT_DONE, count: 3 },
    { status: OrderStatus.PENDING_SEWING_ASSIGNMENT, count: 6 },
    { status: OrderStatus.SEWING_IN_PROGRESS, count: 7 },
    { status: OrderStatus.SEWING_DONE, count: 3 },
    { status: OrderStatus.PENDING_QC, count: 5 },
    { status: OrderStatus.QC_FAILED, count: 2 },
    { status: OrderStatus.QC_PASSED, count: 3 },
    { status: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, count: 4 },
    { status: OrderStatus.INSTALLATION_ASSIGNED, count: 4 },
    { status: OrderStatus.INSTALLATION_IN_PROGRESS, count: 2 },
    // Установка сделана, клиент не доплатил — «Ждёт оплаты» и вкладка «С долгом».
    { status: OrderStatus.INSTALLATION_DONE, count: 2 },
    { status: OrderStatus.COMPLETED, count: 14 },
    { status: OrderStatus.CANCELLED, count: 3 },
  ];

  const models = DEFAULT_CATALOG_ITEMS.curtain_model;
  const materials = DEFAULT_CATALOG_ITEMS.material;
  const colors = DEFAULT_CATALOG_ITEMS.color;
  const cornices = DEFAULT_CATALOG_ITEMS.cornice;
  const tulles = DEFAULT_CATALOG_ITEMS.tulle;

  const priorities: readonly Priority[] = ['normal', 'normal', 'normal', 'urgent', 'critical'];

  const catalogRows = await db.select().from(purchaseItems);
  const completedOrderIds: number[] = [];
  const installingOrderIds: number[] = [];
  const assignedOrderIds: number[] = [];
  let created = 0;

  for (const target of TARGETS) {
    for (let index = 0; index < target.count; index += 1) {
      const seller = pick(roleUsers(Role.SELLER));
      const sellerActor = await actorOf(seller.id);

      const createdAt = daysAgo(between(2, 85));
      const workPrice = between(30, 220) * 100_000;
      // Закрытые заказы оплачены целиком: с долгом заказ не закрывается.
      const deposit =
        target.status === OrderStatus.COMPLETED
          ? workPrice
          : Math.round(workPrice * (0.2 + random() * 0.5));

      const [order] = await db
        .insert(orders)
        .values({
          branchId: pick(branchIds),
          clientName: pick(CLIENT_NAMES),
          clientPhone: `+99890${(1000000 + between(0, 8999999)).toString().slice(0, 7)}`,
          clientComment: random() < 0.3 ? 'Просили не шуметь до 10 утра' : null,
          installAddress: pick(ADDRESSES),
          deadline: isoDate(new Date(createdAt.getTime() + between(10, 45) * 24 * 60 * 60 * 1000)),
          priority: pick(priorities),
          workPrice: moneyToDecimalString(workPrice * 100),
          createdBy: seller.id,
          createdAt,
        })
        .returning();

      if (order === undefined) continue;

      // Первая оплата — проводкой в книгу: «оплачено» у заказа поднимет база.
      await post(db, {
        branchId: order.branchId,
        kind: PaymentKind.ORDER_DEPOSIT,
        method: PaymentMethod.CASH,
        amount: deposit * 100,
        orderId: order.id,
        actorId: seller.id,
        at: createdAt,
      });

      // Позиции заказа
      const itemCount = between(1, 3);
      for (let position = 0; position < itemCount; position += 1) {
        const width = between(90, 400);
        const height = between(140, 300);

        await db.insert(orderItems).values({
          orderId: order.id,
          kind: position === 0 ? 'window' : pick(['window', 'door'] as const),
          position,
          model: pick(models),
          materials: pickSome(materials, 2),
          materialOptions: pickSome(DEFAULT_CATALOG_ITEMS.material_option, 2),
          color: pick(colors),
          widthCm: width.toFixed(1),
          heightCm: height.toFixed(1),
          areaM2: areaM2FromCm(width, height).toFixed(4),
          cornice: { code: pick(cornices), meters: null, description: null },
          tulle: { code: pick(tulles), meters: null, description: null },
          quantity: between(1, 2),
        });
      }

      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: OrderStatus.NEW,
        changedBy: seller.id,
        comment: 'Заказ создан',
      });

      await advanceTo(db, order.id, target.status, {
        seller: sellerActor,
        admin: adminActor,
        actorOf,
        roleUsers,
      });

      await spreadHistoryOverTime(db, order.id, createdAt);

      if (target.status === OrderStatus.COMPLETED) completedOrderIds.push(order.id);
      if (target.status === OrderStatus.INSTALLATION_IN_PROGRESS) installingOrderIds.push(order.id);
      if (target.status === OrderStatus.INSTALLATION_ASSIGNED) assignedOrderIds.push(order.id);

      // Закупки по части заказов — чтобы считалась себестоимость и маржа
      if (catalogRows.length > 0 && random() < 0.7) {
        for (let line = 0; line < between(1, 4); line += 1) {
          const catalogItem = pick(catalogRows);
          await db.insert(purchases).values({
            orderId: order.id,
            itemId: catalogItem.id,
            quantity: (between(1, 12) + random()).toFixed(3),
            unitPrice: catalogItem.price,
            createdBy: adminActor.id,
          });
        }
      }

      // Комментарии — чтобы карточка заказа не была пустой
      if (random() < 0.4) {
        await db.insert(orderComments).values({
          orderId: order.id,
          userId: pick([seller.id, adminActor.id]),
          body: pick([
            'Клиент просил перезвонить после 18:00',
            'Согласовали замену цвета на бежевый',
            'Ткань привезли, можно раскраивать',
            'Клиент передвинул установку на следующую неделю',
          ]),
          isVoice: false,
        });
      }

      created += 1;
    }
  }

  log(`Заказы: ${created.toString()} (в том числе ${completedOrderIds.length.toString()} закрытых)`);

  /* --- Сегодня: живая картина для табло ------------------------------------ */

  log(await seedToday(db, { branchId: mainBranch.id, roleUsers, installingOrderIds }));

  /* --- Машинки, планы и время установки --------------------------------- */

  log(
    await seedPlansAndSchedule(db, {
      ceoId: ceo.id,
      roleUsers,
      completedOrderIds,
      installingOrderIds,
      assignedOrderIds,
    }),
  );

  /* --- Зарплата за два месяца -------------------------------------------- */

  const now = new Date();
  const periods = [
    { year: now.getFullYear(), month: now.getMonth() + 1 },
    now.getMonth() === 0
      ? { year: now.getFullYear() - 1, month: 12 }
      : { year: now.getFullYear(), month: now.getMonth() },
  ];

  const allStaff = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(users.isActive, true));

  let payrollCount = 0;
  for (const period of periods) {
    for (const entry of allStaff) {
      if (payableRoles([entry.role]).length === 0) continue;

      try {
        await db.transaction(async (tx) => {
          const calculated = await calculateForUserRole(tx, entry.userId, entry.role, period);
          if (await saveDraft(tx, calculated)) payrollCount += 1;
        });
      } catch {
        // Роль без активной схемы — пропускаем, это не ошибка демо-данных.
      }
    }
  }

  log(`Расчёты зарплаты: ${payrollCount.toString()} за ${periods.length.toString()} периода`);

  const [notificationCount] = await db
    .select({ value: notifications.id })
    .from(notifications)
    .limit(1);
  log(`Уведомления: сгенерированы переходами статусов${notificationCount === undefined ? ' (пусто)' : ''}`);

  log('');
  log('Готово. Демо-сотрудники входят по паролю Demo2026!');
  log('Например: Малика Юсупова — +998931000000, Дилшод Мирзаев — +998931000018');
}

/* -------------------------------------------------------------------------- */
/*                         Сегодняшний день для табло                         */
/* -------------------------------------------------------------------------- */

interface TodayParams {
  readonly branchId: number;
  readonly roleUsers: (role: RoleName) => { id: number; fullName: string }[];
  /** Заказы, доведённые до «идёт установка»: по ним установщики сейчас в дороге. */
  readonly installingOrderIds: readonly number[];
}

/**
 * Смены, отлучка, выезд и выходной на сегодня — чтобы на табло был виден
 * каждый статус: работает, без заказа, отлучка, выезд, выходной, смена
 * закрыта, нет отметки. История за прошлые дни сегодняшний день не трогает.
 */
async function seedToday(db: Database, params: TodayParams): Promise<string> {
  const now = new Date();
  // Всё — сегодня по Ташкенту, даже если скрипт запущен сразу после полуночи:
  // вчерашний выезд в «Выезды сегодня» не попадёт, вчерашняя смена — «нет отметки».
  const todayStart = workshopPeriodStarts(now).today.getTime();
  const minutesAgo = (minutes: number): Date => new Date(Math.max(todayStart, now.getTime() - minutes * 60 * 1000));
  const point = { startLatitude: 41.2995, startLongitude: 69.2401 };

  const openShift = async (userId: number, startedAt: Date): Promise<number> => {
    const [row] = await db
      .insert(shifts)
      .values({ userId, branchId: params.branchId, startedAt, ...point, startDistanceMeters: between(5, 60) })
      .returning({ id: shifts.id });
    if (row === undefined) throw new Error('смена не открыта');
    return row.id;
  };

  const sewers = params.roleUsers(Role.SEWER);
  const installers = params.roleUsers(Role.INSTALLER);
  const corniceInstallers = params.roleUsers(Role.CORNICE_INSTALLER);

  // Установщик в дороге — тот, на ком заказ «идёт установка». Один выезд на смену.
  const installing =
    params.installingOrderIds.length === 0
      ? []
      : await db
          .select({ id: orders.id, installerId: orders.installerId })
          .from(orders)
          .where(inArray(orders.id, [...params.installingOrderIds]));
  const tripOrderOf = new Map<number, number>();
  for (const row of installing) {
    if (row.installerId !== null && !tripOrderOf.has(row.installerId)) tripOrderOf.set(row.installerId, row.id);
  }

  // Из каждой группы один не отметился. У выездных — тот, кто не в дороге.
  const absent = new Set<number>();
  const lastSewer = sewers.at(-1);
  if (lastSewer !== undefined) absent.add(lastSewer.id);
  const idleOutside = [...installers, ...corniceInstallers].find((person) => !tripOrderOf.has(person.id));
  if (idleOutside !== undefined) absent.add(idleOutside.id);

  // Постоянный выходной в сегодняшний день недели (1 — понедельник … 7 — воскресенье).
  const dayOffSewer = sewers.at(-2);
  if (dayOffSewer !== undefined) {
    const weekday = new Date(`${workshopDay(now)}T00:00:00Z`).getUTCDay() || 7;
    await db.update(users).set({ weeklyDayOff: weekday }).where(eq(users.id, dayOffSewer.id));
    absent.add(dayOffSewer.id);
  }

  const finishedSewer = sewers.at(-3);
  if (finishedSewer !== undefined) {
    const startedAt = minutesAgo(4 * 60);
    await db.insert(shifts).values({
      userId: finishedSewer.id,
      branchId: params.branchId,
      startedAt,
      endedAt: new Date((startedAt.getTime() + now.getTime()) / 2),
      ...point,
      startDistanceMeters: between(5, 60),
    });
    absent.add(finishedSewer.id);
  }

  let opened = 0;
  let trips = 0;
  let onBreak = 0;
  const onShift = [
    ...sewers,
    ...installers,
    ...corniceInstallers,
    ...params.roleUsers(Role.MASTER),
    ...params.roleUsers(Role.QC),
  ].filter((person) => !absent.has(person.id));

  for (const person of onShift) {
    const shiftId = await openShift(person.id, minutesAgo(between(1, 5) * 60));
    opened += 1;

    const tripOrderId = tripOrderOf.get(person.id);
    if (tripOrderId !== undefined) {
      await db.insert(installationTrips).values({
        shiftId,
        orderId: tripOrderId,
        startedAt: minutesAgo(40),
        ...point,
        startDistanceMeters: between(5, 60),
      });
      trips += 1;
    }

    // Одна швея отошла на полчаса — на табло «Отлучка до HH:MM».
    if (person.id === sewers[0]?.id) {
      await db
        .insert(personalBreaks)
        .values({ shiftId, plannedMinutes: 30, startedAt: minutesAgo(10) });
      onBreak += 1;
    }
  }

  return `Сегодня: ${opened.toString()} открытых смен, выездов ${trips.toString()}, отлучек ${onBreak.toString()}, не на смене ${absent.size.toString()} (нет отметки, выходной, смена закрыта)`;
}

/* -------------------------------------------------------------------------- */
/*                   Машинки, планы и время установки для табло               */
/* -------------------------------------------------------------------------- */

interface PlansParams {
  readonly ceoId: number;
  readonly roleUsers: (role: RoleName) => { id: number; fullName: string }[];
  readonly completedOrderIds: readonly number[];
  readonly installingOrderIds: readonly number[];
  readonly assignedOrderIds: readonly number[];
}

/**
 * Машинки швеям, нормы ролей на этот и прошлый месяц (под объём демо), два
 * личных плана и время установки так, чтобы в «Установках сегодня» были все
 * четыре состояния: идёт, сделано, опаздывает, впереди.
 */
async function seedPlansAndSchedule(db: Database, params: PlansParams): Promise<string> {
  const sewers = params.roleUsers(Role.SEWER);
  for (const [index, sewer] of sewers.entries()) {
    await db.update(users).set({ workstation: index + 1 }).where(eq(users.id, sewer.id));
  }

  const now = new Date();
  const starts = workshopPeriodStarts(now);
  const months = [workshopDay(starts.prevMonth).slice(0, 7), workshopDay(starts.month).slice(0, 7)];
  // Под объём демо: за месяц швея сдаёт 10–20 штук, установщик — до десятка
  // заказов. Норма выше этого покрасила бы всё табло в «отстаёт».
  const norms = [
    { role: Role.SEWER, target: 12 },
    { role: Role.INSTALLER, target: 8 },
    { role: Role.CORNICE_INSTALLER, target: 4 },
  ] as const;
  for (const month of months) {
    for (const norm of norms) {
      await setWorkPlan(db, { role: norm.role, userId: null, month, target: norm.target, actorId: params.ceoId });
    }
  }
  const currentMonth = months[1] ?? '';
  const personal = [
    { person: sewers[0], role: Role.SEWER, target: 15 },
    { person: params.roleUsers(Role.INSTALLER)[0], role: Role.INSTALLER, target: 6 },
  ];
  for (const plan of personal) {
    if (plan.person === undefined) continue;
    await setWorkPlan(db, {
      role: plan.role,
      userId: plan.person.id,
      month: currentMonth,
      target: plan.target,
      actorId: params.ceoId,
    });
  }

  // Время — в сегодняшних ташкентских сутках, даже сразу после полуночи.
  const todayStart = starts.today.getTime();
  const todayAgo = (minutes: number): Date => new Date(Math.max(todayStart, now.getTime() - minutes * 60_000));
  const todayLater = new Date(Math.min(now.getTime() + 2 * 60 * 60_000, starts.tomorrow.getTime() - 15 * 60_000));
  const tomorrowMorning = new Date(starts.tomorrow.getTime() + 11 * 60 * 60_000);
  const [late, later, tomorrow] = params.assignedOrderIds;
  const times: { orderId: number | undefined; at: Date }[] = [
    // Идёт установка: начали утром.
    ...params.installingOrderIds.map((orderId, index) => ({ orderId, at: todayAgo(90 - index * 30) })),
    // Две сегодняшние — уже сделаны.
    ...params.completedOrderIds.slice(0, 2).map((orderId, index) => ({ orderId, at: todayAgo(5 * 60 - index * 60) })),
    // Назначена на два часа назад, выезда нет — опаздывает.
    { orderId: late, at: todayAgo(120) },
    { orderId: later, at: todayLater },
    { orderId: tomorrow, at: tomorrowMorning },
    // Четвёртая назначенная остаётся без времени — счётчик «Без времени».
  ];
  let scheduled = 0;
  for (const { orderId, at } of times) {
    if (orderId === undefined) continue;
    await db.update(orders).set({ installationAt: at }).where(eq(orders.id, orderId));
    scheduled += 1;
  }

  return `Табло: машинки у ${sewers.length.toString()} швей, нормы на ${months.join(' и ')}, личных планов ${personal.length.toString()}, установок со временем ${scheduled.toString()}`;
}

/* -------------------------------------------------------------------------- */
/*                     Продвижение заказа по жизненному циклу                 */
/* -------------------------------------------------------------------------- */

/**
 * Разносит историю заказа во времени.
 *
 * `changeOrderStatus` ставит метку «сейчас», а демо-скрипт прогоняет весь
 * жизненный цикл заказа за доли секунды. В результате переходы, между которыми
 * в жизни дни, отличались на миллисекунды — и любой показатель вида «сколько
 * времени занял этап» давал ноль. Проверял: среднее время замера выходило
 * `0.00` дня.
 *
 * Поэтому после прогона метки переписываются: первая — момент создания заказа,
 * дальше правдоподобные промежутки, монотонно и не позже «сейчас».
 *
 * ЭТО ДОПУСТИМО ТОЛЬКО ЗДЕСЬ. `order_status_history` — append-only таблица,
 * и ни один роутер её не переписывает; демо-скрипт же не фиксирует настоящие
 * события, а сочиняет правдоподобное прошлое, и без этого шага сочинённое
 * прошлое получается схлопнутым в одну точку.
 *
 * Заодно приводятся в соответствие `completed_at`, `cancelled_at`
 * и `updated_at` — по ним считаются выручка за период и динамика.
 */
async function spreadHistoryOverTime(
  db: Database,
  orderId: number,
  createdAt: Date,
): Promise<void> {
  const rows = await db
    .select({ id: orderStatusHistory.id, toStatus: orderStatusHistory.toStatus })
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.id));

  if (rows.length === 0) return;

  const now = Date.now();
  let cursor = createdAt.getTime();
  let completedAt: Date | null = null;
  let cancelledAt: Date | null = null;
  let lastAt = createdAt;

  for (const [index, row] of rows.entries()) {
    if (index > 0) {
      // От трёх часов до трёх суток на шаг — примерно так и идёт заказ
      // в мастерской: замер и раскрой быстро, пошив и установка дольше.
      cursor += Math.round((0.12 + random() * 2.9) * 24 * 60 * 60 * 1000);
      // Заказ не мог продвинуться в будущем: упираемся в «сейчас».
      if (cursor > now) cursor = now;
    }

    const at = new Date(cursor);
    lastAt = at;

    await db
      .update(orderStatusHistory)
      .set({ createdAt: at })
      .where(eq(orderStatusHistory.id, row.id));

    if (row.toStatus === OrderStatus.COMPLETED) completedAt = at;
    if (row.toStatus === OrderStatus.CANCELLED) cancelledAt = at;
  }

  await db
    .update(orders)
    .set({
      updatedAt: lastAt,
      ...(completedAt === null ? {} : { completedAt }),
      ...(cancelledAt === null ? {} : { cancelledAt }),
    })
    .where(eq(orders.id, orderId));
}

interface AdvanceContext {
  readonly seller: AuthenticatedUser;
  readonly admin: AuthenticatedUser;
  readonly actorOf: (id: number) => Promise<AuthenticatedUser>;
  readonly roleUsers: (role: RoleName) => { id: number; fullName: string }[];
}

/**
 * Проводит заказ по реальным переходам до нужного статуса.
 *
 * Именно через `changeOrderStatus`, а не прямым `UPDATE`: так история,
 * уведомления и автоназначение ОТК получаются настоящими. Побочный эффект —
 * скрипт проверяет весь конвейер на полусотне заказов.
 */
async function advanceTo(
  db: Database,
  orderId: number,
  target: OrderStatusName,
  context: AdvanceContext,
): Promise<void> {
  const { seller, admin, actorOf, roleUsers } = context;

  const master = await actorOf(pick(roleUsers(Role.MASTER)).id);
  const sewer = await actorOf(pick(roleUsers(Role.SEWER)).id);
  const qc = await actorOf(pick(roleUsers(Role.QC)).id);
  const installer = await actorOf(pick(roleUsers(Role.INSTALLER)).id);

  const move = async (
    to: OrderStatusName,
    actor: AuthenticatedUser,
    comment?: string,
  ): Promise<void> => {
    await db.transaction(async (tx) => {
      await changeOrderStatus(tx, { orderId, toStatus: to, actor, comment: comment ?? null });
    });
  };

  const assign = async (
    role: 'master' | 'sewer' | 'installer',
    assigneeId: number,
  ): Promise<void> => {
    await db.transaction(async (tx) => {
      await assignExecutor(tx, { orderId, role, assigneeId, actor: admin });
    });
  };

  await move(OrderStatus.PENDING_ADMIN_REVIEW, seller);
  if (target === OrderStatus.PENDING_ADMIN_REVIEW) return;

  if (target === OrderStatus.REJECTED_TO_CEO) {
    await move(OrderStatus.REJECTED_TO_CEO, admin, 'Не согласована цена с клиентом');
    return;
  }

  if (target === OrderStatus.CANCELLED) {
    await move(OrderStatus.CANCELLED, admin, pick([
      'Клиент отказался от заказа',
      'Не согласовали срок установки',
      'Клиент выбрал другого подрядчика',
    ]));
    return;
  }

  await assign('master', master.id);
  await move(OrderStatus.MEASUREMENT_ASSIGNED, admin);
  if (target === OrderStatus.MEASUREMENT_ASSIGNED) return;

  await move(OrderStatus.MEASUREMENT_DONE, master);
  if (target === OrderStatus.MEASUREMENT_DONE) return;

  await move(OrderStatus.PENDING_SEWING_ASSIGNMENT, master);
  if (target === OrderStatus.PENDING_SEWING_ASSIGNMENT) return;

  await assign('sewer', sewer.id);
  await move(OrderStatus.SEWING_IN_PROGRESS, sewer);
  if (target === OrderStatus.SEWING_IN_PROGRESS) return;

  await move(OrderStatus.SEWING_DONE, sewer);
  if (target === OrderStatus.SEWING_DONE) return;

  await move(OrderStatus.PENDING_QC, sewer);
  if (target === OrderStatus.PENDING_QC) return;

  if (target === OrderStatus.QC_FAILED) {
    await move(OrderStatus.QC_FAILED, qc, pick([
      'Кривой шов по нижнему краю',
      'Не совпадает оттенок ткани с образцом',
      'Замят ламбрекен при упаковке',
    ]));
    return;
  }

  await move(OrderStatus.QC_PASSED, qc);
  if (target === OrderStatus.QC_PASSED) return;

  await move(OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, qc);
  if (target === OrderStatus.PENDING_INSTALLATION_ASSIGNMENT) return;

  await assign('installer', installer.id);
  await move(OrderStatus.INSTALLATION_ASSIGNED, admin);
  if (target === OrderStatus.INSTALLATION_ASSIGNED) return;

  // Без отмеченного листа сборов выезд не начать — установщик собирается сам.
  const packList = await loadPackList(db, orderId);
  if (packList.length > 0) {
    await db
      .insert(orderPackChecks)
      .values(packList.map((row) => ({ orderId, key: row.key, checkedBy: installer.id })));
  }
  await move(OrderStatus.INSTALLATION_IN_PROGRESS, installer);
  if (target === OrderStatus.INSTALLATION_IN_PROGRESS) return;

  await move(OrderStatus.INSTALLATION_DONE, installer);
  if (target === OrderStatus.INSTALLATION_DONE) return;

  await move(OrderStatus.COMPLETED, admin);
}

main().catch((error: unknown) => {
  process.stderr.write(`\nГЕНЕРАЦИЯ ДЕМО-ДАННЫХ ПРЕРВАНА: ${String(error)}\n`);
  if (error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});

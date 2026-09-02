/**
 * Наполнение базы начальными данными.
 *
 * Запуск: `pnpm db:seed` (после `pnpm db:migrate`).
 *
 * Скрипт идемпотентен: повторный запуск не создаёт дублей и не перезаписывает
 * изменённые вручную данные. Это важно, потому что сид гоняют на одной и той же
 * dev-базе десятки раз.
 *
 * Создаёт: филиал, учётную запись CEO, справочники характеристик, примерный
 * каталог закупки и схемы начисления зарплаты по ролям.
 */
import {
  CATALOG_KINDS,
  DEFAULT_CATALOG_ITEMS,
  normalizePhone,
  PayrollSchemeType,
  PurchaseCategory,
  PurchaseUnit,
  Role,
  type PayrollSchemeType as PayrollSchemeTypeValue,
  type Role as RoleValue,
} from '@curtain-crm/shared';
import { config as loadEnv } from 'dotenv';
import { and, eq } from 'drizzle-orm';

import { closeDatabase, createDatabase } from './index';
import { hashPassword } from './lib/password';
import {
  branches,
  catalogItems,
  payrollSchemes,
  purchaseItems,
  userBranches,
  userRoles,
  users,
} from './schema';

loadEnv({ path: ['.env', '../../.env'] });

/* -------------------------------------------------------------------------- */
/*                            Параметры сидирования                           */
/* -------------------------------------------------------------------------- */

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Переменная окружения ${key} не задана`);
  }
  return value;
};

const envOrDefault = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value === undefined || value.length === 0 ? fallback : value;
};

const DATABASE_URL = requireEnv('DATABASE_URL');

/** Первый филиал. Координаты по умолчанию — Ташкент, как в `curtain-bot`. */
const SEED_BRANCH_NAME = envOrDefault('SEED_BRANCH_NAME', 'Цех №1');
const SEED_BRANCH_LAT = Number.parseFloat(envOrDefault('SEED_BRANCH_LAT', '41.2995'));
const SEED_BRANCH_LON = Number.parseFloat(envOrDefault('SEED_BRANCH_LON', '69.2401'));

const SEED_CEO_NAME = envOrDefault('SEED_CEO_NAME', 'Директор');
const SEED_CEO_PHONE = envOrDefault('SEED_CEO_PHONE', '+998901234567');
/**
 * Пароль директора. В проде задавайте `SEED_CEO_PASSWORD` явно — дефолт
 * рассчитан только на локальную разработку и печатается в консоль.
 */
const SEED_CEO_PASSWORD = envOrDefault('SEED_CEO_PASSWORD', 'DesignHouse2026!');

/**
 * Примерный каталог закупки. Реальные позиции и цены заводит CEO из веб-панели;
 * здесь — минимум, чтобы форма закупки была не пустой на дев-стенде.
 */
const SAMPLE_PURCHASE_ITEMS = [
  { name: 'Ткань блэкаут', unit: PurchaseUnit.METER, price: '85000.00', category: PurchaseCategory.FABRIC },
  { name: 'Тюль органза', unit: PurchaseUnit.METER, price: '45000.00', category: PurchaseCategory.FABRIC },
  { name: 'Карниз профильный алюминий', unit: PurchaseUnit.METER, price: '65000.00', category: PurchaseCategory.CORNICE },
  { name: 'Лента шторная', unit: PurchaseUnit.METER, price: '12000.00', category: PurchaseCategory.CONSUMABLE },
  { name: 'Крючки шторные', unit: PurchaseUnit.SET, price: '25000.00', category: PurchaseCategory.CONSUMABLE },
  { name: 'Подхваты', unit: PurchaseUnit.PIECE, price: '55000.00', category: PurchaseCategory.ACCESSORY },
] as const;

/**
 * Схемы начисления по ролям.
 *
 * ВНИМАНИЕ: суммы — заглушки для дев-стенда, а не согласованные с заказчиком
 * значения. Настоящие ставки заводятся через `payroll.upsertScheme` из
 * веб-панели; сид лишь гарантирует, что расчёт зарплаты не падает на пустой
 * конфигурации.
 */
interface SeedScheme {
  readonly role: RoleValue;
  readonly type: PayrollSchemeTypeValue;
  readonly baseAmount?: string;
  readonly rate?: string;
  readonly kpiTarget?: string;
  readonly commissionPercent?: string;
}

const SEED_PAYROLL_SCHEMES: readonly SeedScheme[] = [
  { role: Role.CEO, type: PayrollSchemeType.FIXED, baseAmount: '15000000.00' },
  { role: Role.ADMIN, type: PayrollSchemeType.KPI, baseAmount: '6000000.00', rate: '2000000.00', kpiTarget: '30' },
  { role: Role.SELLER, type: PayrollSchemeType.COMMISSION, commissionPercent: '5.000' },
  { role: Role.MASTER, type: PayrollSchemeType.COMMISSION, commissionPercent: '3.000' },
  { role: Role.SEWER, type: PayrollSchemeType.HOURLY, rate: '35000.00' },
  { role: Role.QC, type: PayrollSchemeType.HOURLY, rate: '30000.00' },
  { role: Role.INSTALLER, type: PayrollSchemeType.COMMISSION, commissionPercent: '4.000' },
  { role: Role.SMM, type: PayrollSchemeType.FIXED, baseAmount: '4000000.00' },
];

/* -------------------------------------------------------------------------- */

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

async function seed(): Promise<void> {
  const { db, client } = createDatabase(DATABASE_URL, { maxConnections: 1 });

  try {
    await db.transaction(async (tx) => {
      /* --- Филиал -------------------------------------------------------- */

      const existingBranch = await tx.query.branches.findFirst({
        where: eq(branches.name, SEED_BRANCH_NAME),
      });

      const branchId =
        existingBranch?.id ??
        (
          await tx
            .insert(branches)
            .values({
              name: SEED_BRANCH_NAME,
              latitude: SEED_BRANCH_LAT,
              longitude: SEED_BRANCH_LON,
            })
            .returning({ id: branches.id })
        )[0]?.id;

      if (branchId === undefined) {
        throw new Error('Не удалось создать филиал');
      }
      log(`Филиал «${SEED_BRANCH_NAME}» — id ${branchId.toString()}`);

      /* --- Учётная запись CEO -------------------------------------------- */

      const ceoPhone = normalizePhone(SEED_CEO_PHONE);
      if (ceoPhone === null) {
        throw new Error(`SEED_CEO_PHONE «${SEED_CEO_PHONE}» не является узбекским номером`);
      }

      const existingCeo = await tx.query.users.findFirst({
        where: eq(users.phone, ceoPhone),
      });

      const resolveCeoId = async (): Promise<number> => {
        if (existingCeo !== undefined) {
          log(`Директор уже существует: ${ceoPhone}`);
          return existingCeo.id;
        }

        const passwordHash = await hashPassword(SEED_CEO_PASSWORD);
        const inserted = await tx
          .insert(users)
          .values({ fullName: SEED_CEO_NAME, phone: ceoPhone, passwordHash })
          .returning({ id: users.id });

        const created = inserted[0];
        if (created === undefined) {
          throw new Error('Не удалось создать учётную запись директора');
        }

        log(`Директор создан: ${ceoPhone} / ${SEED_CEO_PASSWORD}`);
        log('Смените пароль сразу после первого входа.');
        return created.id;
      };

      const ceoId = await resolveCeoId();

      // Роль CEO выдаёт сам себе — единственный законный способ загрузить
      // систему: дальше роли раздаёт только он.
      await tx
        .insert(userRoles)
        .values({ userId: ceoId, role: Role.CEO, grantedBy: ceoId })
        .onConflictDoNothing();

      await tx
        .insert(userBranches)
        .values({ userId: ceoId, branchId, isPrimary: true })
        .onConflictDoNothing();

      /* --- Справочники характеристик -------------------------------------- */

      const catalogRows = CATALOG_KINDS.flatMap((kind) =>
        DEFAULT_CATALOG_ITEMS[kind].map((name, index) => ({
          kind,
          name,
          sortOrder: index,
          createdBy: ceoId,
        })),
      );

      if (catalogRows.length > 0) {
        await tx.insert(catalogItems).values(catalogRows).onConflictDoNothing();
      }
      log(`Справочники характеристик: ${catalogRows.length.toString()} позиций`);

      /* --- Каталог закупки ------------------------------------------------ */

      await tx
        .insert(purchaseItems)
        .values(
          SAMPLE_PURCHASE_ITEMS.map((item) => ({
            name: item.name,
            unit: item.unit,
            price: item.price,
            category: item.category,
            createdBy: ceoId,
          })),
        )
        .onConflictDoNothing();
      log(`Каталог закупки: ${SAMPLE_PURCHASE_ITEMS.length.toString()} позиций`);

      /* --- Схемы начисления зарплаты -------------------------------------- */

      /*
        Условия оплаты принадлежат сотруднику, а не роли, поэтому сид больше
        не может завести «схему для швей» — заводить не на кого, пока швей
        нет. Здесь он раздаёт КАЖДОМУ активному сотруднику условия по
        шаблону его роли, и только тем, у кого их ещё нет.

        Так сид остаётся идемпотентным и полезным в обоих случаях: на пустой
        базе он оснащает директора, а на населённой — доводит условия тем,
        кого завели позже. Ставки в шаблонах ориентировочные: настоящие
        руководство проставляет каждому в панели.
      */
      const effectiveFrom = envOrDefault('SEED_PAYROLL_EFFECTIVE_FROM', '2026-01-01');
      const templates = new Map(SEED_PAYROLL_SCHEMES.map((scheme) => [scheme.role, scheme]));
      let createdSchemes = 0;

      const staffRoles = await tx
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(eq(users.isActive, true));

      for (const entry of staffRoles) {
        const template = templates.get(entry.role);
        if (template === undefined) continue;

        const existing = await tx.query.payrollSchemes.findFirst({
          where: and(
            eq(payrollSchemes.userId, entry.userId),
            eq(payrollSchemes.role, entry.role),
            eq(payrollSchemes.isActive, true),
          ),
        });
        if (existing !== undefined) continue;

        await tx.insert(payrollSchemes).values({
          userId: entry.userId,
          role: template.role,
          type: template.type,
          baseAmount: template.baseAmount ?? null,
          rate: template.rate ?? null,
          kpiTarget: template.kpiTarget ?? null,
          commissionPercent: template.commissionPercent ?? null,
          effectiveFrom,
          createdBy: ceoId,
        });
        createdSchemes += 1;
      }
      log(
        `Условия оплаты: создано ${createdSchemes.toString()} из ${staffRoles.length.toString()} пар «сотрудник + роль»`,
      );
    });

    log('Сидирование завершено.');
  } finally {
    await closeDatabase(client);
  }
}

seed().catch((error: unknown) => {
  process.stderr.write(`Сидирование прервано: ${String(error)}\n`);
  process.exitCode = 1;
});

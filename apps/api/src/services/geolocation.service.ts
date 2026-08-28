import { branches, userBranches, type DbExecutor } from '@curtain-crm/db';
import {
  findBranchInRadius,
  findNearestBranch,
  formatDistance,
  isValidGeoPoint,
  type GeoBranch,
  type GeoPoint,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

/**
 * Привязка сотрудника к филиалу по геолокации.
 *
 * Отличия от `curtain-bot`:
 *  - список цехов берётся из БД, а не из переменных окружения;
 *  - проверяются только филиалы, к которым сотрудник реально привязан
 *    (`user_branches`), — раньше подходил любой цех компании;
 *  - радиус берётся у филиала, а не из глобальной константы;
 *  - при отказе сообщение говорит, где сотрудник и насколько промахнулся,
 *    вместо безличного «вы не на месте».
 */

export interface ResolvedCheckInBranch {
  readonly branchId: number;
  readonly branchName: string;
  readonly distanceMeters: number;
}

/** Активные филиалы, к которым привязан сотрудник. */
async function loadUserBranches(
  executor: DbExecutor,
  userId: number,
): Promise<GeoBranch[]> {
  const rows = await executor
    .select({
      id: branches.id,
      name: branches.name,
      latitude: branches.latitude,
      longitude: branches.longitude,
      radiusMeters: branches.radiusMeters,
    })
    .from(userBranches)
    .innerJoin(branches, eq(userBranches.branchId, branches.id))
    .where(and(eq(userBranches.userId, userId), eq(branches.isActive, true)));

  return rows;
}

/**
 * Определяет филиал, у которого сотрудник может открыть смену.
 *
 * @throws {TRPCError} `BAD_REQUEST` — координаты некорректны;
 *   `FORBIDDEN` — сотрудник не привязан к филиалам или находится вне радиуса.
 */
export async function resolveCheckInBranch(
  executor: DbExecutor,
  userId: number,
  position: GeoPoint,
): Promise<ResolvedCheckInBranch> {
  if (!isValidGeoPoint(position)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Координаты получены некорректно. Проверьте, включена ли геолокация',
    });
  }

  const available = await loadUserBranches(executor, userId);

  if (available.length === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Вы не привязаны ни к одному активному филиалу. Обратитесь к администратору',
    });
  }

  const matched = findBranchInRadius(position, available);

  if (matched !== null) {
    return {
      branchId: matched.branch.id,
      branchName: matched.branch.name,
      distanceMeters: matched.distanceMeters,
    };
  }

  // Внутрь радиуса не попали — объясняем насколько, это снимает половину
  // обращений в поддержку.
  const nearest = findNearestBranch(position, available);
  if (nearest === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Не удалось определить ближайший филиал',
    });
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      `Вы находитесь в ${formatDistance(nearest.distanceMeters)} от филиала «${nearest.branch.name}». ` +
      `Отметиться можно в пределах ${nearest.branch.radiusMeters.toString()} м`,
  });
}

/**
 * Расстояние до филиала для чек-аута.
 *
 * Закрытие смены НЕ блокируется по расстоянию: сотрудник мог уехать на объект
 * или домой, а незакрытая смена ломает расчёт часов сильнее, чем неточная
 * геометка. Расстояние сохраняется для отчёта, но не запрещает действие.
 */
export async function measureDistanceToBranch(
  executor: DbExecutor,
  branchId: number,
  position: GeoPoint | null,
): Promise<number | null> {
  if (position === null || !isValidGeoPoint(position)) return null;

  const branch = await executor.query.branches.findFirst({
    where: eq(branches.id, branchId),
    columns: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
  });

  if (branch === undefined) return null;

  return findNearestBranch(position, [branch])?.distanceMeters ?? null;
}

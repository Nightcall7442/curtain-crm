import { users, type Database } from '@curtain-crm/db';
import { RatingScope, Role, sewerCategoryFor, type SewerCategory } from '@curtain-crm/shared';
import { and, eq, isNotNull } from 'drizzle-orm';

import { employeeRating, ratingPeriodBounds, type RatedEmployee } from './rating.service';
import type { Period } from './shifts.service';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface SewerCategoryRow {
  readonly userId: number;
  readonly fullName: string;
  readonly category: SewerCategory;
  /** Поставлена руками: расчёт её не меняет, пока руководство не вернёт «авто». */
  readonly isManual: boolean;
  /** Балл рейтинга за расчётный период — с дисциплиной. */
  readonly score: number;
  /** Лучший балл среди швей за тот же период — знаменатель категории. */
  readonly best: number;
  /** За какой месяц считано. */
  readonly period: Period;
}

/**
 * Категории швей — из рейтинга за прошлый месяц.
 *
 * Прошлый, а не текущий: в первых числах текущего балла ещё нет ни у кого,
 * и все были бы третьей. Прошлого месяца тоже может не быть — система
 * только запущена; тогда берётся текущий, чтобы категории появились с
 * первого закрытого заказа, а не через месяц.
 */
export async function sewerCategories(
  db: Database,
  employees: readonly RatedEmployee[],
  /** Месяц, для которого нужна категория; по умолчанию — текущий по Ташкенту. */
  forPeriod?: Period,
): Promise<SewerCategoryRow[]> {
  const sewers = employees.filter((employee) => employee.roles.includes(Role.SEWER));
  if (sewers.length === 0) return [];

  const local = new Date(Date.now() + TASHKENT_OFFSET_MS);
  const current: Period = forPeriod ?? { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 };
  const bounds = ratingPeriodBounds(RatingScope.MONTH, current);

  let period: Period = current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 };
  let entries = await employeeRating(db, sewers, bounds.previous);
  if (entries.every((entry) => (entry.score ?? 0) <= 0)) {
    period = current;
    entries = await employeeRating(db, sewers, bounds.current);
  }

  const best = entries.reduce((max, entry) => Math.max(max, entry.score ?? 0), 0);

  /*
    Ручная категория выше расчётной: система знает закрытые заказы и
    опоздания, но не знает, что швею перевели вчера. Пока она стоит,
    пересчёт её не трогает; «авто» возвращает расчёт.
  */
  const manual = new Map(
    (
      await db
        .select({ id: users.id, category: users.sewerCategory })
        .from(users)
        .where(and(eq(users.isActive, true), isNotNull(users.sewerCategory)))
    ).map((row) => [row.id, row.category]),
  );

  return entries.map((entry) => {
    const own = manual.get(entry.userId) ?? null;
    return {
      userId: entry.userId,
      fullName: entry.fullName,
      category: own === null ? sewerCategoryFor(entry.score ?? 0, best) : (own as SewerCategory),
      isManual: own !== null,
      score: entry.score ?? 0,
      best,
      period,
    };
  });
}

import type { Database } from '@curtain-crm/db';
import { RatingScope, Role, sewerCategoryFor, type SewerCategory } from '@curtain-crm/shared';

import { employeeRating, ratingPeriodBounds, type RatedEmployee } from './rating.service';
import type { Period } from './shifts.service';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface SewerCategoryRow {
  readonly userId: number;
  readonly fullName: string;
  readonly category: SewerCategory;
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
export async function sewerCategories(db: Database, employees: readonly RatedEmployee[]): Promise<SewerCategoryRow[]> {
  const sewers = employees.filter((employee) => employee.roles.includes(Role.SEWER));
  if (sewers.length === 0) return [];

  const local = new Date(Date.now() + TASHKENT_OFFSET_MS);
  const current: Period = { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 };
  const bounds = ratingPeriodBounds(RatingScope.MONTH, current);

  let period: Period = current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 };
  let entries = await employeeRating(db, sewers, bounds.previous);
  if (entries.every((entry) => (entry.score ?? 0) <= 0)) {
    period = current;
    entries = await employeeRating(db, sewers, bounds.current);
  }

  const best = entries.reduce((max, entry) => Math.max(max, entry.score ?? 0), 0);

  return entries.map((entry) => ({
    userId: entry.userId,
    fullName: entry.fullName,
    category: sewerCategoryFor(entry.score ?? 0, best),
    score: entry.score ?? 0,
    best,
    period,
  }));
}

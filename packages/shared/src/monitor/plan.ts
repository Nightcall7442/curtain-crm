import type { PlanPace, PlanRole, PlanSource } from '../enums/monitor.enum';
import { isDayOffOn } from './dayOff';

/**
 * План месяца.
 *
 * Строка `work_plans` действует с первого числа своего месяца и до следующей
 * строки того же адресата. `userId = null` — норма роли, иначе личный план;
 * личный план с `target = null` — возврат к норме с этого месяца. История не
 * переписывается: прошлые месяцы считаются по тем строкам, что действовали.
 */
export interface WorkPlanRow {
  readonly role: PlanRole;
  readonly userId: number | null;
  /** `YYYY-MM-01`. */
  readonly effectiveFrom: string;
  readonly target: number | null;
}

export interface ResolvedPlan {
  readonly target: number;
  readonly source: PlanSource;
  readonly effectiveFrom: string;
}

/** `'2026-10'` → `'2026-10-01'`. */
export function monthStartIso(month: string): string {
  return `${month}-01`;
}

/** Последняя строка, начавшая действовать не позже начала месяца. */
function latestEffective(rows: readonly WorkPlanRow[], since: string): WorkPlanRow | null {
  let latest: WorkPlanRow | null = null;
  for (const row of rows) {
    if (row.effectiveFrom > since) continue;
    if (latest === null || row.effectiveFrom > latest.effectiveFrom) latest = row;
  }
  return latest;
}

/** Действующий план человека по роли за месяц `YYYY-MM`: личный, иначе норма роли. */
export function resolvePlan(
  rows: readonly WorkPlanRow[],
  userId: number,
  role: PlanRole,
  month: string,
): ResolvedPlan | null {
  const since = monthStartIso(month);
  const ofRole = rows.filter((row) => row.role === role);

  const personal = latestEffective(
    ofRole.filter((row) => row.userId === userId),
    since,
  );
  if (personal !== null && personal.target !== null) {
    return { target: personal.target, source: 'personal', effectiveFrom: personal.effectiveFrom };
  }

  const norm = latestEffective(
    ofRole.filter((row) => row.userId === null),
    since,
  );
  if (norm === null || norm.target === null) return null;
  return { target: norm.target, source: 'role', effectiveFrom: norm.effectiveFrom };
}

/**
 * Рабочие дни месяца `YYYY-MM` — все, кроме постоянного выходного человека.
 * `elapsed` — сколько их прошло по `todayIso` включительно: месяц в прошлом
 * прошёл целиком, будущий ещё не начался.
 */
export function workdaysInMonth(
  month: string,
  weeklyDayOff: number | null,
  todayIso: string,
): { elapsed: number; total: number } {
  const [year, monthNumber] = month.split('-').map((part) => Number.parseInt(part, 10));
  if (year === undefined || monthNumber === undefined) return { elapsed: 0, total: 0 };
  // Нулевой день следующего месяца — последний день этого.
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  let elapsed = 0;
  let total = 0;
  for (let day = 1; day <= days; day += 1) {
    const dayIso = `${month}-${day.toString().padStart(2, '0')}`;
    if (isDayOffOn(dayIso, weeklyDayOff, [])) continue;
    total += 1;
    if (dayIso <= todayIso) elapsed += 1;
  }
  return { elapsed, total };
}

/** Насколько можно отстать от доли прошедших дней и всё ещё идти «в графике». */
const ON_TRACK_TOLERANCE_POINTS = 10;

/**
 * Темп: `ahead` — доля плана не меньше доли прошедших рабочих дней,
 * `on_track` — ниже не больше чем на 10 п.п., иначе `behind`.
 */
export function planPace(params: {
  readonly done: number;
  readonly target: number;
  readonly elapsed: number;
  readonly total: number;
}): PlanPace {
  const { done, target, elapsed, total } = params;
  const donePercent = target > 0 ? (done / target) * 100 : 100;
  const expectedPercent = total > 0 ? (elapsed / total) * 100 : 0;
  if (donePercent >= expectedPercent) return 'ahead';
  if (donePercent >= expectedPercent - ON_TRACK_TOLERANCE_POINTS) return 'on_track';
  return 'behind';
}

/** Выполнение плана, целые проценты. */
export function planPercent(done: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((done / target) * 100);
}

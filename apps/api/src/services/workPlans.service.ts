import { userRoles, users, workPlans, type Database, type DbExecutor } from '@curtain-crm/db';
import {
  isPlanRole,
  monthStartIso,
  PLAN_ROLES,
  PLAN_UNIT,
  planPercent,
  resolvePlan,
  type PlanRole,
  type ResolvedPlan,
  type WorkPlanRow,
} from '@curtain-crm/shared';
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { loadOutput } from './monitor.queries';
import { workshopMonthBounds } from './periods';

/**
 * Планы на месяц: норма роли и личные поправки.
 *
 * Таблица маленькая — строка на роль или человека в месяц, когда план
 * меняли, — поэтому грузится целиком по ролям, а действующий план считает
 * `resolvePlan`, а не SQL: одно правило для табло, «Рабочих» и этой страницы.
 */

export async function loadWorkPlans(db: DbExecutor, roles: readonly PlanRole[]): Promise<WorkPlanRow[]> {
  if (roles.length === 0) return [];
  const rows = await db
    .select({
      role: workPlans.role,
      userId: workPlans.userId,
      effectiveFrom: workPlans.effectiveFrom,
      target: workPlans.target,
    })
    .from(workPlans)
    .where(inArray(workPlans.role, [...roles]));
  // Check-ограничение не пускает в таблицу другие роли; фильтр — для типа.
  return rows.flatMap((row) => (isPlanRole(row.role) ? [{ ...row, role: row.role }] : []));
}

export interface PlanSetting {
  readonly target: number | null;
  readonly effectiveFrom: string;
}

export interface PlansPerson {
  readonly userId: number;
  readonly fullName: string;
  /** Действующий план за месяц; `null` — ни личного, ни нормы. */
  readonly plan: ResolvedPlan | null;
  /** Последняя личная строка на месяц: `target = null` — «вернулся к норме». */
  readonly personal: PlanSetting | null;
  readonly done: number;
  readonly percent: number | null;
}

export interface PlansRole {
  readonly role: PlanRole;
  readonly unit: 'pieces' | 'orders';
  readonly norm: { readonly target: number; readonly effectiveFrom: string } | null;
  readonly people: readonly PlansPerson[];
}

export interface PlansOverview {
  readonly month: string;
  readonly roles: readonly PlansRole[];
}

/** Последняя строка адресата, начавшая действовать не позже `since`. */
function latestRow(
  rows: readonly WorkPlanRow[],
  role: PlanRole,
  userId: number | null,
  since: string,
): WorkPlanRow | null {
  let latest: WorkPlanRow | null = null;
  for (const row of rows) {
    if (row.role !== role || row.userId !== userId || row.effectiveFrom > since) continue;
    if (latest === null || row.effectiveFrom > latest.effectiveFrom) latest = row;
  }
  return latest;
}

/**
 * Выработка за месяц `YYYY-MM` по ролям плана — тем же запросом, что у табло
 * (`loadOutput`): месяц подставляется в его окно «прошлого месяца»,
 * `[start, end)`. Отдельный SQL дал бы второе определение «сделано».
 * Человеку с двумя ролями выработка складывается, как на табло.
 */
export async function loadMonthOutput(
  db: Database,
  people: readonly { readonly id: number; readonly roles: readonly PlanRole[] }[],
  month: string,
): Promise<Map<number, number>> {
  if (people.length === 0) return new Map();
  const { start, end } = workshopMonthBounds(month);
  const output = await loadOutput(
    db,
    people,
    { today: end, week: end, month: end, prevMonth: start, prevMonthToDate: end },
    null,
  );
  return new Map([...output].map(([userId, row]) => [userId, row.prevMonth]));
}

/** Страница «Планы»: по каждой роли — норма и люди с планом и выработкой месяца. */
export async function listPlans(db: Database, month: string): Promise<PlansOverview> {
  const [rows, people] = await Promise.all([
    loadWorkPlans(db, PLAN_ROLES),
    db
      .select({ id: users.id, fullName: users.fullName, role: userRoles.role })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(users.isActive, true), inArray(userRoles.role, [...PLAN_ROLES])))
      .orderBy(asc(users.fullName), asc(users.id)),
  ]);
  const since = monthStartIso(month);

  const roles = await Promise.all(
    PLAN_ROLES.map(async (role): Promise<PlansRole> => {
      const ofRole = people.filter((person) => person.role === role);
      const output = await loadMonthOutput(
        db,
        ofRole.map((person) => ({ id: person.id, roles: [role] })),
        month,
      );
      const norm = latestRow(rows, role, null, since);
      return {
        role,
        unit: PLAN_UNIT[role],
        norm: norm?.target == null ? null : { target: norm.target, effectiveFrom: norm.effectiveFrom },
        people: ofRole.map((person) => {
          const plan = resolvePlan(rows, person.id, role, month);
          const personal = latestRow(rows, role, person.id, since);
          const done = output.get(person.id) ?? 0;
          return {
            userId: person.id,
            fullName: person.fullName,
            plan,
            personal: personal === null ? null : { target: personal.target, effectiveFrom: personal.effectiveFrom },
            done,
            percent: plan === null ? null : planPercent(done, plan.target),
          };
        }),
      };
    }),
  );
  return { month, roles };
}

/**
 * Записать план адресата с месяца `month`: повторная запись в тот же месяц
 * обновляет строку. Возвращает план, действовавший до правки, — для журнала.
 */
export async function setWorkPlan(
  tx: DbExecutor,
  input: {
    readonly role: PlanRole;
    readonly userId: number | null;
    readonly month: string;
    readonly target: number | null;
    readonly actorId: number;
  },
): Promise<{ readonly from: number | null; readonly to: number | null }> {
  const effectiveFrom = monthStartIso(input.month);
  const [before] = await tx
    .select({ target: workPlans.target })
    .from(workPlans)
    .where(
      and(
        eq(workPlans.role, input.role),
        input.userId === null ? isNull(workPlans.userId) : eq(workPlans.userId, input.userId),
        lte(workPlans.effectiveFrom, effectiveFrom),
      ),
    )
    .orderBy(desc(workPlans.effectiveFrom))
    .limit(1);

  await tx
    .insert(workPlans)
    .values({
      role: input.role,
      userId: input.userId,
      effectiveFrom,
      target: input.target,
      createdBy: input.actorId,
    })
    .onConflictDoUpdate({
      target: [workPlans.role, workPlans.userId, workPlans.effectiveFrom],
      set: { target: input.target, createdBy: input.actorId, createdAt: new Date() },
    });

  return { from: before?.target ?? null, to: input.target };
}

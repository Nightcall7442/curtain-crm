import { payrollSchemes, type DbExecutor } from '@curtain-crm/db';
import type { Role } from '@curtain-crm/shared';
import { and, eq, lte } from 'drizzle-orm';

/**
 * График смены на день — из условий оплаты, какими они были в этот день.
 *
 * Отдельно от `lateness.service`: это вопрос о схемах оплаты, а не о
 * баллах, и его правило (какая схема действовала в день) должно быть одно
 * для отметки, для любого пересчёта задним числом и для закрытия забытой
 * смены (`reminders.service`).
 */

/** Схема оплаты сотрудника — то, что нужно, чтобы найти график на день. */
export interface ScheduleSchemeRow {
  readonly id: number;
  readonly role: Role;
  readonly shiftStart: string | null;
  readonly shiftEnd: string | null;
}

/** Какой край графика нужен: начало смены (опоздание) или конец (закрытие забытой смены). */
type ScheduleEdge = 'shiftStart' | 'shiftEnd';

/**
 * Край графика среди схем, действовавших в день; нет его — `null`.
 *
 * Вход — схемы сотрудника, которые к этому дню уже вступили в силу
 * (`effective_from` не позже дня), действующие и прежние. Схемы не
 * правятся на месте: `payroll.schemes.upsert` гасит действующую схему
 * пары «сотрудник + роль» и заводит новую со своей датой начала. Значит, в
 * роли в этот день действовала схема, заведённая ПОСЛЕДНЕЙ из уже
 * вступивших (наибольший id). Не «с самой поздней датой начала»: схему на
 * 15-е, исправленную схемой с 1-го, руководитель погасил, и с 15-го
 * действует исправление, а не она.
 *
 * Роли — по отдельности: у сотрудника с двумя ролями две линии схем, и
 * новая схема в роли без графика не отменяет график другой роли. Графиком
 * дня считается самый свежий среди действовавших схем, у которых он есть.
 * Время проверяется ПОСЛЕ выбора схемы, а не фильтром до него: иначе
 * замена почасовой схемы на оклад без графика воскрешала бы график старой.
 *
 * Начало и конец выбираются одним правилом: разойдись они, забытая смена
 * закрывалась бы по графику одной схемы, а опоздание считалось бы по другой.
 */
function edgeInForce(schemes: readonly ScheduleSchemeRow[], edge: ScheduleEdge): string | null {
  const settledRoles = new Set<Role>();
  for (const scheme of [...schemes].sort((a, b) => b.id - a.id)) {
    if (settledRoles.has(scheme.role)) continue;
    settledRoles.add(scheme.role);
    const time = scheme[edge];
    if (time !== null) return time;
  }
  return null;
}

/** Начало смены по графику среди схем, действовавших в день (`edgeInForce`); нет графика — `null`. */
export function shiftStartInForce(schemes: readonly ScheduleSchemeRow[]): string | null {
  return edgeInForce(schemes, 'shiftStart');
}

/** Конец смены по графику среди схем, действовавших в день (`edgeInForce`); нет графика — `null`. */
export function shiftEndInForce(schemes: readonly ScheduleSchemeRow[]): string | null {
  return edgeInForce(schemes, 'shiftEnd');
}

/** Схемы сотрудника, уже вступившие в силу к дню `YYYY-MM-DD`, — действующие и прежние. */
async function schemesInForceOn(executor: DbExecutor, userId: number, day: string): Promise<ScheduleSchemeRow[]> {
  return executor
    .select({
      id: payrollSchemes.id,
      role: payrollSchemes.role,
      shiftStart: payrollSchemes.shiftStart,
      shiftEnd: payrollSchemes.shiftEnd,
    })
    .from(payrollSchemes)
    .where(and(eq(payrollSchemes.userId, userId), lte(payrollSchemes.effectiveFrom, day)));
}

/**
 * Начало смены по графику, действовавшему в этот день (`shiftStartInForce`).
 *
 * Не нынешнего: раньше бралась активная схема, и после смены графика
 * пересчёт переписывал прошлый день по новому — отметка в 09:10 при смене с
 * 09:00 (10 мин, −0,5), график сменили на 08:00, и выходило «опоздание
 * 70 мин», −2. А одобрение за прошлый день после переноса графика позже
 * снимало опоздание, которое по графику того дня было.
 *
 * Общее для отметки и пересчёта: если бы пересчёт брал график иначе, чем
 * отметка, одобрение могло бы «найти» смену там, где отметка её не видела,
 * и наоборот. Для отметки «день» — сегодня, и в обычном случае это и есть
 * действующая схема; схема, назначенная с будущей даты, начинает считать
 * опоздания с этой даты. Нет графика — опоздание не считается вовсе.
 */
export async function scheduledShiftStartOn(executor: DbExecutor, userId: number, day: string): Promise<string | null> {
  return shiftStartInForce(await schemesInForceOn(executor, userId, day));
}

/**
 * Конец смены по графику, действовавшему в этот день (`shiftEndInForce`).
 *
 * Двойник `scheduledShiftStartOn` для закрытия забытой смены: смена за
 * прошлую неделю закрывается по графику той недели. Раньше брался конец
 * действующей схемы — и смена, забытая до смены графика (или в роли, чью
 * схему погасили), закрывалась по чужому графику.
 */
export async function scheduledShiftEndOn(executor: DbExecutor, userId: number, day: string): Promise<string | null> {
  return shiftEndInForce(await schemesInForceOn(executor, userId, day));
}

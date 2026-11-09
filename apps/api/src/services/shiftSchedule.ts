import { payrollSchemes, type DbExecutor } from '@curtain-crm/db';
import { and, eq, lte } from 'drizzle-orm';

/**
 * График смены на день — из условий оплаты, какими они были в этот день.
 *
 * Отдельно от `lateness.service`: это вопрос о схемах оплаты, а не о
 * баллах, и его правило (какая схема действовала в день) должно быть одно
 * для отметки и для любого пересчёта задним числом.
 */

/** Схема оплаты сотрудника — то, что нужно, чтобы найти график на день. */
export interface ScheduleSchemeRow {
  readonly id: number;
  readonly role: string;
  readonly shiftStart: string | null;
}

/**
 * Начало смены по графику среди схем, действовавших в день; нет графика — `null`.
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
 * Начало смены проверяется ПОСЛЕ выбора схемы, а не фильтром до него:
 * иначе замена почасовой схемы на оклад без графика воскрешала бы график
 * старой схемы.
 */
export function shiftStartInForce(schemes: readonly ScheduleSchemeRow[]): string | null {
  const settledRoles = new Set<string>();
  for (const scheme of [...schemes].sort((a, b) => b.id - a.id)) {
    if (settledRoles.has(scheme.role)) continue;
    settledRoles.add(scheme.role);
    if (scheme.shiftStart !== null) return scheme.shiftStart;
  }
  return null;
}

/**
 * Начало смены по графику, действовавшему в этот день (`shiftStartInForce`).
 *
 * Не нынешнего: раньше бралась активная схема, и после смены графика
 * снятие согласования переписывало прошлый день по новому — отметка в
 * 09:10 при смене с 09:00 (10 мин, −0,5), график сменили на 08:00, и после
 * одобрения и снятия стояло «опоздание 70 мин», −2. А одобрение за прошлый
 * день после переноса графика позже снимало опоздание, которое по графику
 * того дня было.
 *
 * Общее для отметки и пересчёта: если бы пересчёт брал график иначе, чем
 * отметка, одобрение могло бы «найти» смену там, где отметка её не видела,
 * и наоборот. Для отметки «день» — сегодня, и в обычном случае это и есть
 * действующая схема; схема, назначенная с будущей даты, начинает считать
 * опоздания с этой даты. Нет графика — опоздание не считается вовсе.
 */
export async function scheduledShiftStartOn(executor: DbExecutor, userId: number, day: string): Promise<string | null> {
  const schemes = await executor
    .select({ id: payrollSchemes.id, role: payrollSchemes.role, shiftStart: payrollSchemes.shiftStart })
    .from(payrollSchemes)
    .where(and(eq(payrollSchemes.userId, userId), lte(payrollSchemes.effectiveFrom, day)));
  return shiftStartInForce(schemes);
}

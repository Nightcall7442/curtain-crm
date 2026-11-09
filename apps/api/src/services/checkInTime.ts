import { auditLog, shifts, type DbExecutor } from '@curtain-crm/db';
import { workshopDayIso } from '@curtain-crm/shared';
import { and, asc, eq, exists, gte, isNotNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { workshopDayBounds } from './periods';

/**
 * Время отметки прихода — восстановление по смене и журналу её правок.
 *
 * Опоздание оценивается только по отметке: ручная правка смены его не
 * питает — ни при отметке, ни в `shifts.adjustManually`, ни при пересчёте
 * после решения по запросу. А начало смены в базе руководитель правит
 * свободно, так что «когда человек отметился» приходится восстанавливать:
 * смена хранит только нынешнее начало, журнал — каким оно было до правок.
 * Отдельно от `lateness.service`, потому что это вопрос о сменах, а не о
 * баллах.
 */

/**
 * Смена до первой ручной правки — так её пишет в журнал `shifts.adjustManually`.
 *
 * `before` — смена до правки, записанная в той же транзакции, что и сама
 * правка. Остальное в записи пересчёту не нужно, и неизвестный формат не
 * должен ронять решение по запросу: не разобралось — значит, время отметки
 * не восстановить.
 */
const shiftEditBeforeSchema = z.object({
  before: z.object({ startedAt: z.string().datetime(), userId: z.number().int() }),
});

/**
 * Время отметки по первой ручной правке смены: `before` в её журнале; иначе `null`.
 *
 * До первой правки начало смены — то, что записала отметка; значит,
 * `before.startedAt` первой правки и есть время отметки, сколько бы раз
 * смену ни двигали потом. Смена, которую правка передала от другого
 * сотрудника, — не его отметка: `null`.
 */
export function checkInStartFromFirstEdit(details: unknown, userId: number): Date | null {
  const parsed = shiftEditBeforeSchema.safeParse(details);
  if (!parsed.success || parsed.data.before.userId !== userId) return null;
  return new Date(parsed.data.before.startedAt);
}

/** Смена сотрудника — то, по чему восстанавливается отметка. */
interface CheckInShift {
  readonly id: number;
  readonly userId: number;
  readonly startedAt: Date;
  readonly startLatitude: number | null;
  /** Когда смена появилась в базе: у смены с отметки — в момент отметки. */
  readonly createdAt: Date;
}

/**
 * Когда сотрудник отметился, открывая смену, — `null`, если смена не с отметки.
 *
 * Раньше «настоящую отметку» узнавали по `is_manually_adjusted`, но его
 * ставит и правка одного только конца смены: отметка в 09:40 (−2),
 * руководитель поправил уход, одобрение «приду к 09:45» сняло запись — и
 * снятие согласования её уже не возвращало. Поэтому судим по началу:
 *  - координат начала нет — смену завёл руководитель, отметки не было;
 *  - ручных правок с `before` нет (автозакрытие пишет `shift.adjusted` без
 *    него — оно трогает только конец) — начало смены и есть отметка;
 *  - правки были — время отметки берём из `before` первой из них
 *    (`checkInStartFromFirstEdit`): правка конца его не меняет, перенос
 *    начала — тоже не теряет.
 */
async function checkInStartOf(executor: DbExecutor, shift: CheckInShift): Promise<Date | null> {
  if (shift.startLatitude === null) return null;
  const [firstEdit] = await executor
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'shift.adjusted'),
        eq(auditLog.entityType, 'shift'),
        eq(auditLog.entityId, shift.id),
        sql`jsonb_typeof(${auditLog.details} -> 'before') = 'object'`,
      ),
    )
    .orderBy(asc(auditLog.id))
    .limit(1);
  if (firstEdit === undefined) return shift.startedAt;
  return checkInStartFromFirstEdit(firstEdit.details, shift.userId);
}

/**
 * Первая отметка сотрудника за день — та, по которой отметка оценивала опоздание; иначе `null`.
 *
 * Брать первую смену дня по нынешнему началу нельзя: начало правит
 * руководитель, и проверка нашла оба провала. Отметки в 09:05 и 13:00,
 * первую смену перенесли на 18:10 — первой по началу становилась смена с
 * 13:00, и снятие согласования писало «опоздание 240 мин» вместо 5. Отметка
 * в 09:40, руководитель добавил смену 08:00–09:30 без координат — первой
 * становилась она, отметки у неё нет, и штраф пропадал совсем.
 *
 * Поэтому кандидаты — смены сотрудника с координатами начала (смены без
 * них завёл руководитель — отметки не было, их просто пропускаем), у
 * которых в этот день либо нынешнее начало, либо начало до первой правки.
 * Для каждой восстанавливается время отметки (`checkInStartOf`), остаются
 * отметки этого дня, из них берётся самая ранняя.
 *
 * И последнее — то же правило, что у самой отметки (`recordLatenessIfAny`):
 * опоздание оценивается, только если в момент отметки у сотрудника не было
 * смены, начатой в этот день раньше. Руководитель завёл утреннюю смену,
 * которую человек забыл открыть, а тот отметился после обеда — отметка
 * опоздания не писала, и снятие согласования не должно его создавать.
 * Смена, заведённая ПОСЛЕ отметки (позже по `created_at`), для отметки не
 * существовала и её не отменяет: ручная правка опоздание не питает.
 *
 * Начало до правки в журнале — строка ISO (`Date` в jsonb так и
 * сериализуется), поэтому отбор в SQL — сравнением строк в порядке "C":
 * формат у строк один, и порядок строк совпадает с порядком моментов.
 * Приведение к timestamptz уронило бы весь запрос на одной кривой записи;
 * сравнение строк только сужает выборку, а проверяет её `checkInStartOf` —
 * разбором схемой и днём отметки.
 */
export async function firstCheckInOnDay(executor: DbExecutor, userId: number, day: string): Promise<Date | null> {
  const { start, end } = workshopDayBounds(day);
  const startedBeforeEdit = sql`(${auditLog.details} -> 'before' ->> 'startedAt') collate "C"`;
  const candidates = await executor
    .select({
      id: shifts.id,
      userId: shifts.userId,
      startedAt: shifts.startedAt,
      startLatitude: shifts.startLatitude,
      createdAt: shifts.createdAt,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        isNotNull(shifts.startLatitude),
        or(
          and(gte(shifts.startedAt, start), lt(shifts.startedAt, end)),
          exists(
            executor
              .select({ id: auditLog.id })
              .from(auditLog)
              .where(
                and(
                  eq(auditLog.action, 'shift.adjusted'),
                  eq(auditLog.entityType, 'shift'),
                  eq(auditLog.entityId, shifts.id),
                  sql`${startedBeforeEdit} >= ${start.toISOString()}`,
                  sql`${startedBeforeEdit} < ${end.toISOString()}`,
                ),
              ),
          ),
        ),
      ),
    );

  let first: { readonly at: Date; readonly createdAt: Date } | null = null;
  for (const shift of candidates) {
    const checkIn = await checkInStartOf(executor, shift);
    if (checkIn === null || workshopDayIso(checkIn) !== day) continue;
    if (first === null || checkIn < first.at) first = { at: checkIn, createdAt: shift.createdAt };
  }
  if (first === null) return null;

  // Была ли в момент отметки смена, начатая в этот день раньше неё (см. выше).
  const [earlierAtCheckIn] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        lt(shifts.createdAt, first.createdAt),
        gte(shifts.startedAt, start),
        lt(shifts.startedAt, first.at),
      ),
    )
    .limit(1);
  return earlierAtCheckIn === undefined ? first.at : null;
}

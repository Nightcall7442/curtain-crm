import { disciplineEvents, lateRequests, payrollSchemes, shifts, type DbExecutor } from '@curtain-crm/db';
import {
  clockMinutes,
  DISCIPLINE_KIND_LABELS_RU,
  disciplinePoints,
  DisciplineKind,
  DayOffStatus,
  effectiveShiftStart,
  isDisciplineViolation,
  workshopClockTime,
  workshopDayIso,
  type DisciplineKind as DisciplineKindName,
  type Locale,
} from '@curtain-crm/shared';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { recordAudit } from './audit.service';
import { notifyDisciplineRecorded } from './notifications.service';
import { workshopDayBounds } from './periods';

/**
 * Пояснение к опозданию: «Смена с 09:00, отметка в 11:52 — опоздание 172 мин».
 *
 * В базу пишется по-русски — как и всё, что руководитель вводит в
 * дисциплину руками: язык читателя сервер в момент отметки не знает. На
 * узбекский пояснение переводится при показе (`localizeLatenessDescription`),
 * и обе фразы живут здесь, рядом, — иначе разбор сохранённой строки
 * разошёлся бы с её сборкой при первой же правке текста.
 */
export function latenessDescription(
  shiftStart: string,
  actual: string,
  lateMinutes: number,
  locale: Locale = 'ru',
): string {
  const minutes = lateMinutes.toString();
  return locale === 'uz'
    ? `Smena boshlanishi ${shiftStart}, belgi ${actual} da — ${minutes} daqiqa kechikish`
    : `Смена с ${shiftStart}, отметка в ${actual} — опоздание ${minutes} мин`;
}

/** Сохранённое русское пояснение — ровно та строка, что собирает `latenessDescription`. */
const STORED_LATENESS = /^Смена с (\d{1,2}:\d{2}), отметка в (\d{1,2}:\d{2}) — опоздание (\d+) мин$/;

/**
 * Пояснение к событию дисциплины — на языке читателя.
 *
 * В узбекском интерфейсе под переведённым заголовком «30 daqiqadan ko'p
 * kechikish» стояло русское «Смена с 09:00, отметка в 11:52 — опоздание
 * 172 мин». Переводится только то, что записала сама система; текст,
 * который руководитель ввёл руками, показывается как есть.
 */
export function localizeLatenessDescription(description: string, locale: Locale): string {
  if (locale === 'ru') return description;
  const match = STORED_LATENESS.exec(description);
  if (match === null) return description;
  const [, shiftStart = '', actual = '', minutes = '0'] = match;
  return latenessDescription(shiftStart, actual, Number.parseInt(minutes, 10), locale);
}

/** Виды опоздания — из них система пишет запись сама; остальное в дисциплине — руками руководства. */
const LATE_KINDS: readonly DisciplineKindName[] = [
  DisciplineKind.LATE_UNDER_15,
  DisciplineKind.LATE_15_30,
  DisciplineKind.LATE_OVER_30,
];

/**
 * Опоздание — само, по смене из условий оплаты.
 *
 * Почасовику руководитель назначил смену «с 09:00»; отметился в 09:22 —
 * это опоздание, и его не должен вспоминать менеджер к вечеру: система
 * записывает его в дисциплину в момент отметки, по той же таблице баллов
 * (до 15 мин, 15–30, больше 30) и с тем же правилом повтора. Одно на день
 * и только по первой отметке: вторая смена после отлучки опозданием не
 * считается, даже если первая была вовремя.
 *
 * Отметился раньше или вовремя — ничего не пишем: «пришёл вовремя» и есть
 * норма, а не заслуга.
 *
 * Согласованное опоздание («12.11 приду к 10:30», `late_requests`) сдвигает
 * начало на этот день: отметка до 10:30 — вовремя, после — опоздание от
 * 10:30, и в пояснении стоит «Смена с 10:30», чтобы человек видел, от чего
 * считали. Ждущий решения или отклонённый запрос ничего не сдвигает.
 *
 * `recomputed` — запись пересчитана после решения по запросу на опоздание
 * (`recomputeLatenessForDay`), а не сделана при отметке: в группу её второй
 * раз не пишем — см. `groupFeed.service`.
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  startedAt: Date,
  ipAddress: string | null,
  options: { readonly recomputed?: boolean } = {},
): Promise<void> {
  const [scheme] = await executor
    .select({ shiftStart: payrollSchemes.shiftStart })
    .from(payrollSchemes)
    .where(and(eq(payrollSchemes.userId, userId), eq(payrollSchemes.isActive, true), sql`${payrollSchemes.shiftStart} is not null`))
    .orderBy(desc(payrollSchemes.effectiveFrom))
    .limit(1);
  const scheduledStart = scheme?.shiftStart ?? null;
  if (scheduledStart === null) return;

  // День и время — по часам мастерской: отметка в 03:00 по Ташкенту в UTC ещё вчерашняя.
  const day = workshopDayIso(startedAt);
  const actual = workshopClockTime(startedAt);

  /*
    Опоздание оценивается по первой отметке дня. Пришла в 08:55, ушла на
    обед, вернулась в 14:00 — повторная отметка не опоздание, хотя записи об
    опоздании за день нет (проверка «уже есть опоздание» ниже этого не
    ловит). Только что открытая смена начата ровно в `startedAt`, поэтому
    строгое «раньше» её саму не видит.
  */
  const { start: dayStart } = workshopDayBounds(day);
  const [earlierShift] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), gte(shifts.startedAt, dayStart), lt(shifts.startedAt, startedAt)))
    .limit(1);
  if (earlierShift !== undefined) return;

  const [approvedLate] = await executor
    .select({ arriveBy: lateRequests.arriveBy })
    .from(lateRequests)
    .where(
      and(
        eq(lateRequests.userId, userId),
        eq(lateRequests.date, day),
        eq(lateRequests.status, DayOffStatus.APPROVED),
      ),
    )
    .limit(1);
  const shiftStart = effectiveShiftStart(scheduledStart, approvedLate?.arriveBy ?? null);

  const lateBy = clockMinutes(actual) - clockMinutes(shiftStart);
  if (lateBy <= 0) return;

  const monthStart = `${day.slice(0, 7)}-01`;

  // Одно опоздание в день. Записанное руководством руками тоже считается: второе за тот же день — двойной штраф.
  const [already] = await executor
    .select({ id: disciplineEvents.id })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.occurredOn, day),
        inArray(disciplineEvents.kind, [...LATE_KINDS]),
      ),
    )
    .limit(1);
  if (already !== undefined) return;

  const kind: DisciplineKindName =
    lateBy <= 15 ? DisciplineKind.LATE_UNDER_15 : lateBy <= 30 ? DisciplineKind.LATE_15_30 : DisciplineKind.LATE_OVER_30;

  /*
    Повтор — такое же нарушение РАНЬШЕ в этом месяце, а не где угодно в нём.
    При отметке разницы нет: позже сегодняшнего дня записей ещё не бывает.
    А пересчёт идёт и задним числом (руководитель согласовал опоздание за
    вчера), и опоздание за 10-е, записанное 5-го, тогда не повтор — даже если
    12-го человек опоздал ещё раз.
  */
  const [prior] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.kind, kind),
        gte(disciplineEvents.occurredOn, monthStart),
        lt(disciplineEvents.occurredOn, day),
      ),
    );
  const isRepeat = isDisciplineViolation(kind) && (prior?.count ?? 0) > 0;
  const points = disciplinePoints(kind, isRepeat);

  const [created] = await executor
    .insert(disciplineEvents)
    .values({
      userId,
      kind,
      points: points.toFixed(1),
      isRepeat,
      occurredOn: day,
      description: latenessDescription(shiftStart, actual, lateBy),
      recordedBy: userId,
    })
    .returning({ id: disciplineEvents.id });

  await recordAudit(executor, {
    actorId: userId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created?.id ?? null,
    details: {
      auto: true,
      kind,
      points,
      isRepeat,
      lateBy,
      shiftStart,
      ...(approvedLate === undefined ? {} : { approvedArriveBy: approvedLate.arriveBy }),
      ...(options.recomputed === true ? { recomputed: true } : {}),
      label: DISCIPLINE_KIND_LABELS_RU[kind],
    },
    ipAddress,
  });
  await notifyDisciplineRecorded(executor, userId, { kind, points, occurredOn: day, recordedByName: 'Система' });
}

/**
 * Пересчитать опоздание за день после решения по запросу на опоздание.
 *
 * Опоздание пишется при отметке, а руководитель нередко согласует «приду к
 * 10:30» уже после неё — в том числе задним числом, чтобы простить
 * опоздание. Без пересчёта одобрение ничего бы не меняло: запись «опоздание
 * 90 мин» так и осталась бы. То же при снятии согласования — опоздание
 * снова считается от графика.
 *
 * Убираются только записи, сделанные системой (`recorded_by` — сам
 * сотрудник, так пишет `recordLatenessIfAny`); опоздание, записанное
 * руководителем руками, — его решение, и пересчёт его не трогает. Удаление
 * — в журнал (`discipline.removed`, как ручное удаление; в группу оно не
 * идёт), затем опоздание оценивается заново по первой смене дня и текущему
 * согласованию. Смен в этот день нет — опаздывать было не к чему.
 *
 * Повторы в последующих днях месяца не пересчитываются: признак повтора
 * фиксируется в момент записи, как и при ручном удалении записи.
 */
export async function recomputeLatenessForDay(
  executor: DbExecutor,
  input: {
    readonly userId: number;
    readonly day: string;
    /** Кто решил запрос: удаление старой записи в журнале — на нём. */
    readonly actorId: number;
    readonly ipAddress: string | null;
  },
): Promise<void> {
  const { start, end } = workshopDayBounds(input.day);
  const [firstShift] = await executor
    .select({ startedAt: shifts.startedAt })
    .from(shifts)
    .where(and(eq(shifts.userId, input.userId), gte(shifts.startedAt, start), lt(shifts.startedAt, end)))
    .orderBy(asc(shifts.startedAt))
    .limit(1);
  if (firstShift === undefined) return;

  const removed = await executor
    .delete(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, input.userId),
        eq(disciplineEvents.occurredOn, input.day),
        inArray(disciplineEvents.kind, [...LATE_KINDS]),
        eq(disciplineEvents.recordedBy, input.userId),
      ),
    )
    .returning();

  for (const event of removed) {
    await recordAudit(executor, {
      actorId: input.actorId,
      action: 'discipline.removed',
      entityType: 'discipline_event',
      entityId: event.id,
      details: {
        userId: event.userId,
        kind: event.kind,
        points: event.points,
        occurredOn: event.occurredOn,
        auto: true,
        reason: 'late_request_review',
      },
      ipAddress: input.ipAddress,
    });
  }

  await recordLatenessIfAny(executor, input.userId, firstShift.startedAt, input.ipAddress, { recomputed: true });
}

import { disciplineEvents, lateRequests, payrollSchemes, type DbExecutor } from '@curtain-crm/db';
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
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { recordAudit } from './audit.service';
import { notifyDisciplineRecorded } from './notifications.service';

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

/**
 * Опоздание — само, по смене из условий оплаты.
 *
 * Почасовику руководитель назначил смену «с 09:00»; отметился в 09:22 —
 * это опоздание, и его не должен вспоминать менеджер к вечеру: система
 * записывает его в дисциплину в момент отметки, по той же таблице баллов
 * (до 15 мин, 15–30, больше 30) и с тем же правилом повтора. Одно на день:
 * вторая отметка после отлучки опозданием не считается.
 *
 * Отметился раньше или вовремя — ничего не пишем: «пришёл вовремя» и есть
 * норма, а не заслуга.
 *
 * Согласованное опоздание («12.11 приду к 10:30», `late_requests`) сдвигает
 * начало на этот день: отметка до 10:30 — вовремя, после — опоздание от
 * 10:30, и в пояснении стоит «Смена с 10:30», чтобы человек видел, от чего
 * считали. Ждущий решения или отклонённый запрос ничего не сдвигает.
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  startedAt: Date,
  ipAddress: string | null,
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
  const [year = 0, month = 1] = day.split('-').map((part) => Number.parseInt(part, 10));
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  // Одно опоздание в день — повторная отметка после отлучки не считается.
  const [already] = await executor
    .select({ id: disciplineEvents.id })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.occurredOn, day),
        sql`${disciplineEvents.kind} in ('late_under_15', 'late_15_30', 'late_over_30')`,
      ),
    )
    .limit(1);
  if (already !== undefined) return;

  const kind: DisciplineKindName =
    lateBy <= 15 ? DisciplineKind.LATE_UNDER_15 : lateBy <= 30 ? DisciplineKind.LATE_15_30 : DisciplineKind.LATE_OVER_30;

  const [prior] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.kind, kind),
        gte(disciplineEvents.occurredOn, monthStart),
        lt(disciplineEvents.occurredOn, nextMonth),
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
      label: DISCIPLINE_KIND_LABELS_RU[kind],
    },
    ipAddress,
  });
  await notifyDisciplineRecorded(executor, userId, { kind, points, occurredOn: day, recordedByName: 'Система' });
}

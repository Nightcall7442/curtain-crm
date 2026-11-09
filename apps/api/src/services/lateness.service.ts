import {
  auditLog,
  disciplineEvents,
  lateRequests,
  payrollSchemes,
  shifts,
  type DbExecutor,
  type DisciplineEvent,
} from '@curtain-crm/db';
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
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';

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

/**
 * Минуты опоздания из пояснения, записанного системой; чужой текст — `null`.
 *
 * Сколько минут было до пересчёта, в записи хранит только пояснение: балл
 * и вид — ступени, а не минуты. Разбор — тем же шаблоном, что и перевод,
 * чтобы сборка и чтение строки не разошлись.
 */
export function storedLateMinutes(description: string | null): number | null {
  if (description === null) return null;
  const minutes = STORED_LATENESS.exec(description)?.[3];
  return minutes === undefined ? null : Number.parseInt(minutes, 10);
}

/** Виды опоздания — из них система пишет запись сама; остальное в дисциплине — руками руководства. */
const LATE_KINDS: readonly DisciplineKindName[] = [
  DisciplineKind.LATE_UNDER_15,
  DisciplineKind.LATE_15_30,
  DisciplineKind.LATE_OVER_30,
];

/**
 * Вид опоздания по минутам: до 15, 15–30, больше 30.
 *
 * Одна функция и для отметки, и для пересчёта после решения по запросу:
 * две копии порогов разошлись бы, и одно и то же опоздание при отметке и
 * после пересмотра попадало бы в разные ступени.
 */
export function latenessKind(lateBy: number): DisciplineKindName {
  if (lateBy <= 15) return DisciplineKind.LATE_UNDER_15;
  return lateBy <= 30 ? DisciplineKind.LATE_15_30 : DisciplineKind.LATE_OVER_30;
}

/** Причина в журнале для всего, что система меняет в опоздании после решения по запросу. */
const REVIEW_REASON = 'late_request_review';

/**
 * Начало смены по графику — из активной схемы оплаты.
 *
 * Общее для отметки и пересчёта: если бы пересчёт брал график иначе, чем
 * отметка, одобрение могло бы «найти» смену там, где отметка её не видела,
 * и наоборот. Нет графика — опоздание не считается вовсе.
 */
async function scheduledShiftStart(executor: DbExecutor, userId: number): Promise<string | null> {
  const [scheme] = await executor
    .select({ shiftStart: payrollSchemes.shiftStart })
    .from(payrollSchemes)
    .where(and(eq(payrollSchemes.userId, userId), eq(payrollSchemes.isActive, true), sql`${payrollSchemes.shiftStart} is not null`))
    .orderBy(desc(payrollSchemes.effectiveFrom))
    .limit(1);
  return scheme?.shiftStart ?? null;
}

/** Одобренное «приду к» на день. Ждущий решения или отклонённый запрос порог не сдвигает. */
async function approvedArriveBy(executor: DbExecutor, userId: number, day: string): Promise<string | null> {
  const [approved] = await executor
    .select({ arriveBy: lateRequests.arriveBy })
    .from(lateRequests)
    .where(
      and(eq(lateRequests.userId, userId), eq(lateRequests.date, day), eq(lateRequests.status, DayOffStatus.APPROVED)),
    )
    .limit(1);
  return approved?.arriveBy ?? null;
}

/** Есть ли за день опоздание — любое, в том числе записанное руководством руками. */
async function hasLatenessOnDay(executor: DbExecutor, userId: number, day: string): Promise<boolean> {
  const [already] = await executor
    .select({ id: disciplineEvents.id })
    .from(disciplineEvents)
    .where(
      and(eq(disciplineEvents.userId, userId), eq(disciplineEvents.occurredOn, day), inArray(disciplineEvents.kind, [...LATE_KINDS])),
    )
    .limit(1);
  return already !== undefined;
}

/** Календарный месяц дня `YYYY-MM-DD`: `[from, to)` — в датах, как `occurred_on`. */
function monthOf(day: string): { readonly from: string; readonly to: string } {
  const [year = 1970, month = 1] = day.split('-').map((part) => Number.parseInt(part, 10));
  return {
    from: `${day.slice(0, 7)}-01`,
    // Date.UTC сам переносит тринадцатый месяц в январь следующего года.
    to: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
  };
}

/**
 * Повтор: такое же событие РАНЬШЕ в этом месяце — по порядку (день, id).
 *
 * Не «где угодно в месяце»: пересчёт идёт и задним числом, и опоздание за
 * 05.11 не повтор оттого, что 09.11 человек опоздал ещё раз. Ручные записи
 * руководителя считаются как более ранние события наравне с системными.
 * `beforeId` — у уже существующей записи (правка на месте): событие того
 * же дня с меньшим id тоже раньше. У новой записи его нет: за день система
 * пишет одно опоздание и только если других опозданий за день нет
 * (`hasLatenessOnDay`), так что «раньше» для неё — только прошлые дни.
 */
async function hasEarlierSameKind(
  executor: DbExecutor,
  event: { readonly userId: number; readonly kind: DisciplineKindName; readonly day: string; readonly beforeId?: number },
): Promise<boolean> {
  const { from } = monthOf(event.day);
  const [prior] = await executor
    .select({ id: disciplineEvents.id })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, event.userId),
        eq(disciplineEvents.kind, event.kind),
        gte(disciplineEvents.occurredOn, from),
        event.beforeId === undefined
          ? lt(disciplineEvents.occurredOn, event.day)
          : or(
              lt(disciplineEvents.occurredOn, event.day),
              and(eq(disciplineEvents.occurredOn, event.day), lt(disciplineEvents.id, event.beforeId)),
            ),
      ),
    )
    .limit(1);
  return prior !== undefined;
}

/** Строка дисциплины для пересчёта повторов — без лишних колонок. */
export interface RepeatRow {
  readonly id: number;
  readonly userId: number;
  readonly kind: DisciplineKindName;
  readonly occurredOn: string;
  readonly isRepeat: boolean;
  readonly points: number;
  readonly recordedBy: number;
}

export interface RepeatChange {
  readonly id: number;
  readonly occurredOn: string;
  readonly from: { readonly isRepeat: boolean; readonly points: number };
  readonly to: { readonly isRepeat: boolean; readonly points: number };
}

/**
 * Повторы одного вида за месяц — заново, по порядку (день, id).
 *
 * Простили опоздание 05.11 — опоздание 09.11 того же вида больше не
 * повтор, и его балл должен стать обычным; сняли согласование — снова
 * повтор. Признак и балл хранятся в записи, поэтому без пересчёта 09.11 так
 * и висело бы строже, чем положено, и тянуло уровень и рейтинг.
 *
 * Меняются только записи системы (`recorded_by` — сам сотрудник): ручная
 * запись — решение руководителя, её балл он поставил сам. Но как более
 * раннее событие она считается. Вход — записи одного сотрудника, одного
 * вида и одного месяца; выход — только те, что разошлись.
 */
export function recountRepeats(rows: readonly RepeatRow[]): RepeatChange[] {
  const ordered = [...rows].sort((a, b) =>
    a.occurredOn === b.occurredOn ? a.id - b.id : a.occurredOn < b.occurredOn ? -1 : 1,
  );
  const changes: RepeatChange[] = [];
  let seenEarlier = false;
  for (const row of ordered) {
    if (row.recordedBy === row.userId) {
      const isRepeat = isDisciplineViolation(row.kind) && seenEarlier;
      const points = disciplinePoints(row.kind, isRepeat);
      if (isRepeat !== row.isRepeat || points !== row.points) {
        changes.push({
          id: row.id,
          occurredOn: row.occurredOn,
          from: { isRepeat: row.isRepeat, points: row.points },
          to: { isRepeat, points },
        });
      }
    }
    seenEarlier = true;
  }
  return changes;
}

/** Кто и откуда меняет опоздание при пересмотре — для журнала. */
interface ReviewActor {
  readonly actorId: number;
  readonly ipAddress: string | null;
}

/** Повторы затронутых видов за месяц дня — в базе, каждая правка в журнал. */
async function recountMonthRepeats(
  executor: DbExecutor,
  scope: { readonly userId: number; readonly day: string; readonly kinds: ReadonlySet<DisciplineKindName> },
  actor: ReviewActor,
): Promise<void> {
  const { from, to } = monthOf(scope.day);
  for (const kind of scope.kinds) {
    const rows = await executor
      .select({
        id: disciplineEvents.id,
        userId: disciplineEvents.userId,
        kind: disciplineEvents.kind,
        occurredOn: disciplineEvents.occurredOn,
        isRepeat: disciplineEvents.isRepeat,
        points: disciplineEvents.points,
        recordedBy: disciplineEvents.recordedBy,
      })
      .from(disciplineEvents)
      .where(
        and(
          eq(disciplineEvents.userId, scope.userId),
          eq(disciplineEvents.kind, kind),
          gte(disciplineEvents.occurredOn, from),
          lt(disciplineEvents.occurredOn, to),
        ),
      )
      .orderBy(asc(disciplineEvents.occurredOn), asc(disciplineEvents.id))
      .for('update');

    const changes = recountRepeats(rows.map((row) => ({ ...row, points: Number.parseFloat(row.points) })));
    for (const change of changes) {
      await executor
        .update(disciplineEvents)
        .set({ isRepeat: change.to.isRepeat, points: change.to.points.toFixed(1) })
        .where(eq(disciplineEvents.id, change.id));
      await recordAudit(executor, {
        actorId: actor.actorId,
        action: 'discipline.adjusted',
        entityType: 'discipline_event',
        entityId: change.id,
        details: {
          userId: scope.userId,
          kind,
          occurredOn: change.occurredOn,
          auto: true,
          reason: REVIEW_REASON,
          // Повтор пересчитан из-за решения по другому дню — этого.
          reviewedDay: scope.day,
          from: change.from,
          to: change.to,
        },
        ipAddress: actor.ipAddress,
      });
    }
  }
}

/** Что известно об опоздании за день: от какого времени считали и на сколько опоздал. */
interface LatenessFacts {
  readonly userId: number;
  readonly day: string;
  /** Начало с учётом одобренного «приду к» — его и пишем в пояснение. */
  readonly shiftStart: string;
  readonly actual: string;
  readonly lateBy: number;
  readonly approvedArriveBy: string | null;
}

/**
 * Записать опоздание от имени системы — один путь для отметки и пересчёта.
 *
 * Вид, повтор, балл и пояснение считаются одинаково, где бы опоздание ни
 * появилось. `recomputed` — запись сделана при пересмотре запроса, а не
 * при отметке: в группу её второй раз не пишем (см. `groupFeed.service`).
 * Сотрудник узнаёт о записи в любом случае.
 */
async function insertAutomaticLateness(
  executor: DbExecutor,
  facts: LatenessFacts,
  options: { readonly recomputed: boolean; readonly ipAddress: string | null },
): Promise<{ readonly kind: DisciplineKindName }> {
  const kind = latenessKind(facts.lateBy);
  const isRepeat =
    isDisciplineViolation(kind) && (await hasEarlierSameKind(executor, { userId: facts.userId, kind, day: facts.day }));
  const points = disciplinePoints(kind, isRepeat);

  const [created] = await executor
    .insert(disciplineEvents)
    .values({
      userId: facts.userId,
      kind,
      points: points.toFixed(1),
      isRepeat,
      occurredOn: facts.day,
      description: latenessDescription(facts.shiftStart, facts.actual, facts.lateBy),
      recordedBy: facts.userId,
    })
    .returning({ id: disciplineEvents.id });

  await recordAudit(executor, {
    actorId: facts.userId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created?.id ?? null,
    details: {
      auto: true,
      kind,
      points,
      isRepeat,
      lateBy: facts.lateBy,
      shiftStart: facts.shiftStart,
      ...(facts.approvedArriveBy === null ? {} : { approvedArriveBy: facts.approvedArriveBy }),
      ...(options.recomputed ? { recomputed: true } : {}),
      label: DISCIPLINE_KIND_LABELS_RU[kind],
    },
    ipAddress: options.ipAddress,
  });
  await notifyDisciplineRecorded(executor, facts.userId, {
    kind,
    points,
    occurredOn: facts.day,
    recordedByName: 'Система',
  });

  return { kind };
}

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
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  startedAt: Date,
  ipAddress: string | null,
): Promise<void> {
  const scheduledStart = await scheduledShiftStart(executor, userId);
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

  const arriveBy = await approvedArriveBy(executor, userId, day);
  const shiftStart = effectiveShiftStart(scheduledStart, arriveBy);
  const lateBy = clockMinutes(actual) - clockMinutes(shiftStart);
  if (lateBy <= 0) return;

  // Одно опоздание в день. Записанное руководством руками тоже считается: второе за тот же день — двойной штраф.
  if (await hasLatenessOnDay(executor, userId, day)) return;

  await insertAutomaticLateness(
    executor,
    { userId, day, shiftStart, actual, lateBy, approvedArriveBy: arriveBy },
    { recomputed: false, ipAddress },
  );
}

/**
 * Простил ли руководитель опоздание за день руками (`discipline.remove`).
 *
 * Ручное удаление пишет в журнал `discipline.removed` без `auto`; удаление
 * при пересмотре запроса — с `auto: true`, и прощением оно не считается:
 * его делает правило, а не человек.
 */
async function forgivenByHand(executor: DbExecutor, userId: number, day: string): Promise<boolean> {
  const [removal] = await executor
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'discipline.removed'),
        eq(auditLog.entityType, 'discipline_event'),
        sql`${auditLog.details}->>'userId' = ${userId.toString()}`,
        sql`${auditLog.details}->>'occurredOn' = ${day}`,
        inArray(sql`${auditLog.details}->>'kind'`, [...LATE_KINDS]),
        sql`coalesce(${auditLog.details}->'auto', 'false'::jsonb) <> 'true'::jsonb`,
      ),
    )
    .limit(1);
  return removal !== undefined;
}

/** Убрать запись системы при пересмотре — с журналом; в группу удаление не идёт. */
async function removeAutomaticLateness(
  executor: DbExecutor,
  event: DisciplineEvent,
  actor: ReviewActor,
): Promise<void> {
  await executor.delete(disciplineEvents).where(eq(disciplineEvents.id, event.id));
  await recordAudit(executor, {
    actorId: actor.actorId,
    action: 'discipline.removed',
    entityType: 'discipline_event',
    entityId: event.id,
    details: {
      userId: event.userId,
      kind: event.kind,
      points: event.points,
      occurredOn: event.occurredOn,
      // Объяснение сотрудника уходит вместе с записью — пусть останется хотя бы в журнале.
      employeeComment: event.employeeComment,
      auto: true,
      reason: REVIEW_REASON,
    },
    ipAddress: actor.ipAddress,
  });
}

/** Решение по запросу, после которого пересчитывается опоздание. */
export type LateReviewMode = 'approved' | 'withdrawn';

/**
 * Чем кончился пересчёт — роутеру, чтобы сказать сотруднику:
 *  - `none` — пересчитывать нечего (нет графика, нет смены, нет записи и
 *    создавать её не положено);
 *  - `unchanged` — запись осталась как была;
 *  - `removed` — запись снята, `minutes` — сколько было (`null`, если
 *    пояснение не системное);
 *  - `adjusted` — запись поправлена на месте: другое число минут, вид, балл;
 *  - `created` — запись появилась заново (только при снятии согласования).
 */
export type LatenessRecomputeOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'unchanged'; readonly minutes: number }
  | { readonly kind: 'removed'; readonly minutes: number | null }
  | { readonly kind: 'adjusted'; readonly fromMinutes: number | null; readonly toMinutes: number }
  | { readonly kind: 'created'; readonly minutes: number };

const NONE: LatenessRecomputeOutcome = { kind: 'none' };

/**
 * Пересчитать опоздание за день после решения по запросу на опоздание.
 *
 * Опоздание пишется при отметке, а руководитель нередко согласует «приду к
 * 10:30» уже после неё — в том числе задним числом, чтобы простить
 * опоздание. Без пересчёта одобрение ничего бы не меняло. То же при снятии
 * согласования — опоздание снова считается от графика.
 *
 * Правила — от того, что пересчёт не должен делать хуже, чем было:
 *  - графика нет или смены за день нет — ничего не трогаем: запись,
 *    сделанная раньше, остаётся (стереть штраф молча нельзя);
 *  - трогаем только записи системы (`recorded_by` — сам сотрудник);
 *    опоздание, записанное руководителем руками, — его решение;
 *  - одобрение только сдвигает порог позже и штраф НЕ создаёт никогда:
 *    смену мог завести руководитель (отметки не было, опоздание не
 *    оценивалось), или он уже простил опоздание (`discipline.remove`);
 *  - снятие согласования создаёт запись заново, только если её не простили
 *    руками и смена — настоящая отметка, а не заведённая руководством;
 *  - запись правится на месте, а не удаляется и создаётся снова: иначе
 *    пропадало бы объяснение сотрудника (`discipline.explain`);
 *  - повторы того же вида в месяце пересчитываются: простили первое
 *    опоздание — второе уже не повтор.
 *
 * Снятие и правка записи — в журнал от имени решившего (`discipline.removed`
 * / `discipline.adjusted`), в группу они не идут.
 */
export async function recomputeLatenessForDay(
  executor: DbExecutor,
  input: {
    readonly userId: number;
    readonly day: string;
    readonly mode: LateReviewMode;
    /** Кто решил запрос: правки записи в журнале — на нём. */
    readonly actorId: number;
    readonly ipAddress: string | null;
  },
): Promise<LatenessRecomputeOutcome> {
  const actor: ReviewActor = { actorId: input.actorId, ipAddress: input.ipAddress };

  const scheduledStart = await scheduledShiftStart(executor, input.userId);
  if (scheduledStart === null) return NONE;

  const { start, end } = workshopDayBounds(input.day);
  const [firstShift] = await executor
    .select({ startedAt: shifts.startedAt, isManuallyAdjusted: shifts.isManuallyAdjusted })
    .from(shifts)
    .where(and(eq(shifts.userId, input.userId), gte(shifts.startedAt, start), lt(shifts.startedAt, end)))
    .orderBy(asc(shifts.startedAt))
    .limit(1);
  if (firstShift === undefined) return NONE;

  // Под блокировкой: объяснение сотрудника или ручное удаление посреди пересчёта не потеряются.
  const existing = await executor
    .select()
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, input.userId),
        eq(disciplineEvents.occurredOn, input.day),
        inArray(disciplineEvents.kind, [...LATE_KINDS]),
        eq(disciplineEvents.recordedBy, input.userId),
      ),
    )
    .orderBy(asc(disciplineEvents.id))
    .for('update');

  const arriveBy = await approvedArriveBy(executor, input.userId, input.day);
  const shiftStart = effectiveShiftStart(scheduledStart, arriveBy);
  const actual = workshopClockTime(firstShift.startedAt);
  const lateBy = clockMinutes(actual) - clockMinutes(shiftStart);

  const [kept, ...duplicates] = existing;

  if (kept === undefined) {
    if (input.mode === 'approved' || lateBy <= 0) return NONE;
    if (firstShift.isManuallyAdjusted) return NONE;
    if (await forgivenByHand(executor, input.userId, input.day)) return NONE;
    if (await hasLatenessOnDay(executor, input.userId, input.day)) return NONE;

    const created = await insertAutomaticLateness(
      executor,
      { userId: input.userId, day: input.day, shiftStart, actual, lateBy, approvedArriveBy: arriveBy },
      { recomputed: true, ipAddress: input.ipAddress },
    );
    await recountMonthRepeats(executor, { userId: input.userId, day: input.day, kinds: new Set([created.kind]) }, actor);
    return { kind: 'created', minutes: lateBy };
  }

  // Системное опоздание за день одно; лишние — след старой ошибки, оставляем самое раннее.
  const touched = new Set<DisciplineKindName>([kept.kind]);
  for (const duplicate of duplicates) {
    await removeAutomaticLateness(executor, duplicate, actor);
    touched.add(duplicate.kind);
  }

  const fromMinutes = storedLateMinutes(kept.description);
  let outcome: LatenessRecomputeOutcome;

  if (lateBy <= 0) {
    await removeAutomaticLateness(executor, kept, actor);
    outcome = { kind: 'removed', minutes: fromMinutes };
  } else {
    const kind = latenessKind(lateBy);
    const isRepeat =
      isDisciplineViolation(kind) &&
      (await hasEarlierSameKind(executor, { userId: input.userId, kind, day: input.day, beforeId: kept.id }));
    const points = disciplinePoints(kind, isRepeat);
    const description = latenessDescription(shiftStart, actual, lateBy);
    const keptPoints = Number.parseFloat(kept.points);

    if (
      kind === kept.kind &&
      isRepeat === kept.isRepeat &&
      points === keptPoints &&
      description === kept.description
    ) {
      outcome = { kind: 'unchanged', minutes: lateBy };
    } else {
      // Объяснение сотрудника (`employee_comment`) не трогаем: оно о том же опоздании.
      await executor
        .update(disciplineEvents)
        .set({ kind, isRepeat, points: points.toFixed(1), description })
        .where(eq(disciplineEvents.id, kept.id));
      await recordAudit(executor, {
        actorId: actor.actorId,
        action: 'discipline.adjusted',
        entityType: 'discipline_event',
        entityId: kept.id,
        details: {
          userId: input.userId,
          occurredOn: input.day,
          auto: true,
          reason: REVIEW_REASON,
          shiftStart,
          ...(arriveBy === null ? {} : { approvedArriveBy: arriveBy }),
          from: { kind: kept.kind, points: keptPoints, isRepeat: kept.isRepeat, lateBy: fromMinutes },
          to: { kind, points, isRepeat, lateBy },
        },
        ipAddress: actor.ipAddress,
      });
      touched.add(kind);
      outcome = { kind: 'adjusted', fromMinutes, toMinutes: lateBy };
    }
  }

  if (outcome.kind !== 'unchanged' || duplicates.length > 0) {
    await recountMonthRepeats(executor, { userId: input.userId, day: input.day, kinds: touched }, actor);
  }
  return outcome;
}

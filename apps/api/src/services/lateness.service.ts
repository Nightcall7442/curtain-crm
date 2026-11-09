import {
  disciplineEvents,
  lateCheckIns,
  lateRequests,
  shifts,
  type DbExecutor,
  type DisciplineEvent,
  type LateCheckIn,
} from '@curtain-crm/db';
import {
  clockMinutes,
  DayOffStatus,
  DISCIPLINE_KIND_LABELS_RU,
  DisciplineAuditReason,
  evaluateMonthLateness,
  isLateDisciplineKind,
  LATE_DISCIPLINE_KINDS,
  parseStoredLateness,
  workshopClockTime,
  workshopDayIso,
  type DesiredLateness,
  type DisciplineKind,
  type LateDisciplineKind,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';

import { SYSTEM_AUTHOR_RU } from '../lib/notificationTranslations';
import { recordAudit } from './audit.service';
import { notifyDisciplineRecorded, type DisciplineRecordedNotice } from './notifications.service';
import { workshopDayBounds } from './periods';
import { scheduledShiftStartOn } from './shiftSchedule';

/**
 * Опоздания: факт при отметке → оценка месяца → записи дисциплины.
 *
 * Модель. Записи системы об опоздании (`discipline_events` вида late_*,
 * `recorded_by` — сам сотрудник, пояснение в формате системы) не правятся
 * по цепочке решений — они ПРОЕКЦИЯ состояния:
 *  - факты: первая настоящая отметка дня позже графика (`late_check_ins`),
 *    пишутся один раз и не меняются;
 *  - решения руководства: одобренные запросы на опоздание, ручные записи
 *    опозданий, прощение (отметка в факте).
 * Чистая функция `evaluateMonthLateness` по состоянию месяца говорит, какой
 * должна быть запись за каждый день; `syncMonthLateness` сверяет с этим
 * базу и правит только расхождения. Любое изменение состояния — отметка,
 * решение по запросу, ручная правка дисциплины — заканчивается сверкой
 * месяца под замком сотрудника.
 *
 * Гарантии (тесты — в `@curtain-crm/shared` и здесь, сценарии — в смоуке):
 *  - записи месяца — функция состояния: порядок решений не важен;
 *  - снятие согласования возвращает ровно то, что было бы без одобрения;
 *  - одобрение не делает строже ни один день и не создаёт записей;
 *  - ручные записи руководителя не трогаются; ручная правка и удаление
 *    смены, смена графика задним числом фактов не меняют;
 *  - объяснение сотрудника остаётся при правке записи на месте, а при
 *    снятии и возврате записи возвращается вместе с ней (хранится в факте).
 *
 * Чего модель не обещает: при первой сверке месяца записи, сделанные до неё
 * прежними правилами, приводятся к оценке — это правки в журнале с кодом
 * причины, а не молчаливые изменения.
 */

/** Пространство advisory-замков опоздания; у инкассации своё (`payments.router`), замки не пересекаются. */
const LOCK_LATENESS = 7_002;

/**
 * Замок на опоздания одного сотрудника — до конца транзакции.
 *
 * Отметка, решение по запросу и ручная правка дисциплины читают состояние
 * месяца и пишут записи. При READ COMMITTED без общего замка каждая видела
 * бы другую такой, какой та была до своего коммита: одобрение не находило
 * бы незафиксированную отметку, отметка — незафиксированное одобрение, и
 * после обоих коммитов запись расходилась бы с оценкой. Под замком они идут
 * по очереди, и вторая читает состояние целиком.
 *
 * Порядок везде один: сначала этот замок, потом строки. Поэтому решение по
 * запросу берёт его ДО UPDATE запроса, отметка — до вставки смены, ручная
 * правка — до своей вставки или удаления: возьми кто-то замок после строки,
 * он ждал бы замок со строкой в руках, а владелец замка — эту строку.
 *
 * Advisory, а не FOR UPDATE на строке `users`: её проверяет внешний ключ
 * каждого INSERT со ссылкой на сотрудника, и замок на ней тормозил бы всё
 * подряд. Повторный вызов в той же транзакции проходит сразу.
 */
export async function lockLatenessOf(executor: DbExecutor, userId: number): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(${LOCK_LATENESS}, ${userId})`);
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
 * Запись системы: опоздание, записанное от имени самого сотрудника, с пояснением в формате системы.
 *
 * Только такие записи проекция правит, снимает и создаёт. Всё остальное —
 * ручные записи: руководитель записал опоздание сам (и подписал своими
 * словами или никак). Пояснение — часть признака, а не только автор: запись
 * руководителя о самом себе тоже несёт `recorded_by = user_id`, и без
 * пояснения системы ни разобрать её отметку, ни стирать её нельзя.
 */
export function isAutomaticLateness(row: {
  readonly userId: number;
  readonly recordedBy: number;
  readonly kind: DisciplineKind;
  readonly description: string | null;
}): boolean {
  return row.recordedBy === row.userId && isLateDisciplineKind(row.kind) && parseStoredLateness(row.description) !== null;
}

/* -------------------------------------------------------------------------- */
/*  Факт при отметке                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Отметка прихода: записать факт опоздания и сверить месяц.
 *
 * Почасовику руководитель назначил смену «с 09:00»; отметился в 09:22 —
 * это опоздание, и система записывает его сама, в момент отметки. Факт —
 * только по первой отметке дня (вторая смена после отлучки опозданием не
 * считается, даже если первая была вовремя) и только при графике на этот
 * день (`scheduledShiftStartOn`). Отметился раньше или вовремя — ничего:
 * «пришёл вовремя» и есть норма.
 *
 * Факт пишется независимо от одобренного «приду к»: он — что было, а
 * одобрение учтёт оценка. Пришла до «приду к» — факт есть, записи нет;
 * снимут согласование — запись появится из этого факта. Второй факт за день
 * не пишется (уникальность в базе): отметка после удалённой утренней смены
 * ничего не меняет.
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  shift: { readonly id: number; readonly startedAt: Date },
  ipAddress: string | null,
): Promise<void> {
  // `shifts.checkIn` берёт замок ещё до вставки смены; здесь — на случай другого вызывающего.
  await lockLatenessOf(executor, userId);

  // День и время — по часам мастерской: отметка в 03:00 по Ташкенту в UTC ещё вчерашняя.
  const day = workshopDayIso(shift.startedAt);
  const checkIn = workshopClockTime(shift.startedAt);
  const scheduleStart = await scheduledShiftStartOn(executor, userId, day);
  if (scheduleStart === null || clockMinutes(checkIn) <= clockMinutes(scheduleStart)) return;

  /*
    Только первая отметка дня. Пришла в 08:55, ушла на обед, вернулась в
    14:00 — повторная отметка не опоздание. Только что открытая смена начата
    ровно в `startedAt`, поэтому строгое «раньше» её саму не видит.
  */
  const { start: dayStart } = workshopDayBounds(day);
  const [earlierShift] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), gte(shifts.startedAt, dayStart), lt(shifts.startedAt, shift.startedAt)))
    .limit(1);
  if (earlierShift !== undefined) return;

  const [fact] = await executor
    .insert(lateCheckIns)
    .values({ userId, day, checkInTime: checkIn, scheduleStart, shiftId: shift.id })
    .onConflictDoNothing({ target: [lateCheckIns.userId, lateCheckIns.day] })
    .returning({ id: lateCheckIns.id });
  if (fact === undefined) return;

  const { notices } = await syncMonthLateness(executor, { userId, day, cause: 'check_in', actorId: userId, ipAddress });
  // Сверка — последний шаг отметки, так что и сказать о записи можно сразу.
  for (const notice of notices) await notifyDisciplineRecorded(executor, userId, notice);
}

/**
 * Руководитель простил опоздание дня, убрав запись системы руками (`discipline.remove`).
 *
 * Прощение — решение о дне, а не о строке: отметка остаётся в факте, и без
 * этой пометки сверка месяца тут же вывела бы запись заново. Простить можно
 * один раз; кто и когда — первые.
 */
export async function forgiveLatenessOn(
  executor: DbExecutor,
  input: { readonly userId: number; readonly day: string; readonly forgivenBy: number },
): Promise<void> {
  await executor
    .update(lateCheckIns)
    .set({ forgivenAt: new Date(), forgivenBy: input.forgivenBy })
    .where(and(eq(lateCheckIns.userId, input.userId), eq(lateCheckIns.day, input.day), isNull(lateCheckIns.forgivenAt)));
}

/**
 * Повтор для РУЧНОЙ записи: такое же событие в этом месяце по этот день включительно.
 *
 * Ручная запись получает повтор и балл один раз, при записи, и потом не
 * пересчитывается — это решение руководителя. Раньше неё — прошлые дни и
 * все уже лежащие записи того же дня (она получит самый большой id).
 */
export async function hasEarlierSameKind(
  executor: DbExecutor,
  event: { readonly userId: number; readonly kind: DisciplineKind; readonly day: string },
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
        lte(disciplineEvents.occurredOn, event.day),
      ),
    )
    .limit(1);
  return prior !== undefined;
}

/* -------------------------------------------------------------------------- */
/*  Сверка месяца: план (чистый) и его исполнение                             */
/* -------------------------------------------------------------------------- */

/** Запись системы в базе — то, что сверяется с оценкой. */
export interface StoredAutoLateness {
  readonly id: number;
  readonly day: string;
  readonly kind: LateDisciplineKind;
  readonly isRepeat: boolean;
  readonly points: number;
  readonly description: string | null;
}

/**
 * Шаг сверки:
 *  - `remove_duplicate` — вторая и следующие записи системы за день (след
 *    старой ошибки, второй штраф за то же опоздание): остаётся самая ранняя;
 *  - `remove` — записи за день быть не должно;
 *  - `create` — должна быть, а её нет;
 *  - `adjust` — есть, но не такая: правка на месте, чтобы объяснение
 *    сотрудника осталось при ней.
 */
export type LatenessSyncStep<Row extends StoredAutoLateness> =
  | { readonly type: 'remove_duplicate'; readonly row: Row }
  | { readonly type: 'remove'; readonly row: Row }
  | { readonly type: 'create'; readonly desired: DesiredLateness }
  | { readonly type: 'adjust'; readonly row: Row; readonly desired: DesiredLateness };

/** Совпадает ли запись с оценкой во всём, что оценка задаёт. */
function matchesDesired(row: StoredAutoLateness, desired: DesiredLateness): boolean {
  return (
    row.kind === desired.kind &&
    row.isRepeat === desired.isRepeat &&
    row.points === desired.points &&
    row.description === desired.description
  );
}

/**
 * Что сделать с записями системы, чтобы они стали ровно оценкой месяца.
 *
 * Чистая функция: на входе — что лежит, на выходе — шаги по дням по
 * возрастанию. Совпадающая запись не трогается вовсе — ни правкой, ни
 * журналом; поэтому сверка, повторённая без изменений состояния, пуста.
 */
export function planLatenessSync<Row extends StoredAutoLateness>(
  stored: readonly Row[],
  desired: ReadonlyMap<string, DesiredLateness>,
): LatenessSyncStep<Row>[] {
  const byDay = new Map<string, Row[]>();
  for (const row of [...stored].sort((a, b) => a.id - b.id)) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);

  const steps: LatenessSyncStep<Row>[] = [];
  for (const day of [...new Set([...byDay.keys(), ...desired.keys()])].sort()) {
    const [kept, ...duplicates] = byDay.get(day) ?? [];
    for (const duplicate of duplicates) steps.push({ type: 'remove_duplicate', row: duplicate });
    const target = desired.get(day);
    if (kept === undefined) {
      if (target !== undefined) steps.push({ type: 'create', desired: target });
    } else if (target === undefined) {
      steps.push({ type: 'remove', row: kept });
    } else if (!matchesDesired(kept, target)) {
      steps.push({ type: 'adjust', row: kept, desired: target });
    }
  }
  return steps;
}

/** Что сверку вызвало — от этого код причины в журнале и пойдёт ли новая запись в группу. */
export type LatenessSyncCause = 'check_in' | 'late_request_review' | 'manual_discipline_change';

const REASON_OF_CAUSE: Readonly<Record<LatenessSyncCause, DisciplineAuditReason>> = {
  check_in: DisciplineAuditReason.CHECK_IN_RECOUNT,
  late_request_review: DisciplineAuditReason.LATE_REQUEST_REVIEW,
  manual_discipline_change: DisciplineAuditReason.MANUAL_DISCIPLINE_CHANGE,
};

export interface LatenessSyncInput {
  readonly userId: number;
  /** Любой день месяца; он же день, изменение за который вызвало сверку (`reviewedDay` в журнале у других дней). */
  readonly day: string;
  readonly cause: LatenessSyncCause;
  /** Чьё действие вызвало сверку: правки в журнале — от его имени. */
  readonly actorId: number;
  readonly ipAddress: string | null;
  /** Решение по какому запросу вызвало сверку — для журнала. */
  readonly lateRequestId?: number;
}

/** Запись за день до и после сверки — роутеру, чтобы сказать сотруднику, что изменилось. */
export interface LatenessState {
  readonly kind: LateDisciplineKind;
  readonly points: number;
  readonly isRepeat: boolean;
  /** Минуты из пояснения; у записи системы они есть всегда, `null` — только на всякий случай. */
  readonly minutes: number | null;
}

export interface LatenessDayChange {
  readonly day: string;
  readonly before: LatenessState | null;
  readonly after: LatenessState | null;
}

export interface LatenessSyncResult {
  /** Дни, где запись появилась, пропала или поправлена; лишние дубли сюда не входят. */
  readonly changes: readonly LatenessDayChange[];
  /**
   * Уведомления о новых записях — отправляет вызывающий ПОСЛЕДНИМ шагом:
   * уведомление сразу уходит и в Telegram, не дожидаясь коммита, и если
   * после него что-то упадёт, сотрудник прочтёт о штрафе, которого нет.
   */
  readonly notices: readonly DisciplineRecordedNotice[];
}

/** Запись системы из базы — вместе с самой строкой: объяснение и автор нужны исполнению. */
interface AutoRow extends StoredAutoLateness {
  readonly event: DisciplineEvent;
}

function stateOfRow(row: AutoRow): LatenessState {
  return {
    kind: row.kind,
    points: row.points,
    isRepeat: row.isRepeat,
    minutes: parseStoredLateness(row.description)?.minutes ?? null,
  };
}

function stateOfDesired(desired: DesiredLateness): LatenessState {
  return { kind: desired.kind, points: desired.points, isRepeat: desired.isRepeat, minutes: desired.minutes };
}

/** Запись в журнале «было/стало» — минуты под ключом `lateBy`, как у записи при отметке (подпись на сайте одна). */
function auditState(state: LatenessState): Record<string, unknown> {
  return { kind: state.kind, points: state.points, isRepeat: state.isRepeat, lateBy: state.minutes };
}

/** Состояние месяца сотрудника — под блокировкой строк: объяснение или удаление посреди сверки не потеряются. */
async function loadMonth(
  executor: DbExecutor,
  userId: number,
  month: { readonly from: string; readonly to: string },
): Promise<{ facts: LateCheckIn[]; lateRows: DisciplineEvent[]; approvals: Map<string, string> }> {
  const facts = await executor
    .select()
    .from(lateCheckIns)
    .where(and(eq(lateCheckIns.userId, userId), gte(lateCheckIns.day, month.from), lt(lateCheckIns.day, month.to)))
    .for('update');
  const lateRows = await executor
    .select()
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        inArray(disciplineEvents.kind, [...LATE_DISCIPLINE_KINDS]),
        gte(disciplineEvents.occurredOn, month.from),
        lt(disciplineEvents.occurredOn, month.to),
      ),
    )
    .orderBy(asc(disciplineEvents.occurredOn), asc(disciplineEvents.id))
    .for('update');
  const approved = await executor
    .select({ date: lateRequests.date, arriveBy: lateRequests.arriveBy })
    .from(lateRequests)
    .where(
      and(
        eq(lateRequests.userId, userId),
        eq(lateRequests.status, DayOffStatus.APPROVED),
        gte(lateRequests.date, month.from),
        lt(lateRequests.date, month.to),
      ),
    );
  return { facts, lateRows, approvals: new Map(approved.map((request) => [request.date, request.arriveBy])) };
}

/**
 * Сверить записи системы за месяц с оценкой по фактам — и вернуть, что изменилось.
 *
 * Под замком сотрудника (`lockLatenessOf`). Каждое расхождение — в журнал
 * от имени того, чьё действие вызвало сверку, с кодом причины:
 *  - лишние записи дня — `discipline.removed` с `duplicate`;
 *  - запись снята — `discipline.removed`; объяснение сотрудника перед
 *    удалением откладывается в факт дня, чтобы вернуться с записью;
 *  - запись появилась — `discipline.recorded` (с объяснением из факта, если
 *    оно было отложено). В группу — только запись дня самой отметки, при
 *    самой отметке; появившаяся по решению или пересчёту помечена
 *    `recomputed` — группа то опоздание уже видела или увидит решение;
 *  - запись не такая — правка на месте, `discipline.adjusted`.
 */
export async function syncMonthLateness(executor: DbExecutor, input: LatenessSyncInput): Promise<LatenessSyncResult> {
  await lockLatenessOf(executor, input.userId);
  const { facts, lateRows, approvals } = await loadMonth(executor, input.userId, monthOf(input.day));

  const automatic: AutoRow[] = [];
  const manualLateRows: { day: string; id: number; kind: LateDisciplineKind }[] = [];
  for (const event of lateRows) {
    if (!isLateDisciplineKind(event.kind)) continue;
    if (isAutomaticLateness(event)) {
      const row = { id: event.id, day: event.occurredOn, kind: event.kind, isRepeat: event.isRepeat, description: event.description };
      automatic.push({ ...row, points: Number.parseFloat(event.points), event });
    } else {
      manualLateRows.push({ day: event.occurredOn, id: event.id, kind: event.kind });
    }
  }
  const desired = evaluateMonthLateness({
    facts: facts.map((fact) => ({
      day: fact.day,
      checkIn: fact.checkInTime,
      scheduleStart: fact.scheduleStart,
      forgiven: fact.forgivenAt !== null,
    })),
    manualLateRows,
    approvals,
  });

  const factByDay = new Map(facts.map((fact) => [fact.day, fact]));
  const changes: LatenessDayChange[] = [];
  const notices: DisciplineRecordedNotice[] = [];
  for (const step of planLatenessSync(automatic, desired)) {
    switch (step.type) {
      case 'remove_duplicate':
        await removeAutomatic(executor, input, step.row, { duplicate: true });
        break;
      case 'remove': {
        const fact = factByDay.get(step.row.day);
        if (fact !== undefined) {
          await executor
            .update(lateCheckIns)
            .set({ stashedComment: step.row.event.employeeComment, stashedCommentAt: step.row.event.employeeCommentAt })
            .where(eq(lateCheckIns.id, fact.id));
        }
        await removeAutomatic(executor, input, step.row, { duplicate: false });
        changes.push({ day: step.row.day, before: stateOfRow(step.row), after: null });
        break;
      }
      case 'create':
        notices.push(await createAutomatic(executor, input, step.desired, factByDay.get(step.desired.day)));
        changes.push({ day: step.desired.day, before: null, after: stateOfDesired(step.desired) });
        break;
      case 'adjust':
        await adjustAutomatic(executor, input, step.row, step.desired);
        changes.push({ day: step.row.day, before: stateOfRow(step.row), after: stateOfDesired(step.desired) });
        break;
    }
  }
  return { changes, notices };
}

/** Общая часть журнала правки: причина, запрос и — у других дней — из-за какого дня пересчитано. */
function causeDetails(input: LatenessSyncInput, day: string): Record<string, unknown> {
  return {
    reason: REASON_OF_CAUSE[input.cause],
    ...(input.lateRequestId === undefined ? {} : { lateRequestId: input.lateRequestId }),
    ...(day === input.day ? {} : { reviewedDay: input.day }),
  };
}

async function removeAutomatic(
  executor: DbExecutor,
  input: LatenessSyncInput,
  row: AutoRow,
  how: { readonly duplicate: boolean },
): Promise<void> {
  await executor.delete(disciplineEvents).where(eq(disciplineEvents.id, row.id));
  await recordAudit(executor, {
    actorId: input.actorId,
    action: 'discipline.removed',
    entityType: 'discipline_event',
    entityId: row.id,
    details: {
      userId: input.userId,
      kind: row.kind,
      points: row.event.points,
      occurredOn: row.day,
      lateBy: parseStoredLateness(row.description)?.minutes ?? null,
      // Объяснение — и для истории: у снятой записи оно остаётся только здесь и в факте дня.
      employeeComment: row.event.employeeComment,
      employeeCommentAt: row.event.employeeCommentAt,
      recordedBy: row.event.recordedBy,
      auto: true,
      ...(how.duplicate ? { duplicate: true } : {}),
      ...causeDetails(input, row.day),
    },
    ipAddress: input.ipAddress,
  });
}

async function createAutomatic(
  executor: DbExecutor,
  input: LatenessSyncInput,
  desired: DesiredLateness,
  fact: LateCheckIn | undefined,
): Promise<DisciplineRecordedNotice> {
  const [created] = await executor
    .insert(disciplineEvents)
    .values({
      userId: input.userId,
      kind: desired.kind,
      points: desired.points.toFixed(1),
      isRepeat: desired.isRepeat,
      occurredOn: desired.day,
      description: desired.description,
      // Объяснение, отложенное, когда оценка эту запись снимала, — возвращается вместе с ней.
      employeeComment: fact?.stashedComment ?? null,
      employeeCommentAt: fact?.stashedCommentAt ?? null,
      recordedBy: input.userId,
    })
    .returning({ id: disciplineEvents.id });
  if (created === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить запись' });
  }
  if (fact !== undefined && (fact.stashedComment !== null || fact.stashedCommentAt !== null)) {
    await executor
      .update(lateCheckIns)
      .set({ stashedComment: null, stashedCommentAt: null })
      .where(eq(lateCheckIns.id, fact.id));
  }

  // В группу — только опоздание, которое сейчас отметилось; остальное группа уже видела (`groupFeed.service`).
  const announced = input.cause === 'check_in' && desired.day === input.day;
  await recordAudit(executor, {
    actorId: input.actorId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created.id,
    details: {
      auto: true,
      userId: input.userId,
      kind: desired.kind,
      points: desired.points,
      isRepeat: desired.isRepeat,
      lateBy: desired.minutes,
      shiftStart: desired.shiftStart,
      ...(desired.approvedArriveBy === null ? {} : { approvedArriveBy: desired.approvedArriveBy }),
      ...(announced ? {} : { recomputed: true, ...causeDetails(input, desired.day) }),
      label: DISCIPLINE_KIND_LABELS_RU[desired.kind],
    },
    ipAddress: input.ipAddress,
  });
  // Автор — общей константой: по ней перевод узнаёт подпись системы (`notificationTranslations`).
  return { kind: desired.kind, points: desired.points, occurredOn: desired.day, recordedByName: SYSTEM_AUTHOR_RU };
}

async function adjustAutomatic(
  executor: DbExecutor,
  input: LatenessSyncInput,
  row: AutoRow,
  desired: DesiredLateness,
): Promise<void> {
  // Объяснение сотрудника не трогаем: оно о том же опоздании.
  await executor
    .update(disciplineEvents)
    .set({
      kind: desired.kind,
      isRepeat: desired.isRepeat,
      points: desired.points.toFixed(1),
      description: desired.description,
    })
    .where(eq(disciplineEvents.id, row.id));
  await recordAudit(executor, {
    actorId: input.actorId,
    action: 'discipline.adjusted',
    entityType: 'discipline_event',
    entityId: row.id,
    details: {
      userId: input.userId,
      occurredOn: row.day,
      auto: true,
      ...causeDetails(input, row.day),
      shiftStart: desired.shiftStart,
      ...(desired.approvedArriveBy === null ? {} : { approvedArriveBy: desired.approvedArriveBy }),
      from: auditState(stateOfRow(row)),
      to: auditState(stateOfDesired(desired)),
    },
    ipAddress: input.ipAddress,
  });
}

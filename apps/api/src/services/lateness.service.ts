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
  DisciplineAuditReason,
  disciplinePoints,
  DisciplineKind,
  DayOffStatus,
  effectiveShiftStart,
  isDisciplineViolation,
  workshopClockTime,
  workshopDayIso,
  type DisciplineAuditReason as DisciplineAuditReasonCode,
  type DisciplineKind as DisciplineKindName,
  type Locale,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { SYSTEM_AUTHOR_RU } from '../lib/notificationTranslations';
import { recordAudit } from './audit.service';
import { notifyDisciplineRecorded, type DisciplineRecordedNotice } from './notifications.service';
import { workshopDayBounds } from './periods';

/** Пространство advisory-замков опоздания; у инкассации своё (`payments.router`), замки не пересекаются. */
const LOCK_LATENESS = 7_002;

/**
 * Замок на опоздания одного сотрудника — до конца транзакции.
 *
 * Решение по запросу (одобрить / снять) и первая отметка дня раньше читали
 * друг друга обычными SELECT, и при READ COMMITTED каждая видела другую
 * такой, какой та была до своего коммита. Проверка воспроизвела обе гонки:
 * одобрение пересчитывает день, где отметки «ещё нет», а отметка считает
 * опоздание от графика, потому что одобрения «ещё нет», — и при одобренном
 * запросе остаются 70 минут опоздания (со снятием — зеркально). Под замком
 * решение и отметка идут по очереди: вторая начинает читать, когда первая
 * уже зафиксирована, и видит её целиком — смену, запрос и запись.
 *
 * Тот же замок разводит двух руководителей, решающих за одного человека
 * разные дни месяца: каждый брал FOR UPDATE сначала на запись своего дня,
 * потом на все записи месяца при пересчёте повторов — и они ловили
 * взаимную блокировку. Ручная правка дисциплины пересчитывает тот же месяц
 * и берёт этот же замок.
 *
 * Порядок везде один: сначала этот замок, потом строки (запрос на
 * опоздание, записи дисциплины, смена). Поэтому решение по запросу берёт
 * его ДО UPDATE запроса, отметка — до вставки смены, ручная правка — до
 * своей вставки или удаления: возьми кто-то замок после строки, он ждал бы
 * замок со строкой в руках, а владелец замка — эту строку.
 *
 * Advisory, а не FOR UPDATE на строке `users`: её проверяет внешний ключ
 * каждого INSERT со ссылкой на сотрудника (уведомления, журнал, смены), и
 * замок на ней тормозил бы всё подряд. Повторный вызов в той же транзакции
 * проходит сразу.
 */
export async function lockLatenessOf(executor: DbExecutor, userId: number): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(${LOCK_LATENESS}, ${userId})`);
}

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

/**
 * Время отметки из пояснения, записанного системой («отметка в 09:05»); чужой текст — `null`.
 *
 * Пересчёт после решения по запросу оценивает именно его, а не начало
 * смены в базе: смену после отметки мог передвинуть руководитель
 * (`shifts.adjustManually`), а ручная правка смены опоздание не питает. Без
 * этого снятие согласования считало опоздание от перенесённого начала —
 * отметка в 09:05, смена перенесена на 10:30, и штраф вырастал до «90 мин»,
 * которых отметка никогда не показывала. Пересчёт переписывает пояснение,
 * но время отметки в нём сохраняет, так что оно переживает любое число
 * одобрений и снятий.
 */
export function storedCheckInTime(description: string | null): string | null {
  if (description === null) return null;
  return STORED_LATENESS.exec(description)?.[2] ?? null;
}

/** Виды опоздания — из них система пишет запись сама; остальное в дисциплине — руками руководства. */
const LATE_KINDS: readonly DisciplineKindName[] = [
  DisciplineKind.LATE_UNDER_15,
  DisciplineKind.LATE_15_30,
  DisciplineKind.LATE_OVER_30,
];

/** Вид — опоздание: такую запись система ведёт сама, и её правка руками пересчитывает повторы месяца. */
export function isLateKind(kind: DisciplineKindName): boolean {
  return LATE_KINDS.includes(kind);
}

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

/**
 * «Приду к» на день для отметки — живой запрос читается под FOR SHARE.
 *
 * Решение по запросу могло уже обновить строку и ещё не зафиксироваться.
 * Обычный SELECT при READ COMMITTED увидел бы её прежней, и отметка
 * посчитала бы опоздание по правилу, которого через миг не станет. FOR
 * SHARE ждёт коммита решения и перечитывает строку: одобренная даёт «приду
 * к», снятая (статус уже не из списка) выпадает из выборки — и опоздание
 * считается от графика. Ждущий решения запрос порог не сдвигает, но тоже
 * блокируется: решение по нему дождётся этой отметки и пересчитает её.
 * Основную очередь держит `lockLatenessOf`; эта блокировка — на случай
 * пути, который изменит запрос без него.
 */
async function arriveByForCheckIn(executor: DbExecutor, userId: number, day: string): Promise<string | null> {
  const [live] = await executor
    .select({ status: lateRequests.status, arriveBy: lateRequests.arriveBy })
    .from(lateRequests)
    .where(
      and(
        eq(lateRequests.userId, userId),
        eq(lateRequests.date, day),
        inArray(lateRequests.status, [DayOffStatus.PENDING, DayOffStatus.APPROVED]),
      ),
    )
    .for('share')
    .limit(1);
  return live?.status === DayOffStatus.APPROVED ? live.arriveBy : null;
}

/**
 * Одобренное «приду к» на день — для пересчёта после решения.
 *
 * Решающая транзакция сама только что обновила запрос и держит замок
 * сотрудника, так что блокировка здесь ничего не добавила бы. Ждущий
 * решения или отклонённый запрос порог не сдвигает.
 */
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
 * же дня с меньшим id тоже раньше. У новой записи его нет: она получит
 * самый большой id, так что раньше неё — прошлые дни и ВСЕ уже лежащие
 * записи того же дня. Тот же порядок держит `recountRepeats`, и ручная
 * запись (`discipline.record`) спрашивает здесь же — иначе запись и
 * пересчёт месяца расходились бы в том, что считать повтором. Система за
 * день пишет одно опоздание и только если других опозданий нет
 * (`hasLatenessOnDay`), так что у неё «тот же день» всегда пуст.
 */
export async function hasEarlierSameKind(
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
          ? lte(disciplineEvents.occurredOn, event.day)
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
 * Какие правки повторов допустимы:
 *  - `any` — любые: повтор появился — балл строже, пропал — мягче;
 *  - `lower_only` — только мягче. Так после одобрения запроса: оно — уступка
 *    сотруднику и не должно утяжелить ему ни один день (см.
 *    `recomputeLatenessForDay`).
 */
export type RepeatRecountPolicy = 'any' | 'lower_only';

/** Место записи в порядке месяца — день, затем id; тот же порядок, что у повтора. */
export interface RepeatPosition {
  readonly occurredOn: string;
  readonly id: number;
}

/** Запись стоит в месяце строго после `position`. */
function isAfter(row: RepeatPosition, position: RepeatPosition): boolean {
  return row.occurredOn === position.occurredOn ? row.id > position.id : row.occurredOn > position.occurredOn;
}

/**
 * Повторы одного вида за месяц — заново, по порядку (день, id), но только
 * ПОСЛЕ места правки.
 *
 * Простили опоздание 05.11 — опоздание 09.11 того же вида больше не
 * повтор, и его балл должен стать обычным; сняли согласование — снова
 * повтор. Признак и балл хранятся в записи, поэтому без пересчёта 09.11 так
 * и висело бы строже, чем положено, и тянуло уровень и рейтинг.
 *
 * `after` — место записи, которую добавили, убрали или поправили. Повтор
 * зависит только от того, что было РАНЬШЕ, поэтому правка в этом месте
 * может сдвинуть лишь записи после него; записи до него остаются как есть
 * и только считаются «бывшими раньше». Раньше обход переписывал весь месяц:
 * одобрение увело 03-е ступенью ниже и бережно оставило 06-е не повтором
 * (`lower_only`), а следующая ручная запись за 08-е строгим обходом делала
 * 06-е повтором — да ещё от имени и с причиной чужой правки.
 *
 * Меняются только записи системы (`recorded_by` — сам сотрудник): ручная
 * запись — решение руководителя, её балл он поставил сам. Но как более
 * раннее событие она считается. Вход — записи одного сотрудника, одного
 * вида и одного месяца; выход — только те, что разошлись.
 *
 * При `lower_only` правка, после которой балл строже, пропускается. Чем
 * считать «раньше» это не меняет: повтор зависит от того, были ли записи
 * раньше, а не от их признаков, так что пропуск одной правки остальные не
 * сдвигает.
 */
export function recountRepeats(
  rows: readonly RepeatRow[],
  how: { readonly after: RepeatPosition; readonly policy: RepeatRecountPolicy },
): RepeatChange[] {
  const ordered = [...rows].sort((a, b) =>
    a.occurredOn === b.occurredOn ? a.id - b.id : a.occurredOn < b.occurredOn ? -1 : 1,
  );
  const { after, policy } = how;
  const changes: RepeatChange[] = [];
  let seenEarlier = false;
  for (const row of ordered) {
    if (row.recordedBy === row.userId && isAfter(row, after)) {
      const isRepeat = isDisciplineViolation(row.kind) && seenEarlier;
      const points = disciplinePoints(row.kind, isRepeat);
      const stricter = points < row.points;
      if ((isRepeat !== row.isRepeat || points !== row.points) && !(policy === 'lower_only' && stricter)) {
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
export interface ReviewActor {
  readonly actorId: number;
  readonly ipAddress: string | null;
}

/**
 * Повторы затронутых видов после места правки — в базе, каждая правка в журнал.
 *
 * Зовут двое: пересчёт после решения по запросу и ручная правка дисциплины
 * (`discipline.record` / `discipline.remove` опоздания). `after` — место
 * записи, которую добавили, убрали или поправили (см. `recountRepeats`):
 * меняются только записи месяца после него. `reason` — код причины в
 * журнале (`DisciplineAuditReason`), `reviewedDay` — день этой записи, из-за
 * которой пересчитаны повторы. Меняются только записи системы.
 *
 * Вызывающий держит `lockLatenessOf` с самого начала своей транзакции:
 * здесь записи месяца берутся FOR UPDATE, и два пересчёта одного месяца без
 * общего замка блокировали бы друг друга.
 */
export async function recountMonthRepeats(
  executor: DbExecutor,
  scope: { readonly userId: number; readonly after: RepeatPosition; readonly kinds: ReadonlySet<DisciplineKindName> },
  actor: ReviewActor,
  how: { readonly reason: DisciplineAuditReasonCode; readonly policy: RepeatRecountPolicy },
): Promise<void> {
  const reviewedDay = scope.after.occurredOn;
  const { from, to } = monthOf(reviewedDay);
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

    const changes = recountRepeats(
      rows.map((row) => ({ ...row, points: Number.parseFloat(row.points) })),
      { after: scope.after, policy: how.policy },
    );
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
          reason: how.reason,
          // Повтор пересчитан из-за правки записи раньше в месяце — за этот день.
          reviewedDay,
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
 *
 * Сотрудник узнаёт о записи в любом случае, но не всегда отсюда.
 * Уведомление сразу уходит и в Telegram, не дожидаясь коммита. При отметке
 * запись — последний шаг, и `notify` сообщает сразу. При пересчёте после
 * снятия согласования за ней ещё пересчёт повторов, журнал и уведомление
 * о снятии; упади что-то из них (хоть взаимная блокировка), транзакция
 * откатится, а сотрудник уже прочтёт в Telegram о штрафе, которого нет.
 * Тогда `notify: false`, и текст возвращается вызывающему — отправить
 * последним шагом.
 */
async function insertAutomaticLateness(
  executor: DbExecutor,
  facts: LatenessFacts,
  options: { readonly recomputed: boolean; readonly notify: boolean; readonly ipAddress: string | null },
): Promise<{ readonly id: number; readonly kind: DisciplineKindName; readonly notice: DisciplineRecordedNotice }> {
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
  // Место новой записи нужно пересчёту повторов после неё (`recountMonthRepeats`).
  if (created === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить запись' });
  }

  await recordAudit(executor, {
    actorId: facts.userId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created.id,
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
  // Автор — общей константой: по ней перевод узнаёт подпись системы (`notificationTranslations`).
  const notice: DisciplineRecordedNotice = { kind, points, occurredOn: facts.day, recordedByName: SYSTEM_AUTHOR_RU };
  if (options.notify) await notifyDisciplineRecorded(executor, facts.userId, notice);

  return { id: created.id, kind, notice };
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
 *
 * Решение по запросу за этот же день могло идти одновременно — поэтому
 * сначала замок сотрудника (`lockLatenessOf`; `shifts.checkIn` берёт его ещё
 * до вставки смены, здесь — на случай другого вызывающего), а запрос
 * читается под FOR SHARE (`arriveByForCheckIn`).
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  startedAt: Date,
  ipAddress: string | null,
): Promise<void> {
  await lockLatenessOf(executor, userId);
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

  const arriveBy = await arriveByForCheckIn(executor, userId, day);
  const shiftStart = effectiveShiftStart(scheduledStart, arriveBy);
  const lateBy = clockMinutes(actual) - clockMinutes(shiftStart);
  if (lateBy <= 0) return;

  // Одно опоздание в день. Записанное руководством руками тоже считается: второе за тот же день — двойной штраф.
  if (await hasLatenessOnDay(executor, userId, day)) return;

  // Запись — последний шаг отметки, так что и сказать о ней можно сразу.
  await insertAutomaticLateness(
    executor,
    { userId, day, shiftStart, actual, lateBy, approvedArriveBy: arriveBy },
    { recomputed: false, notify: true, ipAddress },
  );
}

/**
 * Простил ли руководитель опоздание СИСТЕМЫ за день руками (`discipline.remove`).
 *
 * Прощение — это когда руководитель убрал запись, которую сделала система
 * при отметке. Если он стёр свою же ошибочную ручную запись, он ничего не
 * прощал: при снятии согласования опоздание по отметке должно вернуться.
 * Поэтому `discipline.remove` пишет в журнал, чья была запись (`recordedBy`;
 * `auto` — запись системы, `recordedBy` = сам сотрудник), и здесь
 * считается только удаление записи системы.
 *
 * Удаление, которое сделал сам пересчёт, отмечено кодом причины
 * `late_request_review`: его делает правило, а не человек. Отличаем по
 * коду, а не по `auto` — у ручного удаления записи системы `auto` теперь
 * тоже `true`.
 *
 * Старые ручные удаления (до этого изменения) `recordedBy` не несут, и
 * чья была запись, уже не узнать. Их по-прежнему считаем прощением —
 * осторожно: лучше не вернуть штраф, чем вернуть прощённый.
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
        sql`coalesce(${auditLog.details}->>'reason', '') <> ${DisciplineAuditReason.LATE_REQUEST_REVIEW}`,
        or(
          sql`${auditLog.details}->'recordedBy' is null`,
          sql`${auditLog.details}->>'recordedBy' = ${userId.toString()}`,
        ),
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
      recordedBy: event.recordedBy,
      auto: true,
      // По этому коду `forgivenByHand` отличает снятие правилом от прощения руками.
      reason: DisciplineAuditReason.LATE_REQUEST_REVIEW,
    },
    ipAddress: actor.ipAddress,
  });
}

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

/** Смена дня для пересчёта опоздания: с чего она началась и как. */
interface DayShift {
  readonly id: number;
  readonly userId: number;
  readonly startedAt: Date;
  readonly startLatitude: number | null;
}

/**
 * Когда сотрудник отметился, открывая смену, — `null`, если смена не с отметки.
 *
 * Опоздание оценивается только по отметке: ручная правка смены его не
 * питает — ни при отметке, ни в `adjustManually`, ни при пересчёте. Раньше
 * «настоящую отметку» узнавали по `is_manually_adjusted`, но его ставит и
 * правка одного только конца смены: отметка в 09:40 (−2), руководитель
 * поправил уход, одобрение «приду к 09:45» сняло запись — и снятие
 * согласования её уже не возвращало. Поэтому судим по началу:
 *  - координат начала нет — смену завёл руководитель, отметки не было;
 *  - ручных правок с `before` нет (автозакрытие пишет `shift.adjusted` без
 *    него — оно трогает только конец) — начало смены и есть отметка;
 *  - правки были — время отметки берём из `before` первой из них
 *    (`checkInStartFromFirstEdit`): правка конца его не меняет, перенос
 *    начала — тоже не теряет.
 */
async function checkInStartOf(executor: DbExecutor, shift: DayShift): Promise<Date | null> {
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

/** Решение по запросу, после которого пересчитывается опоздание. */
export type LateReviewMode = 'approved' | 'withdrawn';

/**
 * Чем кончился пересчёт — роутеру, чтобы сказать сотруднику:
 *  - `none` — пересчитывать нечего (нет графика, нет смены, нет записи и
 *    создавать её не положено);
 *  - `unchanged` — запись осталась как была, `minutes` — сколько в ней
 *    записано (`null`, если пояснение не системное). Так же — когда
 *    одобрение сделало бы запись строже: тогда её не трогаем;
 *  - `removed` — запись снята, `minutes` — сколько было (`null`, если
 *    пояснение не системное);
 *  - `adjusted` — запись поправлена на месте: другое число минут, вид, балл;
 *  - `created` — запись появилась заново (только при снятии согласования).
 *    `notice` — уведомление о ней: его отправляет роутер последним шагом
 *    решения, после журнала и уведомления о снятии (см.
 *    `insertAutomaticLateness`).
 */
export type LatenessRecomputeOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'unchanged'; readonly minutes: number | null }
  | { readonly kind: 'removed'; readonly minutes: number | null }
  | { readonly kind: 'adjusted'; readonly fromMinutes: number | null; readonly toMinutes: number }
  | { readonly kind: 'created'; readonly minutes: number; readonly notice: DisciplineRecordedNotice };

const NONE: LatenessRecomputeOutcome = { kind: 'none' };

/** Какой должна стать запись системы за день: вид, повтор, балл, пояснение. */
interface LatenessTarget {
  readonly kind: DisciplineKindName;
  readonly isRepeat: boolean;
  readonly points: number;
  readonly description: string;
}

/**
 * Сделало бы одобрение запись строже: минут больше, чем в ней записано, или балл строже.
 *
 * Минут из пояснения может не быть (текст не системный) — тогда судим
 * только по баллу. Одобрение — уступка сотруднику; если оно выходит хуже
 * записанного, пересчёт оставляет запись как есть (см. `recomputeLatenessForDay`).
 */
export function approvalWorsens(
  kept: { readonly minutes: number | null; readonly points: number },
  next: { readonly minutes: number; readonly points: number },
): boolean {
  return (kept.minutes !== null && next.minutes > kept.minutes) || next.points < kept.points;
}

/** Запись за день при опоздании `lateBy` (> 0) — с повтором относительно записей раньше `keptId`. */
async function latenessTarget(
  executor: DbExecutor,
  event: { readonly userId: number; readonly day: string; readonly keptId: number },
  facts: { readonly shiftStart: string; readonly actual: string; readonly lateBy: number },
): Promise<LatenessTarget> {
  const kind = latenessKind(facts.lateBy);
  const isRepeat =
    isDisciplineViolation(kind) &&
    (await hasEarlierSameKind(executor, { userId: event.userId, kind, day: event.day, beforeId: event.keptId }));
  return {
    kind,
    isRepeat,
    points: disciplinePoints(kind, isRepeat),
    description: latenessDescription(facts.shiftStart, facts.actual, facts.lateBy),
  };
}

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
 *  - оценивается время ОТМЕТКИ, а не начало смены в базе: смену после
 *    отметки мог передвинуть руководитель (`shifts.adjustManually`), а
 *    ручная правка смены опоздание не питает. Есть запись системы — время
 *    берётся из её пояснения («отметка в 09:05», `storedCheckInTime`); нет
 *    записи — из отметки смены (`checkInStartOf`). Иначе снятие
 *    согласования после переноса смены с 09:05 на 10:30 писало «опоздание
 *    90 мин», которых отметка никогда не показывала;
 *  - одобрение только смягчает и уже записанное: вышло бы больше минут или
 *    балл строже — запись остаётся как была, без журнала и без
 *    «пересчитано» в уведомлении. Так бывает, когда график сдвинули после
 *    отметки: отметка в 09:10 при смене с 09:00 (10 мин, −0,5), смену
 *    переназначили с 08:00, одобрение «приду к 08:30» — от него выходит
 *    40 мин, −2; или когда запись ушла бы в ступень, где она — повтор;
 *  - снятие согласования создаёт запись заново, только если её не простили
 *    руками и смена — настоящая отметка, а не заведённая руководством;
 *  - запись правится на месте, а не удаляется и создаётся снова: иначе
 *    пропадало бы объяснение сотрудника (`discipline.explain`);
 *  - повторы того же вида в месяце пересчитываются: простили первое
 *    опоздание — второе уже не повтор.
 *
 * Повторы после одобрения — тоже только мягче (`lower_only`). Снятая запись
 * или та же ступень с меньшими минутами более поздние дни только смягчают.
 * Но запись, ушедшая ступенью ниже (25 мин → 10 мин), в новой ступени
 * становится более ранним событием, и более позднее опоздание той же
 * ступени стало бы повтором — строже из-за одобрения совсем другого дня
 * (−0,5 → −1,5, больше, чем сэкономило само одобрение). Такую правку после
 * одобрения не делаем; снятие согласования и ручная правка пересчитывают
 * строго. Любой пересчёт повторов трогает только записи ПОСЛЕ записи этого
 * дня (`recountRepeats`): более ранние от неё не зависят.
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
  // Замок — до первого чтения (см. `lockLatenessOf`). Роутер берёт его ещё
  // до UPDATE запроса; здесь — на случай другого вызывающего.
  await lockLatenessOf(executor, input.userId);

  const actor: ReviewActor = { actorId: input.actorId, ipAddress: input.ipAddress };
  const review: { readonly reason: DisciplineAuditReasonCode; readonly policy: RepeatRecountPolicy } = {
    reason: DisciplineAuditReason.LATE_REQUEST_REVIEW,
    policy: input.mode === 'approved' ? 'lower_only' : 'any',
  };

  const scheduledStart = await scheduledShiftStart(executor, input.userId);
  if (scheduledStart === null) return NONE;

  const { start, end } = workshopDayBounds(input.day);
  const [firstShift] = await executor
    .select({ id: shifts.id, userId: shifts.userId, startedAt: shifts.startedAt, startLatitude: shifts.startLatitude })
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
  const minutesLate = (actual: string): number => clockMinutes(actual) - clockMinutes(shiftStart);

  const [kept, ...duplicates] = existing;

  if (kept === undefined) {
    // Одобрение штраф не создаёт никогда (см. выше).
    if (input.mode === 'approved') return NONE;
    // Смена не с отметки или отметка была в другой день (смену перенесли руками) — оценивать нечего.
    const checkIn = await checkInStartOf(executor, firstShift);
    if (checkIn === null || workshopDayIso(checkIn) !== input.day) return NONE;
    const actual = workshopClockTime(checkIn);
    const lateBy = minutesLate(actual);
    if (lateBy <= 0) return NONE;
    if (await forgivenByHand(executor, input.userId, input.day)) return NONE;
    if (await hasLatenessOnDay(executor, input.userId, input.day)) return NONE;

    // Уведомление — не отсюда: роутер отправит его последним шагом (см. `insertAutomaticLateness`).
    const created = await insertAutomaticLateness(
      executor,
      { userId: input.userId, day: input.day, shiftStart, actual, lateBy, approvedArriveBy: arriveBy },
      { recomputed: true, notify: false, ipAddress: input.ipAddress },
    );
    await recountMonthRepeats(
      executor,
      {
        userId: input.userId,
        after: { occurredOn: input.day, id: created.id },
        kinds: new Set([created.kind]),
      },
      actor,
      review,
    );
    return { kind: 'created', minutes: lateBy, notice: created.notice };
  }

  /*
    Время отметки — из пояснения записи: его записала сама отметка, и
    пересчёты его сохраняют. Начало смены в базе мог передвинуть
    руководитель. Пояснение не системное (старая запись) — тогда из отметки
    смены, а не восстановить её — из начала смены как есть.
  */
  const actual =
    storedCheckInTime(kept.description) ??
    workshopClockTime((await checkInStartOf(executor, firstShift)) ?? firstShift.startedAt);
  const lateBy = minutesLate(actual);
  const fromMinutes = storedLateMinutes(kept.description);
  const keptPoints = Number.parseFloat(kept.points);
  // Какой запись должна стать; `null` — снять: по новому порогу пришёл вовремя.
  const target =
    lateBy > 0
      ? await latenessTarget(
          executor,
          { userId: input.userId, day: input.day, keptId: kept.id },
          { shiftStart, actual, lateBy },
        )
      : null;

  // Одобрение хуже не делает (см. выше) — и тогда не пишем ничего: ни правки, ни журнала.
  if (
    input.mode === 'approved' &&
    target !== null &&
    approvalWorsens({ minutes: fromMinutes, points: keptPoints }, { minutes: lateBy, points: target.points })
  ) {
    return { kind: 'unchanged', minutes: fromMinutes };
  }

  // Системное опоздание за день одно; лишние — след старой ошибки, оставляем самое раннее.
  const touched = new Set<DisciplineKindName>([kept.kind]);
  for (const duplicate of duplicates) {
    await removeAutomaticLateness(executor, duplicate, actor);
    touched.add(duplicate.kind);
  }

  let outcome: LatenessRecomputeOutcome;

  if (target === null) {
    await removeAutomaticLateness(executor, kept, actor);
    outcome = { kind: 'removed', minutes: fromMinutes };
  } else if (
    target.kind === kept.kind &&
    target.isRepeat === kept.isRepeat &&
    target.points === keptPoints &&
    target.description === kept.description
  ) {
    outcome = { kind: 'unchanged', minutes: fromMinutes };
  } else {
    // Объяснение сотрудника (`employee_comment`) не трогаем: оно о том же опоздании.
    await executor
      .update(disciplineEvents)
      .set({
        kind: target.kind,
        isRepeat: target.isRepeat,
        points: target.points.toFixed(1),
        description: target.description,
      })
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
        reason: review.reason,
        shiftStart,
        ...(arriveBy === null ? {} : { approvedArriveBy: arriveBy }),
        from: { kind: kept.kind, points: keptPoints, isRepeat: kept.isRepeat, lateBy: fromMinutes },
        to: { kind: target.kind, points: target.points, isRepeat: target.isRepeat, lateBy },
      },
      ipAddress: actor.ipAddress,
    });
    touched.add(target.kind);
    outcome = { kind: 'adjusted', fromMinutes, toMinutes: lateBy };
  }

  if (outcome.kind !== 'unchanged' || duplicates.length > 0) {
    // Место правки — запись дня (снятые дубли того же дня стоят после неё): раньше неё ничего не сдвигается.
    await recountMonthRepeats(
      executor,
      { userId: input.userId, after: { occurredOn: input.day, id: kept.id }, kinds: touched },
      actor,
      review,
    );
  }
  return outcome;
}

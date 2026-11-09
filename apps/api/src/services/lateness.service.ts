import {
  auditLog,
  disciplineEvents,
  lateRequests,
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
  LATE_DISCIPLINE_KINDS,
  latenessBeforeApprovalSchema,
  workshopClockTime,
  workshopDayIso,
  type DisciplineAuditReason as DisciplineAuditReasonCode,
  type DisciplineKind as DisciplineKindName,
  type LatenessApprovalChange,
  type LatenessBeforeApproval,
  type Locale,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';

import { SYSTEM_AUTHOR_RU } from '../lib/notificationTranslations';
import { recordAudit } from './audit.service';
import { firstCheckInOnDay } from './checkInTime';
import { notifyDisciplineRecorded, type DisciplineRecordedNotice } from './notifications.service';
import { workshopDayBounds } from './periods';
import { scheduledShiftStartOn } from './shiftSchedule';

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
 * Пересчёт после одобрения оценивает именно его, а не начало смены в базе:
 * смену после отметки мог передвинуть руководитель (`shifts.adjustManually`),
 * а ручная правка смены опоздание не питает. Без этого отметка в 09:05 при
 * смене, перенесённой на 10:30, и «приду к 09:30» оставляли бы штраф, хотя
 * человек пришёл вовремя. Пересчёт переписывает пояснение, но время отметки
 * в нём сохраняет, так что оно переживает любое число одобрений.
 */
export function storedCheckInTime(description: string | null): string | null {
  if (description === null) return null;
  return STORED_LATENESS.exec(description)?.[2] ?? null;
}

/** Виды опоздания — из них система пишет запись сама (общий список, `LATE_DISCIPLINE_KINDS`). */
const LATE_KINDS: readonly DisciplineKindName[] = LATE_DISCIPLINE_KINDS;

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
  event: {
    readonly userId: number;
    readonly kind: DisciplineKindName;
    readonly day: string;
    readonly beforeId?: number | undefined;
  },
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

/** Запись в порядке месяца с тем, что меняет пересчёт повторов: признак и балл. */
export interface RepeatEntry {
  readonly id: number;
  readonly kind: DisciplineKindName;
  readonly occurredOn: string;
  readonly isRepeat: boolean;
  readonly points: number;
}

/** Строка дисциплины для пересчёта повторов — без лишних колонок. */
export interface RepeatRow extends RepeatEntry {
  readonly userId: number;
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

/**
 * Порядок записей в месяце: отрицательное — `a` раньше `b`, положительное — позже.
 *
 * Один для сортировки и для «раньше / после места правки»: если бы порядок
 * сортировки и сравнение мест разошлись, запись того же дня могла бы
 * считаться и до правки, и после неё.
 */
export function comparePosition(a: RepeatPosition, b: RepeatPosition): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
  return a.id - b.id;
}

/**
 * Правка записи месяца, после которой пересчитываются повторы.
 *
 * `from` — вид записи до правки (`null` — её не было, запись добавили),
 * `to` — после (`null` — запись убрали). Место — самой записи: у новой —
 * её id, у убранной — тот, что был.
 */
export interface RepeatEdit extends RepeatPosition {
  readonly from: DisciplineKindName | null;
  readonly to: DisciplineKindName | null;
}

/**
 * Повторы месяца после правки — только там, где правка их и меняет.
 *
 * Простили опоздание 05.11 — опоздание 09.11 того же вида больше не
 * повтор, и его балл должен стать обычным; сняли согласование — снова
 * повтор. Признак и балл хранятся в записи, поэтому без пересчёта 09.11 так
 * и висело бы строже, чем положено, и тянуло уровень и рейтинг.
 *
 * Повтор записи зависит от одного: было ли РАНЬШЕ в месяце событие её вида,
 * то есть лежит ли самая ранняя запись вида до неё. Правка меняет запись
 * только тогда, когда меняет этот ответ: он считается дважды — по записям
 * до правки (правленая — со старым видом на своём месте или вовсе без неё)
 * и после, — и запись трогается лишь там, где ответы разошлись. Записи
 * раньше места правки так не меняются никогда: всё, что раньше них, правка
 * не задела.
 *
 * Раньше месяц обходился строго заново после места правки, и обход
 * поднимал записи, которых правка не касалась. Пример проверки: 02-го
 * 40 мин (−2), 03-го 25 мин (−1), 06-го 10 мин (−0,5). Одобрение 03-го
 * «до 09:20» увело его в «до 15 мин», и 06-е бережно осталось не повтором
 * (`lower_only`); одобрение 02-го «до 09:35» — туда же; снятие согласования
 * 02-го вернуло его в «больше 30», а строгий обход сделал 06-е повтором
 * (−1,5) — хотя раньше 06-го «до 15 мин» было и до снятия, и после (03-е):
 * снятие за 02-е на 06-е не влияло.
 *
 * Меняются только записи системы (`recorded_by` — сам сотрудник): ручная
 * запись — решение руководителя, её балл он поставил сам. Но как более
 * раннее событие она считается. Правленую запись здесь не трогают: её вид,
 * повтор и балл посчитал тот, кто её правил. Вход — записи сотрудника за
 * месяц после правки; выход — только те, что разошлись.
 *
 * При `lower_only` правка, после которой балл строже, пропускается. Чем
 * считать «раньше» это не меняет: повтор зависит от того, были ли записи
 * раньше, а не от их признаков.
 */
export function recountRepeats(
  rows: readonly RepeatRow[],
  how: { readonly edits: readonly RepeatEdit[]; readonly policy: RepeatRecountPolicy },
): RepeatChange[] {
  const edited = new Set(how.edits.map((edit) => edit.id));
  const earliest = earliestByKind(rows, how.edits);
  const changes: RepeatChange[] = [];
  for (const row of [...rows].sort(comparePosition)) {
    if (row.recordedBy !== row.userId || edited.has(row.id)) continue;
    const change = repeatChangeOf(row, earliest, how.policy);
    if (change !== null) changes.push(change);
  }
  return changes;
}

/**
 * Повторы записей, которые держит одобрение, — в снимке до него (`late_requests.lateness_before_approval`).
 *
 * Снятие согласования возвращает запись из снимка. Но был ли раньше в
 * месяце такой же вид, пока одобрение в силе, могло поменяться: снятие
 * одобрения другого дня, ручная запись или прощение более раннего дня.
 * Проверка поймала все три: (1) 02-го −2, 06-го −3 с повтором; одобрили
 * 02-е, потом 06-е, сняли 02-е, потом 06-е — 06-е вернулось −2 без
 * повтора, хотя 02-е снова «больше 30»; (2) ручное «больше 30» за 03-е,
 * пока одобрение 06-го в силе, — то же; (3) 02-е простили руками — 06-е
 * вернулось повтором, хотя раньше него ничего такого уже нет. Пересчёт
 * после возврата саму вернувшуюся запись не трогает (она правленая), и
 * устаревший признак оставался.
 *
 * Поэтому запись в снимке пересчитывается вместе с месяцем — ТЕМ ЖЕ
 * правилом, что и живая запись на её месте (`repeatChangeOf`, с той же
 * политикой правки). Без этого одобрения она и прошла бы ровно через эти
 * правки, так что снятие, вернув снимок как есть, даёт день, каким он был
 * бы без одобрения. Сравнить при снятии «было ли раньше такое же» в момент
 * одобрения и сейчас мало: ответ мог смениться из-за одобрения другого дня
 * (`lower_only` тогда запись не утяжелил бы) или смениться и вернуться
 * назад — и сравнение концов дало бы не то.
 *
 * Запись снимка стоит на своём месте в месяце — день и id до одобрения:
 * без одобрения она там и лежала бы. Снятая и вставленная заново получает
 * id больше, но в её день других опозданий тогда нет (`restoreRemoved`),
 * так что ни для одной записи месяца новое место не отличается от старого.
 *
 * Как более раннее событие запись снимка не считается — ни для записей
 * месяца, ни для других снимков: пока одобрение в силе, в месяце её нет
 * (или она другого вида), и решения по другим дням принимались без неё.
 * Правка самой этой записи (её одобрение, прощение руками) снимок не
 * пересчитывает — как и правленую живую запись в `recountRepeats`.
 */
export function recountHeldRepeats(
  rows: readonly RepeatRow[],
  held: readonly RepeatEntry[],
  how: { readonly edits: readonly RepeatEdit[]; readonly policy: RepeatRecountPolicy },
): RepeatChange[] {
  const edited = new Set(how.edits.map((edit) => edit.id));
  const earliest = earliestByKind(rows, how.edits);
  const changes: RepeatChange[] = [];
  for (const entry of [...held].sort(comparePosition)) {
    if (edited.has(entry.id)) continue;
    const change = repeatChangeOf(entry, earliest, how.policy);
    if (change !== null) changes.push(change);
  }
  return changes;
}

/** Самая ранняя запись каждого вида в месяце — после правки и до неё. */
interface EarliestByKind {
  readonly now: ReadonlyMap<DisciplineKindName, RepeatPosition>;
  readonly before: ReadonlyMap<DisciplineKindName, RepeatPosition>;
}

/** Самые ранние записи видов по записям месяца после правки и по самим правкам (см. `recountRepeats`). */
function earliestByKind(rows: readonly RepeatRow[], edits: readonly RepeatEdit[]): EarliestByKind {
  const edited = new Set(edits.map((edit) => edit.id));
  const now = new Map<DisciplineKindName, RepeatPosition>();
  const before = new Map<DisciplineKindName, RepeatPosition>();
  const note = (earliest: Map<DisciplineKindName, RepeatPosition>, kind: DisciplineKindName, at: RepeatPosition): void => {
    const known = earliest.get(kind);
    if (known === undefined || comparePosition(at, known) < 0) earliest.set(kind, at);
  };
  for (const row of rows) {
    note(now, row.kind, row);
    // До правки правленой записи на её месте не было — или она была другого вида (ниже).
    if (!edited.has(row.id)) note(before, row.kind, row);
  }
  for (const edit of edits) {
    if (edit.from !== null) note(before, edit.from, edit);
  }
  return { now, before };
}

/**
 * Повтор и балл записи после правки — или `null`, если правка их не меняет.
 *
 * Одно правило и для живой записи, и для записи в снимке одобрения: две
 * копии разошлись бы, и вернувшаяся из снимка запись стояла бы не с тем
 * повтором, что живая на её месте.
 */
function repeatChangeOf(entry: RepeatEntry, earliest: EarliestByKind, policy: RepeatRecountPolicy): RepeatChange | null {
  /** Было ли раньше записи событие её вида: запись стоит после самой ранней записи вида. */
  const seenEarlier = (first: RepeatPosition | undefined): boolean =>
    first !== undefined && comparePosition(entry, first) > 0;
  const seenNow = seenEarlier(earliest.now.get(entry.kind));
  if (seenNow === seenEarlier(earliest.before.get(entry.kind))) return null;

  const isRepeat = isDisciplineViolation(entry.kind) && seenNow;
  const points = disciplinePoints(entry.kind, isRepeat);
  const stricter = points < entry.points;
  if ((isRepeat === entry.isRepeat && points === entry.points) || (policy === 'lower_only' && stricter)) return null;
  return {
    id: entry.id,
    occurredOn: entry.occurredOn,
    from: { isRepeat: entry.isRepeat, points: entry.points },
    to: { isRepeat, points },
  };
}

/** Кто и откуда меняет опоздание при пересмотре — для журнала. */
export interface ReviewActor {
  readonly actorId: number;
  readonly ipAddress: string | null;
}

/**
 * Повторы месяца после правок — в базе, каждая правка повтора в журнал.
 *
 * Зовут двое: пересчёт после решения по запросу и ручная правка дисциплины
 * (`discipline.record` / `discipline.remove` опоздания). `edits` — что
 * добавили, убрали или поправили (см. `recountRepeats`); все правки — за
 * один день, он же `reviewedDay` в журнале: из-за записи этого дня
 * пересчитаны повторы. `reason` — код причины (`DisciplineAuditReason`).
 * Меняются только записи системы — и записи в снимках одобрений, которые в
 * силе (`recountHeldRepeats`): иначе снятие согласования вернуло бы запись
 * с повтором, устаревшим за время одобрения.
 *
 * Вызывающий держит `lockLatenessOf` с самого начала своей транзакции:
 * здесь записи месяца и запросы со снимками берутся FOR UPDATE, и два
 * пересчёта одного месяца без общего замка блокировали бы друг друга.
 */
export async function recountMonthRepeats(
  executor: DbExecutor,
  scope: { readonly userId: number; readonly edits: readonly RepeatEdit[] },
  actor: ReviewActor,
  how: { readonly reason: DisciplineAuditReasonCode; readonly policy: RepeatRecountPolicy },
): Promise<void> {
  const [first] = [...scope.edits].sort(comparePosition);
  if (first === undefined) return;
  const reviewedDay = first.occurredOn;
  const { from, to } = monthOf(reviewedDay);
  // Повтор меняется только у видов, которые правка добавила или убрала.
  const kinds = new Set(scope.edits.flatMap((edit) => [edit.from, edit.to]).filter((kind) => kind !== null));
  const held = await heldSnapshotsIn(executor, scope.userId, { from, to });
  for (const kind of kinds) {
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

    const repeatRows = rows.map((row) => ({ ...row, points: Number.parseFloat(row.points) }));
    const changes = recountRepeats(repeatRows, { edits: scope.edits, policy: how.policy });
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

    /*
      Записи в снимках — без журнала: записи дисциплины с такими значениями
      сейчас нет, и читать в журнале «повтор пересчитан» у несуществующей
      записи было бы странно. Значения, с которыми запись вернулась,
      журнал получит при снятии согласования (`restoreAdjusted` /
      `restoreRemoved`).
    */
    const heldOfKind = held.filter((entry) => entry.snapshot.row.kind === kind);
    const heldChanges = recountHeldRepeats(
      repeatRows,
      heldOfKind.map(({ snapshot }) => ({
        id: snapshot.row.id,
        kind: snapshot.row.kind,
        occurredOn: snapshot.row.occurredOn,
        isRepeat: snapshot.row.isRepeat,
        points: Number.parseFloat(snapshot.row.points),
      })),
      { edits: scope.edits, policy: how.policy },
    );
    for (const change of heldChanges) {
      const entry = heldOfKind.find(({ snapshot }) => snapshot.row.id === change.id);
      if (entry === undefined) continue;
      await rememberBeforeApproval(executor, entry.requestId, {
        ...entry.snapshot,
        row: { ...entry.snapshot.row, isRepeat: change.to.isRepeat, points: change.to.points.toFixed(1) },
      });
    }
  }
}

/** Снимок записи до одобрения, которое сейчас в силе, — и чей это запрос. */
interface HeldSnapshot {
  readonly requestId: number;
  readonly snapshot: LatenessBeforeApproval;
}

/**
 * Снимки одобрений сотрудника за месяц, которые в силе, — под блокировкой.
 *
 * Снимок пишет только одобрение и только проверенным схемой; читается всё
 * равно через неё — `jsonb` мог поправить кто угодно. Не разобрался или он
 * о другом дне — пропускаем: вернуть из него запись не даст само снятие
 * согласования (`parseBeforeApproval`), а ручную правку дисциплины за
 * месяц испорченный снимок чужого дня ронять не должен.
 */
async function heldSnapshotsIn(
  executor: DbExecutor,
  userId: number,
  month: { readonly from: string; readonly to: string },
): Promise<HeldSnapshot[]> {
  const requests = await executor
    .select({ id: lateRequests.id, date: lateRequests.date, snapshot: lateRequests.latenessBeforeApproval })
    .from(lateRequests)
    .where(
      and(
        eq(lateRequests.userId, userId),
        eq(lateRequests.status, DayOffStatus.APPROVED),
        isNotNull(lateRequests.latenessBeforeApproval),
        gte(lateRequests.date, month.from),
        lt(lateRequests.date, month.to),
      ),
    )
    .orderBy(asc(lateRequests.id))
    .for('update');
  return requests.flatMap((request) => {
    const parsed = latenessBeforeApprovalSchema.safeParse(request.snapshot);
    return parsed.success && parsed.data.row.occurredOn === request.date
      ? [{ requestId: request.id, snapshot: parsed.data }]
      : [];
  });
}

/** Ступень опоздания за день: вид, повтор и балл. */
interface LatenessGrade {
  readonly kind: DisciplineKindName;
  readonly isRepeat: boolean;
  readonly points: number;
}

/**
 * Ступень опоздания на `lateBy` минут (> 0) — одна для новой записи и для пересчёта старой.
 *
 * Две копии этого расчёта (при записи и при пересчёте на месте) однажды
 * разошлись бы, и одно опоздание после пересмотра стояло бы не в той
 * ступени или не с тем повтором. `beforeId` — у уже лежащей записи: повтор
 * считается относительно записей раньше неё; у новой его нет (см.
 * `hasEarlierSameKind`).
 */
async function gradeLateness(
  executor: DbExecutor,
  event: { readonly userId: number; readonly day: string; readonly lateBy: number; readonly beforeId?: number },
): Promise<LatenessGrade> {
  const kind = latenessKind(event.lateBy);
  const isRepeat =
    isDisciplineViolation(kind) &&
    (await hasEarlierSameKind(executor, { userId: event.userId, kind, day: event.day, beforeId: event.beforeId }));
  return { kind, isRepeat, points: disciplinePoints(kind, isRepeat) };
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

/** Новая запись системы: её место (id, вид) нужно пересчёту повторов, уведомление — роутеру. */
interface CreatedLateness {
  readonly id: number;
  readonly kind: DisciplineKindName;
  readonly notice: DisciplineRecordedNotice;
}

/**
 * Оценить и записать опоздание от имени системы — при отметке и при снятии согласования.
 *
 * Вид, повтор, балл и пояснение считаются одинаково, где бы опоздание ни
 * появилось. `lateRequestId` — запись сделана при снятии согласования этого
 * запроса, а не при отметке: в группу её второй раз не пишем (`recomputed`,
 * см. `groupFeed.service`), а в журнале видно, по какому запросу.
 *
 * Сотрудник узнаёт о записи в любом случае, но не всегда отсюда.
 * Уведомление сразу уходит и в Telegram, не дожидаясь коммита. При отметке
 * запись — последний шаг, и `notify` сообщает сразу. При снятии
 * согласования за ней ещё пересчёт повторов, журнал и уведомление о снятии;
 * упади что-то из них (хоть взаимная блокировка), транзакция откатится, а
 * сотрудник уже прочтёт в Telegram о штрафе, которого нет. Тогда
 * `notify: false`, и текст возвращается вызывающему — отправить последним
 * шагом.
 */
async function insertAutomaticLateness(
  executor: DbExecutor,
  facts: LatenessFacts,
  options: { readonly lateRequestId: number | null; readonly notify: boolean; readonly ipAddress: string | null },
): Promise<CreatedLateness> {
  const { kind, isRepeat, points } = await gradeLateness(executor, facts);

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
      ...(options.lateRequestId === null ? {} : { recomputed: true, lateRequestId: options.lateRequestId }),
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
 * считается, даже если первая была вовремя. График — тот, что действует в
 * день отметки (`scheduledShiftStartOn`).
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

  // День и время — по часам мастерской: отметка в 03:00 по Ташкенту в UTC ещё вчерашняя.
  const day = workshopDayIso(startedAt);
  const actual = workshopClockTime(startedAt);

  const scheduledStart = await scheduledShiftStartOn(executor, userId, day);
  if (scheduledStart === null) return;

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
    { lateRequestId: null, notify: true, ipAddress },
  );
}

/**
 * Простил ли руководитель опоздание СИСТЕМЫ за день руками (`discipline.remove`).
 *
 * Прощение — это когда руководитель убрал запись, которую сделала система
 * при отметке. Если он стёр свою же ошибочную ручную запись, он ничего не
 * прощал. Поэтому `discipline.remove` пишет в журнал, чья была запись
 * (`recordedBy`; `auto` — запись системы, `recordedBy` = сам сотрудник), и
 * здесь считается только удаление записи системы.
 *
 * Удаление, которое сделал сам пересчёт, отмечено кодом причины
 * `late_request_review`: его делает правило, а не человек. Отличаем по
 * коду, а не по `auto` — у ручного удаления записи системы `auto` тоже
 * `true`.
 *
 * Ручные удаления без `recordedBy` (так их писали раньше) считаем
 * прощением — осторожно: лучше не вернуть штраф, чем вернуть прощённый.
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

/**
 * Решение по запросу — с тем, что пересчёту дня нужно о самом запросе.
 *
 * У снятия согласования — то, каким было одобрение, ДО того как его сняли
 * (роутер читает строку запроса до UPDATE, который это стирает):
 *  - `approvedAt` — когда запрос одобрили (`reviewed_at`); `null` быть не
 *    должно — одобренный запрос без него не даст сохранить сама база;
 *  - `beforeApproval` — снимок записи дня до одобрения
 *    (`late_requests.lateness_before_approval`) как он лежит в `jsonb`, ещё
 *    не разобранный: разбирает его схема здесь (`parseBeforeApproval`).
 */
export type LateReview =
  | { readonly mode: 'approved'; readonly lateRequestId: number }
  | {
      readonly mode: 'withdrawn';
      readonly lateRequestId: number;
      readonly approvedAt: Date | null;
      readonly beforeApproval: unknown;
    };

/**
 * Чем кончился пересчёт — роутеру, чтобы сказать сотруднику:
 *  - `none` — пересчитывать нечего (нет графика на этот день, нет записи и
 *    создавать её не положено или не из чего);
 *  - `unchanged` — запись осталась как была, `minutes` — сколько в ней
 *    записано (`null`, если пояснение не разобрать);
 *  - `removed` — запись снята, `minutes` — сколько было;
 *  - `adjusted` — запись поправлена на месте: при одобрении — пересчитана
 *    мягче, при снятии — возвращена к тому, какой была до одобрения;
 *    `toMinutes` — сколько в ней теперь (`null`, если пояснение не разобрать);
 *  - `created` — запись появилась (только при снятии согласования).
 *    `notice` — уведомление о ней: его отправляет роутер последним шагом
 *    решения, после журнала и уведомления о снятии (см.
 *    `insertAutomaticLateness`).
 */
export type LatenessRecomputeOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'unchanged'; readonly minutes: number | null }
  | { readonly kind: 'removed'; readonly minutes: number | null }
  | { readonly kind: 'adjusted'; readonly fromMinutes: number | null; readonly toMinutes: number | null }
  | { readonly kind: 'created'; readonly minutes: number | null; readonly notice: DisciplineRecordedNotice };

const NONE: LatenessRecomputeOutcome = { kind: 'none' };

/** Запись осталась как была — или её нет вовсе. */
function keptAsIs(kept: DisciplineEvent | undefined): LatenessRecomputeOutcome {
  return kept === undefined ? NONE : { kind: 'unchanged', minutes: storedLateMinutes(kept.description) };
}

/**
 * Сделало бы одобрение запись строже: минут больше, чем в ней записано, или балл строже.
 *
 * Минут из пояснения может не быть (текст не разобрать) — тогда судим
 * только по баллу. Одобрение — уступка сотруднику; если оно выходит хуже
 * записанного, пересчёт оставляет запись как есть (см. `applyApproval`).
 */
export function approvalWorsens(
  kept: { readonly minutes: number | null; readonly points: number },
  next: { readonly minutes: number; readonly points: number },
): boolean {
  return (kept.minutes !== null && next.minutes > kept.minutes) || next.points < kept.points;
}

/**
 * Тяжелее ли опоздание от графика записанного от «приду к»: балл не мягче, а минут больше или балл строже.
 *
 * Для снятия согласования, когда отметку оценивали уже от одобренного
 * «приду к» (`undoApprovalAtCheckIn`): снятие убирает уступку, и запись
 * может только потяжелеть. Вышло бы мягче хоть в чём-то — скажем, больше
 * минут, но балл мягче, потому что запись в прежней ступени была повтором,
 * — запись остаётся: снятие согласования штраф не снижает.
 */
export function withdrawalRaises(
  kept: { readonly minutes: number | null; readonly points: number },
  next: { readonly minutes: number; readonly points: number },
): boolean {
  if (next.points > kept.points) return false;
  return next.points < kept.points || (kept.minutes !== null && next.minutes > kept.minutes);
}

/** Какой должна стать запись системы за день: ступень и пояснение. */
interface LatenessTarget extends LatenessGrade {
  readonly description: string;
}

/** Запись за день при опоздании `lateBy` (> 0) — с повтором относительно записей раньше `keptId`. */
async function latenessTarget(
  executor: DbExecutor,
  event: { readonly userId: number; readonly day: string; readonly keptId: number },
  facts: { readonly shiftStart: string; readonly actual: string; readonly lateBy: number },
): Promise<LatenessTarget> {
  const grade = await gradeLateness(executor, {
    userId: event.userId,
    day: event.day,
    lateBy: facts.lateBy,
    beforeId: event.keptId,
  });
  return { ...grade, description: latenessDescription(facts.shiftStart, facts.actual, facts.lateBy) };
}

/** Пересмотр одного дня: чей, по какому запросу и кто решил. */
interface DayReview {
  readonly userId: number;
  readonly day: string;
  readonly lateRequestId: number;
  readonly actor: ReviewActor;
}

/** Повторы месяца после правки записи дня — с кодом причины пересмотра запроса. */
async function recountAfterReview(
  executor: DbExecutor,
  review: DayReview,
  edits: readonly RepeatEdit[],
  policy: RepeatRecountPolicy,
): Promise<void> {
  await recountMonthRepeats(
    executor,
    { userId: review.userId, edits },
    review.actor,
    { reason: DisciplineAuditReason.LATE_REQUEST_REVIEW, policy },
  );
}

/** Записи системы об опоздании за день — под блокировкой: объяснение или ручное удаление посреди пересчёта не потеряются. */
async function automaticLatenessOn(executor: DbExecutor, userId: number, day: string): Promise<DisciplineEvent[]> {
  return executor
    .select()
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.occurredOn, day),
        inArray(disciplineEvents.kind, [...LATE_KINDS]),
        eq(disciplineEvents.recordedBy, userId),
      ),
    )
    .orderBy(asc(disciplineEvents.id))
    .for('update');
}

/** Убрать запись системы при одобрении — с журналом; в группу удаление не идёт. */
async function removeAutomaticLateness(executor: DbExecutor, event: DisciplineEvent, review: DayReview): Promise<void> {
  await executor.delete(disciplineEvents).where(eq(disciplineEvents.id, event.id));
  await recordAudit(executor, {
    actorId: review.actor.actorId,
    action: 'discipline.removed',
    entityType: 'discipline_event',
    entityId: event.id,
    details: {
      userId: event.userId,
      kind: event.kind,
      points: event.points,
      occurredOn: event.occurredOn,
      // Объяснение — для истории: вернёт его снятие согласования из снимка в запросе, а не отсюда.
      employeeComment: event.employeeComment,
      employeeCommentAt: event.employeeCommentAt,
      recordedBy: event.recordedBy,
      auto: true,
      // По этому коду `forgivenByHand` отличает снятие правилом от прощения руками.
      reason: DisciplineAuditReason.LATE_REQUEST_REVIEW,
      lateRequestId: review.lateRequestId,
    },
    ipAddress: review.actor.ipAddress,
  });
}

/**
 * Поправить запись системы на месте — с журналом от имени решившего; в группу правка не идёт.
 *
 * Объяснение сотрудника (`employee_comment`) не трогаем: оно о том же опоздании.
 */
async function adjustAutomaticLateness(
  executor: DbExecutor,
  review: DayReview,
  kept: DisciplineEvent,
  next: LatenessTarget & { readonly shiftStart: string; readonly approvedArriveBy: string | null; readonly lateBy: number },
): Promise<void> {
  await executor
    .update(disciplineEvents)
    .set({ kind: next.kind, isRepeat: next.isRepeat, points: next.points.toFixed(1), description: next.description })
    .where(eq(disciplineEvents.id, kept.id));
  await recordAudit(executor, {
    actorId: review.actor.actorId,
    action: 'discipline.adjusted',
    entityType: 'discipline_event',
    entityId: kept.id,
    details: {
      userId: review.userId,
      occurredOn: review.day,
      auto: true,
      reason: DisciplineAuditReason.LATE_REQUEST_REVIEW,
      lateRequestId: review.lateRequestId,
      shiftStart: next.shiftStart,
      ...(next.approvedArriveBy === null ? {} : { approvedArriveBy: next.approvedArriveBy }),
      from: {
        kind: kept.kind,
        points: Number.parseFloat(kept.points),
        isRepeat: kept.isRepeat,
        lateBy: storedLateMinutes(kept.description),
      },
      to: { kind: next.kind, points: next.points, isRepeat: next.isRepeat, lateBy: next.lateBy },
    },
    ipAddress: review.actor.ipAddress,
  });
}

/* -------------------------------------------------------------------------- */
/*  Одобрение: только мягче, и запомнить, какой запись была                   */
/* -------------------------------------------------------------------------- */

/**
 * Запись дня целиком — какой она была до одобрения.
 *
 * Проверяется схемой и при записи, а не только при чтении: снимок, который
 * потом не разобрать, сорвал бы снятие согласования; пусть лучше сразу не
 * пройдёт одобрение.
 */
function snapshotOf(row: DisciplineEvent, change: LatenessApprovalChange): LatenessBeforeApproval {
  return latenessBeforeApprovalSchema.parse({
    change,
    row: {
      id: row.id,
      kind: row.kind,
      isRepeat: row.isRepeat,
      points: row.points,
      description: row.description,
      employeeComment: row.employeeComment,
      employeeCommentAt: row.employeeCommentAt?.toISOString() ?? null,
      occurredOn: row.occurredOn,
    },
  });
}

/**
 * Запомнить в запросе, какой была запись дня до его одобрения (см. `latenessBeforeApprovalSchema`).
 *
 * Пишут двое: одобрение (`snapshotOf`) и пересчёт повторов месяца, пока
 * одобрение в силе (`recountMonthRepeats`). Схемой — при каждой записи:
 * снимок, который потом не разобрать, сорвал бы снятие согласования.
 */
async function rememberBeforeApproval(
  executor: DbExecutor,
  lateRequestId: number,
  snapshot: LatenessBeforeApproval,
): Promise<void> {
  await executor
    .update(lateRequests)
    .set({ latenessBeforeApproval: latenessBeforeApprovalSchema.parse(snapshot) })
    .where(eq(lateRequests.id, lateRequestId));
}

/**
 * Одобрение: смягчить или снять запись системы за день — и запомнить, какой она была.
 *
 *  - график — тот, что действовал в этот день (`scheduledShiftStartOn`);
 *    графика нет — ничего не трогаем: стереть штраф молча нельзя;
 *  - трогаем только записи системы (`recorded_by` — сам сотрудник);
 *    опоздание, записанное руководителем руками, — его решение;
 *  - штраф одобрение НЕ создаёт никогда: смену мог завести руководитель
 *    (отметки не было), или он уже простил опоздание (`discipline.remove`);
 *  - оценивается время ОТМЕТКИ, а не начало смены в базе: оно в пояснении
 *    записи («отметка в 09:05», `storedCheckInTime`), запасной путь — первая
 *    отметка дня (`firstCheckInOnDay`); не восстановить — запись остаётся;
 *  - вышло бы больше минут или балл строже (`approvalWorsens`) — запись
 *    остаётся как была, без журнала и без «пересчитано» в уведомлении. Так
 *    бывает, когда график этого дня поменяли после отметки (схема с этой же
 *    или более ранней датой начала), или запись ушла бы в ступень, где она —
 *    повтор;
 *  - запись правится на месте, а не удаляется и создаётся снова: так
 *    объяснение сотрудника (`discipline.explain`) остаётся при ней;
 *  - поправленная или снятая запись запоминается целиком в запросе
 *    (`rememberBeforeApproval`) — по этому снимку снятие согласования вернёт
 *    её такой, какой она была бы без одобрения: повтор и балл в снимке, пока
 *    одобрение в силе, пересчитывает месяц (`recountHeldRepeats`);
 *  - повторы месяца — только мягче (`lower_only`) и только там, где правка
 *    этого дня меняет, было ли раньше такое же (`recountRepeats`). Запись,
 *    ушедшая ступенью ниже (25 мин → 10 мин), в новой ступени становится
 *    более ранним событием, и более позднее опоздание той же ступени стало
 *    бы повтором — строже из-за одобрения совсем другого дня. Такую правку
 *    после одобрения не делаем.
 */
async function applyApproval(executor: DbExecutor, review: DayReview): Promise<LatenessRecomputeOutcome> {
  const scheduledStart = await scheduledShiftStartOn(executor, review.userId, review.day);
  if (scheduledStart === null) return NONE;

  const [kept, ...duplicates] = await automaticLatenessOn(executor, review.userId, review.day);
  if (kept === undefined) return NONE;

  const arriveBy = await approvedArriveBy(executor, review.userId, review.day);
  const shiftStart = effectiveShiftStart(scheduledStart, arriveBy);

  /*
    Время отметки — из пояснения записи: его записала сама отметка, и
    пересчёты его сохраняют, а начало смены в базе мог передвинуть
    руководитель. Формат пояснения системы не менялся, и разбор удаётся
    всегда; запасной путь — страховка: первая отметка дня. Не восстановить
    и её — запись оставляем как есть, а не берём начало смены из базы:
    поправленное руками, опоздание оно не питает.
  */
  const fromMinutes = storedLateMinutes(kept.description);
  let actual = storedCheckInTime(kept.description);
  if (actual === null) {
    const checkIn = await firstCheckInOnDay(executor, review.userId, review.day);
    if (checkIn === null) return { kind: 'unchanged', minutes: fromMinutes };
    actual = workshopClockTime(checkIn);
  }
  const lateBy = clockMinutes(actual) - clockMinutes(shiftStart);
  const keptPoints = Number.parseFloat(kept.points);
  // Какой запись должна стать; `null` — снять: по новому порогу пришёл вовремя.
  const target =
    lateBy > 0
      ? await latenessTarget(executor, { userId: review.userId, day: review.day, keptId: kept.id }, { shiftStart, actual, lateBy })
      : null;

  // Одобрение хуже не делает — и тогда не пишем ничего: ни правки, ни журнала, ни снимка.
  if (target !== null && approvalWorsens({ minutes: fromMinutes, points: keptPoints }, { minutes: lateBy, points: target.points })) {
    return { kind: 'unchanged', minutes: fromMinutes };
  }

  // Системное опоздание за день одно; лишние — след старой ошибки, оставляем самое раннее.
  // Снимка у лишних нет, и снятие согласования их не вернёт — см. `applyWithdrawal`.
  const edits: RepeatEdit[] = [];
  for (const duplicate of duplicates) {
    await removeAutomaticLateness(executor, duplicate, review);
    edits.push({ occurredOn: duplicate.occurredOn, id: duplicate.id, from: duplicate.kind, to: null });
  }

  let outcome: LatenessRecomputeOutcome;
  if (target === null) {
    await rememberBeforeApproval(executor, review.lateRequestId, snapshotOf(kept, 'removed'));
    await removeAutomaticLateness(executor, kept, review);
    edits.push({ occurredOn: kept.occurredOn, id: kept.id, from: kept.kind, to: null });
    outcome = { kind: 'removed', minutes: fromMinutes };
  } else if (
    target.kind === kept.kind &&
    target.isRepeat === kept.isRepeat &&
    target.points === keptPoints &&
    target.description === kept.description
  ) {
    outcome = { kind: 'unchanged', minutes: fromMinutes };
  } else {
    await rememberBeforeApproval(executor, review.lateRequestId, snapshotOf(kept, 'adjusted'));
    await adjustAutomaticLateness(executor, review, kept, { ...target, shiftStart, approvedArriveBy: arriveBy, lateBy });
    edits.push({ occurredOn: kept.occurredOn, id: kept.id, from: kept.kind, to: target.kind });
    outcome = { kind: 'adjusted', fromMinutes, toMinutes: lateBy };
  }

  await recountAfterReview(executor, review, edits, 'lower_only');
  return outcome;
}

/* -------------------------------------------------------------------------- */
/*  Снятие согласования: вернуть день ровно к тому, каким он был до одобрения  */
/* -------------------------------------------------------------------------- */

/** Запись дня из снимка до одобрения. */
type RowBeforeApproval = LatenessBeforeApproval['row'];

/**
 * Снимок до одобрения из запроса; снимка нет — `null` (что это значит — см. `applyWithdrawal`).
 *
 * Снимок пишут только одобрение и пересчёт повторов, и только проверенным
 * схемой (`rememberBeforeApproval`). Не разобрался или он о другом дне —
 * значит, `jsonb` правили руками, и вернуть день «ровно как было» не из
 * чего. Тогда снятие согласования не проходит вовсе: молча вывести запись
 * заново по графику — ровно то, от чего снимок и спасает.
 */
function parseBeforeApproval(raw: unknown, day: string): LatenessBeforeApproval | null {
  if (raw === null || raw === undefined) return null;
  const parsed = latenessBeforeApprovalSchema.safeParse(raw);
  if (!parsed.success || parsed.data.row.occurredOn !== day) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Не удалось прочитать, каким было опоздание до одобрения, — согласование не снято',
    });
  }
  return parsed.data;
}

/** Момент объяснения из снимка: ISO-строка → `Date`. */
function explainedAt(row: RowBeforeApproval): Date | null {
  return row.employeeCommentAt === null ? null : new Date(row.employeeCommentAt);
}

/**
 * Одобрение поправило запись — вернуть ту же строку к снимку.
 *
 * Без графика, без смен и без пересчёта ступени: вид, повтор, балл и
 * пояснение — ровно из снимка. Повтор и балл в нём не застыли на моменте
 * одобрения: пока оно было в силе, их пересчитывал месяц тем же правилом,
 * что и запись на этом месте (`recountHeldRepeats`), — снимок и есть
 * запись, какой она была бы без одобрения. Объяснение сотрудника одобрение не
 * трогает, а пишет его только сам сотрудник (`discipline.explain`), так что
 * нынешнее — либо то же, что в снимке, либо новее: сотрудник объяснил
 * опоздание уже после одобрения. Тогда остаётся нынешнее — оно о том же
 * опоздании и свежее; нет его — из снимка.
 *
 * Строки уже нет — после одобрения руководитель убрал её руками, то есть
 * простил опоздание; снятие согласования прощение не отменяет.
 */
async function restoreAdjusted(
  executor: DbExecutor,
  review: DayReview,
  row: RowBeforeApproval,
): Promise<LatenessRecomputeOutcome> {
  const [current] = await executor
    .select()
    .from(disciplineEvents)
    .where(and(eq(disciplineEvents.id, row.id), eq(disciplineEvents.userId, review.userId)))
    .for('update');
  if (current === undefined) return NONE;

  const fromMinutes = storedLateMinutes(current.description);
  if (
    current.kind === row.kind &&
    current.isRepeat === row.isRepeat &&
    current.points === row.points &&
    current.description === row.description
  ) {
    return { kind: 'unchanged', minutes: fromMinutes };
  }

  const explanation =
    current.employeeComment === null
      ? { comment: row.employeeComment, at: explainedAt(row) }
      : { comment: current.employeeComment, at: current.employeeCommentAt };
  await executor
    .update(disciplineEvents)
    .set({
      kind: row.kind,
      isRepeat: row.isRepeat,
      points: row.points,
      description: row.description,
      occurredOn: row.occurredOn,
      employeeComment: explanation.comment,
      employeeCommentAt: explanation.at,
    })
    .where(eq(disciplineEvents.id, current.id));

  const toMinutes = storedLateMinutes(row.description);
  await recordAudit(executor, {
    actorId: review.actor.actorId,
    action: 'discipline.adjusted',
    entityType: 'discipline_event',
    entityId: current.id,
    details: {
      userId: review.userId,
      occurredOn: review.day,
      auto: true,
      reason: DisciplineAuditReason.LATE_REQUEST_REVIEW,
      lateRequestId: review.lateRequestId,
      // Не пересчёт, а возврат к записи, какой она была до одобрения.
      restored: true,
      from: {
        kind: current.kind,
        points: Number.parseFloat(current.points),
        isRepeat: current.isRepeat,
        lateBy: fromMinutes,
      },
      to: { kind: row.kind, points: Number.parseFloat(row.points), isRepeat: row.isRepeat, lateBy: toMinutes },
    },
    ipAddress: review.actor.ipAddress,
  });

  // Повторы позже в месяце — только там, где вид этой записи меняет, было ли раньше такое же.
  await recountAfterReview(
    executor,
    review,
    [{ occurredOn: current.occurredOn, id: current.id, from: current.kind, to: row.kind }],
    'any',
  );
  return { kind: 'adjusted', fromMinutes, toMinutes };
}

/**
 * Одобрение сняло запись — вставить её заново ровно со значениями снимка.
 *
 * Вид, повтор, балл, пояснение, объяснение сотрудника и его момент, день —
 * из снимка; автор — сам сотрудник, как у любой записи системы. Без
 * графика, без смен: удалённая после одобрения смена с отметкой штраф уже не
 * теряет. Повтор и балл снимка пересчитывались вместе с месяцем, пока
 * одобрение было в силе, — на прежнем месте записи (`recountHeldRepeats`).
 * Строка новая (id больше прежнего): в порядке месяца это меняет что-то
 * только против записей того же дня, а других опозданий за день здесь
 * нет — см. ниже; так что прежнее место и новое для месяца одно и то же.
 *
 * Пока одобрение было в силе, руководитель мог записать опоздание за этот
 * день руками — тогда второе было бы двойным штрафом, и снятие ничего не
 * вставляет.
 */
async function restoreRemoved(
  executor: DbExecutor,
  review: DayReview,
  row: RowBeforeApproval,
): Promise<LatenessRecomputeOutcome> {
  if (await hasLatenessOnDay(executor, review.userId, review.day)) return NONE;

  const [created] = await executor
    .insert(disciplineEvents)
    .values({
      userId: review.userId,
      kind: row.kind,
      points: row.points,
      isRepeat: row.isRepeat,
      occurredOn: row.occurredOn,
      description: row.description,
      employeeComment: row.employeeComment,
      employeeCommentAt: explainedAt(row),
      recordedBy: review.userId,
    })
    .returning({ id: disciplineEvents.id });
  if (created === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить запись' });
  }

  const points = Number.parseFloat(row.points);
  const minutes = storedLateMinutes(row.description);
  await recordAudit(executor, {
    actorId: review.userId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created.id,
    details: {
      auto: true,
      kind: row.kind,
      points,
      isRepeat: row.isRepeat,
      lateBy: minutes,
      // В группу второй раз не пишем (`groupFeed.service`): опоздание она уже видела.
      recomputed: true,
      lateRequestId: review.lateRequestId,
      // Какую запись вернули: её сняло одобрение этого запроса.
      restoredFrom: row.id,
      label: DISCIPLINE_KIND_LABELS_RU[row.kind],
    },
    ipAddress: review.actor.ipAddress,
  });

  await recountAfterReview(
    executor,
    review,
    [{ occurredOn: row.occurredOn, id: created.id, from: null, to: row.kind }],
    'any',
  );
  // Уведомление — не отсюда: роутер отправит его последним шагом (см. `insertAutomaticLateness`).
  const notice: DisciplineRecordedNotice = { kind: row.kind, points, occurredOn: row.occurredOn, recordedByName: SYSTEM_AUTHOR_RU };
  return { kind: 'created', minutes, notice };
}

/**
 * Снимка нет: одобрение запись дня не поправило и не сняло — повлиять оно могло только на саму отметку.
 *
 * (Снимка нет и в двух случаях, когда одобрение запись всё же трогало, —
 * их снятие не возвращает, см. `applyWithdrawal`.)
 *
 * Отметку, сделанную ПОСЛЕ одобрения, оценивали уже от «приду к»: пришла в
 * 09:50 при «приду к 10:00» — записи нет; в 10:20 — 20 мин вместо 80 от
 * графика. Снятие согласования убирает эту уступку: та же отметка
 * оценивается от графика, действовавшего в тот день (`scheduledShiftStartOn`),
 * с прежними охранами — настоящая отметка и без более ранней смены
 * (`firstCheckInOnDay`), не прощено руками (`forgivenByHand`), нет
 * опоздания, записанного руководителем. Записи нет и опоздала — запись
 * появляется; запись отметки есть — она только тяжелеет
 * (`withdrawalRaises`): снятие штраф не снижает. Не поднимай снятие уже
 * лежащую запись, выходил бы абсурд: пришедшая в 10:20 после снятия
 * согласования отделывалась бы −1, а пришедшая в 09:50 получала бы −2.
 *
 * «После одобрения» — по моменту самой отметки (`started_at` с отметки,
 * восстановленный `firstCheckInOnDay`), а не по `created_at` смены:
 * `created_at` — время начала транзакции отметки, взятое ещё до замка
 * опоздания, и отметка, дождавшаяся замка за одобрением, получила бы его
 * раньше `reviewed_at`, хотя оценивалась уже от «приду к». Время отметки
 * берётся после замка — оно позже одобрения всегда, когда отметка видела
 * одобрение, и раньше — когда не видела.
 *
 * Отметка была до одобрения — одобрение её не касалось: запись (если есть)
 * остаётся как есть, создавать нечего. Так же остаётся запись, которую
 * писала не эта отметка (`cameFromCheckIn`).
 */
async function undoApprovalAtCheckIn(
  executor: DbExecutor,
  review: DayReview,
  approvedAt: Date | null,
  kept: DisciplineEvent | undefined,
): Promise<LatenessRecomputeOutcome> {
  const checkIn = await firstCheckInOnDay(executor, review.userId, review.day);
  if (checkIn === null || approvedAt === null || checkIn < approvedAt) return keptAsIs(kept);

  const scheduledStart = await scheduledShiftStartOn(executor, review.userId, review.day);
  if (scheduledStart === null) return keptAsIs(kept);
  const actual = workshopClockTime(checkIn);
  const lateBy = clockMinutes(actual) - clockMinutes(scheduledStart);
  if (lateBy <= 0) return keptAsIs(kept);

  if (kept === undefined) {
    if (await forgivenByHand(executor, review.userId, review.day)) return NONE;
    if (await hasLatenessOnDay(executor, review.userId, review.day)) return NONE;
    // Уведомление — не отсюда: роутер отправит его последним шагом (см. `insertAutomaticLateness`).
    const created = await insertAutomaticLateness(
      executor,
      { userId: review.userId, day: review.day, shiftStart: scheduledStart, actual, lateBy, approvedArriveBy: null },
      { lateRequestId: review.lateRequestId, notify: false, ipAddress: review.actor.ipAddress },
    );
    await recountAfterReview(
      executor,
      review,
      [{ occurredOn: review.day, id: created.id, from: null, to: created.kind }],
      'any',
    );
    return { kind: 'created', minutes: lateBy, notice: created.notice };
  }

  const fromMinutes = storedLateMinutes(kept.description);
  if (!cameFromCheckIn(kept, actual)) return { kind: 'unchanged', minutes: fromMinutes };
  const target = await latenessTarget(
    executor,
    { userId: review.userId, day: review.day, keptId: kept.id },
    { shiftStart: scheduledStart, actual, lateBy },
  );
  if (!withdrawalRaises({ minutes: fromMinutes, points: Number.parseFloat(kept.points) }, { minutes: lateBy, points: target.points })) {
    return { kind: 'unchanged', minutes: fromMinutes };
  }
  await adjustAutomaticLateness(executor, review, kept, { ...target, shiftStart: scheduledStart, approvedArriveBy: null, lateBy });
  await recountAfterReview(
    executor,
    review,
    [{ occurredOn: kept.occurredOn, id: kept.id, from: kept.kind, to: target.kind }],
    'any',
  );
  return { kind: 'adjusted', fromMinutes, toMinutes: lateBy };
}

/**
 * Запись дня писала эта отметка — по времени отметки в её пояснении (`storedCheckInTime`).
 *
 * Проверка нашла: отметка в 09:40 (40 мин, −2) была до одобрения, потом
 * смену с ней удалили, и сотрудник отметился ещё раз в 20:24 — уже после
 * одобрения. Первой отметкой дня стала 20:24, и снятие согласования
 * поднимало запись до 684 мин, хотя писала её отметка в 09:40, которой
 * одобрение не касалось (повторная отметка опоздание не писала: за день
 * оно уже было). Поднимать можно только запись, записанную самой отметкой
 * после одобрения, — тогда в пояснении её время: пересчёты переписывают
 * начало и минуты, но время отметки сохраняют. Пояснение не разобрать (так
 * его не пишет ни одна версия системы, но колонку могли поправить руками) —
 * не поднимаем: лучше оставить штраф как есть, чем поднять его по чужой
 * отметке.
 */
function cameFromCheckIn(kept: DisciplineEvent, checkInTime: string): boolean {
  return storedCheckInTime(kept.description) === checkInTime;
}

/**
 * Снятие согласования: вернуть день к тому, каким он был до одобрения.
 *
 *  - одобрение запись поправило или сняло — в запросе лежит её снимок
 *    (`latenessBeforeApproval`), и запись возвращается ровно к нему: та же
 *    строка (`restoreAdjusted`) или новая с теми же значениями
 *    (`restoreRemoved`). Ни графика, ни смен, ни пересчёта ступени —
 *    ничего, что могло измениться после одобрения. Повтор и балл снимка
 *    пересчитывал месяц, пока одобрение было в силе (`recountHeldRepeats`):
 *    повтор зависит от более ранних дней, и они за это время могли
 *    измениться;
 *  - снимка нет — одобрение запись системы не поправило и не сняло, и она
 *    остаётся как есть. Кроме одного: отметку, сделанную уже после
 *    одобрения, оценивали от «приду к», и эта уступка снимается
 *    (`undoApprovalAtCheckIn`).
 *
 * Снимка нет и в двух случаях, когда одобрение запись всё-таки трогало, —
 * и снятие это не возвращает:
 *  - лишние записи системы за тот же день: одобрение оставляет одну, самую
 *    раннюю (`applyApproval`). Система пишет за день одно опоздание; вторая
 *    запись — след старой ошибки и второй штраф за то же опоздание. Вернуть
 *    её — вернуть двойной штраф, поэтому её снятие окончательное;
 *  - одобрения, сделанные до миграции 0076, когда снимков ещё не было:
 *    какой запись была до них, взять неоткуда. Запись остаётся, какой её
 *    оставило одобрение, и заново, как при любом одобрении без снимка,
 *    оценивается только отметка, сделанная после него.
 */
async function applyWithdrawal(
  executor: DbExecutor,
  review: DayReview,
  withdrawal: { readonly approvedAt: Date | null; readonly beforeApproval: unknown },
): Promise<LatenessRecomputeOutcome> {
  const snapshot = parseBeforeApproval(withdrawal.beforeApproval, review.day);
  if (snapshot !== null) {
    return snapshot.change === 'adjusted'
      ? restoreAdjusted(executor, review, snapshot.row)
      : restoreRemoved(executor, review, snapshot.row);
  }
  const [kept] = await automaticLatenessOn(executor, review.userId, review.day);
  return undoApprovalAtCheckIn(executor, review, withdrawal.approvedAt, kept);
}

/**
 * Пересчитать опоздание за день после решения по запросу на опоздание.
 *
 * Опоздание пишется при отметке, а руководитель нередко согласует «приду к
 * 10:30» уже после неё — в том числе задним числом, чтобы простить
 * опоздание. Без пересчёта одобрение ничего бы не меняло.
 *
 * Правило владельца: одобрение может только смягчить или снять штраф, а
 * снятие согласования возвращает день ровно к тому, каким он был до
 * одобрения, — не больше и не меньше. Как это держится:
 *  - одобрение пересчитывает запись системы от «приду к» и только смягчает
 *    или снимает её: штраф не создаёт и ничего не утяжеляет, в том числе
 *    повторы других дней (`applyApproval`). Поправленную или снятую запись
 *    оно запоминает в запросе целиком;
 *  - снятие согласования ничего не выводит заново, а возвращает запомненное
 *    — вид, повтор, балл, пояснение, объяснение; поправленную — в ту же
 *    строку (`applyWithdrawal`). Повтор и балл запомненной записи месяц
 *    пересчитывает, пока одобрение в силе, — так же, как пересчитал бы её
 *    саму без одобрения (`recountHeldRepeats`). Повторы более поздних дней
 *    меняются только там, где возврат вида этой записи меняет, было ли
 *    раньше такое же;
 *  - снимка нет — одобрение запись не поправило и не сняло, и снятие её
 *    тоже не трогает (два исключения, когда снимка нет, хотя одобрение
 *    запись трогало, — в `applyWithdrawal`). Заново оценивается одно:
 *    отметка, сделанная уже после одобрения. Дня «до одобрения» у неё не
 *    было, и она считается так, как посчитала бы отметка без «приду к»
 *    (`undoApprovalAtCheckIn`);
 *  - решения руководителя, принятые после одобрения, сильнее снятия:
 *    прощённая руками запись не воскресает, а при опоздании, которое он сам
 *    записал за этот день, снятая запись не возвращается — двойного штрафа
 *    нет.
 *
 * Снятие и правка записи — в журнал от имени решившего (`discipline.removed`
 * / `discipline.adjusted`, с `lateRequestId`), в группу они не идут; запись,
 * появившаяся при снятии, — `discipline.recorded` с `recomputed`, в группу
 * тоже не идёт.
 */
export async function recomputeLatenessForDay(
  executor: DbExecutor,
  input: {
    readonly userId: number;
    readonly day: string;
    readonly review: LateReview;
    /** Кто решил запрос: правки записи в журнале — на нём. */
    readonly actorId: number;
    readonly ipAddress: string | null;
  },
): Promise<LatenessRecomputeOutcome> {
  // Замок — до первого чтения (см. `lockLatenessOf`). Роутер берёт его ещё
  // до UPDATE запроса; здесь — на случай другого вызывающего.
  await lockLatenessOf(executor, input.userId);

  const review: DayReview = {
    userId: input.userId,
    day: input.day,
    lateRequestId: input.review.lateRequestId,
    actor: { actorId: input.actorId, ipAddress: input.ipAddress },
  };
  return input.review.mode === 'approved'
    ? applyApproval(executor, review)
    : applyWithdrawal(executor, review, input.review);
}

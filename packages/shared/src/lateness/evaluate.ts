import { disciplinePoints, isDisciplineViolation } from '../constants/discipline';
import { clockMinutes, effectiveShiftStart } from '../constants/lateRequest';
import type { LateDisciplineKind } from '../enums/discipline.enum';

import { latenessDescription, latenessKind } from './description';

/**
 * Опоздания месяца — чистая оценка по фактам.
 *
 * Семь кругов проверки пытались держать записи верными ПРАВКАМИ: одобрение
 * правило запись и запоминало, какой она была, снятие возвращало
 * запомненное, повторы месяца перепроверялись «только там, где правка их
 * меняет». Случайные последовательности раз за разом находили, что итог
 * зависит от ПОРЯДКА решений: те же одобрения, снятые в другом порядке,
 * оставляли другой балл. Правки по цепочке прошлых правок так устроены
 * сами: каждая опирается на то, что оставила предыдущая.
 *
 * Поэтому записи системы больше не правятся по цепочке, а выводятся заново
 * из состояния: что было (факт первой отметки), что решило руководство
 * (одобренные запросы, ручные записи, прощение). Эта функция и есть правило;
 * сервер только сверяет с её ответом то, что лежит в базе. Отсюда
 * гарантии, которые проверяют тесты:
 *  - итог — функция состояния: любой порядок решений, приводящий к одному
 *    состоянию, даёт одни и те же записи;
 *  - снятие одобрения возвращает ровно то, что было бы без него;
 *  - добавленное одобрение не делает строже ни один день — ни свой, ни
 *    другие — и не создаёт записей;
 *  - ручные записи руководителя не трогаются никогда.
 */

/** Факт опоздания за день — что зафиксировала первая отметка (`late_check_ins`). */
export interface LateCheckInFact {
  /** День мастерской `YYYY-MM-DD`. */
  readonly day: string;
  /** Время отметки `ЧЧ:ММ`. */
  readonly checkIn: string;
  /** Начало смены по графику, действовавшему в момент отметки, `ЧЧ:ММ`. */
  readonly scheduleStart: string;
  /** Руководитель простил опоздание этого дня руками — записи нет, что бы ни решили потом. */
  readonly forgiven: boolean;
}

/** Опоздание, записанное руководителем руками: само не меняется, но для повтора — более раннее событие. */
export interface ManualLateRow {
  readonly day: string;
  readonly id: number;
  readonly kind: LateDisciplineKind;
}

export interface MonthLatenessInput {
  readonly facts: readonly LateCheckInFact[];
  readonly manualLateRows: readonly ManualLateRow[];
  /** Одобренные запросы сотрудника: день → «приду к». */
  readonly approvals: ReadonlyMap<string, string>;
}

/** Какой должна быть запись системы за день. */
export interface DesiredLateness {
  readonly day: string;
  readonly kind: LateDisciplineKind;
  readonly isRepeat: boolean;
  readonly points: number;
  /** Минуты, по которым поставлена ступень, и начало, от которого они считаны. */
  readonly minutes: number;
  readonly shiftStart: string;
  readonly checkIn: string;
  /** Пояснение — ровно в формате `latenessDescription`. */
  readonly description: string;
  /** «Приду к», если день одобрен, — для журнала; ступень могла остаться и по факту. */
  readonly approvedArriveBy: string | null;
}

/** Ступень опоздания на `minutes` (> 0) от `shiftStart` — с повтором по более ранним событиям. */
function grade(
  day: string,
  checkIn: string,
  shiftStart: string,
  minutes: number,
  earlierKinds: ReadonlySet<LateDisciplineKind>,
): Omit<DesiredLateness, 'approvedArriveBy'> {
  const kind = latenessKind(minutes);
  const isRepeat = isDisciplineViolation(kind) && earlierKinds.has(kind);
  return {
    day,
    kind,
    isRepeat,
    points: disciplinePoints(kind, isRepeat),
    minutes,
    shiftStart,
    checkIn,
    description: latenessDescription(shiftStart, checkIn, minutes),
  };
}

/**
 * Запись за день с фактом — или `null`, если записи быть не должно.
 *
 * Одобренный день ставится МЯГЧЕ из двух ступеней: от «приду к» и по факту
 * (от графика). Обычно мягче первая, но не всегда: ступенью ниже опоздание
 * может стать повтором (25 мин от графика −1, а от «приду к» 10 мин при
 * уже бывшем «до 15 мин» — −1,5). Одобрение — уступка, и строже дня без
 * него оно не делает. Равные баллы — ступень от «приду к»: она и есть то,
 * о чём договорились.
 */
function dayLateness(
  fact: LateCheckInFact,
  arriveBy: string | null,
  earlierKinds: ReadonlySet<LateDisciplineKind>,
): DesiredLateness | null {
  const checkInAt = clockMinutes(fact.checkIn);
  const factMinutes = checkInAt - clockMinutes(fact.scheduleStart);
  if (factMinutes <= 0) return null;
  const byFact = grade(fact.day, fact.checkIn, fact.scheduleStart, factMinutes, earlierKinds);
  if (arriveBy === null) return { ...byFact, approvedArriveBy: null };

  const agreedStart = effectiveShiftStart(fact.scheduleStart, arriveBy);
  const agreedMinutes = checkInAt - clockMinutes(agreedStart);
  if (agreedMinutes <= 0) return null;
  const byAgreement = grade(fact.day, fact.checkIn, agreedStart, agreedMinutes, earlierKinds);
  // Баллы отрицательные: мягче — ближе к нулю.
  return { ...(byAgreement.points >= byFact.points ? byAgreement : byFact), approvedArriveBy: arriveBy };
}

/**
 * Записи системы за месяц одного сотрудника: день → какой должна быть запись.
 *
 * Дни — по возрастанию. День без записи:
 *  - факта нет (отметки с опозданием не было) или он прощён руками;
 *  - за день есть ручное опоздание — решение руководителя за этот день
 *    сильнее автоматики, а второе опоздание за день было бы двойным штрафом;
 *  - день одобрен и по «приду к» человек пришёл вовремя.
 *
 * Повтор — если РАНЬШЕ в месяце было событие того же вида. Более ранние
 * события — ручные опоздания прошлых дней и записи системы за прошлые дни,
 * которые НЕ одобрены. Одобренное (согласованное) опоздание повтором
 * следующее не делает — так добавленное одобрение не может утяжелить другой
 * день. Ручное опоздание того же дня — тоже не «раньше»: день с ним записи
 * системы не получает вовсе.
 *
 * Ручная запись руководителя на выходе не появляется никогда: её не правят,
 * а повтор и балл она получила при записи (`discipline.record`).
 */
export function evaluateMonthLateness(input: MonthLatenessInput): ReadonlyMap<string, DesiredLateness> {
  const factByDay = new Map<string, LateCheckInFact>();
  // Факт за день один (уникальность в базе); дубль во входе — первый, как и в базе.
  for (const fact of input.facts) if (!factByDay.has(fact.day)) factByDay.set(fact.day, fact);
  const manualByDay = new Map<string, LateDisciplineKind[]>();
  for (const row of input.manualLateRows) manualByDay.set(row.day, [...(manualByDay.get(row.day) ?? []), row.kind]);

  const days = [...new Set([...factByDay.keys(), ...manualByDay.keys()])].sort();
  const earlierKinds = new Set<LateDisciplineKind>();
  const desired = new Map<string, DesiredLateness>();
  for (const day of days) {
    const fact = factByDay.get(day);
    const manualKinds = manualByDay.get(day) ?? [];
    if (fact !== undefined && !fact.forgiven && manualKinds.length === 0) {
      const arriveBy = input.approvals.get(day) ?? null;
      const row = dayLateness(fact, arriveBy, earlierKinds);
      if (row !== null) {
        desired.set(day, row);
        if (arriveBy === null) earlierKinds.add(row.kind);
      }
    }
    // Ручные опоздания дня — более ранние события для следующих дней, не для этого.
    for (const kind of manualKinds) earlierKinds.add(kind);
  }
  return desired;
}

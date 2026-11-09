import { dayOffRequests, lateRequests, shifts, userRoles, users, type DbExecutor } from '@curtain-crm/db';
import {
  clockMinutes,
  DayOffStatus,
  isoWeekdayOf,
  MANAGEMENT_ROLES,
  SHIFT_AUTO_CLOSE_AFTER_HOURS,
  SHIFT_AUTO_CLOSE_REASON,
  SHIFT_FORGOTTEN_AFTER_HOURS,
  TERMINAL_CHECKS_DAILY_TARGET,
  workshopClockTime,
  workshopDayIso,
  type Locale,
} from '@curtain-crm/shared';
import { and, eq, gt, gte, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import { sellerUserIds, terminalChecksToday } from '../routers/terminalChecks.router';

import { recordAudit } from './audit.service';
import { notifyShiftAdjusted, notifyTerminalCheckDue } from './notifications.service';
import { workshopPeriodStarts } from './periods';
import { scheduledShiftEndOn } from './shiftSchedule';
import { isTelegramGroupEnabled, sendTelegramGroupMessage } from './telegram.service';

/** Время по Ташкенту, в которое продавцам напоминают о терминальных чеках. */
export const TERMINAL_CHECK_REMINDER_TIMES: readonly string[] = ['10:00', '15:00'];
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Напоминания о терминальных чеках: в 10:00 и 15:00 по Ташкенту — всем
 * продавцам, пока цель дня не закрыта. Закрыта — молчим: напоминание должно
 * означать «ещё не сделано», а не «сейчас десять часов».
 *
 * Раньше в эти же часы напоминали об инкассации; владелец заменил —
 * наличные продавцы никуда не сдают, а чеки пробить обязаны.
 *
 * В том же ежеминутном тике — напоминания о смене в группу (см. ниже
 * `shiftReminderKind`) и закрытие забытых смен. Три части друг от друга не
 * зависят: упавший запрос забытых смен не должен глушить напоминания, и
 * наоборот, — поэтому у каждой свой перехват и своя строка в журнале.
 *
 * Слоты срабатывают с допуском (`stepSlots`): `setInterval` плывёт и может
 * перешагнуть целую минуту, а слот, ждущий точного совпадения минуты, тогда
 * молча пропал бы. Сработавший слот запоминается на день; после перезапуска
 * в пределах допуска слот может сработать повторно — это лишнее
 * напоминание, а не потеря.
 *
 * ponytail: один процесс API — отметки в памяти; при нескольких инстансах
 * перенести отметку «слот отправлен» в БД.
 */
export function startCollectionReminders(executor: DbExecutor): () => void {
  let shiftSlots: SlotState = EMPTY_SLOT_STATE;
  let checkSlots: SlotState = EMPTY_SLOT_STATE;

  const tick = async (): Promise<void> => {
    // Слоты отмечаются сразу, до первого `await`: тик, затянувшийся дольше
    // минуты, иначе пересёкся бы со следующим, и тот отправил бы слот снова.
    const now = new Date();
    const shift = stepSlots(SHIFT_REMINDER_TIMES, now, shiftSlots);
    shiftSlots = shift.state;
    const checks = stepSlots(TERMINAL_CHECK_REMINDER_TIMES, now, checkSlots);
    checkSlots = checks.state;

    await guarded('Забытые смены не закрыты', () => closeForgottenShifts(executor));

    for (const slot of shift.due) {
      const kind = shiftReminderKind(slot);
      if (kind === null) continue;
      await guarded(`Напоминание о смене (${slot}) не отправлено`, () => remindAboutShift(executor, kind, now));
    }

    if (checks.due.length > 0) {
      await guarded('Напоминание о терминальных чеках не отправлено', () => remindAboutTerminalChecks(executor));
    }
  };

  const timer = setInterval(() => {
    // Части перехвачены по отдельности; сюда долетит только сбой самого тика.
    tick().catch((error: unknown) => {
      process.stderr.write(`Тик напоминаний сломался: ${String(error)}\n`);
    });
  }, 60_000);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}

/** Одна часть тика: ошибка пишется в журнал процесса и не останавливает остальные. */
async function guarded(failure: string, part: () => Promise<void>): Promise<void> {
  try {
    await part();
  } catch (error: unknown) {
    process.stderr.write(`${failure}: ${String(error)}\n`);
  }
}

/** Терминальные чеки: напомнить продавцам, если цель дня ещё не закрыта. */
async function remindAboutTerminalChecks(executor: DbExecutor): Promise<void> {
  const count = await terminalChecksToday(executor, null);
  if (count >= TERMINAL_CHECKS_DAILY_TARGET) return;
  await notifyTerminalCheckDue(executor, await sellerUserIds(executor), {
    count,
    target: TERMINAL_CHECKS_DAILY_TARGET,
  });
}

/* -------------------------------------------------------------------------- */
/*                         Слоты по часам мастерской                          */
/* -------------------------------------------------------------------------- */

/**
 * Сколько минут после своего времени слот ещё срабатывает.
 *
 * Тик раз в минуту, но не ровно: таймер плывёт, а под нагрузкой тик может
 * опоздать и перешагнуть минуту слота целиком. Две минуты покрывают один
 * пропущенный тик с запасом; позже напоминание «откройте смену» в 09:00
 * уже не о том. Слоты разнесены минимум на пять минут, окна не пересекаются.
 */
export const SLOT_GRACE_MINUTES = 2;

/** Какие слоты уже отправлены — за один день мастерской. */
export interface SlotState {
  readonly day: string;
  readonly fired: ReadonlySet<string>;
}

export const EMPTY_SLOT_STATE: SlotState = { day: '', fired: new Set() };

/**
 * Слоты, которые пора отправить в этот тик, и новое состояние.
 *
 * Слот `ЧЧ:ММ` срабатывает на первом тике в его минуту или позже — в
 * пределах `SLOT_GRACE_MINUTES` — и один раз за день: отметка — пара «день,
 * слот», и с новым днём отметки сбрасываются. Чистая функция: таймер и
 * база живут снаружи, а правило проверяется тестом на любой
 * последовательности тиков. Слоты мастерской не ближе к полуночи, чем
 * допуск, поэтому окно не переходит через смену дня.
 */
export function stepSlots(
  slots: readonly string[],
  now: Date,
  state: SlotState,
): { readonly due: readonly string[]; readonly state: SlotState } {
  const day = workshopDayIso(now);
  const minute = clockMinutes(workshopClockTime(now));
  const fired = state.day === day ? state.fired : EMPTY_SLOT_STATE.fired;

  const due = slots.filter((slot) => {
    const lateBy = minute - clockMinutes(slot);
    return lateBy >= 0 && lateBy <= SLOT_GRACE_MINUTES && !fired.has(slot);
  });

  return { due, state: due.length === 0 && state.day === day ? state : { day, fired: new Set([...fired, ...due]) } };
}

/* -------------------------------------------------------------------------- */
/*                         Напоминания о смене в группу                       */
/* -------------------------------------------------------------------------- */

export type ShiftReminderKind = 'open' | 'close';

/**
 * Слоты напоминаний — часы мастерской, как назвал владелец (09.11).
 *
 * Утром три раза подряд — к началу дня, пока люди ещё в дороге; вечером —
 * под конец смены и последний раз в 22:00, для тех, кто ушёл, не отметив
 * уход: забытая смена портит часы и зарплату.
 */
const SHIFT_REMINDER_SLOTS: Readonly<Record<string, ShiftReminderKind>> = {
  '09:00': 'open',
  '09:10': 'open',
  '09:15': 'open',
  '17:20': 'close',
  '17:25': 'close',
  '17:30': 'close',
  '22:00': 'close',
};

/** Время слотов напоминания о смене — для `stepSlots`. */
export const SHIFT_REMINDER_TIMES: readonly string[] = Object.keys(SHIFT_REMINDER_SLOTS);

/**
 * Текст напоминания — дословно слова владельца; группа узбекоязычная
 * (как и лента, `groupFeed.service`), русский — для разработчика. Имён нет:
 * группа общая, и перечислять, кто не отметился, владелец не просил.
 */
export const SHIFT_REMINDER_TEXT: Readonly<Record<ShiftReminderKind, Readonly<Record<Locale, string>>>> = {
  open: { uz: 'Smenani yoqishni unutmang!', ru: 'Не забудьте открыть смену!' },
  close: { uz: 'Smenani yopishni unutmang!', ru: 'Не забудьте закрыть смену!' },
};

const SHIFT_REMINDER_LOCALE: Locale = 'uz';

/** Какое напоминание у слота `ЧЧ:ММ` (время по Ташкенту); `null` — такого слота нет. */
export function shiftReminderKind(workshopClock: string): ShiftReminderKind | null {
  return SHIFT_REMINDER_SLOTS[workshopClock] ?? null;
}

/**
 * Кто сегодня должен открыть смену, но ещё не открыл.
 *
 * Должен — работающий сотрудник, не руководство (директор и админ смену не
 * открывают), у которого сегодня не выходной: ни по графику
 * (`users.weekly_day_off`, ISO 1–7), ни по одобренному запросу. Согласованное
 * «приду к 10:30» тоже освобождает — пока 10:30 не наступило. Не открыл —
 * нет смены, начатой сегодня по Ташкенту, и нет открытой (ночная смена со
 * вчера — тоже «на смене»).
 *
 * Возвращает id, а не «да/нет»: смоук проверяет правило на своих людях,
 * не завися от того, кто ещё есть в базе.
 */
export async function employeesMissingShift(
  executor: DbExecutor,
  now: Date = new Date(),
): Promise<number[]> {
  const today = workshopDayIso(now);
  const clock = workshopClockTime(now);
  const { today: dayStart } = workshopPeriodStarts(now);
  const weekday = isoWeekdayOf(new Date(`${today}T00:00:00Z`));

  const rows = await executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        or(isNull(users.weeklyDayOff), ne(users.weeklyDayOff, weekday)),
        // Без ролей человеку в системе делать нечего — и смену открывать тоже.
        sql`exists (select 1 from ${userRoles} r where r.user_id = ${users.id})`,
        sql`not exists (select 1 from ${userRoles} r where r.user_id = ${users.id}
          and r.role in (${sql.join(
            MANAGEMENT_ROLES.map((role) => sql`${role}`),
            sql`, `,
          )}))`,
        sql`not exists (${executor
          .select({ one: sql`1` })
          .from(dayOffRequests)
          .where(
            and(
              eq(dayOffRequests.userId, users.id),
              eq(dayOffRequests.status, DayOffStatus.APPROVED),
              lte(dayOffRequests.startDate, today),
              gte(dayOffRequests.endDate, today),
            ),
          )})`,
        sql`not exists (${executor
          .select({ one: sql`1` })
          .from(lateRequests)
          .where(
            and(
              eq(lateRequests.userId, users.id),
              eq(lateRequests.status, DayOffStatus.APPROVED),
              eq(lateRequests.date, today),
              gt(lateRequests.arriveBy, clock),
            ),
          )})`,
        sql`not exists (${executor
          .select({ one: sql`1` })
          .from(shifts)
          .where(
            and(
              eq(shifts.userId, users.id),
              or(gte(shifts.startedAt, dayStart), isNull(shifts.endedAt)),
            ),
          )})`,
      ),
    );

  return rows.map((row) => row.id);
}

/** У кого смена ещё открыта. */
export async function employeesWithOpenShift(executor: DbExecutor): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ id: shifts.userId })
    .from(shifts)
    .where(isNull(shifts.endedAt));

  return rows.map((row) => row.id);
}

/**
 * Напоминание о смене — в группу, со звуком, и только если оно о чём-то.
 *
 * «Откройте смену», когда все уже на месте или отдыхают, и «закройте»,
 * когда открытых смен нет, — шум, который приучает группу не слушать
 * напоминания. Поэтому сперва проверка, потом сообщение.
 *
 * Со звуком (`silent: false`), как напоминание о терминальных чеках: ради
 * звука его и шлют — о смене забывают как раз те, кто не смотрит в телефон.
 */
async function remindAboutShift(executor: DbExecutor, kind: ShiftReminderKind, now: Date): Promise<void> {
  // Без группы спрашивать базу незачем: напоминание всё равно некуда слать.
  if (!isTelegramGroupEnabled()) return;

  const due =
    kind === 'open'
      ? (await employeesMissingShift(executor, now)).length > 0
      : (await employeesWithOpenShift(executor)).length > 0;
  if (!due) return;

  void sendTelegramGroupMessage(SHIFT_REMINDER_TEXT[kind][SHIFT_REMINDER_LOCALE], '', { silent: false });
}

/**
 * Забытые смены закрываются сами.
 *
 * Открытая дольше `SHIFT_FORGOTTEN_AFTER_HOURS` смена закрывается на
 * `SHIFT_AUTO_CLOSE_AFTER_HOURS` часах от начала — с пометкой «закрыта
 * автоматически» и уведомлением сотруднику. Точное время руководство
 * поправит в табеле; открытая три дня смена не поправляется никем и ломает
 * и явку, и часы, и «на смене сейчас».
 */
async function closeForgottenShifts(executor: DbExecutor): Promise<void> {
  const threshold = new Date(Date.now() - SHIFT_FORGOTTEN_AFTER_HOURS * 60 * 60 * 1000);
  const forgotten = await executor
    .select({ id: shifts.id, userId: shifts.userId, startedAt: shifts.startedAt })
    .from(shifts)
    .where(and(isNull(shifts.endedAt), lt(shifts.startedAt, threshold)));

  for (const shift of forgotten) {
    /*
      Конец — по графику, если он есть и позже начала: смена «с 09:00 до
      18:00», забытая в 09:10, закрывается в 18:00, а не в 21:10. Графика
      нет — двенадцать часов от начала.

      График — тот, что действовал в день смены (`scheduledShiftEndOn`), по
      тому же правилу, по которому этот день считает опоздание. Раньше брался
      конец действующей схемы с самой поздней датой начала: смена, забытая
      до смены графика, закрывалась по новому графику, а схема, назначенная
      с будущей даты, закрывала сегодняшнюю смену по графику, который ещё не
      начал действовать. Запрос на каждую смену — не беда: забытых смен за
      тик единицы, и закрытая из выборки уходит.
    */
    const shiftEnd = await scheduledShiftEndOn(executor, shift.userId, workshopDayIso(shift.startedAt));
    const endedAt = plannedEnd(shift.startedAt, shiftEnd) ?? new Date(shift.startedAt.getTime() + SHIFT_AUTO_CLOSE_AFTER_HOURS * 60 * 60 * 1000);
    await executor
      .update(shifts)
      .set({ endedAt, adjustedAt: new Date(), adjustmentReason: SHIFT_AUTO_CLOSE_REASON })
      .where(and(eq(shifts.id, shift.id), isNull(shifts.endedAt)));
    await recordAudit(executor, {
      actorId: shift.userId,
      action: 'shift.adjusted',
      entityType: 'shift',
      entityId: shift.id,
      details: { auto: true, reason: SHIFT_AUTO_CLOSE_REASON, endedAt: endedAt.toISOString() },
    });
    await notifyShiftAdjusted(executor, shift.userId, {
      // Не «Система»: безличное «закрыта автоматически» не требует автора.
      actorName: null,
      reason: SHIFT_AUTO_CLOSE_REASON,
      // День по Ташкенту, а не по UTC: смена, начатая до 05:00 по Ташкенту,
      // по UTC ещё вчерашняя, и заголовок назвал бы не тот день.
      shiftDate: workshopDayIso(shift.startedAt),
    });
  }
}

/** Момент «конца смены по графику» в тот же местный день, что и начало; `null`, если графика нет или он раньше начала. */
function plannedEnd(startedAt: Date, shiftEnd: string | null): Date | null {
  if (shiftEnd === null) return null;
  const [hours, minutes] = shiftEnd.split(':').map((part: string) => Number.parseInt(part, 10));
  const local = new Date(startedAt.getTime() + TASHKENT_OFFSET_MS);
  const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours ?? 0, minutes ?? 0) - TASHKENT_OFFSET_MS);
  return end.getTime() > startedAt.getTime() ? end : null;
}

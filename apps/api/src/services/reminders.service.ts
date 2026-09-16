import { shifts, type DbExecutor } from '@curtain-crm/db';
import {
  SHIFT_AUTO_CLOSE_AFTER_HOURS,
  SHIFT_AUTO_CLOSE_REASON,
  SHIFT_FORGOTTEN_AFTER_HOURS,
  TERMINAL_CHECKS_DAILY_TARGET,
} from '@curtain-crm/shared';
import { and, isNull, lt, sql } from 'drizzle-orm';

import { sellerUserIds, terminalChecksToday } from '../routers/terminalChecks.router';

import { recordAudit } from './audit.service';
import { notifyShiftAdjusted, notifyTerminalCheckDue } from './notifications.service';

/** Часы по Ташкенту, в которые продавцам напоминают о терминальных чеках. */
const REMINDER_HOURS = [10, 15] as const;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Напоминания о терминальных чеках: в 10:00 и 15:00 по Ташкенту — всем
 * продавцам, пока цель дня не закрыта. Закрыта — молчим: напоминание должно
 * означать «ещё не сделано», а не «сейчас десять часов».
 *
 * Раньше в эти же часы напоминали об инкассации; владелец заменил —
 * наличные продавцы никуда не сдают, а чеки пробить обязаны.
 *
 * Раз в минуту смотрим на часы; сработавший слот запоминаем, чтобы не
 * послать дважды. После перезапуска слот может сработать повторно в ту же
 * минуту — это лишнее напоминание, а не потеря.
 *
 * ponytail: один процесс API — таймер в памяти; при нескольких инстансах
 * перенести отметку «слот отправлен» в БД.
 */
export function startCollectionReminders(executor: DbExecutor): () => void {
  let lastSlot = '';

  const tick = async (): Promise<void> => {
    await closeForgottenShifts(executor);
    const local = new Date(Date.now() + TASHKENT_OFFSET_MS);
    const hour = local.getUTCHours();
    if (!(REMINDER_HOURS as readonly number[]).includes(hour) || local.getUTCMinutes() !== 0) return;
    const slot = `${local.toISOString().slice(0, 10)} ${hour.toString()}`;
    if (slot === lastSlot) return;
    lastSlot = slot;

    const count = await terminalChecksToday(executor, null);
    if (count >= TERMINAL_CHECKS_DAILY_TARGET) return;
    await notifyTerminalCheckDue(executor, await sellerUserIds(executor), {
      count,
      target: TERMINAL_CHECKS_DAILY_TARGET,
    });
  };

  const timer = setInterval(() => {
    tick().catch((error: unknown) => {
      process.stderr.write(`Напоминание о терминальных чеках не отправлено: ${String(error)}
`);
    });
  }, 60_000);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
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
  const closed = await executor
    .update(shifts)
    .set({
      endedAt: sql`${shifts.startedAt} + make_interval(hours => ${SHIFT_AUTO_CLOSE_AFTER_HOURS})`,
      // Не «правка руководителя»: у той обязателен автор, а здесь его нет.
      // Причина и время остаются — по ним в табеле видно, что закрыла система.
      adjustedAt: new Date(),
      adjustmentReason: SHIFT_AUTO_CLOSE_REASON,
    })
    .where(and(isNull(shifts.endedAt), lt(shifts.startedAt, threshold)))
    .returning({ id: shifts.id, userId: shifts.userId, startedAt: shifts.startedAt });

  for (const shift of closed) {
    await recordAudit(executor, {
      actorId: shift.userId,
      action: 'shift.adjusted',
      entityType: 'shift',
      entityId: shift.id,
      details: { auto: true, reason: SHIFT_AUTO_CLOSE_REASON },
    });
    await notifyShiftAdjusted(executor, shift.userId, {
      actorName: 'Система',
      reason: SHIFT_AUTO_CLOSE_REASON,
      shiftDate: shift.startedAt.toISOString().slice(0, 10),
    });
  }
}

import { type DbExecutor } from '@curtain-crm/db';
import { TERMINAL_CHECKS_DAILY_TARGET } from '@curtain-crm/shared';

import { sellerUserIds, terminalChecksToday } from '../routers/terminalChecks.router';

import { notifyTerminalCheckDue } from './notifications.service';

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

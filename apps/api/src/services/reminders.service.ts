import { type DbExecutor } from '@curtain-crm/db';
import { formatMoney } from '@curtain-crm/shared';

import { notifyCashCollectionDue } from './notifications.service';
import { cashOnHandsByUser } from './payments.service';

/** Часы по Ташкенту, в которые продавцам напоминают сдать наличные. */
const COLLECTION_HOURS = [10, 15] as const;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Напоминания об инкассации: в 10:00 и 15:00 по Ташкенту — всем, у кого
 * наличные на руках.
 *
 * Раз в минуту смотрим на часы; сработавший слот запоминаем, чтобы не
 * послать дважды, если процесс проверил ту же минуту два раза. После
 * перезапуска слот может сработать повторно в ту же минуту — это редкость
 * и лишнее напоминание, а не потеря.
 *
 * ponytail: один процесс API — таймер в памяти; при нескольких инстансах
 * перенести отметку «слот отправлен» в БД.
 */
export function startCollectionReminders(executor: DbExecutor): () => void {
  let lastSlot = '';

  const tick = async (): Promise<void> => {
    const local = new Date(Date.now() + TASHKENT_OFFSET_MS);
    const hour = local.getUTCHours();
    if (!(COLLECTION_HOURS as readonly number[]).includes(hour) || local.getUTCMinutes() !== 0) return;
    const slot = `${local.toISOString().slice(0, 10)} ${hour.toString()}`;
    if (slot === lastSlot) return;
    lastSlot = slot;

    const holders = await cashOnHandsByUser(executor);
    await notifyCashCollectionDue(
      executor,
      holders.map((row) => ({ userId: row.userId, onHands: formatMoney(row.onHands) })),
    );
  };

  const timer = setInterval(() => {
    tick().catch((error: unknown) => {
      process.stderr.write(`Напоминание об инкассации не отправлено: ${String(error)}\n`);
    });
  }, 60_000);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}

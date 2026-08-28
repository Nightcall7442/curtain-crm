import { TRPCError } from '@trpc/server';

import {
  AUTH_IP_REQUESTS_PER_MINUTE,
  LOGIN_BLOCK_MS,
  LOGIN_FAILURE_WINDOW_MS,
  LOGIN_MAX_FAILURES,
  LOGIN_THROTTLE_MAX_TRACKED,
} from '../lib/constants';

/**
 * Ограничение попыток входа.
 *
 * Стоимость scrypt (~100 мс) перебор замедляет, но не закрывает: телефоны
 * сотрудников известны внутри компании, а пароль допускается от 8 символов.
 * За ночь по одному номеру можно проверить сотни тысяч вариантов — и заодно
 * занять процессор, потому что каждая попытка стоит серверу тех же 100 мс.
 *
 * Здесь два независимых ограничителя:
 *  1. по НОМЕРУ — пять неудач подряд закрывают вход на 15 минут. Считаем по
 *     номеру, а не по учётной записи, поэтому несуществующий номер получает
 *     тот же ответ, что и существующий: иначе блокировка сама превратилась бы
 *     в способ перечислить сотрудников;
 *  2. по АДРЕСУ — общий потолок обращений к `auth.*`. Это защита не от подбора
 *     пароля (его закрывает первый), а от исчерпания процессора: без него
 *     достаточно слать логины с разными номерами.
 *
 * Состояние хранится В ПАМЯТИ ПРОЦЕССА. Осознанное ограничение: API
 * запускается одним процессом (`tsx src/index.ts`), и общего кеша в проекте
 * нет. Следствия: перезапуск сервера снимает блокировки, а при запуске
 * нескольких экземпляров каждый будет считать своё. Если экземпляров станет
 * больше одного, счётчики нужно вынести в Redis или в таблицу БД — менять
 * придётся только этот файл, вызывающие стороны знают лишь три функции.
 */

interface Bucket {
  /** Неудачи в текущем окне. */
  failures: number;
  /** Момент первой неудачи окна — по нему окно и истекает. */
  windowStartedAt: number;
  /** Момент, до которого вход закрыт. `0` — блокировки нет. */
  blockedUntil: number;
}

/** Неудачные попытки входа: ключ — нормализованный номер телефона. */
const phoneBuckets = new Map<string, Bucket>();

/** Обращения к `auth.*`: ключ — адрес клиента. */
const ipWindows = new Map<string, { count: number; windowStartedAt: number }>();

const newBucket = (now: number): Bucket => ({
  failures: 0,
  windowStartedAt: now,
  blockedUntil: 0,
});

/**
 * Убирает записи, которые уже ничего не ограничивают.
 *
 * Без уборки карта росла бы на каждый новый номер, а номера присылает
 * клиент. Чистим не по таймеру, а при переполнении: таймер держал бы процесс
 * активным и усложнял бы завершение.
 */
function pruneIfCrowded(now: number): void {
  if (phoneBuckets.size <= LOGIN_THROTTLE_MAX_TRACKED) return;

  for (const [key, bucket] of phoneBuckets) {
    const blockExpired = bucket.blockedUntil <= now;
    const windowExpired = now - bucket.windowStartedAt > LOGIN_FAILURE_WINDOW_MS;
    if (blockExpired && windowExpired) phoneBuckets.delete(key);
  }
}

/* -------------------------------------------------------------------------- */
/*                          Ограничение по номеру                             */
/* -------------------------------------------------------------------------- */

/** Секунды до снятия блокировки. `0` — вход разрешён. */
export function loginRetryAfterSeconds(phone: string, now: number = Date.now()): number {
  const bucket = phoneBuckets.get(phone);
  if (bucket === undefined || bucket.blockedUntil <= now) return 0;
  return Math.ceil((bucket.blockedUntil - now) / 1000);
}

/**
 * Отбивает попытку входа, если номер временно закрыт.
 *
 * Формулировка одинакова для существующего и несуществующего номера и не
 * говорит, сколько попыток осталось: и то и другое помогало бы перебору.
 */
export function assertLoginAllowed(phone: string, now: number = Date.now()): void {
  const seconds = loginRetryAfterSeconds(phone, now);
  if (seconds === 0) return;

  const minutes = Math.ceil(seconds / 60);
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message:
      'Слишком много неудачных попыток входа. ' +
      `Повторите через ${minutes.toString()} мин. или обратитесь к руководству`,
  });
}

/** Учитывает неудачную попытку и при необходимости закрывает вход. */
export function registerLoginFailure(phone: string, now: number = Date.now()): void {
  const existing = phoneBuckets.get(phone);
  const bucket =
    existing === undefined || now - existing.windowStartedAt > LOGIN_FAILURE_WINDOW_MS
      ? newBucket(now)
      : existing;

  bucket.failures += 1;

  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    bucket.blockedUntil = now + LOGIN_BLOCK_MS;
    // Счётчик обнуляем вместе с блокировкой: после её истечения у сотрудника
    // снова полный запас попыток, иначе одна ошибка закрывала бы вход навсегда.
    bucket.failures = 0;
    bucket.windowStartedAt = now;
  }

  phoneBuckets.set(phone, bucket);
  pruneIfCrowded(now);
}

/** Успешный вход снимает счётчик: подряд идущие неудачи — только неудачи. */
export function resetLoginAttempts(phone: string): void {
  phoneBuckets.delete(phone);
}

/* -------------------------------------------------------------------------- */
/*                          Ограничение по адресу                             */
/* -------------------------------------------------------------------------- */

/**
 * Списывает одно обращение к `auth.*` из минутного лимита адреса.
 * Возвращает секунды до сброса окна, если лимит исчерпан, иначе `0`.
 *
 * Запрос без определяемого адреса (прямое подключение без прокси-заголовков)
 * не ограничиваем: единственный ключ, который у нас был бы, — общий для всех,
 * и один клиент закрывал бы вход всей компании.
 */
export function consumeAuthRequestBudget(
  ipAddress: string | null,
  now: number = Date.now(),
): number {
  if (ipAddress === null || ipAddress.length === 0) return 0;

  const existing = ipWindows.get(ipAddress);
  const window =
    existing === undefined || now - existing.windowStartedAt >= 60_000
      ? { count: 0, windowStartedAt: now }
      : existing;

  window.count += 1;
  ipWindows.set(ipAddress, window);

  if (ipWindows.size > LOGIN_THROTTLE_MAX_TRACKED) {
    for (const [key, value] of ipWindows) {
      if (now - value.windowStartedAt >= 60_000) ipWindows.delete(key);
    }
  }

  if (window.count <= AUTH_IP_REQUESTS_PER_MINUTE) return 0;
  return Math.ceil((window.windowStartedAt + 60_000 - now) / 1000);
}

/** Сброс состояния. Нужен только тестам. */
export function resetLoginThrottle(): void {
  phoneBuckets.clear();
  ipWindows.clear();
}

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Хеширование паролей (scrypt из стандартной библиотеки Node).
 *
 * Почему здесь, а не в `apps/api`: формат значения `users.password_hash` —
 * часть контракта таблицы, и им пользуются и API (`auth.service.ts`), и сид.
 * Держать реализацию в `apps/api` означало бы либо дублировать её в сиде, либо
 * тянуть приложение в пакет БД.
 *
 * Почему scrypt, а не argon2/bcrypt: обе популярные библиотеки — нативные
 * модули со сборкой под каждую платформу, а scrypt входит в Node, устойчив к
 * атакам с параллельным перебором и не добавляет зависимостей в цепочку поставки.
 *
 * Формат: `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>`.
 * Параметры хранятся внутри значения, поэтому их можно поднять со временем,
 * не ломая уже сохранённые хеши.
 */

/**
 * Промисифицированный scrypt.
 *
 * Обёртка написана руками, а не через `promisify`: у `crypto.scrypt` несколько
 * перегрузок, и `promisify` выбирает трёхаргументную, из-за чего вариант
 * с `ScryptOptions` перестаёт типизироваться.
 */
const scrypt = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });

/** Параметры, которыми хешируются новые пароли. */
const DEFAULT_COST = 2 ** 15; // N
const DEFAULT_BLOCK_SIZE = 8; // r
const DEFAULT_PARALLELIZATION = 1; // p
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt требует ~128 * N * r байт; берём с запасом. */
const MAX_MEMORY = 256 * DEFAULT_COST * DEFAULT_BLOCK_SIZE;

const ALGORITHM_PREFIX = 'scrypt';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Хеширует пароль. */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (plainPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль короче ${MIN_PASSWORD_LENGTH.toString()} символов`);
  }
  if (plainPassword.length > MAX_PASSWORD_LENGTH) {
    // Ограничение сверху защищает от DoS: scrypt на мегабайтном «пароле»
    // занял бы процесс надолго.
    throw new Error(`Пароль длиннее ${MAX_PASSWORD_LENGTH.toString()} символов`);
  }

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plainPassword.normalize('NFKC'), salt, KEY_LENGTH, {
    N: DEFAULT_COST,
    r: DEFAULT_BLOCK_SIZE,
    p: DEFAULT_PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    ALGORITHM_PREFIX,
    DEFAULT_COST.toString(),
    DEFAULT_BLOCK_SIZE.toString(),
    DEFAULT_PARALLELIZATION.toString(),
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Проверяет пароль против сохранённого хеша.
 *
 * Никогда не бросает исключение на повреждённом хеше — возвращает `false`:
 * иначе одна битая строка в таблице превращала бы вход в 500-ю ошибку,
 * а по разнице между 401 и 500 можно было бы перечислять учётные записи.
 */
export async function verifyPassword(
  plainPassword: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;

  const [prefix, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] = parts;
  if (prefix !== ALGORITHM_PREFIX) return false;
  if (
    rawCost === undefined ||
    rawBlockSize === undefined ||
    rawParallelization === undefined ||
    rawSalt === undefined ||
    rawHash === undefined
  ) {
    return false;
  }

  const cost = Number.parseInt(rawCost, 10);
  const blockSize = Number.parseInt(rawBlockSize, 10);
  const parallelization = Number.parseInt(rawParallelization, 10);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }

  const salt = Buffer.from(rawSalt, 'base64');
  const expected = Buffer.from(rawHash, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scrypt(plainPassword.normalize('NFKC'), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: Math.max(MAX_MEMORY, 256 * cost * blockSize),
    });

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Нужно ли перехешировать пароль при следующем успешном входе
 * (например, после повышения параметров стойкости).
 */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6) return true;
  const [prefix, rawCost] = parts;
  if (prefix !== ALGORITHM_PREFIX || rawCost === undefined) return true;
  return Number.parseInt(rawCost, 10) < DEFAULT_COST;
}

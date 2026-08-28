import {
  hashPassword,
  needsRehash,
  refreshTokens,
  users,
  verifyPassword,
  type Database,
  type DbExecutor,
} from '@curtain-crm/db';
import { normalizePhone } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../lib/jwt';
import { loadAuthenticatedUser } from '../context';
import type { AuthenticatedUser } from '../types';

/**
 * Аутентификация сотрудников.
 *
 * Логин — номер телефона в любом виде; он нормализуется к E.164, поэтому
 * `+998 90 123 45 67` и `901234567` — один и тот же сотрудник.
 */

/**
 * Заведомо валидный хеш несуществующего пароля.
 *
 * Нужен, чтобы вход по несуществующему номеру занимал столько же времени,
 * сколько вход с неверным паролем. Без этого разница во времени ответа
 * позволяла бы перебором выяснить, какие номера заведены в системе.
 */
const DUMMY_PASSWORD_HASH = [
  'scrypt',
  (2 ** 15).toString(),
  '8',
  '1',
  Buffer.alloc(16).toString('base64'),
  Buffer.alloc(64).toString('base64'),
].join('$');

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}

export interface AuthResult extends AuthTokens {
  readonly user: AuthenticatedUser;
}

const invalidCredentials = (): TRPCError =>
  new TRPCError({
    code: 'UNAUTHORIZED',
    // Одна и та же формулировка для «нет такого номера» и «неверный пароль»:
    // раздельные сообщения позволяли бы перечислять учётные записи.
    message: 'Неверный номер телефона или пароль',
  });

/* -------------------------------------------------------------------------- */
/*                                   Вход                                     */
/* -------------------------------------------------------------------------- */

export interface LoginInput {
  readonly phone: string;
  readonly password: string;
  readonly userAgent?: string | null;
}

export async function login(db: Database, input: LoginInput): Promise<AuthResult> {
  const phone = normalizePhone(input.phone);
  if (phone === null) throw invalidCredentials();

  const account = await db.query.users.findFirst({
    where: eq(users.phone, phone),
    columns: { id: true, passwordHash: true, isActive: true },
  });

  const passwordMatches = await verifyPassword(
    input.password,
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (account === undefined || !passwordMatches) throw invalidCredentials();

  if (!account.isActive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Учётная запись деактивирована. Обратитесь к руководству',
    });
  }

  // Параметры стойкости могли вырасти с момента последней смены пароля —
  // перехешируем прозрачно для сотрудника.
  if (needsRehash(account.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password) })
      .where(eq(users.id, account.id));
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));

  const user = await loadAuthenticatedUser(db, account.id);
  if (user === null) throw invalidCredentials();

  const tokens = await issueTokens(db, account.id, input.userAgent ?? null);
  return { ...tokens, user };
}

/* -------------------------------------------------------------------------- */
/*                            Выпуск и обновление                             */
/* -------------------------------------------------------------------------- */

/** Выпускает пару токенов и сохраняет хеш refresh-токена. */
export async function issueTokens(
  executor: DbExecutor,
  userId: number,
  userAgent: string | null,
): Promise<AuthTokens> {
  const refresh = generateRefreshToken();

  await executor.insert(refreshTokens).values({
    userId,
    tokenHash: refresh.tokenHash,
    userAgent,
    expiresAt: refresh.expiresAt,
  });

  return {
    accessToken: await signAccessToken(userId),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

/**
 * Обновляет пару токенов по refresh-токену (с ротацией).
 *
 * Старый токен отзывается сразу. Если предъявлен УЖЕ отозванный токен —
 * это признак кражи: злоумышленник использует украденную копию после того,
 * как её обновил законный владелец (или наоборот). В таком случае гасим все
 * сессии сотрудника и требуем повторного входа.
 */
export async function refreshSession(
  db: Database,
  token: string,
  userAgent: string | null,
): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(token);

  /**
   * Результат разбора токена.
   *
   * Транзакция ВОЗВРАЩАЕТ решение, а не бросает исключение: `throw` внутри
   * `db.transaction()` откатывает всё, что успело записаться, — включая
   * отзыв сессий при обнаружении кражи. Именно так здесь и было: отзыв
   * выполнялся, ошибка бросалась, транзакция откатывалась, и украденный
   * токен оставался рабочим. В логе SQL при этом виден прошедший `UPDATE`,
   * поэтому по логу дефект незаметен — его ловит только проверка того,
   * что сессии действительно мертвы (`smoke.ts`).
   */
  type Outcome =
    | { readonly kind: 'ok'; readonly tokens: AuthTokens; readonly user: AuthenticatedUser }
    | { readonly kind: 'unknown' }
    | { readonly kind: 'expired' }
    | { readonly kind: 'reused'; readonly userId: number }
    | { readonly kind: 'inactive' };

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const stored = await tx.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    if (stored === undefined) return { kind: 'unknown' };

    // Предъявлен уже отозванный токен — признак кражи. Сам отзыв делаем
    // ПОСЛЕ выхода из транзакции, иначе он не переживёт отказа.
    if (stored.revokedAt !== null) return { kind: 'reused', userId: stored.userId };

    if (stored.expiresAt.getTime() <= Date.now()) return { kind: 'expired' };

    const user = await loadAuthenticatedUser(tx, stored.userId);
    if (user === null) return { kind: 'inactive' };

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    const tokens = await issueTokens(tx, stored.userId, userAgent);
    return { kind: 'ok', tokens, user };
  });

  const sessionExpired = (): TRPCError =>
    new TRPCError({ code: 'UNAUTHORIZED', message: 'Сессия истекла, войдите заново' });

  switch (outcome.kind) {
    case 'ok':
      return { ...outcome.tokens, user: outcome.user };

    case 'reused':
      // Отдельной транзакцией: она должна зафиксироваться независимо
      // от того, что дальше мы отказываем в доступе.
      await revokeAllSessions(db, outcome.userId);
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Сессия недействительна. Все устройства отключены, войдите заново',
      });

    case 'inactive':
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Учётная запись деактивирована. Обратитесь к руководству',
      });

    case 'unknown':
    case 'expired':
      throw sessionExpired();
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Выход                                    */
/* -------------------------------------------------------------------------- */

/** Завершает одну сессию. Неизвестный токен не считается ошибкой. */
export async function logout(executor: DbExecutor, token: string): Promise<void> {
  await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.tokenHash, hashRefreshToken(token)), isNull(refreshTokens.revokedAt)),
    );
}

/** Завершает все сессии сотрудника: при увольнении, смене пароля, краже токена. */
export async function revokeAllSessions(executor: DbExecutor, userId: number): Promise<void> {
  await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/**
 * Удаляет просроченные токены и давно отозванные.
 *
 * Отозванные держим ещё какое-то время намеренно: именно по ним работает
 * определение кражи токена в `refreshSession()`. Удалив их сразу, мы потеряли
 * бы разницу между «токен украден и переиспользован» и «токена никогда не было».
 */
export async function purgeStaleSessions(
  executor: DbExecutor,
  revokedRetentionDays = 30,
): Promise<void> {
  const revokedCutoff = new Date(Date.now() - revokedRetentionDays * 24 * 60 * 60 * 1000);

  await executor
    .delete(refreshTokens)
    .where(
      or(
        lt(refreshTokens.expiresAt, new Date()),
        lt(refreshTokens.revokedAt, revokedCutoff),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*                               Смена пароля                                 */
/* -------------------------------------------------------------------------- */

/**
 * Смена собственного пароля.
 *
 * После смены все прочие сессии завершаются: если пароль меняют из-за
 * подозрения на компрометацию, оставлять чужие refresh-токены живыми нельзя.
 */
export async function changeOwnPassword(
  db: Database,
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const account = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { passwordHash: true },
  });

  if (account === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
  }

  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Текущий пароль указан неверно' });
  }

  if (await verifyPassword(newPassword, account.passwordHash)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Новый пароль совпадает с текущим',
    });
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await revokeAllSessions(tx, userId);
  });
}

/**
 * Сброс пароля сотруднику директором.
 * Отдельная функция: текущий пароль здесь не требуется и не должен требоваться.
 */
export async function resetPasswordByManager(
  executor: DbExecutor,
  userId: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await executor.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await revokeAllSessions(executor, userId);
}

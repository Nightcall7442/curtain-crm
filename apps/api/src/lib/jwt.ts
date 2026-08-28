import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

import { getEnv } from './constants';

/**
 * Выпуск и проверка токенов.
 *
 * Access-токен намеренно НЕ содержит ролей — только идентификатор сотрудника.
 * Роли читаются из БД на каждый запрос (`context.ts`). Это стоит одного
 * запроса, но даёт главное: когда CEO отзывает роль, отзыв действует
 * немедленно, а не через 15 минут, когда истечёт токен с зашитыми правами.
 *
 * Refresh-токен — случайные 32 байта; в БД лежит только его SHA-256.
 * Утечка дампа `refresh_tokens` не позволяет войти.
 */

const ISSUER = 'curtain-crm';
const AUDIENCE = 'curtain-crm-clients';
const ALGORITHM = 'HS256';

const REFRESH_TOKEN_BYTES = 32;

/** Полезная нагрузка access-токена. */
const accessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
});

export interface AccessTokenClaims {
  readonly userId: number;
}

let cachedSecret: Uint8Array | null = null;

const getSecret = (): Uint8Array => {
  cachedSecret ??= new TextEncoder().encode(getEnv().JWT_SECRET);
  return cachedSecret;
};

/** Выпускает access-токен для сотрудника. */
export async function signAccessToken(userId: number): Promise<string> {
  const { ACCESS_TOKEN_TTL_MINUTES } = getEnv();

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId.toString())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_MINUTES.toString()}m`)
    .sign(getSecret());
}

/**
 * Проверяет access-токен.
 *
 * Возвращает `null` на любой некорректный токен — истёкший, с чужой подписью,
 * с нечисловым `sub`. Причину наружу не отдаём: клиенту в любом случае нужен
 * один и тот же ответ `UNAUTHORIZED`, а детали помогли бы подбирать токены.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    const parsed = accessTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;

    const userId = Number.parseInt(parsed.data.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    return { userId };
  } catch {
    return null;
  }
}

export interface GeneratedRefreshToken {
  /** Отдаётся клиенту и больше нигде не хранится. */
  readonly token: string;
  /** Сохраняется в `refresh_tokens.token_hash`. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Создаёт новый refresh-токен. */
export function generateRefreshToken(): GeneratedRefreshToken {
  const { REFRESH_TOKEN_TTL_DAYS } = getEnv();

  const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  return { token, tokenHash: hashRefreshToken(token), expiresAt };
}

/**
 * Хеш refresh-токена для поиска в БД.
 *
 * SHA-256 без соли — здесь этого достаточно и это обязательно: токен ищется
 * по индексу, а токен уже является 256 битами энтропии, поэтому перебор
 * по хешу бессмыслен и медленный KDF не нужен.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Извлекает токен из заголовка `Authorization: Bearer <token>`. */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (authorizationHeader === undefined) return null;

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  if (token === undefined || token.length === 0) return null;

  return token;
}

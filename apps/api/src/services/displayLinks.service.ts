import { createHash, randomBytes } from 'node:crypto';

import { branches, displayLinks, type DbExecutor } from '@curtain-crm/db';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Ссылки для ТВ: токен, его хеш и поиск активной ссылки.
 *
 * Токен — 32 случайных байта: подобрать его перебором нельзя, поэтому
 * ограничитель частоты на `display.*` защищает процессор, а не секрет.
 * В базе хранится только SHA-256 — по нему ищется ссылка, и сравнение
 * хешей в индексе не выдаёт по времени, сколько символов совпало.
 */
export function generateDisplayToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDisplayToken(token) };
}

export function hashDisplayToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type DisplayLinkRow = typeof displayLinks.$inferSelect & {
  readonly branchName: string | null;
};

/** Неотозванная ссылка по токену; `null` — нет такой или она отозвана. */
export async function findActiveDisplayLink(
  executor: DbExecutor,
  token: string,
): Promise<DisplayLinkRow | null> {
  const [row] = await executor
    .select({ link: displayLinks, branchName: branches.name })
    .from(displayLinks)
    .leftJoin(branches, eq(branches.id, displayLinks.branchId))
    .where(and(eq(displayLinks.tokenHash, hashDisplayToken(token)), isNull(displayLinks.revokedAt)))
    .limit(1);

  return row === undefined ? null : { ...row.link, branchName: row.branchName };
}

/** Раз в 20 секунд писать в базу незачем: «был на связи» с точностью до минуты. */
const SEEN_WRITE_INTERVAL_MS = 60_000;

export async function touchDisplayLinkSeen(
  executor: DbExecutor,
  link: Pick<DisplayLinkRow, 'id' | 'lastSeenAt'>,
  now: Date,
): Promise<void> {
  if (link.lastSeenAt !== null && now.getTime() - link.lastSeenAt.getTime() < SEEN_WRITE_INTERVAL_MS) {
    return;
  }
  await executor.update(displayLinks).set({ lastSeenAt: now }).where(eq(displayLinks.id, link.id));
}

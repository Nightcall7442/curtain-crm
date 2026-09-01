// Клиентская база: постоянные клиенты и их персональные скидки.
// Скидка клиента фиксируется в сеансе при открытии стола.

import { utcNow } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

const CLIENT_FIELDS = `
  c.id, c.name, c.phone, c.discount_percent, c.note, c.created_at,
  (SELECT COUNT(*) FROM table_sessions s
    WHERE s.client_id = c.id AND s.ended_at IS NOT NULL) AS visits
`;

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{query?: string, limit?: number}} [options]
 */
export function listClients(db, { query = "", limit = 200 } = {}) {
  const q = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT ${CLIENT_FIELDS} FROM clients c
       WHERE c.name LIKE ? OR COALESCE(c.phone, '') LIKE ?
       ORDER BY c.name LIMIT ?`
    )
    .all(q, q, limit);
}

export function getClient(db, clientId) {
  const client = db
    .prepare(`SELECT ${CLIENT_FIELDS} FROM clients c WHERE c.id = ?`)
    .get(clientId);
  if (!client) throw new NotFoundError(`Клиент id=${clientId} не найден`);
  return client;
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{name: string, phone?: string, note?: string}} data
 * @param {{name: string}} author
 */
export function createClient(db, data, author) {
  const name = String(data.name ?? "").trim();
  if (!name) throw new ConflictError("Имя клиента не может быть пустым");
  const phone = String(data.phone ?? "").trim() || null;
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO clients (name, phone, discount_percent, note, created_at) VALUES (?, ?, 0, ?, ?)"
    )
    .run(name, phone, String(data.note ?? "").trim() || null, utcNow());
  logEvent(
    db,
    JournalEvent.CLIENT_CREATED,
    `Добавлен клиент «${name}» — ${author.name}`
  );
  return getClient(db, Number(lastInsertRowid));
}

/**
 * Обновление клиента (в т.ч. скидки — только администратором на уровне API).
 * @param {import("node:sqlite").DatabaseSync} db
 */
export function updateClient(db, clientId, patch) {
  const client = getClient(db, clientId);
  const next = {
    name: client.name,
    phone: client.phone,
    discount_percent: client.discount_percent,
    note: client.note,
  };
  if ("name" in patch) {
    next.name = String(patch.name ?? "").trim();
    if (!next.name) throw new ConflictError("Имя клиента не может быть пустым");
  }
  if ("phone" in patch) next.phone = String(patch.phone ?? "").trim() || null;
  if ("note" in patch) next.note = String(patch.note ?? "").trim() || null;
  if ("discount_percent" in patch) {
    const d = Number(patch.discount_percent);
    if (!Number.isInteger(d) || d < 0 || d > 100) {
      throw new ConflictError("Скидка должна быть целым числом 0–100");
    }
    next.discount_percent = d;
  }
  db.prepare(
    "UPDATE clients SET name = ?, phone = ?, discount_percent = ?, note = ? WHERE id = ?"
  ).run(next.name, next.phone, next.discount_percent, next.note, client.id);
  return getClient(db, client.id);
}

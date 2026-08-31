// Операции со столами.

import { utcNow } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

/** @param {import("better-sqlite3").Database} db */
export function listTables(db) {
  return db
    .prepare("SELECT id, name, status, created_at FROM tables ORDER BY id")
    .all();
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tableId
 */
export function getTable(db, tableId) {
  const table = db
    .prepare("SELECT id, name, status, created_at FROM tables WHERE id = ?")
    .get(tableId);
  if (!table) {
    throw new NotFoundError(`Стол id=${tableId} не найден`);
  }
  return table;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} name
 */
export function createTable(db, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new ConflictError("Название стола не может быть пустым");
  }
  const exists = db.prepare("SELECT id FROM tables WHERE name = ?").get(trimmed);
  if (exists) {
    throw new ConflictError(`Стол с названием «${trimmed}» уже существует`);
  }
  const create = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO tables (name, status, created_at) VALUES (?, 'free', ?)")
      .run(trimmed, utcNow());
    const id = Number(lastInsertRowid);
    logEvent(db, JournalEvent.TABLE_CREATED, `Создан стол «${trimmed}»`, {
      tableId: id,
    });
    return id;
  });
  return getTable(db, create());
}

// Операции со столами.

import { utcNow, withTransaction } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

/** @param {import("node:sqlite").DatabaseSync} db */
export function listTables(db) {
  return db
    .prepare("SELECT id, name, status, created_at FROM tables ORDER BY id")
    .all();
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
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
 * @param {import("node:sqlite").DatabaseSync} db
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
  const id = withTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO tables (name, status, created_at) VALUES (?, 'free', ?)")
      .run(trimmed, utcNow());
    const tableId = Number(lastInsertRowid);
    logEvent(db, JournalEvent.TABLE_CREATED, `Создан стол «${trimmed}»`, {
      tableId,
    });
    return tableId;
  });
  return getTable(db, id);
}

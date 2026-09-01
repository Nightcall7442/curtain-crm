// Операции со столами.

import { utcNow, withTransaction } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

const TABLE_FIELDS =
  "id, name, status, created_at, tuya_device_id, tuya_switch_code, " +
  "pos_x, pos_y, size_w, size_h";

/** @param {import("node:sqlite").DatabaseSync} db */
export function listTables(db) {
  return db.prepare(`SELECT ${TABLE_FIELDS} FROM tables ORDER BY id`).all();
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 */
export function getTable(db, tableId) {
  const table = db
    .prepare(`SELECT ${TABLE_FIELDS} FROM tables WHERE id = ?`)
    .get(tableId);
  if (!table) {
    throw new NotFoundError(`Стол id=${tableId} не найден`);
  }
  return table;
}

/**
 * Позиция и размер стола на плане зала (в клетках сетки).
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 * @param {{x: number, y: number, w: number, h: number}} layout
 */
export function setTableLayout(db, tableId, layout) {
  const table = getTable(db, tableId);
  const { x, y, w, h } = layout;
  for (const value of [x, y, w, h]) {
    if (!Number.isInteger(value)) {
      throw new ConflictError("Координаты стола должны быть целыми числами");
    }
  }
  if (x < 0 || y < 0 || x > 500 || y > 500) {
    throw new ConflictError("Позиция стола вне допустимых пределов");
  }
  if (w < 2 || h < 1 || w > 16 || h > 12) {
    throw new ConflictError("Размер стола: от 2×1 до 16×12 клеток");
  }
  db.prepare(
    "UPDATE tables SET pos_x = ?, pos_y = ?, size_w = ?, size_h = ? WHERE id = ?"
  ).run(x, y, w, h, table.id);
  return getTable(db, table.id);
}

/**
 * Привязывает стол к реле Tuya/MOES (или отвязывает, если deviceId пуст).
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 * @param {string | null} deviceId
 * @param {string | null} switchCode канал реле (switch_1 … switch_4)
 */
export function setTableDevice(db, tableId, deviceId, switchCode) {
  const table = getTable(db, tableId);
  const device = String(deviceId ?? "").trim() || null;
  const code = String(switchCode ?? "").trim() || null;
  if (code !== null && !/^switch_[1-4]$/.test(code)) {
    throw new ConflictError(`Недопустимый канал реле «${code}» (switch_1 … switch_4)`);
  }
  db.prepare(
    "UPDATE tables SET tuya_device_id = ?, tuya_switch_code = ? WHERE id = ?"
  ).run(device, device ? code : null, table.id);
  return getTable(db, table.id);
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

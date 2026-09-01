// Подключение к SQLite через встроенный модуль node:sqlite (Node 22.13+):
// никаких нативных зависимостей и компиляции при npm install.
// Единственная точка создания базы и схемы: остальной код получает
// готовый объект db и не знает о деталях подключения.

import { DatabaseSync } from "node:sqlite";

import { DATABASE_PATH } from "./config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tables (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'busy')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariffs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  price_per_hour INTEGER NOT NULL CHECK (price_per_hour > 0),
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id                INTEGER NOT NULL REFERENCES tables (id) ON DELETE RESTRICT,
  tariff_id               INTEGER NOT NULL REFERENCES tariffs (id) ON DELETE RESTRICT,
  price_per_hour_snapshot INTEGER NOT NULL,
  started_at              TEXT NOT NULL,
  ended_at                TEXT,
  total_cost_kopecks      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_table ON table_sessions (table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON table_sessions (table_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS journal_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event      TEXT NOT NULL,
  message    TEXT NOT NULL,
  table_id   INTEGER REFERENCES tables (id) ON DELETE SET NULL,
  session_id INTEGER REFERENCES table_sessions (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_entries (created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  opened_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shifts_open ON shifts (user_id) WHERE closed_at IS NULL;
`;

/** Добавляет колонку в существующую базу, если её ещё нет (миграция). */
function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Открывает базу и создаёт недостающие таблицы.
 * @param {string} [filePath] путь к файлу БД (в тестах — ":memory:")
 * @returns {DatabaseSync}
 */
export function createDatabase(filePath = DATABASE_PATH) {
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  // Привязка стола к реле Tuya/MOES (настраивается во вкладке «Настройки»).
  ensureColumn(db, "tables", "tuya_device_id", "tuya_device_id TEXT");
  ensureColumn(db, "tables", "tuya_switch_code", "tuya_switch_code TEXT");
  // Кто и в какую кассовую смену открыл/закрыл сеанс.
  ensureColumn(db, "table_sessions", "opened_by", "opened_by INTEGER REFERENCES users (id)");
  ensureColumn(db, "table_sessions", "closed_by", "closed_by INTEGER REFERENCES users (id)");
  ensureColumn(db, "table_sessions", "shift_id", "shift_id INTEGER REFERENCES shifts (id)");
  ensureColumn(db, "table_sessions", "close_shift_id", "close_shift_id INTEGER REFERENCES shifts (id)");
  return db;
}

/**
 * Выполняет fn внутри транзакции: всё или ничего.
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
export function withTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Текущее время в UTC в формате ISO-8601 (так оно хранится в базе). */
export function utcNow() {
  return new Date().toISOString();
}

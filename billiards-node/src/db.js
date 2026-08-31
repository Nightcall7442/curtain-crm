// Подключение к SQLite (better-sqlite3, синхронный API).
// Единственная точка создания базы и схемы: остальной код получает
// готовый объект db и не знает о деталях подключения.

import Database from "better-sqlite3";

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
`;

/**
 * Открывает базу и создаёт недостающие таблицы.
 * @param {string} [filePath] путь к файлу БД (в тестах — своя база)
 * @returns {Database.Database}
 */
export function createDatabase(filePath = DATABASE_PATH) {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Текущее время в UTC в формате ISO-8601 (так оно хранится в базе). */
export function utcNow() {
  return new Date().toISOString();
}

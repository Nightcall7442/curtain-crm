// Кассовые смены. Кассир открывает смену, работает, закрывает — к смене
// привязывается выручка всех сеансов, закрытых во время неё этим
// сотрудником. Администратор видит все смены, кассир — только свои.

import { utcNow } from "../db.js";
import { kopecksToRubles } from "./billing.js";
import { ConflictError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

const SHIFT_TOTALS = `
  (SELECT COUNT(*) FROM table_sessions ts WHERE ts.close_shift_id = sh.id)
    AS sessions_count,
  (SELECT COALESCE(SUM(ts.total_cost_kopecks), 0) FROM table_sessions ts
    WHERE ts.close_shift_id = sh.id) AS revenue_kopecks
`;

function toShiftOut(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    opened_at: row.opened_at,
    closed_at: row.closed_at ?? null,
    sessions_count: row.sessions_count,
    revenue: kopecksToRubles(row.revenue_kopecks),
  };
}

function getShiftRow(db, shiftId) {
  return db
    .prepare(
      `SELECT sh.*, u.name AS user_name, ${SHIFT_TOTALS}
       FROM shifts sh JOIN users u ON u.id = sh.user_id WHERE sh.id = ?`
    )
    .get(shiftId);
}

/**
 * Открытая смена сотрудника (строка БД) или undefined.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} userId
 */
export function getOpenShift(db, userId) {
  return db
    .prepare("SELECT * FROM shifts WHERE user_id = ? AND closed_at IS NULL")
    .get(userId);
}

/** Открытая смена сотрудника с итогами (для интерфейса) или null. */
export function currentShift(db, userId) {
  const open = getOpenShift(db, userId);
  return open ? toShiftOut(getShiftRow(db, open.id)) : null;
}

/**
 * Открывает кассовую смену.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{id: number, name: string}} user
 */
export function openShift(db, user) {
  if (getOpenShift(db, user.id)) {
    throw new ConflictError("У вас уже есть открытая смена");
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO shifts (user_id, opened_at) VALUES (?, ?)")
    .run(user.id, utcNow());
  const shiftId = Number(lastInsertRowid);
  logEvent(db, JournalEvent.SHIFT_OPENED, `Открыта кассовая смена — ${user.name}`);
  return toShiftOut(getShiftRow(db, shiftId));
}

/**
 * Закрывает кассовую смену, возвращает итоги (сеансы, выручка).
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{id: number, name: string}} user
 */
export function closeShift(db, user) {
  const open = getOpenShift(db, user.id);
  if (!open) {
    throw new ConflictError("Открытой смены нет — закрывать нечего");
  }
  db.prepare("UPDATE shifts SET closed_at = ? WHERE id = ?").run(utcNow(), open.id);
  const shift = toShiftOut(getShiftRow(db, open.id));
  logEvent(
    db,
    JournalEvent.SHIFT_CLOSED,
    `Закрыта кассовая смена — ${user.name}: сеансов ${shift.sessions_count}, ` +
      `выручка ${shift.revenue.toFixed(2)} ₽`
  );
  return shift;
}

/**
 * Список смен, новые сверху. userId ограничивает выборку одним сотрудником
 * (для кассира); для администратора — все.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{userId?: number, limit?: number}} [options]
 */
export function listShifts(db, { userId, limit = 100 } = {}) {
  const where = userId ? "WHERE sh.user_id = ?" : "";
  const params = userId ? [userId, limit] : [limit];
  return db
    .prepare(
      `SELECT sh.*, u.name AS user_name, ${SHIFT_TOTALS}
       FROM shifts sh JOIN users u ON u.id = sh.user_id
       ${where}
       ORDER BY sh.opened_at DESC, sh.id DESC LIMIT ?`
    )
    .all(...params)
    .map(toShiftOut);
}

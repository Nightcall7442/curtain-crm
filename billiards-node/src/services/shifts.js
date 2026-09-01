// Кассовые смены с пересдачей кассы. Кассир открывает смену (указав
// наличные в кассе на начало), работает, закрывает (указав фактические
// наличные) — система считает расчётные наличные и расхождение.
// Выручка сеанса привязывается к смене того, кто его закрыл.

import { utcNow } from "../db.js";
import { kopecksToRubles, rublesToKopecks } from "./billing.js";
import { ConflictError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

const SHIFT_TOTALS = `
  (SELECT COUNT(*) FROM table_sessions ts WHERE ts.close_shift_id = sh.id)
    AS sessions_count,
  (SELECT COALESCE(SUM(ts.total_cost_kopecks), 0) FROM table_sessions ts
    WHERE ts.close_shift_id = sh.id) AS revenue_kopecks,
  (SELECT COALESCE(SUM(ts.total_cost_kopecks), 0) FROM table_sessions ts
    WHERE ts.close_shift_id = sh.id AND ts.payment_method = 'cash')
    AS cash_kopecks,
  (SELECT COALESCE(SUM(ts.total_cost_kopecks), 0) FROM table_sessions ts
    WHERE ts.close_shift_id = sh.id AND ts.payment_method = 'card')
    AS card_kopecks,
  (SELECT COALESCE(SUM(ts.total_cost_kopecks), 0) FROM table_sessions ts
    WHERE ts.close_shift_id = sh.id AND ts.payment_method = 'transfer')
    AS transfer_kopecks
`;

function toShiftOut(row) {
  const openingCash =
    row.opening_cash_kopecks === null ? null : kopecksToRubles(row.opening_cash_kopecks);
  const closingCash =
    row.closing_cash_kopecks === null ? null : kopecksToRubles(row.closing_cash_kopecks);
  // Расчётные наличные в кассе: остаток на начало + наличная выручка.
  const expectedCash =
    openingCash === null
      ? null
      : kopecksToRubles(row.opening_cash_kopecks + row.cash_kopecks);
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    opened_at: row.opened_at,
    closed_at: row.closed_at ?? null,
    sessions_count: row.sessions_count,
    revenue: kopecksToRubles(row.revenue_kopecks),
    cash: kopecksToRubles(row.cash_kopecks),
    card: kopecksToRubles(row.card_kopecks),
    transfer: kopecksToRubles(row.transfer_kopecks),
    opening_cash: openingCash,
    closing_cash: closingCash,
    expected_cash: expectedCash,
    // Расхождение: сдано минус расчёт (минус — недостача).
    cash_discrepancy:
      expectedCash === null || closingCash === null
        ? null
        : Math.round((closingCash - expectedCash) * 100) / 100,
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
 * @param {{openingCash?: number | null}} [options] наличные в кассе на
 *   начало смены, рублей (null — не указано)
 */
export function openShift(db, user, { openingCash = null } = {}) {
  if (getOpenShift(db, user.id)) {
    throw new ConflictError("У вас уже есть открытая смена");
  }
  const openingKopecks = openingCash === null ? null : rublesToKopecks(openingCash);
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO shifts (user_id, opened_at, opening_cash_kopecks) VALUES (?, ?, ?)"
    )
    .run(user.id, utcNow(), openingKopecks);
  logEvent(
    db,
    JournalEvent.SHIFT_OPENED,
    `Открыта кассовая смена — ${user.name}` +
      (openingKopecks !== null
        ? `, в кассе ${kopecksToRubles(openingKopecks).toFixed(2)} ₽`
        : "")
  );
  return toShiftOut(getShiftRow(db, Number(lastInsertRowid)));
}

/**
 * Закрывает кассовую смену, возвращает итоги и расхождение по наличным.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{id: number, name: string}} user
 * @param {{closingCash?: number | null}} [options] фактические наличные
 *   в кассе при закрытии, рублей
 */
export function closeShift(db, user, { closingCash = null } = {}) {
  const open = getOpenShift(db, user.id);
  if (!open) {
    throw new ConflictError("Открытой смены нет — закрывать нечего");
  }
  const closingKopecks = closingCash === null ? null : rublesToKopecks(closingCash);
  db.prepare(
    "UPDATE shifts SET closed_at = ?, closing_cash_kopecks = ? WHERE id = ?"
  ).run(utcNow(), closingKopecks, open.id);
  const shift = toShiftOut(getShiftRow(db, open.id));
  let message =
    `Закрыта кассовая смена — ${user.name}: сеансов ${shift.sessions_count}, ` +
    `выручка ${shift.revenue.toFixed(2)} ₽`;
  if (shift.cash_discrepancy !== null) {
    message +=
      shift.cash_discrepancy === 0
        ? ", касса сошлась"
        : `, расхождение по кассе ${shift.cash_discrepancy.toFixed(2)} ₽`;
  }
  logEvent(db, JournalEvent.SHIFT_CLOSED, message);
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

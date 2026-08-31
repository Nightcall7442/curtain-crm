// Открытие и закрытие сеансов — ядро бизнес-логики клуба.
//
// Правила:
// - открыть сеанс можно только на свободном столе;
// - закрыть сеанс можно только на занятом столе (с открытым сеансом);
// - цена фиксируется на момент открытия (снимок тарифа);
// - при открытии включается свет над столом, при закрытии — выключается;
// - каждое действие фиксируется в журнале.

import { utcNow, withTransaction } from "../db.js";
import { kopecksToRubles, sessionCostKopecks } from "./billing.js";
import { ConflictError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";
import { getLightingController } from "./lighting.js";
import { getTable } from "./tables.js";
import { getTariff } from "./tariffs.js";

const SESSION_FIELDS = `
  s.id, s.table_id, s.tariff_id, s.price_per_hour_snapshot,
  s.started_at, s.ended_at, s.total_cost_kopecks,
  t.name AS table_name, tr.name AS tariff_name
`;

const SESSION_JOIN = `
  FROM table_sessions s
  JOIN tables t ON t.id = s.table_id
  JOIN tariffs tr ON tr.id = s.tariff_id
`;

/**
 * Открытый сеанс стола, если есть.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 */
export function getOpenSession(db, tableId) {
  return db
    .prepare(
      `SELECT ${SESSION_FIELDS} ${SESSION_JOIN}
       WHERE s.table_id = ? AND s.ended_at IS NULL`
    )
    .get(tableId);
}

function getSession(db, sessionId) {
  return db
    .prepare(`SELECT ${SESSION_FIELDS} ${SESSION_JOIN} WHERE s.id = ?`)
    .get(sessionId);
}

/**
 * Открывает сеанс: стол занят, свет включён, событие в журнале.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 * @param {number} tariffId
 */
export function openSession(db, tableId, tariffId) {
  const table = getTable(db, tableId);
  const tariff = getTariff(db, tariffId);
  if (!tariff.is_active) {
    throw new ConflictError(`Тариф «${tariff.name}» отключён`);
  }
  if (table.status !== "free" || getOpenSession(db, table.id)) {
    throw new ConflictError(`Стол «${table.name}» уже занят`);
  }

  const sessionId = withTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO table_sessions
           (table_id, tariff_id, price_per_hour_snapshot, started_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(table.id, tariff.id, tariff.price_per_hour, utcNow());
    const newSessionId = Number(lastInsertRowid);
    db.prepare("UPDATE tables SET status = 'busy' WHERE id = ?").run(table.id);
    logEvent(
      db,
      JournalEvent.SESSION_OPENED,
      `Открыт сеанс на столе «${table.name}», тариф «${tariff.name}» ` +
        `(${tariff.price_per_hour} ₽/час)`,
      { tableId: table.id, sessionId: newSessionId }
    );
    logEvent(db, JournalEvent.LIGHT_ON, `Включён свет над столом «${table.name}»`, {
      tableId: table.id,
      sessionId: newSessionId,
    });
    return newSessionId;
  });

  getLightingController().turnLightOn(table.id);
  return getSession(db, sessionId);
}

/**
 * Закрывает сеанс: считает стоимость, освобождает стол, гасит свет.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 */
export function closeSession(db, tableId) {
  const table = getTable(db, tableId);
  const session = getOpenSession(db, table.id);
  if (!session) {
    throw new ConflictError(`Стол «${table.name}» свободен — закрывать нечего`);
  }

  const endedAt = utcNow();
  const totalKopecks = sessionCostKopecks(
    session.price_per_hour_snapshot,
    session.started_at,
    endedAt
  );

  withTransaction(db, () => {
    db.prepare(
      "UPDATE table_sessions SET ended_at = ?, total_cost_kopecks = ? WHERE id = ?"
    ).run(endedAt, totalKopecks, session.id);
    db.prepare("UPDATE tables SET status = 'free' WHERE id = ?").run(table.id);
    logEvent(
      db,
      JournalEvent.SESSION_CLOSED,
      `Закрыт сеанс на столе «${table.name}», итог ` +
        `${kopecksToRubles(totalKopecks).toFixed(2)} ₽`,
      { tableId: table.id, sessionId: session.id }
    );
    logEvent(db, JournalEvent.LIGHT_OFF, `Выключен свет над столом «${table.name}»`, {
      tableId: table.id,
      sessionId: session.id,
    });
  });

  getLightingController().turnLightOff(table.id);
  return getSession(db, session.id);
}

/**
 * Текущая стоимость сеанса в копейках: для открытого — по времени «сейчас».
 * @param {object} session строка table_sessions
 */
export function currentCostKopecks(session) {
  if (session.total_cost_kopecks !== null && session.total_cost_kopecks !== undefined) {
    return session.total_cost_kopecks;
  }
  return sessionCostKopecks(
    session.price_per_hour_snapshot,
    session.started_at,
    utcNow()
  );
}

/**
 * Закрытые сеансы, новые сверху.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} [limit]
 */
export function listHistory(db, limit = 100) {
  return db
    .prepare(
      `SELECT ${SESSION_FIELDS} ${SESSION_JOIN}
       WHERE s.ended_at IS NOT NULL
       ORDER BY s.ended_at DESC LIMIT ?`
    )
    .all(limit);
}

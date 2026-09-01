// Открытие и закрытие сеансов — ядро бизнес-логики клуба.
//
// Правила:
// - открыть сеанс можно только на свободном столе;
// - закрыть сеанс можно только на занятом столе (с открытым сеансом);
// - цена фиксируется на момент открытия (снимок тарифа);
// - при открытии включается свет над столом, при закрытии — выключается;
// - каждое действие фиксируется в журнале.

import { utcNow, withTransaction } from "../db.js";
import {
  applyDiscount,
  costKopecks,
  kopecksToRubles,
  roundToStep,
} from "./billing.js";
import { getClient } from "./clients.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";
import { getLightingController } from "./lighting.js";
import { getClubSettings } from "./settings.js";
import { getOpenShift } from "./shifts.js";
import { getTable } from "./tables.js";
import { getTariff } from "./tariffs.js";

export const PAYMENT_METHODS = ["cash", "card", "transfer"];

const SESSION_FIELDS = `
  s.id, s.table_id, s.tariff_id, s.price_per_hour_snapshot,
  s.started_at, s.ended_at, s.total_cost_kopecks,
  s.payment_method, s.client_id, s.discount_percent,
  s.time_cost_kopecks, s.bar_cost_kopecks,
  s.prepaid_seconds, s.prepaid_kopecks,
  t.name AS table_name, tr.name AS tariff_name,
  uo.name AS opened_by_name, uc.name AS closed_by_name,
  cl.name AS client_name
`;

const SESSION_JOIN = `
  FROM table_sessions s
  JOIN tables t ON t.id = s.table_id
  JOIN tariffs tr ON tr.id = s.tariff_id
  LEFT JOIN users uo ON uo.id = s.opened_by
  LEFT JOIN users uc ON uc.id = s.closed_by
  LEFT JOIN clients cl ON cl.id = s.client_id
`;

/** Сумма бара по сеансу, в копейках (локально — во избежание циклов импортов). */
function barTotalKopecks(db, sessionId) {
  return db
    .prepare(
      "SELECT COALESCE(SUM(price_kopecks * quantity), 0) AS total FROM session_orders WHERE session_id = ?"
    )
    .get(sessionId).total;
}

/**
 * Расчёт чека сеанса на момент endIso: время (с учётом минимального
 * оплачиваемого времени), скидка клиента, бар, округление итога.
 * Всё в копейках; используется и для предпросмотра, и при закрытии.
 */
export function computeCheck(db, session, endIso) {
  const club = getClubSettings(db);
  const rawSeconds = Math.max(
    0,
    Math.floor((Date.parse(endIso) - Date.parse(session.started_at)) / 1000)
  );
  const barCost = barTotalKopecks(db, session.id);

  // Предоплаченный сеанс: время уже оплачено фиксированной суммой.
  if (session.prepaid_kopecks !== null && session.prepaid_kopecks !== undefined) {
    return {
      duration_seconds: rawSeconds,
      billed_seconds: session.prepaid_seconds,
      time_cost_kopecks: session.prepaid_kopecks,
      discount_percent: session.discount_percent ?? 0,
      discounted_time_kopecks: session.prepaid_kopecks,
      bar_cost_kopecks: barCost,
      total_kopecks: session.prepaid_kopecks + barCost,
      prepaid: true,
    };
  }

  const billedSeconds = Math.max(rawSeconds, club.min_session_minutes * 60);
  const timeCost = costKopecks(session.price_per_hour_snapshot, billedSeconds);
  const discountedTime = applyDiscount(timeCost, session.discount_percent ?? 0);
  const total = roundToStep(discountedTime + barCost, club.rounding_step_kopecks);
  return {
    duration_seconds: rawSeconds,
    billed_seconds: billedSeconds,
    time_cost_kopecks: timeCost,
    discount_percent: session.discount_percent ?? 0,
    discounted_time_kopecks: discountedTime,
    bar_cost_kopecks: barCost,
    total_kopecks: total,
    prepaid: false,
  };
}

/**
 * Смена, к которой привязывается действие кассира. Кассиру смена
 * обязательна; администратор может работать и без неё.
 * @returns {number | null} id смены
 */
function requireShiftFor(db, user) {
  const shift = getOpenShift(db, user.id);
  if (!shift && user.role === "cashier") {
    throw new ConflictError("Сначала откройте кассовую смену");
  }
  return shift?.id ?? null;
}

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
 * @param {{id: number, name: string, role: string}} user кто открывает
 * @param {{clientId?: number | null,
 *          prepaidSeconds?: number | null,
 *          prepaidAmount?: number | null,
 *          paymentMethod?: string | null}} [options]
 *   clientId — клиент (его скидка фиксируется снимком на весь сеанс);
 *   prepaidSeconds — предоплата «на время»: оплаченные секунды;
 *   prepaidAmount — предоплата «на сумму»: рубли, время считается по
 *   тарифу со скидкой; paymentMethod обязателен для предоплаты.
 */
export function openSession(
  db,
  tableId,
  tariffId,
  user,
  { clientId = null, prepaidSeconds = null, prepaidAmount = null, paymentMethod = null } = {}
) {
  const table = getTable(db, tableId);
  const tariff = getTariff(db, tariffId);
  if (!tariff.is_active) {
    throw new ConflictError(`Тариф «${tariff.name}» отключён`);
  }
  if (table.status !== "free" || getOpenSession(db, table.id)) {
    throw new ConflictError(`Стол «${table.name}» уже занят`);
  }
  const shiftId = requireShiftFor(db, user);
  const client = clientId ? getClient(db, clientId) : null;
  const discount = client?.discount_percent ?? 0;

  // Предоплата: считаем оплаченное время и сумму.
  let prepaid = null;
  if (prepaidSeconds !== null || prepaidAmount !== null) {
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new ConflictError("Для предоплаты укажите способ оплаты");
    }
    const club = getClubSettings(db);
    // Эффективная цена часа с учётом скидки клиента, в копейках.
    const perHour = applyDiscount(tariff.price_per_hour * 100, discount);
    if (perHour <= 0) {
      throw new ConflictError("Цена со скидкой равна нулю — предоплата невозможна");
    }
    if (prepaidSeconds !== null) {
      const seconds = Number(prepaidSeconds);
      if (!Number.isInteger(seconds) || seconds < 15 * 60 || seconds > 24 * 3600) {
        throw new ConflictError("Оплаченное время: от 15 минут до 24 часов");
      }
      prepaid = {
        seconds,
        kopecks: roundToStep(
          applyDiscount(costKopecks(tariff.price_per_hour, seconds), discount),
          club.rounding_step_kopecks
        ),
      };
    } else {
      const amount = Number(prepaidAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ConflictError("Сумма предоплаты должна быть больше нуля");
      }
      const kopecks = Math.round(amount * 100);
      const seconds = Math.floor((kopecks * 3600) / perHour);
      if (seconds < 5 * 60) {
        throw new ConflictError("Этой суммы хватает меньше чем на 5 минут");
      }
      prepaid = { seconds, kopecks };
    }
  }

  const sessionId = withTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO table_sessions
           (table_id, tariff_id, price_per_hour_snapshot, started_at,
            opened_by, shift_id, client_id, discount_percent,
            prepaid_seconds, prepaid_kopecks, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        table.id,
        tariff.id,
        tariff.price_per_hour,
        utcNow(),
        user.id,
        shiftId,
        client?.id ?? null,
        discount,
        prepaid?.seconds ?? null,
        prepaid?.kopecks ?? null,
        prepaid ? paymentMethod : null
      );
    const newSessionId = Number(lastInsertRowid);
    db.prepare("UPDATE tables SET status = 'busy' WHERE id = ?").run(table.id);
    const prepaidNote = prepaid
      ? `, предоплата ${kopecksToRubles(prepaid.kopecks).toFixed(2)} ₽ ` +
        `на ${Math.round(prepaid.seconds / 60)} мин`
      : "";
    logEvent(
      db,
      JournalEvent.SESSION_OPENED,
      `Открыт сеанс на столе «${table.name}», тариф «${tariff.name}» ` +
        `(${tariff.price_per_hour} ₽/час)` +
        (client ? `, клиент «${client.name}»` : "") +
        prepaidNote +
        ` — ${user.name}`,
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
 * Выручка привязывается к открытой смене закрывающего сотрудника.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tableId
 * @param {{id: number, name: string, role: string}} user кто закрывает
 * @param {{paymentMethod?: string | null}} [options] способ оплаты
 *   (cash | card | transfer); по умолчанию — способ, выбранный при
 *   предоплате, иначе cash
 */
export function closeSession(db, tableId, user, { paymentMethod = null } = {}) {
  const table = getTable(db, tableId);
  const session = getOpenSession(db, table.id);
  if (!session) {
    throw new ConflictError(`Стол «${table.name}» свободен — закрывать нечего`);
  }
  paymentMethod = paymentMethod ?? session.payment_method ?? "cash";
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ConflictError(
      `Недопустимый способ оплаты «${paymentMethod}» (cash, card или transfer)`
    );
  }
  const closeShiftId = requireShiftFor(db, user);

  const endedAt = utcNow();
  const check = computeCheck(db, session, endedAt);

  withTransaction(db, () => {
    db.prepare(
      `UPDATE table_sessions SET ended_at = ?, total_cost_kopecks = ?,
         time_cost_kopecks = ?, bar_cost_kopecks = ?, payment_method = ?,
         closed_by = ?, close_shift_id = ? WHERE id = ?`
    ).run(
      endedAt,
      check.total_kopecks,
      check.time_cost_kopecks,
      check.bar_cost_kopecks,
      paymentMethod,
      user.id,
      closeShiftId,
      session.id
    );
    db.prepare("UPDATE tables SET status = 'free' WHERE id = ?").run(table.id);
    const methodLabel = { cash: "наличные", card: "карта", transfer: "перевод" }[
      paymentMethod
    ];
    logEvent(
      db,
      JournalEvent.SESSION_CLOSED,
      `Закрыт сеанс на столе «${table.name}», итог ` +
        `${kopecksToRubles(check.total_kopecks).toFixed(2)} ₽ (${methodLabel}) — ${user.name}`,
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
 * Текущая стоимость сеанса в копейках: для закрытого — сохранённый итог,
 * для открытого — полный чек (время со скидкой + бар) на «сейчас».
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {object} session строка table_sessions
 */
export function currentCostKopecks(db, session) {
  if (session.total_cost_kopecks !== null && session.total_cost_kopecks !== undefined) {
    return session.total_cost_kopecks;
  }
  return computeCheck(db, session, utcNow()).total_kopecks;
}

/**
 * Сеанс по id (для чека) — с полями стола, тарифа, кассиров и клиента.
 * @param {import("node:sqlite").DatabaseSync} db
 */
export function getSessionById(db, sessionId) {
  const session = db
    .prepare(`SELECT ${SESSION_FIELDS} ${SESSION_JOIN} WHERE s.id = ?`)
    .get(sessionId);
  if (!session) {
    throw new NotFoundError(`Сеанс id=${sessionId} не найден`);
  }
  return session;
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

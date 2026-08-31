// Операции с тарифами.

import { utcNow, withTransaction } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

const toTariff = (row) => ({ ...row, is_active: Boolean(row.is_active) });

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{onlyActive?: boolean}} [options]
 */
export function listTariffs(db, { onlyActive = false } = {}) {
  const rows = db
    .prepare(
      `SELECT id, name, price_per_hour, is_active FROM tariffs
       ${onlyActive ? "WHERE is_active = 1" : ""} ORDER BY id`
    )
    .all();
  return rows.map(toTariff);
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} tariffId
 */
export function getTariff(db, tariffId) {
  const row = db
    .prepare("SELECT id, name, price_per_hour, is_active FROM tariffs WHERE id = ?")
    .get(tariffId);
  if (!row) {
    throw new NotFoundError(`Тариф id=${tariffId} не найден`);
  }
  return toTariff(row);
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} name
 * @param {number} pricePerHour рублей в час, целое > 0
 */
export function createTariff(db, name, pricePerHour) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new ConflictError("Название тарифа не может быть пустым");
  }
  if (!Number.isInteger(pricePerHour) || pricePerHour <= 0) {
    throw new ConflictError("Цена тарифа должна быть целым числом больше нуля");
  }
  const exists = db.prepare("SELECT id FROM tariffs WHERE name = ?").get(trimmed);
  if (exists) {
    throw new ConflictError(`Тариф с названием «${trimmed}» уже существует`);
  }
  const id = withTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO tariffs (name, price_per_hour, is_active, created_at) VALUES (?, ?, 1, ?)"
      )
      .run(trimmed, pricePerHour, utcNow());
    logEvent(
      db,
      JournalEvent.TARIFF_CREATED,
      `Создан тариф «${trimmed}» — ${pricePerHour} ₽/час`
    );
    return Number(lastInsertRowid);
  });
  return getTariff(db, id);
}

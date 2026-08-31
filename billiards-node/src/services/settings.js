// Настройки приложения, редактируемые через интерфейс (вкладка «Настройки»).
// Хранятся в таблице settings (ключ-значение). Значения из переменных
// окружения служат значениями по умолчанию, пока настройка не сохранена в UI.

import {
  LIGHTING_DRIVER,
  TUYA_ACCESS_ID,
  TUYA_ACCESS_SECRET,
  TUYA_API_HOST,
} from "../config.js";
import { ConflictError } from "./errors.js";

const DEFAULTS = {
  lighting_driver: LIGHTING_DRIVER,
  tuya_access_id: TUYA_ACCESS_ID,
  tuya_access_secret: TUYA_ACCESS_SECRET,
  tuya_api_host: TUYA_API_HOST,
};

const ALLOWED_KEYS = Object.keys(DEFAULTS);
const ALLOWED_DRIVERS = ["mock", "tuya"];

/**
 * Текущие настройки: сохранённые в базе поверх значений по умолчанию.
 * @param {import("node:sqlite").DatabaseSync} db
 * @returns {typeof DEFAULTS}
 */
export function getSettings(db) {
  const stored = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value])
  );
  const result = { ...DEFAULTS };
  for (const key of ALLOWED_KEYS) {
    if (key in stored) result[key] = stored[key];
  }
  return result;
}

/**
 * Сохраняет присланные поля (только известные ключи).
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {Record<string, unknown>} patch
 */
export function saveSettings(db, patch) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  );
  for (const key of ALLOWED_KEYS) {
    if (!(key in patch)) continue;
    const value = String(patch[key] ?? "").trim();
    if (key === "lighting_driver" && !ALLOWED_DRIVERS.includes(value)) {
      throw new ConflictError(
        `Недопустимый драйвер освещения «${value}» (mock или tuya)`
      );
    }
    upsert.run(key, value);
  }
  return getSettings(db);
}

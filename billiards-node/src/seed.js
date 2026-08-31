// Начальные данные для пустой базы: при первом запуске (нет ни столов,
// ни тарифов) создаём стартовый набор, чтобы клуб мог работать сразу.
// На непустую базу не влияет.

import { createTable } from "./services/tables.js";
import { createTariff } from "./services/tariffs.js";

const INITIAL_TABLES = ["Стол 1", "Стол 2", "Стол 3"];
const INITIAL_TARIFFS = [
  ["Будний день", 400],
  ["Выходной день", 600],
];

/** @param {import("node:sqlite").DatabaseSync} db */
export function seedInitialData(db) {
  const hasTables = db.prepare("SELECT id FROM tables LIMIT 1").get();
  const hasTariffs = db.prepare("SELECT id FROM tariffs LIMIT 1").get();
  if (hasTables || hasTariffs) return;
  for (const name of INITIAL_TABLES) createTable(db, name);
  for (const [name, price] of INITIAL_TARIFFS) createTariff(db, name, price);
}

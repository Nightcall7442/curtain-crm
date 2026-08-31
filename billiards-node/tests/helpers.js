// Общие помощники тестов: приложение с чистой базой в памяти для
// каждого теста (сидинг не используется — база пустая и предсказуемая).

import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";

/** Свежая база в памяти + Express-приложение. */
export function makeApp() {
  const db = createDatabase(":memory:");
  return { db, app: createApp(db) };
}

/** @param {import("supertest").Agent} request */
export async function createTable(request, name = "Тестовый стол") {
  const res = await request.post("/api/tables").send({ name });
  if (res.status !== 201) throw new Error(`createTable: ${res.status}`);
  return res.body;
}

/** @param {import("supertest").Agent} request */
export async function createTariff(request, name = "Тестовый тариф", price = 600) {
  const res = await request.post("/api/tariffs").send({ name, price_per_hour: price });
  if (res.status !== 201) throw new Error(`createTariff: ${res.status}`);
  return res.body;
}

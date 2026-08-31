// Преобразование строк БД в тела ответов API.

import { kopecksToRubles } from "../services/billing.js";
import { utcNow } from "../db.js";

/** Полное представление сеанса (открытие/закрытие/история). */
export function sessionToOut(session) {
  const end = session.ended_at ?? utcNow();
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.parse(end) - Date.parse(session.started_at)) / 1000)
  );
  return {
    id: session.id,
    table_id: session.table_id,
    table_name: session.table_name,
    tariff_id: session.tariff_id,
    tariff_name: session.tariff_name,
    price_per_hour: session.price_per_hour_snapshot,
    started_at: session.started_at,
    ended_at: session.ended_at ?? null,
    duration_seconds: durationSeconds,
    total_cost:
      session.total_cost_kopecks === null || session.total_cost_kopecks === undefined
        ? null
        : kopecksToRubles(session.total_cost_kopecks),
  };
}

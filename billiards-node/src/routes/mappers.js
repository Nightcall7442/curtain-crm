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
    opened_by_name: session.opened_by_name ?? null,
    closed_by_name: session.closed_by_name ?? null,
    client_name: session.client_name ?? null,
    discount_percent: session.discount_percent ?? 0,
    payment_method: session.payment_method ?? null,
    time_cost:
      session.time_cost_kopecks === null || session.time_cost_kopecks === undefined
        ? null
        : kopecksToRubles(session.time_cost_kopecks),
    bar_cost:
      session.bar_cost_kopecks === null || session.bar_cost_kopecks === undefined
        ? null
        : kopecksToRubles(session.bar_cost_kopecks),
    total_cost:
      session.total_cost_kopecks === null || session.total_cost_kopecks === undefined
        ? null
        : kopecksToRubles(session.total_cost_kopecks),
  };
}

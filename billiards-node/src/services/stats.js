// Отчёты для администратора: нагруженность столов, выручка по дням,
// пиковые часы. Дни и часы считаются в локальном поясе клуба
// (настройка tz_offset_minutes).

import { kopecksToRubles } from "./billing.js";
import { getClubSettings } from "./settings.js";

/**
 * Сводка по каждому столу за последние N дней (по закрытым сеансам):
 * число сеансов, занятость в секундах, выручка.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} days
 */
export function tableLoad(db, days) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT t.id, t.name,
         COUNT(s.id) AS sessions_count,
         CAST(COALESCE(SUM(
           (julianday(s.ended_at) - julianday(s.started_at)) * 86400
         ), 0) AS INTEGER) AS busy_seconds,
         COALESCE(SUM(s.total_cost_kopecks), 0) AS revenue_kopecks
       FROM tables t
       LEFT JOIN table_sessions s
         ON s.table_id = t.id AND s.ended_at IS NOT NULL AND s.started_at >= ?
       GROUP BY t.id
       ORDER BY t.id`
    )
    .all(since);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sessions_count: r.sessions_count,
    busy_seconds: r.busy_seconds,
    revenue: kopecksToRubles(r.revenue_kopecks),
  }));
}

/**
 * Выручка по дням за период с разбивкой по способам оплаты
 * плюс распределение сеансов по часам суток (пиковые часы).
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} days
 */
export function revenueReport(db, days) {
  const tz = getClubSettings(db).tz_offset_minutes;
  const modifier = `${tz >= 0 ? "+" : ""}${tz} minutes`;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const sumBy = (method) =>
    `COALESCE(SUM(CASE WHEN s.payment_method = '${method}'
       THEN s.total_cost_kopecks ELSE 0 END), 0)`;

  const dayRows = db
    .prepare(
      `SELECT date(s.ended_at, ?) AS day,
         COUNT(*) AS sessions_count,
         COALESCE(SUM(s.total_cost_kopecks), 0) AS total_kopecks,
         ${sumBy("cash")} AS cash_kopecks,
         ${sumBy("card")} AS card_kopecks,
         ${sumBy("transfer")} AS transfer_kopecks
       FROM table_sessions s
       WHERE s.ended_at IS NOT NULL AND s.ended_at >= ?
       GROUP BY day ORDER BY day`
    )
    .all(modifier, since);

  const hourRows = db
    .prepare(
      `SELECT CAST(strftime('%H', s.started_at, ?) AS INTEGER) AS hour,
         COUNT(*) AS sessions_count
       FROM table_sessions s
       WHERE s.ended_at IS NOT NULL AND s.ended_at >= ?
       GROUP BY hour`
    )
    .all(modifier, since);
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessions_count: hourRows.find((r) => r.hour === hour)?.sessions_count ?? 0,
  }));

  return {
    days: dayRows.map((r) => ({
      day: r.day,
      sessions_count: r.sessions_count,
      total: kopecksToRubles(r.total_kopecks),
      cash: kopecksToRubles(r.cash_kopecks),
      card: kopecksToRubles(r.card_kopecks),
      transfer: kopecksToRubles(r.transfer_kopecks),
    })),
    hours,
  };
}

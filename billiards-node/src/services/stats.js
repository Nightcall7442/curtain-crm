// Отчёты для администратора: нагруженность столов за период.

import { kopecksToRubles } from "./billing.js";

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

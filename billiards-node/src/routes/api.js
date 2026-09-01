// HTTP API. Здесь только разбор запросов и формирование ответов —
// вся бизнес-логика в сервисах.

import { Router } from "express";

import {
  clearedSessionCookie,
  createAuthSession,
  deleteAuthSession,
  sessionCookie,
} from "../services/auth.js";
import { kopecksToRubles } from "../services/billing.js";
import { ConflictError, ForbiddenError } from "../services/errors.js";
import { JournalEvent, listJournal, logEvent } from "../services/journal.js";
import {
  getActiveDriver,
  getLightingController,
  initLighting,
  listCloudDevices,
} from "../services/lighting.js";
import { listBookings, cancelBooking, createBooking, nextBookingForTable } from "../services/bookings.js";
import { createClient, listClients, updateClient } from "../services/clients.js";
import { createMenuItem, listMenu, updateMenuItem } from "../services/menu.js";
import { addOrder, listOrders, removeOrder } from "../services/orders.js";
import { getPlan, savePlan } from "../services/plan.js";
import { getClubSettings, getSettings, saveSettings } from "../services/settings.js";
import {
  closeSession,
  computeCheck,
  currentCostKopecks,
  getOpenSession,
  getSessionById,
  listHistory,
  openSession,
} from "../services/sessions.js";
import {
  closeShift,
  currentShift,
  listShifts,
  openShift,
} from "../services/shifts.js";
import { revenueReport, tableLoad } from "../services/stats.js";
import { createRule, deleteRule, listRules, resolveTariffId } from "../services/tariff-rules.js";
import {
  createTable,
  listTables,
  setTableDevice,
  setTableLayout,
} from "../services/tables.js";
import { createTariff, listTariffs } from "../services/tariffs.js";
import {
  authenticate,
  changeOwnPassword,
  createUser,
  listUsers,
  updateUser,
} from "../services/users.js";
import { utcNow } from "../db.js";
import { sessionToOut } from "./mappers.js";

/** Пропускает только администратора. */
function adminOnly(req) {
  if (req.user?.role !== "admin") {
    throw new ForbiddenError("Действие доступно только администратору");
  }
}

/** Целое число из параметра пути; иначе 404 через NotFound-подобный ответ. */
function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function clampLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** @param {import("node:sqlite").DatabaseSync} db */
export function createApiRouter(db) {
  const router = Router();

  // --- Авторизация ---------------------------------------------------------

  router.post("/auth/login", (req, res) => {
    const user = authenticate(db, req.body?.login, req.body?.password);
    if (!user) {
      return res.status(401).json({ detail: "Неверный логин или пароль" });
    }
    const token = createAuthSession(db, user.id);
    res.setHeader("Set-Cookie", sessionCookie(token));
    res.json({
      user,
      shift: currentShift(db, user.id),
      club_name: getClubSettings(db).club_name,
    });
  });

  router.post("/auth/logout", (req, res) => {
    deleteAuthSession(db, req.authToken);
    res.setHeader("Set-Cookie", clearedSessionCookie());
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    res.json({
      user: req.user,
      shift: currentShift(db, req.user.id),
      club_name: getClubSettings(db).club_name,
    });
  });

  router.post("/auth/password", (req, res) => {
    changeOwnPassword(
      db,
      req.user.id,
      req.body?.old_password,
      req.body?.new_password
    );
    res.json({ ok: true });
  });

  // --- Сотрудники (только администратор) -----------------------------------

  router.get("/users", (req, res) => {
    adminOnly(req);
    res.json(listUsers(db));
  });

  router.post("/users", (req, res) => {
    adminOnly(req);
    res.status(201).json(createUser(db, req.body ?? {}, req.user));
  });

  router.put("/users/:id", (req, res) => {
    adminOnly(req);
    const userId = intParam(req.params.id);
    if (userId === null) {
      return res.status(404).json({ detail: "Сотрудник не найден" });
    }
    res.json(updateUser(db, userId, req.body ?? {}, req.user));
  });

  // --- Кассовые смены ------------------------------------------------------

  router.get("/shifts/current", (req, res) => {
    res.json(currentShift(db, req.user.id));
  });

  router.post("/shifts/open", (req, res) => {
    const openingCash =
      req.body?.opening_cash === undefined || req.body?.opening_cash === null
        ? null
        : Number(req.body.opening_cash);
    res.status(201).json(openShift(db, req.user, { openingCash }));
  });

  router.post("/shifts/close", (req, res) => {
    const closingCash =
      req.body?.closing_cash === undefined || req.body?.closing_cash === null
        ? null
        : Number(req.body.closing_cash);
    res.json(closeShift(db, req.user, { closingCash }));
  });

  // Администратор видит все смены, кассир — только свои.
  router.get("/shifts", (req, res) => {
    const limit = clampLimit(req.query.limit, 100, 1000);
    const userId = req.user.role === "admin" ? undefined : req.user.id;
    res.json(listShifts(db, { userId, limit }));
  });

  // --- Отчёты (только администратор) ---------------------------------------

  router.get("/stats/tables", (req, res) => {
    adminOnly(req);
    const days = clampLimit(req.query.days, 30, 365);
    res.json({ days, tables: tableLoad(db, days) });
  });

  // --- Столы -------------------------------------------------------------

  router.get("/tables", (req, res) => {
    res.json(listTables(db));
  });

  router.post("/tables", (req, res) => {
    adminOnly(req);
    if (typeof req.body?.name !== "string") {
      throw new ConflictError("Поле name обязательно и должно быть строкой");
    }
    res.status(201).json(createTable(db, req.body.name));
  });

  router.post("/tables/:id/open", (req, res) => {
    const tableId = intParam(req.params.id);
    const tariffId = intParam(req.body?.tariff_id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    if (tariffId === null) {
      throw new ConflictError("Поле tariff_id обязательно и должно быть числом");
    }
    const clientId = intParam(req.body?.client_id);
    // Режимы: postpaid (по умолчанию), time (минуты вперёд), amount (сумма).
    const mode = req.body?.mode ?? "postpaid";
    const options = { clientId };
    if (mode === "time") {
      options.prepaidSeconds = Math.round(Number(req.body?.minutes) * 60);
      options.paymentMethod = req.body?.payment_method ?? null;
    } else if (mode === "amount") {
      options.prepaidAmount = Number(req.body?.amount);
      options.paymentMethod = req.body?.payment_method ?? null;
    } else if (mode !== "postpaid") {
      throw new ConflictError(`Неизвестный режим открытия «${mode}»`);
    }
    res
      .status(201)
      .json(sessionToOut(openSession(db, tableId, tariffId, req.user, options)));
  });

  router.post("/tables/:id/close", (req, res) => {
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const paymentMethod = req.body?.payment_method ?? null;
    res.json(sessionToOut(closeSession(db, tableId, req.user, { paymentMethod })));
  });

  // Предпросмотр чека открытого сеанса (время, скидка, бар, итог).
  router.get("/tables/:id/check", (req, res) => {
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const session = getOpenSession(db, tableId);
    if (!session) {
      throw new ConflictError("Стол свободен — чека нет");
    }
    const check = computeCheck(db, session, utcNow());
    res.json({
      session_id: session.id,
      table_name: session.table_name,
      tariff_name: session.tariff_name,
      client_name: session.client_name ?? null,
      duration_seconds: check.duration_seconds,
      billed_seconds: check.billed_seconds,
      time_cost: kopecksToRubles(check.time_cost_kopecks),
      discount_percent: check.discount_percent,
      discounted_time: kopecksToRubles(check.discounted_time_kopecks),
      bar_cost: kopecksToRubles(check.bar_cost_kopecks),
      total: kopecksToRubles(check.total_kopecks),
      orders: listOrders(db, session.id).map((o) => ({
        id: o.id,
        item_name: o.item_name,
        price: kopecksToRubles(o.price_kopecks),
        quantity: o.quantity,
      })),
    });
  });

  // --- Бар: заказы на открытый сеанс ---------------------------------------

  router.post("/tables/:id/orders", (req, res) => {
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const result = addOrder(db, tableId, req.body ?? {}, req.user);
    res.status(201).json({
      orders: result.orders,
      bar_total: kopecksToRubles(result.bar_total_kopecks),
    });
  });

  router.delete("/orders/:id", (req, res) => {
    const orderId = intParam(req.params.id);
    if (orderId === null) return res.status(404).json({ detail: "Позиция не найдена" });
    const result = removeOrder(db, orderId);
    res.json({
      orders: result.orders,
      bar_total: kopecksToRubles(result.bar_total_kopecks),
    });
  });

  // --- Чек закрытого сеанса ------------------------------------------------

  router.get("/sessions/:id", (req, res) => {
    const sessionId = intParam(req.params.id);
    if (sessionId === null) return res.status(404).json({ detail: "Сеанс не найден" });
    const session = getSessionById(db, sessionId);
    res.json({
      ...sessionToOut(session),
      club_name: getClubSettings(db).club_name,
      orders: listOrders(db, session.id).map((o) => ({
        item_name: o.item_name,
        price: kopecksToRubles(o.price_kopecks),
        quantity: o.quantity,
      })),
    });
  });

  // --- Тарифы ------------------------------------------------------------

  router.get("/tariffs", (req, res) => {
    res.json(listTariffs(db, { onlyActive: req.query.only_active === "true" }));
  });

  router.post("/tariffs", (req, res) => {
    adminOnly(req);
    if (typeof req.body?.name !== "string") {
      throw new ConflictError("Поле name обязательно и должно быть строкой");
    }
    res
      .status(201)
      .json(createTariff(db, req.body.name, Number(req.body.price_per_hour)));
  });

  // --- Dashboard: столы с живым состоянием сеансов -----------------------
  // Сервер сам считает elapsed_seconds и current_cost — фронтенду не нужно
  // сверять часы с сервером, он лишь тикает между опросами.

  router.get("/dashboard", (req, res) => {
    const lighting = getLightingController();
    const now = Date.now();
    const result = listTables(db).map((table) => {
      const session = getOpenSession(db, table.id);
      const booking = nextBookingForTable(db, table.id);
      return {
        id: table.id,
        name: table.name,
        status: table.status,
        light_on: lighting.isLightOn(table.id),
        pos_x: table.pos_x,
        pos_y: table.pos_y,
        size_w: table.size_w,
        size_h: table.size_h,
        booking: booking
          ? {
              id: booking.id,
              client_name: booking.client_name,
              starts_at: booking.starts_at,
              duration_minutes: booking.duration_minutes,
            }
          : null,
        session: session
          ? (() => {
              const elapsed = Math.max(
                0,
                Math.floor((now - Date.parse(session.started_at)) / 1000)
              );
              const prepaid =
                session.prepaid_kopecks !== null &&
                session.prepaid_kopecks !== undefined;
              return {
                session_id: session.id,
                tariff_name: session.tariff_name,
                price_per_hour: session.price_per_hour_snapshot,
                started_at: session.started_at,
                client_name: session.client_name ?? null,
                discount_percent: session.discount_percent ?? 0,
                elapsed_seconds: elapsed,
                current_cost: kopecksToRubles(currentCostKopecks(db, session)),
                prepaid,
                prepaid_seconds: prepaid ? session.prepaid_seconds : null,
                prepaid_amount: prepaid
                  ? kopecksToRubles(session.prepaid_kopecks)
                  : null,
                payment_method: session.payment_method ?? null,
                remaining_seconds: prepaid
                  ? session.prepaid_seconds - elapsed
                  : null,
                expired: prepaid ? elapsed >= session.prepaid_seconds : false,
              };
            })()
          : null,
      };
    });
    res.json(result);
  });

  // --- Настройки -----------------------------------------------------------
  // Всё, что нужно для реле Tuya/MOES, задаётся отсюда (вкладка «Настройки»):
  // драйвер и ключи облака, привязка столов к устройствам, тест реле.

  router.get("/settings", (req, res) => {
    adminOnly(req);
    res.json({ ...getSettings(db), driver_active: getActiveDriver() });
  });

  router.put("/settings", async (req, res, next) => {
    try {
      adminOnly(req);
      saveSettings(db, req.body ?? {});
      const status = await initLighting(db);
      logEvent(
        db,
        JournalEvent.SETTINGS_UPDATED,
        `Обновлены настройки освещения — ${req.user.name}`
      );
      res.json({
        ...getSettings(db),
        driver_active: status.driver,
        driver_error: status.error ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/settings/devices", async (req, res, next) => {
    try {
      adminOnly(req);
      res.json(await listCloudDevices());
    } catch (error) {
      next(error);
    }
  });

  router.put("/tables/:id/device", (req, res) => {
    adminOnly(req);
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const table = setTableDevice(
      db,
      tableId,
      req.body?.device_id ?? null,
      req.body?.switch_code ?? null
    );
    res.json(table);
  });

  // Ручной тест реле из настроек: включить/выключить свет над столом.
  router.post("/tables/:id/light", (req, res) => {
    adminOnly(req);
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const on = Boolean(req.body?.on);
    const lighting = getLightingController();
    if (on) lighting.turnLightOn(tableId);
    else lighting.turnLightOff(tableId);
    res.json({ table_id: tableId, light_on: lighting.isLightOn(tableId) });
  });

  // --- План зала -----------------------------------------------------------
  // Смотрят все сотрудники, редактирует администратор.

  router.get("/plan", (req, res) => {
    res.json(getPlan(db));
  });

  router.put("/plan", (req, res) => {
    adminOnly(req);
    res.json(savePlan(db, req.body ?? {}));
  });

  router.put("/tables/:id/layout", (req, res) => {
    adminOnly(req);
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    const { x, y, w, h } = req.body ?? {};
    res.json(
      setTableLayout(db, tableId, {
        x: Number(x),
        y: Number(y),
        w: Number(w),
        h: Number(h),
      })
    );
  });

  // --- Клиенты -------------------------------------------------------------
  // Создавать клиентов может любой сотрудник; менять скидку — администратор.

  router.get("/clients", (req, res) => {
    res.json(listClients(db, { query: String(req.query.query ?? "") }));
  });

  router.post("/clients", (req, res) => {
    res.status(201).json(createClient(db, req.body ?? {}, req.user));
  });

  router.put("/clients/:id", (req, res) => {
    adminOnly(req);
    const clientId = intParam(req.params.id);
    if (clientId === null) return res.status(404).json({ detail: "Клиент не найден" });
    res.json(updateClient(db, clientId, req.body ?? {}));
  });

  // --- Меню бара -----------------------------------------------------------

  router.get("/menu", (req, res) => {
    res.json(listMenu(db, { onlyActive: req.query.only_active === "true" }));
  });

  router.post("/menu", (req, res) => {
    adminOnly(req);
    res.status(201).json(createMenuItem(db, req.body ?? {}));
  });

  router.put("/menu/:id", (req, res) => {
    adminOnly(req);
    const itemId = intParam(req.params.id);
    if (itemId === null) return res.status(404).json({ detail: "Позиция не найдена" });
    res.json(updateMenuItem(db, itemId, req.body ?? {}));
  });

  // --- Брони ---------------------------------------------------------------

  router.get("/bookings", (req, res) => {
    res.json(listBookings(db));
  });

  router.post("/bookings", (req, res) => {
    res.status(201).json(createBooking(db, req.body ?? {}, req.user));
  });

  router.post("/bookings/:id/cancel", (req, res) => {
    const bookingId = intParam(req.params.id);
    if (bookingId === null) return res.status(404).json({ detail: "Бронь не найдена" });
    res.json(cancelBooking(db, bookingId, req.user));
  });

  // --- Тарифные расписания (только администратор) --------------------------

  router.get("/tariff-rules", (req, res) => {
    adminOnly(req);
    res.json(listRules(db));
  });

  router.post("/tariff-rules", (req, res) => {
    adminOnly(req);
    res.status(201).json(createRule(db, req.body ?? {}));
  });

  router.delete("/tariff-rules/:id", (req, res) => {
    adminOnly(req);
    const ruleId = intParam(req.params.id);
    if (ruleId === null) return res.status(404).json({ detail: "Правило не найдено" });
    deleteRule(db, ruleId);
    res.json({ ok: true });
  });

  // Тариф по расписанию на «сейчас» — для автоподстановки при открытии.
  router.get("/tariffs/auto", (req, res) => {
    const tz = getClubSettings(db).tz_offset_minutes;
    res.json({ tariff_id: resolveTariffId(db, tz) });
  });

  // --- Отчёт по выручке (только администратор) -----------------------------

  router.get("/stats/revenue", (req, res) => {
    adminOnly(req);
    const days = clampLimit(req.query.days, 30, 365);
    res.json({ days, ...revenueReport(db, days) });
  });

  // --- История и журнал ---------------------------------------------------

  router.get("/history", (req, res) => {
    const limit = clampLimit(req.query.limit, 100, 1000);
    res.json(listHistory(db, limit).map(sessionToOut));
  });

  router.get("/journal", (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(listJournal(db, limit));
  });

  return router;
}

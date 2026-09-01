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
import { getSettings, saveSettings } from "../services/settings.js";
import {
  closeSession,
  currentCostKopecks,
  getOpenSession,
  listHistory,
  openSession,
} from "../services/sessions.js";
import {
  closeShift,
  currentShift,
  listShifts,
  openShift,
} from "../services/shifts.js";
import { tableLoad } from "../services/stats.js";
import { createTable, listTables, setTableDevice } from "../services/tables.js";
import { createTariff, listTariffs } from "../services/tariffs.js";
import {
  authenticate,
  changeOwnPassword,
  createUser,
  listUsers,
  updateUser,
} from "../services/users.js";
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
    res.json({ user, shift: currentShift(db, user.id) });
  });

  router.post("/auth/logout", (req, res) => {
    deleteAuthSession(db, req.authToken);
    res.setHeader("Set-Cookie", clearedSessionCookie());
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    res.json({ user: req.user, shift: currentShift(db, req.user.id) });
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
    res.status(201).json(openShift(db, req.user));
  });

  router.post("/shifts/close", (req, res) => {
    res.json(closeShift(db, req.user));
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
    res.status(201).json(sessionToOut(openSession(db, tableId, tariffId, req.user)));
  });

  router.post("/tables/:id/close", (req, res) => {
    const tableId = intParam(req.params.id);
    if (tableId === null) return res.status(404).json({ detail: "Стол не найден" });
    res.json(sessionToOut(closeSession(db, tableId, req.user)));
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
      return {
        id: table.id,
        name: table.name,
        status: table.status,
        light_on: lighting.isLightOn(table.id),
        session: session
          ? {
              session_id: session.id,
              tariff_name: session.tariff_name,
              price_per_hour: session.price_per_hour_snapshot,
              started_at: session.started_at,
              elapsed_seconds: Math.max(
                0,
                Math.floor((now - Date.parse(session.started_at)) / 1000)
              ),
              current_cost: kopecksToRubles(currentCostKopecks(session)),
            }
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

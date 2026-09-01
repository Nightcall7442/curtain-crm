// Сборка Express-приложения. Вынесена в фабрику, чтобы тесты могли
// создавать приложение со своей базой, не поднимая сетевой сервер.

import express from "express";
import path from "node:path";

import { PUBLIC_DIR } from "./config.js";
import { createApiRouter } from "./routes/api.js";
import { getUserByToken, tokenFromCookieHeader } from "./services/auth.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "./services/errors.js";

/** @param {import("node:sqlite").DatabaseSync} db */
export function createApp(db) {
  const app = express();
  app.use(express.json());

  // Кто делает запрос: пользователь по токену из HttpOnly-cookie.
  app.use((req, res, next) => {
    req.authToken = tokenFromCookieHeader(req.headers.cookie);
    req.user = getUserByToken(db, req.authToken);
    next();
  });

  app.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login");
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.get("/login", (req, res) => {
    if (req.user) return res.redirect("/");
    res.sendFile(path.join(PUBLIC_DIR, "login.html"));
  });

  app.use("/static", express.static(PUBLIC_DIR));

  // Всё API, кроме входа, требует авторизации.
  app.use("/api", (req, res, next) => {
    if (req.path === "/auth/login") return next();
    if (!req.user) return res.status(401).json({ detail: "Требуется вход" });
    next();
  });
  app.use("/api", createApiRouter(db));

  // Доменные ошибки -> HTTP-коды; формат тела как у остального API.
  // eslint-disable-next-line no-unused-vars -- сигнатура из 4 аргументов обязательна для Express
  app.use((err, req, res, next) => {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ detail: err.message });
    }
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ detail: err.message });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ detail: err.message });
    }
    if (err instanceof ConflictError) {
      return res.status(409).json({ detail: err.message });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ detail: "Некорректный JSON в теле запроса" });
    }
    console.error(err);
    return res.status(500).json({ detail: "Внутренняя ошибка сервера" });
  });

  return app;
}

// Сборка Express-приложения. Вынесена в фабрику, чтобы тесты могли
// создавать приложение со своей базой, не поднимая сетевой сервер.

import express from "express";
import path from "node:path";

import { PUBLIC_DIR } from "./config.js";
import { createApiRouter } from "./routes/api.js";
import { ConflictError, NotFoundError } from "./services/errors.js";

/** @param {import("node:sqlite").DatabaseSync} db */
export function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  app.use("/static", express.static(PUBLIC_DIR));

  app.use("/api", createApiRouter(db));

  // Доменные ошибки -> HTTP-коды; формат тела как у остального API.
  // eslint-disable-next-line no-unused-vars -- сигнатура из 4 аргументов обязательна для Express
  app.use((err, req, res, next) => {
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

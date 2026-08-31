// Конфигурация приложения. Значения можно переопределить переменными
// окружения, чтобы менять поведение без правки кода.

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const DATABASE_PATH =
  process.env.BILLIARDS_DATABASE_PATH ?? path.join(ROOT_DIR, "billiards.db");

export const PORT = Number(process.env.PORT ?? 8000);

// Сидинг стартовых данных при первом запуске на пустой базе.
// В тестах отключается: BILLIARDS_SEED=0.
export const SEED_INITIAL_DATA = process.env.BILLIARDS_SEED !== "0";

export const PUBLIC_DIR = path.join(ROOT_DIR, "public");

// --- Освещение -------------------------------------------------------------

// Драйвер: "mock" (по умолчанию) или "tuya" — реальные Wi-Fi реле
// Tuya/MOES (WM4LT1 и совместимые) через Tuya Cloud API.
export const LIGHTING_DRIVER = process.env.BILLIARDS_LIGHTING ?? "mock";

// Ключи облачного проекта с https://iot.tuya.com (Cloud -> проект).
export const TUYA_ACCESS_ID = process.env.TUYA_ACCESS_ID ?? "";
export const TUYA_ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET ?? "";

// Дата-центр, к которому привязан аккаунт приложения Smart Life.
// Для России/Европы это Central Europe: https://openapi.tuyaeu.com
export const TUYA_API_HOST =
  process.env.TUYA_API_HOST ?? "https://openapi.tuyaeu.com";

// Карта "id стола -> устройство" (см. devices.example.json).
export const DEVICES_PATH =
  process.env.BILLIARDS_DEVICES_PATH ?? path.join(ROOT_DIR, "devices.json");

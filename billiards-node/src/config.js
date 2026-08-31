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

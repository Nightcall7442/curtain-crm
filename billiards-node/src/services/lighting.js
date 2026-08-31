// Управление освещением столов.
//
// Frontend и HTTP-слой ничего не знают об оборудовании — они работают
// только с контроллером из getLightingController(). Доступны два драйвера:
//   mock — состояние в памяти процесса (по умолчанию, ничего не требует);
//   tuya — реальные Wi-Fi реле Tuya/MOES (WM4LT1 и совместимые) через
//          Tuya Cloud API; включается переменной BILLIARDS_LIGHTING=tuya.
//
// Контроллер реализует три метода: turnLightOn(tableId),
// turnLightOff(tableId), isLightOn(tableId).

import { readFileSync } from "node:fs";

import {
  DEVICES_PATH,
  LIGHTING_DRIVER,
  TUYA_ACCESS_ID,
  TUYA_ACCESS_SECRET,
  TUYA_API_HOST,
} from "../config.js";
import { TuyaLightingController } from "./lighting-tuya.js";

export class MockLightingController {
  #on = new Set();

  /** @param {number} tableId */
  turnLightOn(tableId) {
    this.#on.add(tableId);
    console.info(`Mock lighting: light ON for table ${tableId}`);
  }

  /** @param {number} tableId */
  turnLightOff(tableId) {
    this.#on.delete(tableId);
    console.info(`Mock lighting: light OFF for table ${tableId}`);
  }

  /** @param {number} tableId */
  isLightOn(tableId) {
    return this.#on.has(tableId);
  }
}

async function createTuyaController() {
  if (!TUYA_ACCESS_ID || !TUYA_ACCESS_SECRET) {
    throw new Error(
      "не заданы TUYA_ACCESS_ID и TUYA_ACCESS_SECRET (см. README, раздел про MOES)"
    );
  }
  const raw = JSON.parse(readFileSync(DEVICES_PATH, "utf8"));
  // Ключи, начинающиеся с "_", — комментарии, не устройства.
  const devices = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.startsWith("_"))
  );
  // Импортируем пакет только когда драйвер действительно нужен.
  const { TuyaContext } = await import("@tuya/tuya-connector-nodejs");
  const client = new TuyaContext({
    baseUrl: TUYA_API_HOST,
    accessKey: TUYA_ACCESS_ID,
    secretKey: TUYA_ACCESS_SECRET,
  });
  console.info(
    `Tuya lighting: драйвер включён, устройств в ${DEVICES_PATH}: ` +
      `${Object.keys(devices).length}`
  );
  return new TuyaLightingController(client, devices);
}

let controller = new MockLightingController();

/**
 * Инициализация драйвера по конфигурации. Вызывается один раз при старте
 * сервера; при ошибке настройки Tuya сервер продолжает работать на Mock,
 * чтобы касса не зависела от облака.
 */
export async function initLighting() {
  if (LIGHTING_DRIVER !== "tuya") return;
  try {
    controller = await createTuyaController();
  } catch (error) {
    console.error(
      `Tuya lighting: не удалось включить драйвер (${error.message}). ` +
        "Работаем на Mock — свет управляться не будет."
    );
  }
}

/** Текущий контроллер освещения. */
export function getLightingController() {
  return controller;
}

// Управление освещением столов.
//
// Frontend и HTTP-слой ничего не знают об оборудовании — они работают
// только с контроллером из getLightingController(). Доступны два драйвера:
//   mock — состояние в памяти процесса (по умолчанию, ничего не требует);
//   tuya — реальные Wi-Fi реле Tuya/MOES (WM4LT1 и совместимые) через
//          Tuya Cloud API.
//
// Драйвер, ключи облака и привязка столов к реле настраиваются во вкладке
// «Настройки» интерфейса и хранятся в базе; initLighting перечитывает их
// при старте сервера и после каждого сохранения настроек.

import { ConflictError } from "./errors.js";
import { getSettings } from "./settings.js";
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

let controller = new MockLightingController();
let tuyaClient = null;
let activeDriver = "mock";

/**
 * (Пере)инициализация драйвера по настройкам из базы. Вызывается при старте
 * сервера и после сохранения настроек. Никогда не бросает: при некорректной
 * конфигурации сервер продолжает работать на Mock, чтобы касса не зависела
 * от облака.
 * @param {import("node:sqlite").DatabaseSync} db
 * @returns {Promise<{driver: "mock"|"tuya", error?: string}>}
 */
export async function initLighting(db) {
  const settings = getSettings(db);
  tuyaClient = null;
  if (settings.lighting_driver !== "tuya") {
    controller = new MockLightingController();
    activeDriver = "mock";
    return { driver: "mock" };
  }
  try {
    if (!settings.tuya_access_id || !settings.tuya_access_secret) {
      throw new Error("не заполнены Access ID и Access Secret");
    }
    // Импортируем пакет только когда драйвер действительно нужен.
    const { TuyaContext } = await import("@tuya/tuya-connector-nodejs");
    tuyaClient = new TuyaContext({
      baseUrl: settings.tuya_api_host,
      accessKey: settings.tuya_access_id,
      secretKey: settings.tuya_access_secret,
    });
    controller = new TuyaLightingController(tuyaClient, (tableId) =>
      db
        .prepare(
          `SELECT tuya_device_id AS device_id, tuya_switch_code AS switch_code
           FROM tables WHERE id = ?`
        )
        .get(tableId) ?? null
    );
    activeDriver = "tuya";
    console.info("Tuya lighting: драйвер включён");
    return { driver: "tuya" };
  } catch (error) {
    controller = new MockLightingController();
    activeDriver = "mock";
    console.error(
      `Tuya lighting: не удалось включить драйвер (${error.message}). ` +
        "Работаем на Mock — свет управляться не будет."
    );
    return { driver: "mock", error: error.message };
  }
}

/** Текущий контроллер освещения. */
export function getLightingController() {
  return controller;
}

/** Имя активного драйвера ("mock" | "tuya") — для вкладки «Настройки». */
export function getActiveDriver() {
  return activeDriver;
}

/**
 * Список устройств из аккаунта Tuya — для выпадающих списков во вкладке
 * «Настройки». Требует включённого драйвера tuya.
 * @returns {Promise<Array<{id: string, name: string, online: boolean|null}>>}
 */
export async function listCloudDevices() {
  if (!tuyaClient) {
    throw new ConflictError(
      "Подключение Tuya не настроено: включите драйвер, заполните ключи и нажмите «Сохранить»"
    );
  }
  const response = await tuyaClient.request({
    method: "GET",
    path: "/v1.0/iot-01/associated-users/devices?size=100",
  });
  if (!response?.success) {
    throw new ConflictError(
      `Tuya отклонил запрос списка устройств: ${response?.msg ?? response?.code ?? "нет ответа"}`
    );
  }
  const devices = response.result?.devices ?? response.result?.list ?? [];
  return devices.map((d) => ({
    id: d.id,
    name: d.name ?? d.id,
    online: typeof d.online === "boolean" ? d.online : null,
  }));
}

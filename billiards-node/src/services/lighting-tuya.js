// Драйвер освещения для реле экосистемы Tuya (MOES WM4LT1 и совместимые).
//
// Управление идёт через официальный Tuya Cloud API: на открытие сеанса
// устройству уходит команда {code: "switch_1", value: true}, на закрытие —
// value: false. Команды отправляются асинхронно и не блокируют кассовые
// операции: если облако недоступно, сеанс всё равно откроется/закроется,
// а ошибка попадёт в лог сервера.
//
// Какое реле у какого стола — решает resolveDevice: привязка хранится
// в базе и настраивается во вкладке «Настройки», без правки кода.

export const DEFAULT_SWITCH_CODE = "switch_1";

/**
 * @typedef {Object} TuyaDevice
 * @property {string} device_id  ID устройства из Tuya IoT Platform
 * @property {string} [switch_code] код канала реле (по умолчанию switch_1)
 */

export class TuyaLightingController {
  #client;
  #resolveDevice;
  #on = new Set();

  /**
   * @param {{request: Function}} client TuyaContext из @tuya/tuya-connector-nodejs
   *   (в тестах — совместимая заглушка)
   * @param {(tableId: number) => TuyaDevice | null} resolveDevice привязка
   *   стола к устройству (обычно чтение из базы)
   */
  constructor(client, resolveDevice) {
    this.#client = client;
    this.#resolveDevice = resolveDevice;
  }

  /** @param {number} tableId @param {boolean} value */
  #send(tableId, value) {
    const device = this.#resolveDevice(tableId);
    if (!device?.device_id) {
      console.warn(
        `Tuya lighting: стол ${tableId} не привязан к устройству — команда пропущена`
      );
      return;
    }
    const code = device.switch_code || DEFAULT_SWITCH_CODE;
    this.#client
      .request({
        method: "POST",
        path: `/v1.0/iot-03/devices/${device.device_id}/commands`,
        body: { commands: [{ code, value }] },
      })
      .then((response) => {
        if (!response?.success) {
          console.error(
            `Tuya lighting: устройство ${device.device_id} отклонило команду ` +
              `${code}=${value}: ${JSON.stringify(response)}`
          );
        }
      })
      .catch((error) => {
        console.error(
          `Tuya lighting: не удалось отправить ${code}=${value} ` +
            `устройству ${device.device_id}: ${error.message}`
        );
      });
  }

  /** @param {number} tableId */
  turnLightOn(tableId) {
    this.#on.add(tableId);
    this.#send(tableId, true);
  }

  /** @param {number} tableId */
  turnLightOff(tableId) {
    this.#on.delete(tableId);
    this.#send(tableId, false);
  }

  /** @param {number} tableId */
  isLightOn(tableId) {
    return this.#on.has(tableId);
  }
}

// Драйвер освещения для реле экосистемы Tuya (MOES WM4LT1 и совместимые).
//
// Управление идёт через официальный Tuya Cloud API: на открытие сеанса
// устройству уходит команда {code: "switch_1", value: true}, на закрытие —
// value: false. Команды отправляются асинхронно и не блокируют кассовые
// операции: если облако недоступно, сеанс всё равно откроется/закроется,
// а ошибка попадёт в лог сервера.

/**
 * @typedef {Object} TuyaDevice
 * @property {string} device_id  ID устройства из Tuya IoT Platform
 * @property {string} [switch_code] код канала реле (по умолчанию switch_1)
 */

export class TuyaLightingController {
  #client;
  #devices;
  #on = new Set();

  /**
   * @param {{request: Function}} client TuyaContext из @tuya/tuya-connector-nodejs
   *   (в тестах — совместимая заглушка)
   * @param {Record<string, TuyaDevice>} devices карта "id стола" -> устройство
   */
  constructor(client, devices) {
    this.#client = client;
    this.#devices = devices;
  }

  /** @param {number} tableId @param {boolean} value */
  #send(tableId, value) {
    const device = this.#devices[String(tableId)];
    if (!device) {
      console.warn(
        `Tuya lighting: для стола ${tableId} нет устройства в devices.json — команда пропущена`
      );
      return;
    }
    const code = device.switch_code ?? "switch_1";
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

// Управление освещением столов.
//
// Frontend и HTTP-слой ничего не знают об оборудовании — они работают
// только с контроллером из getLightingController(). Сегодня реализация
// Mock (состояние в памяти процесса), позже её заменит интеграция с
// реле MOES: достаточно написать класс с теми же тремя методами и
// вернуть его из фабрики — остальной код не изменится.

/**
 * Интерфейс контроллера освещения:
 *   turnLightOn(tableId)  — включить свет над столом;
 *   turnLightOff(tableId) — выключить свет над столом;
 *   isLightOn(tableId)    — текущее состояние света.
 */
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

const controller = new MockLightingController();

/** Точка выбора реализации (здесь появится MOES). */
export function getLightingController() {
  return controller;
}

// Тесты драйвера освещения Tuya (MOES WM4LT1): проверяем протокол —
// какие команды и на какой адрес уходят при открытии/закрытии сеанса.

import assert from "node:assert/strict";
import { test } from "node:test";

import { TuyaLightingController } from "../src/services/lighting-tuya.js";

function makeFakeClient() {
  const calls = [];
  return {
    calls,
    request(options) {
      calls.push(options);
      return Promise.resolve({ success: true });
    },
  };
}

const DEVICES = {
  1: { device_id: "bf-table-1", switch_code: "switch_1" },
  2: { device_id: "bf-multi", switch_code: "switch_3" },
};

test("включение света отправляет команду switch=true на устройство стола", async () => {
  const client = makeFakeClient();
  const lighting = new TuyaLightingController(client, DEVICES);

  lighting.turnLightOn(1);
  await Promise.resolve(); // даём уйти асинхронной отправке

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    method: "POST",
    path: "/v1.0/iot-03/devices/bf-table-1/commands",
    body: { commands: [{ code: "switch_1", value: true }] },
  });
  assert.ok(lighting.isLightOn(1));
});

test("выключение света отправляет команду switch=false", async () => {
  const client = makeFakeClient();
  const lighting = new TuyaLightingController(client, DEVICES);

  lighting.turnLightOn(1);
  lighting.turnLightOff(1);
  await Promise.resolve();

  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.calls[1].body, {
    commands: [{ code: "switch_1", value: false }],
  });
  assert.ok(!lighting.isLightOn(1));
});

test("многоканальный модуль: используется switch_code канала", async () => {
  const client = makeFakeClient();
  const lighting = new TuyaLightingController(client, DEVICES);

  lighting.turnLightOn(2);
  await Promise.resolve();

  assert.deepEqual(client.calls[0].body, {
    commands: [{ code: "switch_3", value: true }],
  });
});

test("стол без устройства в карте не ломает работу", async () => {
  const client = makeFakeClient();
  const lighting = new TuyaLightingController(client, DEVICES);

  lighting.turnLightOn(99); // устройства нет — только предупреждение в лог
  await Promise.resolve();

  assert.equal(client.calls.length, 0);
  assert.ok(lighting.isLightOn(99)); // локальное состояние всё равно ведём
});

test("ошибка облака не приводит к необработанному исключению", async () => {
  const failingClient = {
    request: () => Promise.reject(new Error("cloud down")),
  };
  const lighting = new TuyaLightingController(failingClient, DEVICES);

  lighting.turnLightOn(1); // не должно бросить
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(lighting.isLightOn(1));
});

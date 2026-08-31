// Тесты вкладки «Настройки»: сохранение подключения Tuya и привязка
// столов к реле — всё через API, без правки файлов.

import assert from "node:assert/strict";
import { test } from "node:test";
import supertest from "supertest";

import { createTable, makeApp } from "./helpers.js";

test("настройки по умолчанию: драйвер mock", async () => {
  const { app } = makeApp();
  const request = supertest(app);

  const res = await request.get("/api/settings");
  assert.equal(res.status, 200);
  assert.equal(res.body.lighting_driver, "mock");
  assert.equal(res.body.driver_active, "mock");
});

test("сохранение настроек: значения возвращаются обратно", async () => {
  const { app } = makeApp();
  const request = supertest(app);

  const res = await request.put("/api/settings").send({
    lighting_driver: "mock",
    tuya_access_id: "my-id",
    tuya_access_secret: "my-secret",
    tuya_api_host: "https://openapi.tuyaeu.com",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.tuya_access_id, "my-id");
  assert.equal(res.body.driver_active, "mock");

  const again = await request.get("/api/settings");
  assert.equal(again.body.tuya_access_id, "my-id");
});

test("драйвер tuya без ключей: сервер остаётся на mock и сообщает причину", async () => {
  const { app } = makeApp();
  const request = supertest(app);

  const res = await request.put("/api/settings").send({
    lighting_driver: "tuya",
    tuya_access_id: "",
    tuya_access_secret: "",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.driver_active, "mock");
  assert.match(res.body.driver_error, /Access/);
});

test("недопустимый драйвер отклоняется", async () => {
  const { app } = makeApp();
  const request = supertest(app);

  const res = await request
    .put("/api/settings")
    .send({ lighting_driver: "zigbee" });
  assert.equal(res.status, 409);
});

test("привязка стола к устройству сохраняется и видна в списке столов", async () => {
  const { app } = makeApp();
  const request = supertest(app);
  const table = await createTable(request);

  const res = await request
    .put(`/api/tables/${table.id}/device`)
    .send({ device_id: "bf-device-1", switch_code: "switch_2" });
  assert.equal(res.status, 200);
  assert.equal(res.body.tuya_device_id, "bf-device-1");
  assert.equal(res.body.tuya_switch_code, "switch_2");

  const list = await request.get("/api/tables");
  assert.equal(list.body[0].tuya_device_id, "bf-device-1");

  // Отвязка.
  const cleared = await request
    .put(`/api/tables/${table.id}/device`)
    .send({ device_id: null });
  assert.equal(cleared.body.tuya_device_id, null);
  assert.equal(cleared.body.tuya_switch_code, null);
});

test("недопустимый канал реле отклоняется", async () => {
  const { app } = makeApp();
  const request = supertest(app);
  const table = await createTable(request);

  const res = await request
    .put(`/api/tables/${table.id}/device`)
    .send({ device_id: "bf-1", switch_code: "switch_9" });
  assert.equal(res.status, 409);
});

test("список устройств без настроенного Tuya — понятная ошибка", async () => {
  const { app } = makeApp();
  const request = supertest(app);

  const res = await request.get("/api/settings/devices");
  assert.equal(res.status, 409);
  assert.match(res.body.detail, /не настроено/);
});

test("ручной тест реле включает и выключает свет", async () => {
  const { app } = makeApp();
  const request = supertest(app);
  const table = await createTable(request);

  const on = await request
    .post(`/api/tables/${table.id}/light`)
    .send({ on: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.light_on, true);

  const off = await request
    .post(`/api/tables/${table.id}/light`)
    .send({ on: false });
  assert.equal(off.body.light_on, false);
});

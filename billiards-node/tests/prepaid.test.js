// Тесты предоплаченных сеансов: «на время» и «на сумму».

import assert from "node:assert/strict";
import { test } from "node:test";
import supertest from "supertest";

import { adminAgent, createTable, createTariff, makeApp } from "./helpers.js";

test("предоплата на время: фиксированная сумма и способ оплаты", async () => {
  const { app } = makeApp();
  const admin = await adminAgent(app);
  const table = await createTable(admin);
  const tariff = await createTariff(admin); // 600 ₽/час

  const opened = await admin.post(`/api/tables/${table.id}/open`).send({
    tariff_id: tariff.id,
    mode: "time",
    minutes: 60,
    payment_method: "card",
  });
  assert.equal(opened.status, 201);
  assert.equal(opened.body.prepaid_seconds, 3600);
  assert.equal(opened.body.prepaid_amount, 600);
  assert.equal(opened.body.payment_method, "card");

  const dashboard = await admin.get("/api/dashboard");
  const row = dashboard.body.find((t) => t.id === table.id);
  assert.equal(row.session.prepaid, true);
  assert.ok(row.session.remaining_seconds <= 3600);
  assert.equal(row.session.expired, false);

  // Закрываем без указания способа — берётся сохранённый (card),
  // итог равен предоплате.
  const closed = await admin.post(`/api/tables/${table.id}/close`).send({});
  assert.equal(closed.body.total_cost, 600);
  assert.equal(closed.body.payment_method, "card");
});

test("предоплата на сумму: время считается по тарифу", async () => {
  const { app } = makeApp();
  const admin = await adminAgent(app);
  const table = await createTable(admin);
  const tariff = await createTariff(admin); // 600 ₽/час

  const opened = await admin.post(`/api/tables/${table.id}/open`).send({
    tariff_id: tariff.id,
    mode: "amount",
    amount: 300,
    payment_method: "cash",
  });
  assert.equal(opened.status, 201);
  assert.equal(opened.body.prepaid_amount, 300);
  assert.equal(opened.body.prepaid_seconds, 1800); // полчаса по 600 ₽/час
});

test("предоплата на сумму со скидкой клиента даёт больше времени", async () => {
  const { app } = makeApp();
  const admin = await adminAgent(app);
  const table = await createTable(admin);
  const tariff = await createTariff(admin); // 600 ₽/час
  const client = await admin.post("/api/clients").send({ name: "VIP" });
  await admin.put(`/api/clients/${client.body.id}`).send({ discount_percent: 50 });

  const opened = await admin.post(`/api/tables/${table.id}/open`).send({
    tariff_id: tariff.id,
    client_id: client.body.id,
    mode: "amount",
    amount: 300,
    payment_method: "cash",
  });
  // Со скидкой 50% эффективная цена 300 ₽/час: 300 ₽ хватает на час.
  assert.equal(opened.body.prepaid_seconds, 3600);
});

test("предоплата без способа оплаты отклоняется", async () => {
  const { app } = makeApp();
  const admin = await adminAgent(app);
  const table = await createTable(admin);
  const tariff = await createTariff(admin);

  const res = await admin.post(`/api/tables/${table.id}/open`).send({
    tariff_id: tariff.id,
    mode: "time",
    minutes: 60,
  });
  assert.equal(res.status, 409);
});

test("бар добавляется к предоплате при закрытии", async () => {
  const { app } = makeApp();
  const admin = await adminAgent(app);
  const table = await createTable(admin);
  const tariff = await createTariff(admin);
  const item = await admin.post("/api/menu").send({ name: "Кофе", price: 150 });

  await admin.post(`/api/tables/${table.id}/open`).send({
    tariff_id: tariff.id,
    mode: "time",
    minutes: 30,
    payment_method: "cash",
  });
  await admin
    .post(`/api/tables/${table.id}/orders`)
    .send({ menu_item_id: item.body.id });

  const closed = await admin.post(`/api/tables/${table.id}/close`).send({});
  assert.equal(closed.body.total_cost, 300 + 150);
});

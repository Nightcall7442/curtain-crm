"use strict";

/**
 * Dashboard бильярдного клуба.
 *
 * Источник истины — сервер: /api/dashboard возвращает elapsed_seconds и
 * current_cost на момент ответа. Между опросами (раз в POLL_MS) таймер и
 * стоимость тикают локально от этой базы, поэтому обновление страницы
 * ничего не сбрасывает.
 */

const POLL_MS = 5000;
const TICK_MS = 1000;

const state = {
  tables: [],          // ответ /api/dashboard
  fetchedAt: 0,        // performance.now() в момент ответа
  tariffs: [],
  tariffChoice: new Map(), // table_id -> выбранный tariff_id в селекте
  clientDraft: new Map(),  // table_id -> набранный текст в поле клиента
  devices: [],         // устройства Tuya для вкладки «Настройки»
  user: null,          // текущий сотрудник {id, name, role}
  shift: null,         // открытая кассовая смена или null
  clients: [],         // клиентская база для быстрого выбора при открытии
  autoTariffId: null,  // тариф по расписанию на «сейчас»
};

const PAYMENT_LABELS = { cash: "Наличные", card: "Карта", transfer: "Перевод" };

// ---------------------------------------------------------------- helpers

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Требуется вход");
  }
  if (!response.ok) {
    let detail = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) {
        detail = typeof body.detail === "string" ? body.detail : detail;
      }
    } catch (_) { /* тело не JSON — оставляем статус */ }
    throw new Error(detail);
  }
  return response.json();
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function formatMoney(rubles) {
  return rubles.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ---------------------------------------------------------------- modal

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
}

/** Показывает модальное окно с заголовком и произвольным содержимым. */
function openModal(title, bodyNode) {
  const modal = document.getElementById("modal");
  modal.replaceChildren();
  const head = document.createElement("div");
  head.className = "modal-head";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const close = document.createElement("button");
  close.className = "mini";
  close.textContent = "✕";
  close.addEventListener("click", closeModal);
  head.append(heading, close);
  modal.append(head, bodyNode);
  document.getElementById("modal-overlay").hidden = false;
}

let toastTimer = null;
function showToast(message, ok = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("ok", ok);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

// ---------------------------------------------------------------- dashboard

function liveElapsedSeconds(table) {
  const drift = (performance.now() - state.fetchedAt) / 1000;
  return table.session.elapsed_seconds + drift;
}

function liveCost(table) {
  const perSecond = table.session.price_per_hour / 3600;
  return liveElapsedSeconds(table) * perSecond;
}

function clientOptionLabel(client) {
  return client.phone ? `${client.name} — ${client.phone}` : client.name;
}

function renderClientsDatalist() {
  const datalist = document.getElementById("clients-datalist");
  datalist.replaceChildren();
  for (const client of state.clients) {
    const option = document.createElement("option");
    option.value = clientOptionLabel(client);
    datalist.append(option);
  }
}

function clientIdFromInput(value) {
  const text = value.trim();
  if (!text) return null;
  const client = state.clients.find((c) => clientOptionLabel(c) === text);
  return client ? client.id : null;
}

function bookingBadge(table) {
  if (!table.booking) return null;
  const startsMs = Date.parse(table.booking.starts_at);
  const minutesLeft = Math.round((startsMs - Date.now()) / 60000);
  const el = document.createElement("div");
  el.className = "booking-note" + (minutesLeft <= 60 ? " soon" : "");
  const when = new Date(startsMs).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  el.textContent =
    minutesLeft <= 0
      ? `📅 Бронь сейчас: ${table.booking.client_name}`
      : `📅 Бронь в ${when} — ${table.booking.client_name}`;
  return el;
}

function renderTables() {
  const container = document.getElementById("tables");
  container.replaceChildren();

  for (const table of state.tables) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.tableId = String(table.id);

    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("h2");
    title.textContent = table.name;
    const badge = document.createElement("span");
    badge.className = `badge ${table.status}`;
    badge.textContent = table.status === "busy" ? "ЗАНЯТ" : "СВОБОДЕН";
    head.append(title, badge);
    card.append(head);

    const light = document.createElement("div");
    light.className = "light";
    light.textContent = table.light_on ? "💡 Свет включён" : "🌑 Свет выключен";
    card.append(light);

    const booking = bookingBadge(table);
    if (booking) card.append(booking);

    if (table.session) {
      const timer = document.createElement("div");
      timer.className = "timer";
      timer.dataset.role = "timer";
      timer.textContent = formatDuration(liveElapsedSeconds(table));

      const cost = document.createElement("div");
      cost.className = "cost";
      cost.dataset.role = "cost";
      cost.textContent = `${formatMoney(liveCost(table))} ₽`;

      const meta = document.createElement("div");
      meta.className = "session-meta";
      const parts = [
        `Тариф «${table.session.tariff_name}» — ${table.session.price_per_hour} ₽/час`,
        `начало ${formatDateTime(table.session.started_at)}`,
      ];
      if (table.session.client_name) {
        parts.push(
          `клиент ${table.session.client_name}` +
            (table.session.discount_percent
              ? ` (скидка ${table.session.discount_percent}%)`
              : "")
        );
      }
      meta.textContent = parts.join(", ");

      const barBtn = document.createElement("button");
      barBtn.className = "action bar";
      barBtn.textContent = "🍹 БАР";
      barBtn.addEventListener("click", () => openBarModal(table));

      const closeBtn = document.createElement("button");
      closeBtn.className = "action close";
      closeBtn.textContent = "ЗАКРЫТЬ";
      closeBtn.addEventListener("click", () => openCloseModal(table));

      card.append(timer, cost, meta, barBtn, closeBtn);
    } else {
      const select = document.createElement("select");
      const activeTariffs = state.tariffs.filter((t) => t.is_active);
      for (const tariff of activeTariffs) {
        const option = document.createElement("option");
        option.value = String(tariff.id);
        const auto = tariff.id === state.autoTariffId ? " · авто" : "";
        option.textContent = `${tariff.name} — ${tariff.price_per_hour} ₽/час${auto}`;
        select.append(option);
      }
      // Приоритет: выбор кассира, затем тариф по расписанию.
      const remembered = state.tariffChoice.get(table.id);
      if (remembered && activeTariffs.some((t) => t.id === remembered)) {
        select.value = String(remembered);
      } else if (state.autoTariffId) {
        select.value = String(state.autoTariffId);
      }
      select.addEventListener("change", () => {
        state.tariffChoice.set(table.id, Number(select.value));
      });

      const clientInput = document.createElement("input");
      clientInput.type = "text";
      clientInput.placeholder = "Клиент (не обязательно)";
      clientInput.setAttribute("list", "clients-datalist");
      // Периодическая перерисовка не должна стирать набранный текст.
      clientInput.value = state.clientDraft.get(table.id) ?? "";
      clientInput.addEventListener("input", () => {
        state.clientDraft.set(table.id, clientInput.value);
      });

      const openBtn = document.createElement("button");
      openBtn.className = "action open";
      openBtn.textContent = "ОТКРЫТЬ";
      if (!activeTariffs.length) {
        openBtn.disabled = true;
        openBtn.textContent = "НЕТ АКТИВНЫХ ТАРИФОВ";
      }
      openBtn.addEventListener("click", () => openTable(table, select, clientInput));

      card.append(select, clientInput, openBtn);
    }

    container.append(card);
  }
}

/** Секундный тик: обновляет только цифры, без перерисовки карточек. */
function tick() {
  for (const table of state.tables) {
    if (!table.session) continue;
    const card = document.querySelector(`.card[data-table-id="${table.id}"]`);
    if (!card) continue;
    const timer = card.querySelector('[data-role="timer"]');
    const cost = card.querySelector('[data-role="cost"]');
    if (timer) timer.textContent = formatDuration(liveElapsedSeconds(table));
    if (cost) cost.textContent = `${formatMoney(liveCost(table))} ₽`;
  }
}

async function refreshDashboard() {
  const [tables, tariffs, auto] = await Promise.all([
    api("/api/dashboard"),
    api("/api/tariffs"),
    api("/api/tariffs/auto"),
  ]);
  state.tables = tables;
  state.tariffs = tariffs;
  state.autoTariffId = auto.tariff_id;
  state.fetchedAt = performance.now();
  renderTables();
}

async function loadClients() {
  state.clients = await api("/api/clients");
  renderClientsDatalist();
}

async function openTable(table, select, clientInput) {
  if (!select.value) {
    showToast("Сначала добавьте тариф");
    return;
  }
  const clientText = clientInput.value.trim();
  const clientId = clientIdFromInput(clientText);
  if (clientText && clientId === null) {
    showToast("Клиент не найден — выберите из списка или оставьте поле пустым");
    return;
  }
  try {
    await api(`/api/tables/${table.id}/open`, {
      method: "POST",
      body: JSON.stringify({ tariff_id: Number(select.value), client_id: clientId }),
    });
    state.clientDraft.delete(table.id);
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    await refreshDashboard();
  }
}

// --- Бар: заказ на открытый сеанс ---

async function openBarModal(table) {
  let menu, check;
  try {
    [menu, check] = await Promise.all([
      api("/api/menu?only_active=true"),
      api(`/api/tables/${table.id}/check`),
    ]);
  } catch (error) {
    showToast(error.message);
    return;
  }

  const body = document.createElement("div");

  const ordersBox = document.createElement("div");
  ordersBox.className = "orders-box";

  const renderOrders = (orders, barTotal) => {
    ordersBox.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Заказов пока нет.";
      ordersBox.append(empty);
    }
    for (const order of orders) {
      const row = document.createElement("div");
      row.className = "order-row";
      const label = document.createElement("span");
      label.textContent =
        `${order.item_name} × ${order.quantity} — ` +
        `${formatMoney((order.price ?? order.price_kopecks / 100) * order.quantity)} ₽`;
      const del = document.createElement("button");
      del.className = "mini";
      del.textContent = "Убрать";
      del.addEventListener("click", async () => {
        try {
          const result = await api(`/api/orders/${order.id}`, { method: "DELETE" });
          renderOrders(result.orders, result.bar_total);
          refreshDashboard().catch(() => {});
        } catch (error) {
          showToast(error.message);
        }
      });
      row.append(label, del);
      ordersBox.append(row);
    }
    const total = document.createElement("p");
    total.className = "order-total";
    total.textContent = `Бар всего: ${formatMoney(barTotal)} ₽`;
    ordersBox.append(total);
  };

  const menuBox = document.createElement("div");
  menuBox.className = "menu-grid";
  if (!menu.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Меню пусто — администратор добавляет позиции во вкладке «Бар».";
    menuBox.append(empty);
  }
  for (const item of menu) {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.textContent = `${item.name} · ${item.price} ₽`;
    btn.addEventListener("click", async () => {
      try {
        const result = await api(`/api/tables/${table.id}/orders`, {
          method: "POST",
          body: JSON.stringify({ menu_item_id: item.id, quantity: 1 }),
        });
        renderOrders(result.orders, result.bar_total);
        refreshDashboard().catch(() => {});
      } catch (error) {
        showToast(error.message);
      }
    });
    menuBox.append(btn);
  }

  body.append(menuBox, ordersBox);
  renderOrders(
    check.orders.map((o) => ({ ...o })),
    check.bar_cost
  );
  openModal(`Бар — ${table.name}`, body);
}

// --- Закрытие стола: чек, способ оплаты, печать ---

async function openCloseModal(table) {
  let check;
  try {
    check = await api(`/api/tables/${table.id}/check`);
  } catch (error) {
    showToast(error.message);
    return;
  }

  const body = document.createElement("div");

  const lines = document.createElement("div");
  lines.className = "check-lines";
  const addLine = (label, value, strong = false) => {
    const row = document.createElement("div");
    row.className = "check-line" + (strong ? " strong" : "");
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("span");
    v.textContent = value;
    row.append(l, v);
    lines.append(row);
  };
  addLine(
    `Время (${formatDuration(check.billed_seconds)})`,
    `${formatMoney(check.time_cost)} ₽`
  );
  if (check.discount_percent > 0) {
    addLine(
      `Скидка ${check.discount_percent}%${check.client_name ? ` — ${check.client_name}` : ""}`,
      `−${formatMoney(check.time_cost - check.discounted_time)} ₽`
    );
  }
  if (check.bar_cost > 0) {
    addLine("Бар", `${formatMoney(check.bar_cost)} ₽`);
  }
  addLine("К оплате", `${formatMoney(check.total)} ₽`, true);
  body.append(lines);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Выберите способ оплаты — стол закроется сразу.";
  body.append(hint);

  const buttons = document.createElement("div");
  buttons.className = "pay-buttons";
  for (const [method, label] of Object.entries(PAYMENT_LABELS)) {
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      try {
        const session = await api(`/api/tables/${table.id}/close`, {
          method: "POST",
          body: JSON.stringify({ payment_method: method }),
        });
        closeModal();
        showToast(
          `Сеанс закрыт: ${table.name}, итог ${formatMoney(session.total_cost)} ₽ (${label.toLowerCase()})`,
          true
        );
        await refreshDashboard();
        openReceipt(session.id);
      } catch (error) {
        showToast(error.message);
        closeModal();
        await refreshDashboard();
      }
    });
    buttons.append(btn);
  }
  body.append(buttons);

  openModal(`Закрытие — ${table.name}`, body);
}

// --- Чек: печать ---

async function openReceipt(sessionId) {
  let receipt;
  try {
    receipt = await api(`/api/sessions/${sessionId}`);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const esc = (text) =>
    String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const orderRows = receipt.orders
    .map(
      (o) =>
        `<tr><td>${esc(o.item_name)} × ${o.quantity}</td>` +
        `<td class="r">${formatMoney(o.price * o.quantity)} ₽</td></tr>`
    )
    .join("");
  const discountRow =
    receipt.discount_percent > 0
      ? `<tr><td>Скидка ${receipt.discount_percent}%</td><td class="r">−${formatMoney(
          (receipt.time_cost ?? 0) * receipt.discount_percent / 100
        )} ₽</td></tr>`
      : "";
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
    <title>Чек №${receipt.id}</title>
    <style>
      body { font-family: "Courier New", monospace; max-width: 320px; margin: 20px auto; font-size: 13px; color: #000; }
      h2 { text-align: center; font-size: 15px; margin: 0 0 4px; }
      .center { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      td { padding: 2px 0; vertical-align: top; }
      .r { text-align: right; white-space: nowrap; }
      .total td { border-top: 1px dashed #000; font-weight: bold; padding-top: 6px; }
      hr { border: 0; border-top: 1px dashed #000; }
    </style></head><body>
    <h2>${esc(receipt.club_name)}</h2>
    <p class="center">Чек №${receipt.id} · ${esc(receipt.table_name)}</p>
    <hr>
    <table>
      <tr><td>Начало</td><td class="r">${new Date(receipt.started_at).toLocaleString("ru-RU")}</td></tr>
      <tr><td>Конец</td><td class="r">${new Date(receipt.ended_at).toLocaleString("ru-RU")}</td></tr>
      <tr><td>Длительность</td><td class="r">${formatDuration(receipt.duration_seconds)}</td></tr>
      <tr><td>Тариф</td><td class="r">${esc(receipt.tariff_name)} · ${receipt.price_per_hour} ₽/ч</td></tr>
      ${receipt.client_name ? `<tr><td>Клиент</td><td class="r">${esc(receipt.client_name)}</td></tr>` : ""}
    </table>
    <hr>
    <table>
      <tr><td>Время игры</td><td class="r">${formatMoney(receipt.time_cost ?? receipt.total_cost)} ₽</td></tr>
      ${discountRow}
      ${orderRows}
      <tr class="total"><td>ИТОГО</td><td class="r">${formatMoney(receipt.total_cost)} ₽</td></tr>
      <tr><td>Оплата</td><td class="r">${PAYMENT_LABELS[receipt.payment_method] ?? "—"}</td></tr>
      ${receipt.closed_by_name ? `<tr><td>Кассир</td><td class="r">${esc(receipt.closed_by_name)}</td></tr>` : ""}
    </table>
    <p class="center">Спасибо! Ждём вас снова 🎱</p>
    <script>window.print();</` + `script></body></html>`;
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) {
    showToast("Разрешите всплывающие окна для печати чека");
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------- auth & shift

function renderUserChip() {
  const chip = document.getElementById("user-chip");
  const role = state.user.role === "admin" ? "администратор" : "кассир";
  chip.textContent = `${state.user.name} · ${role}`;
}

/** Индикатор и кнопка смены в шапке. */
function renderShiftBar() {
  const chip = document.getElementById("shift-chip");
  const toggle = document.getElementById("shift-toggle");
  if (state.shift) {
    chip.hidden = false;
    chip.classList.add("open");
    const openedAt = new Date(state.shift.opened_at).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    chip.textContent =
      `Смена с ${openedAt} · ${formatMoney(state.shift.revenue)} ₽`;
    toggle.textContent = "Закрыть смену";
  } else {
    chip.hidden = state.user.role !== "cashier";
    chip.classList.remove("open");
    chip.textContent = "Смена не открыта";
    toggle.textContent = "Открыть смену";
  }
}

async function refreshShift() {
  state.shift = await api("/api/shifts/current");
  renderShiftBar();
}

/** Модальное окно с полем суммы наличных (открытие/закрытие смены). */
function cashModal(title, hint, buttonLabel, onSubmit) {
  const body = document.createElement("div");
  const p = document.createElement("p");
  p.className = "hint";
  p.textContent = hint;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.placeholder = "Сумма, ₽ (можно оставить пустым)";
  input.className = "cash-input";
  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = buttonLabel;
  btn.addEventListener("click", () => {
    const raw = input.value.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      showToast("Сумма должна быть числом не меньше нуля");
      return;
    }
    onSubmit(value);
  });
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  actions.append(btn);
  body.append(p, input, actions);
  openModal(title, body);
  input.focus();
}

async function toggleShift() {
  if (state.shift) {
    cashModal(
      "Закрытие смены",
      `Пересчитайте наличные в кассе и укажите фактическую сумму — система сравнит с расчётной` +
        (state.shift.expected_cash !== null
          ? ` (${formatMoney(state.shift.expected_cash)} ₽)`
          : "") + ".",
      "Закрыть смену",
      async (closingCash) => {
        try {
          const closed = await api("/api/shifts/close", {
            method: "POST",
            body: JSON.stringify({ closing_cash: closingCash }),
          });
          closeModal();
          let message =
            `Смена закрыта: сеансов ${closed.sessions_count}, ` +
            `выручка ${formatMoney(closed.revenue)} ₽`;
          if (closed.cash_discrepancy !== null) {
            message +=
              closed.cash_discrepancy === 0
                ? ", касса сошлась"
                : `, расхождение ${formatMoney(closed.cash_discrepancy)} ₽`;
          }
          showToast(message, closed.cash_discrepancy === null || closed.cash_discrepancy === 0);
          state.shift = null;
          renderShiftBar();
        } catch (error) {
          showToast(error.message);
        }
      }
    );
  } else {
    cashModal(
      "Открытие смены",
      "Укажите наличные в кассе на начало смены — по ним считается пересдача.",
      "Открыть смену",
      async (openingCash) => {
        try {
          state.shift = await api("/api/shifts/open", {
            method: "POST",
            body: JSON.stringify({ opening_cash: openingCash }),
          });
          closeModal();
          showToast("Смена открыта", true);
          renderShiftBar();
        } catch (error) {
          showToast(error.message);
        }
      }
    );
  }
}

// ---------------------------------------------------------------- history

async function refreshHistory() {
  const rows = document.getElementById("history-rows");
  const sessions = await api("/api/history");
  rows.replaceChildren();
  for (const s of sessions) {
    const tr = document.createElement("tr");
    const cells = [
      s.table_name + (s.client_name ? ` · ${s.client_name}` : ""),
      `${s.tariff_name} (${s.price_per_hour} ₽/час)` +
        (s.discount_percent ? `, скидка ${s.discount_percent}%` : ""),
      formatDateTime(s.started_at),
      formatDuration(s.duration_seconds),
      s.bar_cost ? formatMoney(s.bar_cost) : "—",
      formatMoney(s.total_cost),
      PAYMENT_LABELS[s.payment_method] ?? "—",
      s.closed_by_name ?? s.opened_by_name ?? "—",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const receiptCell = document.createElement("td");
    const receiptBtn = document.createElement("button");
    receiptBtn.className = "mini";
    receiptBtn.textContent = "Чек";
    receiptBtn.addEventListener("click", () => openReceipt(s.id));
    receiptCell.append(receiptBtn);
    tr.append(receiptCell);
    rows.append(tr);
  }
  document.getElementById("history-empty").hidden = sessions.length > 0;
}

// ---------------------------------------------------------------- journal

const EVENT_LABELS = {
  table_created: "Создан стол",
  tariff_created: "Создан тариф",
  session_opened: "Сеанс открыт",
  session_closed: "Сеанс закрыт",
  light_on: "Свет включён",
  light_off: "Свет выключен",
  shift_opened: "Смена открыта",
  shift_closed: "Смена закрыта",
  user_created: "Создан сотрудник",
  user_updated: "Обновлён сотрудник",
  settings_updated: "Изменены настройки",
  booking_created: "Создана бронь",
  booking_cancelled: "Отменена бронь",
  client_created: "Добавлен клиент",
};

async function refreshJournal() {
  const rows = document.getElementById("journal-rows");
  const entries = await api("/api/journal");
  rows.replaceChildren();
  for (const entry of entries) {
    const tr = document.createElement("tr");
    const cells = [
      formatDateTime(entry.created_at),
      EVENT_LABELS[entry.event] ?? entry.event,
      entry.message,
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    rows.append(tr);
  }
  document.getElementById("journal-empty").hidden = entries.length > 0;
}

// ---------------------------------------------------------------- tariffs

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function minutesToTime(minutes) {
  const m = minutes % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function initDaysPicker() {
  const box = document.getElementById("rule-days");
  if (box.childElementCount) return;
  DAY_NAMES.forEach((name, index) => {
    const label = document.createElement("label");
    label.className = "day-chip";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(index + 1);
    const span = document.createElement("span");
    span.textContent = name;
    label.append(checkbox, span);
    box.append(label);
  });
}

async function refreshTariffs() {
  const rows = document.getElementById("tariff-rows");
  const tariffs = await api("/api/tariffs");
  state.tariffs = tariffs;
  rows.replaceChildren();
  for (const tariff of tariffs) {
    const tr = document.createElement("tr");
    const cells = [
      tariff.name,
      String(tariff.price_per_hour),
      tariff.is_active ? "Да" : "Нет",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    rows.append(tr);
  }

  // Расписание тарифов (только у администратора).
  if (state.user.role !== "admin") return;
  initDaysPicker();

  const tariffSelect = document.getElementById("rule-tariff");
  const selected = tariffSelect.value;
  tariffSelect.replaceChildren();
  for (const tariff of tariffs.filter((t) => t.is_active)) {
    const option = document.createElement("option");
    option.value = String(tariff.id);
    option.textContent = `${tariff.name} — ${tariff.price_per_hour} ₽/час`;
    tariffSelect.append(option);
  }
  if (selected) tariffSelect.value = selected;

  const rules = await api("/api/tariff-rules");
  const ruleRows = document.getElementById("rule-rows");
  ruleRows.replaceChildren();
  for (const rule of rules) {
    const tr = document.createElement("tr");
    const cells = [
      `${rule.tariff_name} (${rule.price_per_hour} ₽/час)`,
      rule.days.map((d) => DAY_NAMES[d - 1]).join(", "),
      `${minutesToTime(rule.start_minute)}–${minutesToTime(rule.end_minute)}` +
        (rule.end_minute <= rule.start_minute ? " (через полночь)" : ""),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const actions = document.createElement("td");
    const del = document.createElement("button");
    del.className = "mini";
    del.textContent = "Удалить";
    del.addEventListener("click", async () => {
      try {
        await api(`/api/tariff-rules/${rule.id}`, { method: "DELETE" });
        await refreshTariffs();
      } catch (error) {
        showToast(error.message);
      }
    });
    actions.append(del);
    tr.append(actions);
    ruleRows.append(tr);
  }
  document.getElementById("rules-empty").hidden = rules.length > 0;
}

function timeToMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

async function addTariffRule() {
  const days = [...document.querySelectorAll("#rule-days input:checked")].map((c) =>
    Number(c.value)
  );
  if (!days.length) {
    showToast("Отметьте хотя бы один день недели");
    return;
  }
  try {
    await api("/api/tariff-rules", {
      method: "POST",
      body: JSON.stringify({
        tariff_id: Number(document.getElementById("rule-tariff").value),
        days,
        start_minute: timeToMinutes(document.getElementById("rule-start").value),
        end_minute: timeToMinutes(document.getElementById("rule-end").value),
      }),
    });
    showToast("Правило добавлено", true);
    await refreshTariffs();
  } catch (error) {
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- reports

async function refreshReports() {
  const days = Number(document.getElementById("stats-days").value);
  const revenueDays = Number(document.getElementById("revenue-days").value);
  const [shifts, stats, revenue] = await Promise.all([
    api("/api/shifts"),
    api(`/api/stats/tables?days=${days}`),
    api(`/api/stats/revenue?days=${revenueDays}`),
  ]);

  const shiftRows = document.getElementById("shift-rows");
  shiftRows.replaceChildren();
  for (const shift of shifts) {
    const tr = document.createElement("tr");
    const cashBox =
      shift.closing_cash !== null || shift.expected_cash !== null
        ? `${shift.closing_cash !== null ? formatMoney(shift.closing_cash) : "—"} / ` +
          `${shift.expected_cash !== null ? formatMoney(shift.expected_cash) : "—"}`
        : "—";
    const cells = [
      shift.user_name,
      formatDateTime(shift.opened_at),
      shift.closed_at ? formatDateTime(shift.closed_at) : "открыта",
      String(shift.sessions_count),
      formatMoney(shift.revenue),
      `${formatMoney(shift.cash)} / ${formatMoney(shift.card)} / ${formatMoney(shift.transfer)}`,
      cashBox,
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const discrepancyCell = document.createElement("td");
    if (shift.cash_discrepancy === null) {
      discrepancyCell.textContent = "—";
    } else if (shift.cash_discrepancy === 0) {
      discrepancyCell.textContent = "сошлось";
      discrepancyCell.className = "ok-text";
    } else {
      discrepancyCell.textContent = `${formatMoney(shift.cash_discrepancy)} ₽`;
      discrepancyCell.className = "bad-text";
    }
    tr.append(discrepancyCell);
    shiftRows.append(tr);
  }
  document.getElementById("shifts-empty").hidden = shifts.length > 0;

  // Выручка по дням.
  const revenueRows = document.getElementById("revenue-rows");
  revenueRows.replaceChildren();
  const maxDayTotal = Math.max(1, ...revenue.days.map((d) => d.total));
  for (const day of revenue.days) {
    const tr = document.createElement("tr");
    const cells = [
      new Date(`${day.day}T00:00:00`).toLocaleDateString("ru-RU", {
        day: "2-digit", month: "2-digit", weekday: "short",
      }),
      String(day.sessions_count),
      formatMoney(day.cash),
      formatMoney(day.card),
      formatMoney(day.transfer),
      formatMoney(day.total),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const barCell = document.createElement("td");
    const bar = document.createElement("div");
    bar.className = "load-bar";
    const fill = document.createElement("div");
    fill.className = "load-bar-fill";
    fill.style.width = `${Math.round((day.total / maxDayTotal) * 100)}%`;
    bar.append(fill);
    barCell.append(bar);
    tr.append(barCell);
    revenueRows.append(tr);
  }
  document.getElementById("revenue-empty").hidden = revenue.days.length > 0;

  // Пиковые часы: 24 столбика.
  const hoursChart = document.getElementById("hours-chart");
  hoursChart.replaceChildren();
  const maxHour = Math.max(1, ...revenue.hours.map((h) => h.sessions_count));
  for (const { hour, sessions_count } of revenue.hours) {
    const col = document.createElement("div");
    col.className = "hour-col";
    const bar = document.createElement("div");
    bar.className = "hour-bar";
    bar.style.height = `${Math.round((sessions_count / maxHour) * 100)}%`;
    bar.title = `${String(hour).padStart(2, "0")}:00 — сеансов: ${sessions_count}`;
    const label = document.createElement("span");
    label.className = "hour-label";
    label.textContent = hour % 3 === 0 ? String(hour).padStart(2, "0") : "";
    col.append(bar, label);
    hoursChart.append(col);
  }

  const statsRows = document.getElementById("stats-rows");
  statsRows.replaceChildren();
  const maxRevenue = Math.max(1, ...stats.tables.map((t) => t.revenue));
  for (const table of stats.tables) {
    const tr = document.createElement("tr");
    const hours = table.busy_seconds / 3600;
    const cells = [
      table.name,
      String(table.sessions_count),
      hours >= 0.1 ? `${hours.toFixed(1)} ч` : "—",
      formatMoney(table.revenue),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const barCell = document.createElement("td");
    const bar = document.createElement("div");
    bar.className = "load-bar";
    const fill = document.createElement("div");
    fill.className = "load-bar-fill";
    fill.style.width = `${Math.round((table.revenue / maxRevenue) * 100)}%`;
    bar.append(fill);
    barCell.append(bar);
    tr.append(barCell);
    statsRows.append(tr);
  }
}

// ---------------------------------------------------------------- bookings

async function refreshBookings() {
  const [bookings, tables] = await Promise.all([
    api("/api/bookings"),
    api("/api/tables"),
  ]);

  const tableSelect = document.getElementById("booking-table");
  const selected = tableSelect.value;
  tableSelect.replaceChildren();
  for (const table of tables) {
    const option = document.createElement("option");
    option.value = String(table.id);
    option.textContent = table.name;
    tableSelect.append(option);
  }
  if (selected) tableSelect.value = selected;

  const rows = document.getElementById("booking-rows");
  rows.replaceChildren();
  for (const booking of bookings) {
    const tr = document.createElement("tr");
    const cells = [
      booking.table_name,
      formatDateTime(booking.starts_at),
      `${booking.duration_minutes} мин`,
      booking.client_name,
      booking.phone ?? "—",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const actions = document.createElement("td");
    const cancel = document.createElement("button");
    cancel.className = "mini";
    cancel.textContent = "Отменить";
    cancel.addEventListener("click", async () => {
      try {
        await api(`/api/bookings/${booking.id}/cancel`, { method: "POST" });
        showToast("Бронь отменена", true);
        await refreshBookings();
      } catch (error) {
        showToast(error.message);
      }
    });
    actions.append(cancel);
    tr.append(actions);
    rows.append(tr);
  }
  document.getElementById("bookings-empty").hidden = bookings.length > 0;
}

async function addBooking() {
  const startValue = document.getElementById("booking-start").value;
  if (!startValue) {
    showToast("Укажите дату и время брони");
    return;
  }
  try {
    await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        table_id: Number(document.getElementById("booking-table").value),
        starts_at: new Date(startValue).toISOString(),
        duration_minutes: Number(document.getElementById("booking-duration").value),
        client_name: document.getElementById("booking-name").value.trim(),
        phone: document.getElementById("booking-phone").value.trim(),
      }),
    });
    document.getElementById("booking-name").value = "";
    document.getElementById("booking-phone").value = "";
    showToast("Бронь создана", true);
    await refreshBookings();
  } catch (error) {
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- clients tab

async function refreshClientsTab() {
  const query = document.getElementById("client-search").value.trim();
  const clients = await api(`/api/clients?query=${encodeURIComponent(query)}`);
  state.clients = clients;
  renderClientsDatalist();

  const rows = document.getElementById("client-rows");
  rows.replaceChildren();
  for (const client of clients) {
    const tr = document.createElement("tr");
    const cells = [
      client.name,
      client.phone ?? "—",
      client.discount_percent ? `${client.discount_percent}%` : "—",
      String(client.visits),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    if (state.user.role === "admin") {
      const actions = document.createElement("td");
      const discountBtn = document.createElement("button");
      discountBtn.className = "mini";
      discountBtn.textContent = "Скидка";
      discountBtn.addEventListener("click", async () => {
        const value = prompt(
          `Скидка для «${client.name}» в процентах (0–100):`,
          String(client.discount_percent)
        );
        if (value === null) return;
        try {
          await api(`/api/clients/${client.id}`, {
            method: "PUT",
            body: JSON.stringify({ discount_percent: Number(value) }),
          });
          showToast("Скидка обновлена", true);
          await refreshClientsTab();
        } catch (error) {
          showToast(error.message);
        }
      });
      actions.append(discountBtn);
      tr.append(actions);
    }
    rows.append(tr);
  }
  document.getElementById("clients-empty").hidden = clients.length > 0;
}

async function addClient() {
  try {
    await api("/api/clients", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("new-client-name").value.trim(),
        phone: document.getElementById("new-client-phone").value.trim(),
      }),
    });
    document.getElementById("new-client-name").value = "";
    document.getElementById("new-client-phone").value = "";
    showToast("Клиент добавлен", true);
    await refreshClientsTab();
  } catch (error) {
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- menu tab

async function refreshMenuTab() {
  const items = await api("/api/menu");
  const rows = document.getElementById("menu-rows");
  rows.replaceChildren();
  for (const item of items) {
    const tr = document.createElement("tr");
    const cells = [
      item.name,
      item.category || "—",
      String(item.price),
      item.is_active ? "в продаже" : "скрыта",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const actions = document.createElement("td");
    actions.className = "user-actions";

    const priceBtn = document.createElement("button");
    priceBtn.className = "mini";
    priceBtn.textContent = "Цена";
    priceBtn.addEventListener("click", async () => {
      const value = prompt(`Новая цена «${item.name}», ₽:`, String(item.price));
      if (value === null) return;
      try {
        await api(`/api/menu/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ price: Number(value) }),
        });
        await refreshMenuTab();
      } catch (error) {
        showToast(error.message);
      }
    });

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "mini";
    toggleBtn.textContent = item.is_active ? "Скрыть" : "Вернуть";
    toggleBtn.addEventListener("click", async () => {
      try {
        await api(`/api/menu/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: !item.is_active }),
        });
        await refreshMenuTab();
      } catch (error) {
        showToast(error.message);
      }
    });

    actions.append(priceBtn, toggleBtn);
    tr.append(actions);
    rows.append(tr);
  }
}

async function addMenuItem() {
  try {
    await api("/api/menu", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("new-menu-name").value.trim(),
        category: document.getElementById("new-menu-category").value.trim(),
        price: Number(document.getElementById("new-menu-price").value),
      }),
    });
    for (const id of ["new-menu-name", "new-menu-category", "new-menu-price"]) {
      document.getElementById(id).value = "";
    }
    showToast("Позиция добавлена", true);
    await refreshMenuTab();
  } catch (error) {
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- users

const ROLE_LABELS = { admin: "Администратор", cashier: "Кассир" };

async function refreshUsers() {
  const users = await api("/api/users");
  const rows = document.getElementById("user-rows");
  rows.replaceChildren();
  for (const user of users) {
    const tr = document.createElement("tr");

    for (const text of [user.login, user.name, ROLE_LABELS[user.role]]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }

    const statusCell = document.createElement("td");
    statusCell.textContent = user.is_active ? "активен" : "отключён";
    tr.append(statusCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "user-actions";

    const passwordBtn = document.createElement("button");
    passwordBtn.className = "mini";
    passwordBtn.textContent = "Сбросить пароль";
    passwordBtn.addEventListener("click", async () => {
      const password = prompt(`Новый пароль для «${user.name}»:`);
      if (!password) return;
      try {
        await api(`/api/users/${user.id}`, {
          method: "PUT",
          body: JSON.stringify({ password }),
        });
        showToast("Пароль обновлён", true);
      } catch (error) {
        showToast(error.message);
      }
    });
    actionsCell.append(passwordBtn);

    if (user.id !== state.user.id) {
      const activeBtn = document.createElement("button");
      activeBtn.className = "mini";
      activeBtn.textContent = user.is_active ? "Отключить" : "Включить";
      activeBtn.addEventListener("click", async () => {
        try {
          await api(`/api/users/${user.id}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: !user.is_active }),
          });
          await refreshUsers();
        } catch (error) {
          showToast(error.message);
        }
      });
      actionsCell.append(activeBtn);
    }

    tr.append(actionsCell);
    rows.append(tr);
  }
}

async function addUser() {
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        login: document.getElementById("new-user-login").value.trim(),
        name: document.getElementById("new-user-name").value.trim(),
        password: document.getElementById("new-user-password").value,
        role: document.getElementById("new-user-role").value,
      }),
    });
    for (const id of ["new-user-login", "new-user-name", "new-user-password"]) {
      document.getElementById(id).value = "";
    }
    showToast("Аккаунт создан", true);
    await refreshUsers();
  } catch (error) {
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- settings

const SWITCH_CODES = ["switch_1", "switch_2", "switch_3", "switch_4"];

function deviceLabel(device) {
  const online =
    device.online === null ? "" : device.online ? "" : " (офлайн)";
  return `${device.name}${online}`;
}

function buildDeviceSelect(current) {
  const select = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— не привязано —";
  select.append(none);
  for (const device of state.devices) {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = deviceLabel(device);
    select.append(option);
  }
  // Привязанное ранее устройство, которого нет в загруженном списке.
  if (current && !state.devices.some((d) => d.id === current)) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = current;
    select.append(option);
  }
  select.value = current ?? "";
  return select;
}

async function saveBinding(tableId, deviceSelect, channelSelect) {
  try {
    await api(`/api/tables/${tableId}/device`, {
      method: "PUT",
      body: JSON.stringify({
        device_id: deviceSelect.value || null,
        switch_code: channelSelect.value,
      }),
    });
    showToast("Привязка сохранена", true);
  } catch (error) {
    showToast(error.message);
  }
}

function renderBindings(tables) {
  const rows = document.getElementById("binding-rows");
  rows.replaceChildren();
  for (const table of tables) {
    const tr = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = table.name;

    const deviceCell = document.createElement("td");
    const deviceSelect = buildDeviceSelect(table.tuya_device_id);
    deviceCell.append(deviceSelect);

    const channelCell = document.createElement("td");
    const channelSelect = document.createElement("select");
    for (const code of SWITCH_CODES) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code.replace("switch_", "Канал ");
      channelSelect.append(option);
    }
    channelSelect.value = table.tuya_switch_code ?? "switch_1";
    channelCell.append(channelSelect);

    deviceSelect.addEventListener("change", () =>
      saveBinding(table.id, deviceSelect, channelSelect)
    );
    channelSelect.addEventListener("change", () =>
      saveBinding(table.id, deviceSelect, channelSelect)
    );

    const testCell = document.createElement("td");
    const testBtn = document.createElement("button");
    testBtn.className = "mini";
    testBtn.textContent = "Тест";
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      try {
        await api(`/api/tables/${table.id}/light`, {
          method: "POST",
          body: JSON.stringify({ on: true }),
        });
        setTimeout(async () => {
          try {
            await api(`/api/tables/${table.id}/light`, {
              method: "POST",
              body: JSON.stringify({ on: false }),
            });
          } finally {
            testBtn.disabled = false;
          }
        }, 2000);
      } catch (error) {
        showToast(error.message);
        testBtn.disabled = false;
      }
    });
    testCell.append(testBtn);

    tr.append(nameCell, deviceCell, channelCell, testCell);
    rows.append(tr);
  }
}

function showDriverStatus(settings) {
  const status = document.getElementById("settings-status");
  if (settings.driver_error) {
    status.textContent = `⚠️ ${settings.driver_error} — работает Mock`;
  } else if (settings.driver_active === "tuya") {
    status.textContent = "✅ Подключено к Tuya";
  } else {
    status.textContent = "Свет сейчас не управляется (Mock)";
  }
}

async function refreshSettings() {
  const [settings, tables] = await Promise.all([
    api("/api/settings"),
    api("/api/tables"),
  ]);
  document.getElementById("set-driver").value = settings.lighting_driver;
  document.getElementById("set-host").value = settings.tuya_api_host;
  document.getElementById("set-access-id").value = settings.tuya_access_id;
  document.getElementById("set-access-secret").value = settings.tuya_access_secret;
  document.getElementById("set-club-name").value = settings.club_name;
  document.getElementById("set-rounding").value = settings.rounding_step_kopecks;
  document.getElementById("set-min-minutes").value = settings.min_session_minutes;
  document.getElementById("set-tz").value = settings.tz_offset_minutes;
  showDriverStatus(settings);
  renderBindings(tables);
}

async function saveClubSettings() {
  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        club_name: document.getElementById("set-club-name").value.trim(),
        rounding_step_kopecks: document.getElementById("set-rounding").value,
        min_session_minutes: document.getElementById("set-min-minutes").value,
        tz_offset_minutes: document.getElementById("set-tz").value,
      }),
    });
    document.querySelector(".topbar h1").textContent =
      `🎱 ${document.getElementById("set-club-name").value.trim()}`;
    showToast("Настройки клуба сохранены", true);
  } catch (error) {
    showToast(error.message);
  }
}

async function saveConnectionSettings() {
  const payload = {
    lighting_driver: document.getElementById("set-driver").value,
    tuya_api_host: document.getElementById("set-host").value,
    tuya_access_id: document.getElementById("set-access-id").value.trim(),
    tuya_access_secret: document.getElementById("set-access-secret").value.trim(),
  };
  try {
    const settings = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    showDriverStatus(settings);
    showToast(
      settings.driver_active === "tuya"
        ? "Настройки сохранены, Tuya подключена"
        : "Настройки сохранены",
      true
    );
  } catch (error) {
    showToast(error.message);
  }
}

async function loadDevices() {
  const status = document.getElementById("devices-status");
  status.textContent = "Загружаем…";
  try {
    state.devices = await api("/api/settings/devices");
    status.textContent = `Найдено устройств: ${state.devices.length}`;
    renderBindings(await api("/api/tables"));
  } catch (error) {
    status.textContent = "";
    showToast(error.message);
  }
}

// ---------------------------------------------------------------- tabs

const TAB_LOADERS = {
  dashboard: refreshDashboard,
  history: refreshHistory,
  journal: refreshJournal,
  tariffs: refreshTariffs,
  settings: refreshSettings,
  reports: refreshReports,
  users: refreshUsers,
  bookings: refreshBookings,
  clients: refreshClientsTab,
  menu: refreshMenuTab,
};

// Вкладки с формами не перезагружаем по таймеру, чтобы не мешать вводу.
const NO_POLL_TABS = new Set([
  "settings",
  "users",
  "bookings",
  "clients",
  "menu",
  "tariffs",
]);

let activeTab = "dashboard";

function switchTab(name) {
  activeTab = name;
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.hidden = panel.id !== `tab-${name}`;
  }
  TAB_LOADERS[name]().catch((error) => showToast(error.message));
}

// ---------------------------------------------------------------- init

document.addEventListener("DOMContentLoaded", async () => {
  // Кто вошёл: настраиваем интерфейс под роль до первой отрисовки.
  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    state.shift = me.shift;
    if (me.club_name) {
      document.querySelector(".topbar h1").textContent = `🎱 ${me.club_name}`;
      document.title = me.club_name;
    }
  } catch {
    return; // api() уже отправил на /login
  }
  renderUserChip();
  renderShiftBar();
  loadClients().catch(() => {});
  // Кассиру смена нужна для работы — предлагаем открыть её сразу при входе.
  if (state.user.role === "cashier" && !state.shift) {
    toggleShift();
  }
  if (state.user.role === "admin") {
    for (const el of document.querySelectorAll("[data-admin]")) el.hidden = false;
  }

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  });
  document.getElementById("shift-toggle").addEventListener("click", toggleShift);
  document.getElementById("add-user-btn").addEventListener("click", addUser);
  document.getElementById("add-booking-btn").addEventListener("click", addBooking);
  document.getElementById("add-client-btn").addEventListener("click", addClient);
  document.getElementById("add-menu-btn").addEventListener("click", addMenuItem);
  document.getElementById("save-club-btn").addEventListener("click", saveClubSettings);
  document.getElementById("add-rule-btn").addEventListener("click", addTariffRule);
  let searchTimer = null;
  document.getElementById("client-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshClientsTab().catch(() => {}), 300);
  });
  document
    .getElementById("modal-overlay")
    .addEventListener("click", (event) => {
      if (event.target.id === "modal-overlay") closeModal();
    });
  for (const id of ["stats-days", "revenue-days"]) {
    document
      .getElementById(id)
      .addEventListener("change", () => refreshReports().catch(() => {}));
  }

  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  }

  document.getElementById("add-table-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("new-table-name");
    try {
      await api("/api/tables", {
        method: "POST",
        body: JSON.stringify({ name: input.value.trim() }),
      });
      input.value = "";
      showToast("Стол добавлен", true);
      await refreshDashboard();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("add-tariff-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-tariff-name");
    const priceInput = document.getElementById("new-tariff-price");
    try {
      await api("/api/tariffs", {
        method: "POST",
        body: JSON.stringify({
          name: nameInput.value.trim(),
          price_per_hour: Number(priceInput.value),
        }),
      });
      nameInput.value = "";
      priceInput.value = "";
      showToast("Тариф добавлен", true);
      await refreshTariffs();
    } catch (error) {
      showToast(error.message);
    }
  });

  switchTab("dashboard");

  document
    .getElementById("save-settings")
    .addEventListener("click", saveConnectionSettings);
  document.getElementById("load-devices").addEventListener("click", loadDevices);

  setInterval(tick, TICK_MS);
  setInterval(() => {
    if (NO_POLL_TABS.has(activeTab)) return;
    TAB_LOADERS[activeTab]().catch(() => { /* сеть мигнула — следующий опрос */ });
    refreshShift().catch(() => {});
  }, POLL_MS);
});

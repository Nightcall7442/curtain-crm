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
  devices: [],         // устройства Tuya для вкладки «Настройки»
  user: null,          // текущий сотрудник {id, name, role}
  shift: null,         // открытая кассовая смена или null
};

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
      meta.textContent =
        `Тариф «${table.session.tariff_name}» — ` +
        `${table.session.price_per_hour} ₽/час, ` +
        `начало ${formatDateTime(table.session.started_at)}`;

      const closeBtn = document.createElement("button");
      closeBtn.className = "action close";
      closeBtn.textContent = "ЗАКРЫТЬ";
      closeBtn.addEventListener("click", () => closeTable(table));

      card.append(timer, cost, meta, closeBtn);
    } else {
      const select = document.createElement("select");
      for (const tariff of state.tariffs.filter((t) => t.is_active)) {
        const option = document.createElement("option");
        option.value = String(tariff.id);
        option.textContent = `${tariff.name} — ${tariff.price_per_hour} ₽/час`;
        select.append(option);
      }
      const remembered = state.tariffChoice.get(table.id);
      if (remembered) select.value = String(remembered);
      select.addEventListener("change", () => {
        state.tariffChoice.set(table.id, Number(select.value));
      });

      const openBtn = document.createElement("button");
      openBtn.className = "action open";
      openBtn.textContent = "ОТКРЫТЬ";
      if (!state.tariffs.some((t) => t.is_active)) {
        openBtn.disabled = true;
        openBtn.textContent = "НЕТ АКТИВНЫХ ТАРИФОВ";
      }
      openBtn.addEventListener("click", () => openTable(table, select));

      card.append(select, openBtn);
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
  const [tables, tariffs] = await Promise.all([
    api("/api/dashboard"),
    api("/api/tariffs"),
  ]);
  state.tables = tables;
  state.tariffs = tariffs;
  state.fetchedAt = performance.now();
  renderTables();
}

async function openTable(table, select) {
  if (!select.value) {
    showToast("Сначала добавьте тариф");
    return;
  }
  try {
    await api(`/api/tables/${table.id}/open`, {
      method: "POST",
      body: JSON.stringify({ tariff_id: Number(select.value) }),
    });
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    await refreshDashboard();
  }
}

async function closeTable(table) {
  try {
    const session = await api(`/api/tables/${table.id}/close`, { method: "POST" });
    showToast(
      `Сеанс закрыт: ${table.name}, итог ${formatMoney(session.total_cost)} ₽`,
      true,
    );
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    await refreshDashboard();
  }
}

// ---------------------------------------------------------------- auth & shift

function renderUserChip() {
  const chip = document.getElementById("user-chip");
  const role = state.user.role === "admin" ? "администратор" : "кассир";
  chip.textContent = `${state.user.name} · ${role}`;
}

function renderShiftBar() {
  const bar = document.getElementById("shift-bar");
  const info = document.getElementById("shift-info");
  const toggle = document.getElementById("shift-toggle");
  bar.hidden = false;
  if (state.shift) {
    bar.classList.add("open");
    info.textContent =
      `Смена открыта с ${formatDateTime(state.shift.opened_at)} · ` +
      `сеансов: ${state.shift.sessions_count} · ` +
      `выручка: ${formatMoney(state.shift.revenue)} ₽`;
    toggle.textContent = "Закрыть смену";
  } else {
    bar.classList.remove("open");
    info.textContent =
      state.user.role === "cashier"
        ? "Кассовая смена не открыта — откройте её, чтобы работать со столами"
        : "Кассовая смена не открыта";
    toggle.textContent = "Открыть смену";
  }
}

async function refreshShift() {
  state.shift = await api("/api/shifts/current");
  renderShiftBar();
}

async function toggleShift() {
  try {
    if (state.shift) {
      const closed = await api("/api/shifts/close", { method: "POST" });
      showToast(
        `Смена закрыта: сеансов ${closed.sessions_count}, ` +
          `выручка ${formatMoney(closed.revenue)} ₽`,
        true
      );
      state.shift = null;
    } else {
      state.shift = await api("/api/shifts/open", { method: "POST" });
      showToast("Смена открыта", true);
    }
    renderShiftBar();
  } catch (error) {
    showToast(error.message);
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
      s.table_name,
      `${s.tariff_name} (${s.price_per_hour} ₽/час)`,
      formatDateTime(s.started_at),
      formatDateTime(s.ended_at),
      formatDuration(s.duration_seconds),
      formatMoney(s.total_cost),
      s.closed_by_name ?? s.opened_by_name ?? "—",
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
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
}

// ---------------------------------------------------------------- reports

async function refreshReports() {
  const days = Number(document.getElementById("stats-days").value);
  const [shifts, stats] = await Promise.all([
    api("/api/shifts"),
    api(`/api/stats/tables?days=${days}`),
  ]);

  const shiftRows = document.getElementById("shift-rows");
  shiftRows.replaceChildren();
  for (const shift of shifts) {
    const tr = document.createElement("tr");
    const cells = [
      shift.user_name,
      formatDateTime(shift.opened_at),
      shift.closed_at ? formatDateTime(shift.closed_at) : "открыта",
      String(shift.sessions_count),
      formatMoney(shift.revenue),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    shiftRows.append(tr);
  }
  document.getElementById("shifts-empty").hidden = shifts.length > 0;

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
  showDriverStatus(settings);
  renderBindings(tables);
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
};

// Вкладки с формами не перезагружаем по таймеру, чтобы не мешать вводу.
const NO_POLL_TABS = new Set(["settings", "users"]);

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
  } catch {
    return; // api() уже отправил на /login
  }
  renderUserChip();
  renderShiftBar();
  if (state.user.role === "admin") {
    for (const el of document.querySelectorAll("[data-admin]")) el.hidden = false;
  }

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  });
  document.getElementById("shift-toggle").addEventListener("click", toggleShift);
  document.getElementById("add-user-btn").addEventListener("click", addUser);
  document
    .getElementById("stats-days")
    .addEventListener("change", () => refreshReports().catch(() => {}));

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

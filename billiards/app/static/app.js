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
};

// ---------------------------------------------------------------- helpers

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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

// ---------------------------------------------------------------- tabs

const TAB_LOADERS = {
  dashboard: refreshDashboard,
  history: refreshHistory,
  journal: refreshJournal,
  tariffs: refreshTariffs,
};

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

document.addEventListener("DOMContentLoaded", () => {
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

  setInterval(tick, TICK_MS);
  setInterval(() => {
    TAB_LOADERS[activeTab]().catch(() => { /* сеть мигнула — следующий опрос */ });
  }, POLL_MS);
});

# Выпуск 4 «Зарплата» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** почасовику — таблица смен с оплатой каждой смены, округлённой до сума; сдельщику — дата сдачи и статус оплаты у заказов; «Заказы за период» свёрнуты; ставка почасовика вводится «за смену».

**Architecture:** правило оплаты смены и даты по Ташкенту — чистые функции в `packages/shared/src/payroll/shiftPay.ts` и `utils`. Сервер считает почасовую суммой по сменам (`listWorkedShifts` в `shifts.service.ts`) в месячном и дневном расчёте; `payroll.breakdown` отдаёт смены и статус оплаты заказов. Сайт рисует таблицы. Миграций нет.

**Tech Stack:** PostgreSQL 16 + Drizzle 0.38, Hono + tRPC 11, Next.js 15 (Tailwind), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-payroll-release-4-design.md`.

## Global Constraints

- Как в выпусках 1–3: без `any`, TODO и заглушек; подписи — из `@curtain-crm/shared`; Zod на входах; комментарии по-русски, в стиле окружающего кода.
- Деньги — `MoneyMinor` (тийины) и функции `utils/money.ts`; никакой арифметики над строками.
- Оплата смены округляется до целого сума одним округлением от точного произведения (half away from zero).
- `workedSecondsExpression` и `calculateWorkedHours` возвращают ровно то же, что раньше (табель, отчёты, `shifts.my` не меняются).
- Формат `payroll.schemes.upsert` не меняется: ставка «за смену» переводится в часовую на сайте.
- Подписи: «Выплачен» / «To'langan»; «На утверждении» / «Tasdiqlanmoqda».

## Review Focus

1. **Сумма строк = начислено.** `calculateHourly` и таблица смен в разбивке считают одно и то же (`shiftPay` по одной ставке); смена через границу периода режется, но не теряется и не считается дважды. Тест — смоук задачи 4.
2. **Открытая смена** не попадает в расчёт и не роняет разбивку (`workedSeconds = null`). Тест — смоук задачи 4.
3. **Статус оплаты по дню**: день сдачи берётся по Ташкенту, а не UTC (этап, сданный в 03:00 по Ташкенту, — это тот же день по Ташкенту, а не вчерашний UTC). Тест — `workshopDayIso` в задаче 1 и смоук задачи 4.
4. **Старые снимки** без `shiftStart`/`shiftEnd` открываются в разбивке без ошибок. Тест — тип необязательный, смоук открывает запись, посчитанную до правки (раздел 6b).

---

### Task 1: Правило оплаты смены в `shared`

**Files:**
- Create: `packages/shared/src/payroll/shiftPay.ts`, `packages/shared/src/payroll/shiftPay.test.ts`
- Modify: `packages/shared/src/utils/money.ts` (+ тест в `money.test.ts`), `packages/shared/src/utils/dates.ts` (+ `dates.test.ts`), `packages/shared/src/enums/payroll.enum.ts`, `packages/shared/src/index.ts`

**Interfaces — Produces:**
- `roundMoneyToWhole(minor: number): MoneyMinor` — до целого сума (кратно 100), half away from zero.
- `scheduleMinutes(shiftStart: string | null, shiftEnd: string | null): number | null`
- `hourlyRateFromShift(shiftAmount: MoneyMinor, minutes: number): MoneyMinor`
- `shiftPay(rate: MoneyMinor, workedSeconds: number): MoneyMinor` — отрицательные секунды → 0.
- `workedHoursOf(seconds: number): number` — до сотых.
- `workshopDayIso(at: Date | string): string` — `YYYY-MM-DD` по Ташкенту.
- `PAYROLL_ORDER_PAY_STATUSES = ['paid', 'pending'] as const`, тип `PayrollOrderPayStatus`, `PAYROLL_ORDER_PAY_STATUS_LABELS: Translated<PayrollOrderPayStatus>`.

- [ ] **Step 1: тесты** — цифры заказчика:
  - `shiftPay(parseMoney('11111.11'), 9*3600) === parseMoney('100000')`; 8,5 ч → 94 444; 7 ч → 77 778; 13 ч → 144 444; −1 → 0; ставка 35 000 × 7,33 ч → 256 550.
  - `scheduleMinutes('09:00','18:00') === 540`; `('22:00','06:00') === 480`; `('09:00','09:00') === null`; `(null,'18:00') === null`; `('9:00','18:00') === null`.
  - `hourlyRateFromShift(parseMoney('100000'), 540) === parseMoney('11111.11')`.
  - `roundMoneyToWhole(9_444_443.5) === 9_444_400`; `roundMoneyToWhole(-150) === -200`.
  - `workedHoursOf(30600) === 8.5`; `workedHoursOf(26400) === 7.33`.
  - `workshopDayIso(new Date('2026-09-02T22:30:00Z')) === '2026-09-03'`; `workshopDayIso('2026-09-03T18:59:00Z') === '2026-09-03'`.
- [ ] **Step 2:** `pnpm --filter @curtain-crm/shared test` — FAIL (нет модулей).
- [ ] **Step 3:** реализация, экспорт в `index.ts`.
- [ ] **Step 4:** тесты — PASS; `pnpm --filter @curtain-crm/shared typecheck`.
- [ ] **Step 5:** commit «Shared: shift pay rounded to whole sum, Tashkent day, order pay status».

### Task 2: Смены сотрудника за период — `listWorkedShifts`

**Files:** Modify `apps/api/src/services/shifts.service.ts`

**Interfaces — Produces:**
- `shiftSecondsExpressions(bounds): { gross: SQL<string>; away: SQL<string> }` — построчно, для строки `shifts`.
- `listWorkedShifts(executor, userId, bounds): Promise<readonly WorkedShift[]>`,
  `WorkedShift = { id; startedAt: Date; endedAt: Date | null; workedSeconds: number | null; awaySeconds: number; isManuallyAdjusted: boolean }`.
- `workedSecondsExpression(bounds)` = `coalesce(sum(gross - away), 0)` — без изменения результата.

- [ ] **Step 1:** вынести построчные части, `workedSecondsExpression` собрать из них.
- [ ] **Step 2:** `listWorkedShifts` — смены `userId`, `startedAt < end` и (`endedAt is null` или `endedAt >= start`), по `startedAt`. Для открытой: `workedSeconds = null`, `awaySeconds` = закрытые отлучки/выезды на сейчас.
- [ ] **Step 3:** `pnpm --filter @curtain-crm/api typecheck`; смоук (разделы 4, 6 — часы те же) PASS.
- [ ] **Step 4:** commit «Shifts: per-shift worked seconds for payroll».

### Task 3: Почасовая — сумма по сменам; дата сдачи этапа у заказов

**Files:** Modify `apps/api/src/services/payroll.service.ts`, `apps/api/src/services/payroll.service.test.ts`, `packages/db/src/schema/payroll.schema.ts` (тип снимка)

**Interfaces:**
- Consumes: `shiftPay`, `workedHoursOf` (задача 1), `listWorkedShifts` (задача 2).
- Produces:
  - `PayrollInputs.shiftSeconds: readonly number[]`.
  - `calculateHourly` = Σ `shiftPay(rate, s)`; строка `Часы: {Σ часов, 2 знака} × ставка`.
  - `PayrollSchemeSnapshot.shiftStart?: string | null; shiftEnd?: string | null`.
  - `listCompletedOrdersForPayroll` → `doneAt: Date | null` в каждой строке; сортировка `doneAt desc`.

- [ ] **Step 1: тесты** `calculateHourly`: смены 9/8,5/7/13 ч по 11 111,11 → 416 666; ставка 35 000, одна смена 160 ч → 5 600 000; пустой список → 0; отрицательные секунды → 0; без ставки → `TRPCError`. Старые тесты на `workedHours` переписать на `shiftSeconds`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** реализация; `gatherPayrollInputs` и `calculateForDay` берут `listWorkedShifts` (закрытые смены → `shiftSeconds`, `workedHours = workedHoursOf(Σ)`); снимок пишет `shiftStart/shiftEnd`; `doneAt` — выражение по роли (как `attributedOrdersFilter`).
- [ ] **Step 4:** `pnpm --filter @curtain-crm/api test`, typecheck — PASS.
- [ ] **Step 5:** commit «Payroll: hourly pay is the sum of shifts, stage done date on orders».

### Task 4: `payroll.breakdown` — смены и статус оплаты; смоук

**Files:** Modify `apps/api/src/routers/payroll.router.ts`, `apps/api/src/scripts/smoke.ts` (CRLF!)

**Interfaces — Produces** в выходе `breakdown`:
- `shifts: { id; day; startedAt; endedAt; awaySeconds; workedSeconds; amount: string | null; isManuallyAdjusted }[]`
- `orders[].doneAt`, `orders[].paymentStatus: PayrollOrderPayStatus`

- [ ] **Step 1: смоук «10. Выпуск 4»** (пишется первым):
  - почасовик со схемой 11 111,11 и графиком 09:00–18:00; смены сентября 2026 по Ташкенту: 01.09 9:00–18:00, 02.09 9:30–18:00, 03.09 10:00–17:00, 04.09 9:00–22:00, 05.09 9:00–18:00 с отлучкой 30 мин; открытая смена 06.09 — расчёт за сентябрь = 511 110;
  - `breakdown`: 6 строк смен, суммы 100 000 / 94 444 / 77 778 / 144 444 / 94 444 / null, у 05.09 `awaySeconds = 1800`, Σ сумм = начислено;
  - `calculateForDay` за 01.09 = 100 000;
  - сдельщик: два заказа со сдачей пошива 03.09 и 04.09 (история статусов), расчёт сентября, выплата за день 03.09 → первый `paid`, второй `pending`; `doneAt` заполнен.
- [ ] **Step 2:** `pnpm --filter @curtain-crm/api smoke` — новые проверки FAIL.
- [ ] **Step 3:** реализация `breakdown` (дни выплат — `payments.day` по записям сотрудника в роли).
- [ ] **Step 4:** смоук PASS целиком; typecheck, lint.
- [ ] **Step 5:** commit «Payroll breakdown: shifts with pay, order payment status».

### Task 5: Сайт — окно разбивки

**Files:** Modify `apps/web/src/components/payroll/PayrollBreakdownDialog.tsx`

- [ ] **Step 1:** «Смены за период» (только почасовая): Дата · Начал · Закончил · Перерыв · Итого часов · Итого за смену, строка «Итого»; «идёт» у открытой; «исправлено» у ручной правки.
- [ ] **Step 2:** «Заказы за период» свёрнут; шапка «N заказов · сдельно X» + «+»/«−» (`aria-expanded`). Колонки: № заказа · Клиент · Исполнен · Сдельно · Статус оплаты; у `commission`/`per_order` — «Сумма заказа» вместо «Сдельно».
- [ ] **Step 3:** «Условия оплаты»: у почасовой с графиком — «За смену по графику (09:00–18:00, 9 ч)».
- [ ] **Step 4:** `pnpm --filter @curtain-crm/web typecheck lint`; Playwright: разбивка почасовика (6 строк, суммы) и сдельщика («+» раскрывает, статусы).
- [ ] **Step 5:** commit «Web: shifts table and collapsible orders in payroll breakdown».

### Task 6: Сайт — ставка «за смену»

**Files:** Modify `apps/web/src/components/payroll/SchemeDialog.tsx`

- [ ] **Step 1:** у почасовой переключатель «За смену» (по умолчанию) / «За час»; «За смену» требует график, под полем «= 11 111,11 сум в час · 9 ч по графику»; на сервер — `rate` = `hourlyRateFromShift` в сумах.
- [ ] **Step 2:** typecheck, lint; Playwright: 100 000 за 09:00–18:00 сохраняет схему с `rate = 11111.11`.
- [ ] **Step 3:** commit «Web: hourly rate entered per shift».

### Task 7: Документация и финальная проверка

**Files:** `docs/BUSINESS_LOGIC.md` (Зарплата), `docs/API.md` (payroll.breakdown), `docs/REQUIREMENTS.md` (7.x)

- [ ] **Step 1:** документы.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test`, смоук — всё зелёное.
- [ ] **Step 3:** commit «Docs: payroll release 4».

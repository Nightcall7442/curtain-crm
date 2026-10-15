# Монитор-табло, выпуск 2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** добавить в систему данные, которых не хватало выпуску 1, — план на месяц, номер машинки, дату и время установки — показать их на табло (панель, ТВ) и принести табло в мобильное приложение.

**Architecture:** правила плана и расписания (`resolvePlan`, `planPace`, `installSlotState`, рабочие дни, формат времени установки) — чистые функции в `packages/shared`. Три изменения схемы, каждое своей миграцией. Модуль `monitor` дополняет снимок планом, машинкой и «Установками сегодня»; планы задаются процедурами `monitor.plans.*`; время установки — параметром смены статуса и отдельной процедурой `orders.scheduleInstallation` с уведомлением. Панель, ТВ и приложение рисуют те же поля снимка.

**Tech Stack:** PostgreSQL 16 + Drizzle 0.38, Hono + tRPC 11, Next.js 15 (Tailwind), Expo / React Native (`react-native-svg`, `@react-native-community/datetimepicker` уже в зависимостях), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-monitor-board-design.md` — §2.1–2.3, 2.5, 3.1–3.3, 4.2–4.4, 5, 6; выпуск 2 — §7. Выпуск 1 смёрджен (PR #45).

## Global Constraints

- Всё, что сказано в Global Constraints плана выпуска 1 (`docs/superpowers/plans/2026-10-14-monitor-board-release-1.md`), действует и здесь: без `any`, TODO и заглушек; роли, статусы и подписи — только из `@curtain-crm/shared`; Zod на входах; Ташкентские периоды; комментарии по-русски.
- Машинка: `users.workstation smallint null`, check `workstation between 1 and 99`, уникальности нет. Вывод: «Машинка №3».
- План: таблица `work_plans` ровно по §2.2 спецификации; уникальность `(role, user_id, effective_from)` с `NULLS NOT DISTINCT`; повторная запись в тот же месяц — upsert.
- Единицы плана: `sewer → pieces`, `installer → orders`, `cornice_installer → orders`. Две роли группы — план и выработка суммируются.
- Темп: рабочие дни месяца — все дни, кроме `weeklyDayOff` человека; `ahead` — `% плана ≥ доля прошедших рабочих дней`; `on_track` — не ниже чем на 10 п.п.; иначе `behind`.
- Планы задают директор и админ (`managementProcedure`); табло видят директор, админ, менеджер (`orderDispatchProcedure`).
- Время установки: `orders.installation_at timestamptz null` + частичный индекс `where installation_at is not null`. Менять можно в статусах `qc_passed`, `pending_installation_assignment`, `installation_assigned`; `at >= now − 24 ч`, `at <= now + 1 год`. Опоздание — `INSTALLATION_LATE_GRACE_MINUTES = 30`.
- Уведомление `installation_scheduled`: «Установка DH-000117: 15.10 в 10:30», ведёт на заказ; время — по Ташкенту, а не по часам сервера; перевод ru/uz в `notificationTranslations`.
- На ТВ по-прежнему нет денег, клиентов, телефонов, адресов и внутренних id: расписание установок на ТВ не уходит.
- Каждая новая строка приложения — в `apps/mobile/src/i18n/messages.ts`, ru и uz.
- Схема — через `pnpm db:generate`; файл миграции переименовывается в осмысленное имя с правкой тега в `meta/_journal.json`; добавление значения в pg-enum — отдельной миграцией (как `0063_manager_role.sql`).

## Review Focus

1. **Возврат к норме**: личный план с `target = null` с месяца M — с M действует норма роли, а не «плана нет» и не ноль. Тест — задача 1 (`resolvePlan`) и смоук задачи 3.
2. **Две роли группы**: установщик-карнизчик — план = сумма действующих планов обеих ролей; есть план только у одной роли — план = её план. Тест — смоук задачи 5.
3. **Граница опоздания**: ровно `installation_at + 30 мин` — ещё «впереди», на минуту позже — «опаздывает»; идёт выезд по заказу — «идёт», даже если время прошло. Тест — задача 1.
4. **Ташкентские сутки**: установка в 00:30 по Ташкенту (19:30 UTC предыдущего дня) попадает в «Установки сегодня» своих суток, а в уведомлении написано «00:30». Тест — задача 1 (формат) и смоук задачи 7.
5. **Перенос без установщика**: `scheduleInstallation` на заказе, где установщик ещё не назначен, — время записывается, уведомлений нет, ошибки нет; при назначенном — уведомление уходит ему одному. Тест — смоук задачи 6.

---

### Task 1: Правила плана и расписания в `shared`

**Files:**
- Create: `packages/shared/src/monitor/plan.ts`, `packages/shared/src/monitor/installSlot.ts`, `packages/shared/src/monitor/release2.test.ts`
- Modify: `packages/shared/src/enums/monitor.enum.ts` (перечисления и подписи), `packages/shared/src/constants/monitor.ts` (константы, `MONITOR_SORTS`, `MONITOR_SORT_LABELS`), `packages/shared/src/monitor/board.ts` (`sortPeople`), `packages/shared/src/index.ts`
- Modify: `apps/web/src/components/monitor/MonitorBoard.tsx` — свой `SORT_LABELS` заменить на `MONITOR_SORT_LABELS.ru`, иначе новые значения `MONITOR_SORTS` ломают сборку панели

**Interfaces:**
- Produces:
  - `PLAN_ROLES = [Role.SEWER, Role.INSTALLER, Role.CORNICE_INSTALLER] as const`, `type PlanRole`, `planRoleSchema`, `isPlanRole(role): role is PlanRole`.
  - `PLAN_UNIT: Readonly<Record<PlanRole, 'pieces' | 'orders'>>`.
  - `PLAN_SOURCES = ['personal', 'role'] as const`, `type PlanSource`; `PLAN_PACES = ['ahead', 'on_track', 'behind'] as const`, `type PlanPace`, `PLAN_PACE_LABELS: Translated<PlanPace>`.
  - `INSTALL_SLOT_STATES = ['done', 'in_progress', 'late', 'upcoming'] as const`, `type InstallSlotState`, `INSTALL_SLOT_STATE_LABELS: Translated<InstallSlotState>`.
  - `WORKSTATION_MIN = 1`, `WORKSTATION_MAX = 99`, `INSTALLATION_LATE_GRACE_MINUTES = 30`, `PLAN_TARGET_MAX = 100_000`.
  - `MONITOR_SORTS = ['place', 'plan', 'name', 'workstation'] as const`; `MONITOR_SORT_LABELS: Translated<MonitorSort>` — «По месту / По плану / По имени / По машинке», «O‘rin bo‘yicha / Reja bo‘yicha / Ism bo‘yicha / Mashina bo‘yicha».
  - `interface WorkPlanRow { role: PlanRole; userId: number | null; effectiveFrom: string /* YYYY-MM-01 */; target: number | null }`
  - `interface ResolvedPlan { target: number; source: PlanSource; effectiveFrom: string }`
  - `resolvePlan(rows: readonly WorkPlanRow[], userId: number, role: PlanRole, month: string /* YYYY-MM */): ResolvedPlan | null`
  - `monthStartIso(month: string): string` — `'2026-10'` → `'2026-10-01'`.
  - `workdaysInMonth(month: string, weeklyDayOff: number | null, todayIso: string): { elapsed: number; total: number }` — `elapsed` считает дни месяца до `todayIso` включительно; месяц целиком в прошлом — `elapsed = total`, в будущем — `0`.
  - `planPace(params: { done: number; target: number; elapsed: number; total: number }): PlanPace`
  - `planPercent(done: number, target: number): number` — целые проценты, `Math.round(done / target * 100)`.
  - `installSlotState(params: { status: OrderStatus; installationAt: Date; tripInProgress: boolean; now: Date }): InstallSlotState`
  - `formatInstallSlot(at: Date): { date: string; time: string }` — по `WORKSHOP_TIME_ZONE`: `'15.10'`, `'10:30'`.
  - `sortPeople<T extends { fullName: string; place: number; plan?: { percent: number } | null; workstation?: number | null }>` — поля плана и машинки необязательны (снимок получит их в задаче 5, ТВ — в задаче 12); отсутствие = `null`. `plan` — по проценту по убыванию, без плана в конце; `workstation` — по номеру, без машинки в конце; равенство — по имени.

- [ ] **Step 1: Write the failing tests** в `release2.test.ts`:

```ts
const rows: WorkPlanRow[] = [
  { role: Role.SEWER, userId: null, effectiveFrom: '2026-09-01', target: 150 },
  { role: Role.SEWER, userId: null, effectiveFrom: '2026-10-01', target: 180 },
  { role: Role.SEWER, userId: 7, effectiveFrom: '2026-08-01', target: 200 },
  { role: Role.SEWER, userId: 7, effectiveFrom: '2026-10-01', target: null },
  { role: Role.SEWER, userId: 9, effectiveFrom: '2026-11-01', target: 220 },
];
it('норма роли', () => expect(resolvePlan(rows, 1, Role.SEWER, '2026-10')).toEqual({ target: 180, source: 'role', effectiveFrom: '2026-10-01' }));
it('личный план', () => expect(resolvePlan(rows, 7, Role.SEWER, '2026-09')).toEqual({ target: 200, source: 'personal', effectiveFrom: '2026-08-01' }));
it('возврат к норме', () => expect(resolvePlan(rows, 7, Role.SEWER, '2026-10')).toEqual({ target: 180, source: 'role', effectiveFrom: '2026-10-01' }));
it('будущий месяц не действует', () => expect(resolvePlan(rows, 9, Role.SEWER, '2026-10')?.target).toBe(180));
it('плана нет', () => expect(resolvePlan(rows, 1, Role.INSTALLER, '2026-10')).toBeNull());

it('рабочие дни без постоянного выходного', () =>
  // октябрь 2026: 31 день, воскресений 4 (4, 11, 18, 25); 15-е включительно
  expect(workdaysInMonth('2026-10', 7, '2026-10-15')).toEqual({ elapsed: 13, total: 27 }));
it('темп', () => {
  expect(planPace({ done: 90, target: 180, elapsed: 13, total: 27 })).toBe('ahead');    // 50 % ≥ 48 %
  expect(planPace({ done: 70, target: 180, elapsed: 13, total: 27 })).toBe('on_track'); // 39 %, ниже на 9 п.п.
  expect(planPace({ done: 60, target: 180, elapsed: 13, total: 27 })).toBe('behind');   // 33 %
});

const at = new Date('2026-10-15T05:30:00Z'); // 10:30 по Ташкенту
const base = { status: OrderStatus.INSTALLATION_ASSIGNED, installationAt: at, tripInProgress: false };
it('граница опоздания', () => {
  expect(installSlotState({ ...base, now: new Date('2026-10-15T06:00:00Z') })).toBe('upcoming');
  expect(installSlotState({ ...base, now: new Date('2026-10-15T06:01:00Z') })).toBe('late');
  expect(installSlotState({ ...base, tripInProgress: true, now: new Date('2026-10-15T07:00:00Z') })).toBe('in_progress');
  expect(installSlotState({ ...base, status: OrderStatus.INSTALLATION_DONE, now: new Date('2026-10-15T09:00:00Z') })).toBe('done');
});
it('время установки по Ташкенту', () => {
  expect(formatInstallSlot(at)).toEqual({ date: '15.10', time: '10:30' });
  expect(formatInstallSlot(new Date('2026-10-14T19:30:00Z'))).toEqual({ date: '15.10', time: '00:30' });
});
const people = [
  { fullName: 'А', place: 1, plan: { percent: 80 }, workstation: 3 },
  { fullName: 'Б', place: 2, plan: null, workstation: null },
  { fullName: 'В', place: 3, plan: { percent: 120 }, workstation: 1 },
];
it('сортировка по плану', () => expect(sortPeople(people, 'plan').map((p) => p.fullName)).toEqual(['В', 'А', 'Б']));
it('сортировка по машинке', () => expect(sortPeople(people, 'workstation').map((p) => p.fullName)).toEqual(['В', 'А', 'Б']));
```

`installSlotState`: `done` — статусы `installation_done`, `completed`; `in_progress` — `installation_in_progress` или `tripInProgress`; `late` — `now > installationAt + 30 мин`; иначе `upcoming`.

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/shared test` — Expected: FAIL (модулей нет).
- [ ] **Step 3: Implement** по интерфейсам; подписи ru/uz: темп — «Опережает / В графике / Отстаёт», «Oldinda / Grafikda / Ortda»; слот — «Сделано / Идёт / Опаздывает / Впереди», «Bajarildi / Davom etmoqda / Kechikmoqda / Oldinda».
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/shared test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Plan, pace and install-slot rules in shared"`

---

### Task 2: Номер машинки

**Files:**
- Modify: `packages/db/src/schema/users.schema.ts` (колонка + check), migration `packages/db/migrations/0067_workstation.sql`
- Modify: `apps/api/src/routers/users.router.ts` (`create`, `update` — поле `workstation`; `list`/`byId` отдают его)
- Modify: `apps/web/src/components/employees/EmployeeDialog.tsx` (поле «Номер машинки», только если у сотрудника есть роль швеи)
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Produces: `users.workstation: number | null`; вход `users.create/update`: `workstation: z.number().int().min(WORKSTATION_MIN).max(WORKSTATION_MAX).nullable().optional()`.

- [ ] **Step 1: Write the failing smoke checks**: `users.update({ id: sewer.id, workstation: 3 })` → `byId` отдаёт `3`; `workstation: 0` и `100` отбиваются Zod; прямая вставка `workstation = 100` отбивается check-ограничением.
- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api run smoke` — Expected: FAIL.
- [ ] **Step 3: Implement**: схема, `pnpm db:generate` → `0067_workstation.sql`, вход и выход процедур, поле в диалоге (`Input type="number"`, пусто — `null`).
- [ ] **Step 4: Run** smoke, `pnpm --filter @curtain-crm/web typecheck`, lint — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Employee workstation number"`

---

### Task 3: Планы — таблица и процедуры

**Files:**
- Create: `packages/db/src/schema/workPlans.schema.ts` (+ экспорт в `index.ts`, связи в `relations.ts`), migration `0068_work_plans.sql`
- Create: `apps/api/src/services/workPlans.service.ts`, `apps/api/src/routers/workPlans.router.ts`; Modify: `apps/api/src/routers/monitor.router.ts` (вложить как `plans`)
- Modify: `apps/api/src/lib/constants.ts` (`AUDIT_ACTIONS` += `work_plan.norm_set`, `work_plan.personal_set`), `apps/api/src/services/audit.service.ts` (`work_plan`), `apps/api/src/lib/errorTranslations.ts`, `apps/web/src/app/audit/page.tsx` (подписи действий)
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `resolvePlan`, `WorkPlanRow`, `PLAN_ROLES`, `PLAN_UNIT`, `monthStartIso`, `PLAN_TARGET_MAX` (задача 1).
- Produces:
  - `loadWorkPlans(db: Database, roles: readonly PlanRole[]): Promise<WorkPlanRow[]>` — все строки ролей; таблица маленькая, план считает `resolvePlan`, а не SQL: одно правило на всех.
  - `monitor.plans.list({ month: 'YYYY-MM' })` (`managementProcedure`) → `{ month, roles: { role, unit, norm: { target: number; effectiveFrom: string } | null, people: { userId, fullName, plan: ResolvedPlan | null, personal: { target: number | null; effectiveFrom: string } | null, done: number, percent: number | null }[] }[] }`. `done` — выработка месяца по этой роли тем же правилом, что на табло (`loadOutput` из `monitor.queries.ts`).
  - `monitor.plans.setRoleNorm({ role: planRoleSchema, month, target: int 1..PLAN_TARGET_MAX })` — upsert строки `(role, null, M)`.
  - `monitor.plans.setPersonal({ userId, role, month, target: int 1..PLAN_TARGET_MAX | null })` — у человека должна быть эта роль, иначе `BAD_REQUEST` «У сотрудника нет этой роли».
  - Обе записи — в журнал действий (`entityType: 'work_plan'`, `details: { role, userId?, month, from, to }`).

- [ ] **Step 1: Write the failing smoke checks**: норма швеи на текущий месяц 40 → `list` отдаёт её всем швеям смоука с `source: 'role'`; личный 55 для `sewerA` → `personal`; личный `null` с того же месяца → снова норма 40 (Review Focus 1); `setPersonal` для роли, которой у человека нет, — «У сотрудника нет этой роли»; менеджеру `list` закрыт; вставка `effective_from = '2026-10-15'` и `target = 0` отбиваются check-ограничениями; `target = null` при `user_id is null` — тоже.
- [ ] **Step 2: Run** smoke — Expected: FAIL.
- [ ] **Step 3: Implement**: таблица по §2.2 (`unique(...).nullsNotDistinct()`, check первого числа — `extract(day from effective_from) = 1`, check роли — по `PLAN_ROLES`), `pnpm db:generate` → `0068_work_plans.sql`; сервис, роутер, аудит, переводы ошибок.
- [ ] **Step 4: Run** smoke, `pnpm --filter @curtain-crm/api test` (покрытие `errorTranslations`) — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Work plans: role norms and personal overrides"`

---

### Task 4: «План / Сделано / %» в «Рабочих» — на `work_plans`

**Files:**
- Modify: `apps/api/src/routers/users.router.ts:1002-1100` (`performance`)
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `loadWorkPlans`, `resolvePlan`, `isPlanRole`, `loadOutput` (`monitor.queries.ts`).
- Produces: тот же ответ `performance` (`{ userId, plan, completed, percent, payrollAmount }`), но для ролей плана `plan` — сумма действующих планов этих ролей, `completed` — выработка табло за месяц; для людей без ролей плана `plan: null` и прежний `completed`.

- [ ] **Step 1: Write the failing smoke check**: две швеи, личный план только у одной — у каждой свой `plan` (раньше у обеих был KPI схемы роли); `completed` швеи совпадает с `monitor.board().people[…].counts.month` за тот же месяц.
- [ ] **Step 2: Run** smoke — Expected: FAIL.
- [ ] **Step 3: Implement**; комментарий над процедурой переписать: план — из `work_plans`, не из KPI схемы.
- [ ] **Step 4: Run** smoke — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Employees performance reads plans from work_plans"`

---

### Task 5: План и машинка на табло

**Files:**
- Modify: `apps/api/src/services/monitor.service.ts` (`MonitorPerson`, `MonitorPodiumEntry`, `MonitorBoard.summary`, `buildBoard`), `apps/api/src/services/monitor.queries.ts` (`loadGroupPeople` — `workstation`, `weeklyDayOff` уже есть)
- Modify: `apps/api/src/services/monitor.redact.ts` (+ тест) — разрешить `workstation`, `plan`, `podium.entries[].planPercent`, `summary.planTotal`, `summary.planPercent`
- Test: `apps/api/src/scripts/smoke.ts`, `apps/api/src/services/monitor.redact.test.ts`

**Interfaces:**
- Consumes: `resolvePlan`, `planPace`, `planPercent`, `workdaysInMonth`, `loadWorkPlans`.
- Produces:
  - `MonitorPerson.workstation: number | null`
  - `MonitorPerson.plan: { target: number; percent: number; pace: PlanPace; source: PlanSource; effectiveFrom: string } | null` — сумма действующих планов ролей группы у человека; нет ни одного — `null`.
  - `MonitorPodiumEntry.planPercent: number | null` — выработка прошлого месяца к плану прошлого месяца.
  - `summary.planTotal: number | null`, `summary.planPercent: number | null`.
  - Топ-5: при равной выработке выше больший `planPercent`, затем имя.

- [ ] **Step 1: Write the failing tests**: смоук — у `sewerA` с личным 55 и `counts.month` N — `plan.percent === planPercent(N, 55)`; человек с двумя ролями (Review Focus 2): норма установщика 10 и карнизчика 6 → `plan.target === 16`, после удаления нормы карнизчика — `10`; `machine`: `workstation` из задачи 2 виден на карточке. Юнит `toDisplayBoard`: в выходе есть `workstation` и `plan.percent`, по-прежнему нет `userId`, `hiredAt`, адресов.
- [ ] **Step 2: Run** smoke и `pnpm --filter @curtain-crm/api test` — Expected: FAIL.
- [ ] **Step 3: Implement**: планы грузятся один раз на снимок; темп — по `weeklyDayOff` человека и сегодняшнему ташкентскому дню.
- [ ] **Step 4: Run** — Expected: PASS; время снимка в смоуке остаётся в пределах ~150 мс.
- [ ] **Step 5: Commit** — `git commit -m "Plan and workstation on the board snapshot"`

---

### Task 6: Дата и время установки

**Files:**
- Modify: `packages/db/src/schema/orders.schema.ts` (колонка + частичный индекс), migration `0069_installation_at.sql`
- Modify: `packages/shared/src/enums/notificationType.enum.ts` (`INSTALLATION_SCHEDULED: 'installation_scheduled'`), migration `0070_installation_scheduled_notification.sql` (`ALTER TYPE … ADD VALUE IF NOT EXISTS`)
- Modify: `apps/api/src/services/orderWorkflow.service.ts` (`changeOrderStatus` и `assignExecutor` — необязательный `installationAt`), `apps/api/src/routers/orders.router.ts` (`changeStatus`, `assign` — вход `installationAt`; новая `scheduleInstallation`)
- Create: `apps/api/src/services/installationSchedule.service.ts` — `setInstallationTime(executor, { orderId, at, actor, ipAddress })`: проверки, запись, аудит, уведомление
- Modify: `apps/api/src/services/notifications.service.ts` (`notifyInstallationScheduled`), `apps/api/src/lib/notificationTranslations.ts`, `apps/api/src/lib/constants.ts` (`order.installation_scheduled`), `errorTranslations.ts`, `apps/web/src/app/audit/page.tsx`
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `formatInstallSlot` (задача 1).
- Produces:
  - `orders.installationAt: Date | null` во всех ответах, где отдаётся заказ (`list`, `byId` уже берут все колонки).
  - `orders.changeStatus({ …, installationAt?: Date })` — учитывается только при переходе в `installation_assigned`.
  - `orders.assign({ id, role, assigneeId, installationAt?: Date })` — учитывается только для роли установщика.
  - В обоих путях время пишется через `setInstallationTime` в той же транзакции **после** назначения, так что установщик получает и «Новый заказ», и «Установка …: … в …»; те же проверки статуса и диапазона.
  - `orders.scheduleInstallation({ orderId, at: Date | null })` (`orderDispatchProcedure`) → заказ. Ошибки: «Время установки меняется до выезда» (статус не из трёх), «Время установки — не раньше вчерашнего дня», «Время установки — не дальше чем через год».
  - Уведомление установщику: заголовок `Установка ${n}: ${date} в ${time}`, текст `Клиент «${client}». Адрес: ${address}` (без адреса — без второй фразы); `relatedOrderId`. Перевод — шаблоны в `PATTERNS`.

- [ ] **Step 1: Write the failing smoke checks**: `scheduleInstallation` на `installation_assigned` с установщиком → `installation_at` записан, в журнале `order.installation_scheduled` с `from`/`to`, у установщика одно уведомление `installation_scheduled` с «в 10:30» для 05:30Z; на заказе без установщика — время записано, уведомлений нет (Review Focus 5); `at = null` убирает время; статус `sewing_in_progress` → «Время установки меняется до выезда»; `at` двое суток назад → отказ; швее процедура закрыта; `changeStatus` в `installation_assigned` с `installationAt` пишет время одной транзакцией.
- [ ] **Step 2: Run** smoke — Expected: FAIL.
- [ ] **Step 3: Implement**; две миграции через `pnpm db:generate` (enum — отдельным файлом, как `0063_manager_role.sql`).
- [ ] **Step 4: Run** smoke, `pnpm --filter @curtain-crm/api test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Installation date and time with a notification"`

---

### Task 7: «Установки сегодня» в снимке

**Files:**
- Modify: `apps/api/src/services/monitor.queries.ts` (`loadInstallationsToday`, порядок очереди установщика), `apps/api/src/services/monitor.service.ts` (`MonitorBoard.schedule` вместо `trips`; `buildPerson.shiftToday.trips` остаётся)
- Modify: `apps/api/src/services/monitor.redact.ts` — `schedule` на ТВ не уходит (`DisplayBoard` исключает его из `Omit<…>`)
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `installSlotState` (задача 1), `installation_at` (задача 6).
- Produces:
  - `MonitorBoard.schedule: { slots: { orderId: number; orderNumber: string; at: Date; state: InstallSlotState; installerName: string | null; address: string | null }[]; unscheduled: number; cornices: { pending: number; inProgress: number } } | null` — только у «Установщиков»; `slots` — заказы с `installation_at` в сегодняшних ташкентских сутках, кроме отменённых, по времени; `unscheduled` — `installation_assigned` без времени; фильтр филиала — по заказу.
  - `MonitorBoard.trips` пока остаётся: панель переходит на расписание в задаче 9 и там же убирает `trips` из снимка и `TripsToday`. `tripInProgress` для слота — по открытым выездам из `loadPresence`.
  - Очередь установщика — по `installation_at` (без времени в конце), затем по сроку.

- [ ] **Step 1: Write the failing smoke checks**: установка на 00:30 по Ташкенту сегодня (`todayStart + 30 мин`) — в `slots` (Review Focus 4); вчерашняя 23:30 — нет; отменённый заказ с сегодняшним временем — нет; заказ с открытым выездом и прошедшим временем — `in_progress`; выполненный — `done`; `unscheduled` считает назначенные без времени; `display.board` не содержит `"schedule"`.
- [ ] **Step 2: Run** smoke — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** smoke и тесты api — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Today's installation schedule on the board"`

---

### Task 8: Демо-данные выпуска 2

**Files:**
- Modify: `apps/api/src/scripts/demo.ts`

Машинки швеям (1…N по порядку), нормы ролей на текущий и прошлый месяц (швея 40 шт, установщик 12 зак., карнизчик 10 зак. — под объём демо), два личных плана, `installation_at`: у заказов «идёт установка» — сегодня утром (по Ташкенту, не раньше начала суток), у двух «выполнен» — сегодня, у одного «назначен» — два часа назад без выезда (опаздывает), у остальных «назначен» — сегодня позже и завтра, один — без времени.

- [ ] **Step 1: Run** demo на текущей базе — Expected: «Готово», но на табло нет планов и расписания.
- [ ] **Step 2: Implement**.
- [ ] **Step 3: Run** demo дважды (идемпотентность) и вызов `buildBoard` — Expected: у всех швей план и машинка, у установщиков в расписании все четыре состояния слота.
- [ ] **Step 4: Commit** — `git commit -m "Demo data: workstations, plans and installation times"`

---

### Task 9: Табло в панели — план, машинка, расписание

**Files:**
- Create: `apps/web/src/components/monitor/PlanBar.tsx`, `apps/web/src/components/monitor/InstallSchedule.tsx`, `apps/web/src/components/monitor/PlanRing.tsx`
- Modify: `PersonCard.tsx` (подпись «Машинка №3 · 2-я категория», `PlanBar`), `Podium.tsx` («% плана» под значением, полоса), `SummaryPanel.tsx` (строка плана), `MonitorBoard.tsx` (сортировки «По плану», «По машинке»; справа `InstallSchedule` вместо `TripsToday`), `PersonDrawer.tsx` (кольцо «План месяца»), `labels.ts`
- Delete: `apps/web/src/components/monitor/TripsToday.tsx`
- Modify: `apps/api/src/services/monitor.service.ts`, `monitor.queries.ts`, `monitor.redact.ts` — убрать `MonitorBoard.trips` и `loadTripsToday` (расписание из задачи 7 их заменило; выезды за день остаются в `buildPerson.shiftToday.trips`)

**Interfaces:**
- Consumes: снимок задач 5 и 7; `PLAN_PACE_LABELS`, `INSTALL_SLOT_STATE_LABELS`, `PLAN_UNIT`.
- Produces:
  - `<PlanBar plan={MonitorPerson['plan']} unit done expectedShare />` — «План месяца · 96 / 180 шт · 53%», полоса цвета темпа (`ahead` — акцент, `on_track` — `warning`, `behind` — `danger`), риска на доле прошедших рабочих дней; без плана — подпись «план не задан».
  - `<InstallSchedule schedule />` — «Установки сегодня (N) · сделано K»: время, метка состояния (✓ / идёт / опаздывает +40 мин / впереди), номер, исполнитель, адрес; «Без времени: N» со ссылкой на `/orders?tab=installation`; «Карнизы: в очереди N · в работе N».
  - `<PlanRing percent pace size />` — кольцо SVG; переиспользует ТВ, если понадобится.

- [ ] **Step 1: Implement** по интерфейсам и макетам выпуска 1 (полоса и кольцо — как в `s-workshop.png`).
- [ ] **Step 2: Verify**: `pnpm --filter @curtain-crm/web typecheck && lint && build`; скриншоты `/monitor/workshop` и `/monitor/installation` на 1536 (обе схемы) и 390, `scrollWidth <= clientWidth`; сортировка «По плану» ставит без плана в конец.
- [ ] **Step 3: Commit** — `git commit -m "Monitor board: plan bars, workstation and installation schedule"`

---

### Task 10: Страница «Планы»

**Files:**
- Create: `apps/web/src/app/monitor/plans/page.tsx`, `apps/web/src/components/monitor/PlansEditor.tsx`
- Modify: `apps/web/src/components/layout/navigation.ts` — вкладка «Планы» `/monitor/plans` (роли `MANAGEMENT_ROLES`)

**Interfaces:**
- Consumes: `monitor.plans.list/setRoleNorm/setPersonal` (задача 3).

Выбор месяца (текущий по умолчанию, ← →). Для каждой роли плана: строка нормы с правкой на месте (`Input` + «Сохранить»), таблица людей: имя, действующий план, источник («норма роли» / «личный с окт 2026»), поле личного плана (пусто — норма; очистка поля = «вернуть к норме» = `target: null`), сделано, %. Подсказка: «Сохранение действует с выбранного месяца и дальше, пока план не изменят».

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify**: typecheck, lint; Playwright под директором — задать норму, личный план, очистить личный → источник «норма роли»; менеджер не видит вкладку, прямой адрес даёт отказ API.
- [ ] **Step 3: Commit** — `git commit -m "Plans page for the director and admins"`

---

### Task 11: Время установки в панели

**Files:**
- Modify: `apps/web/src/components/orders/OrderActionDialog.tsx` — при переходе в `installation_assigned` поле «Дата и время установки» (`datetime-local`, необязательно)
- Create: `apps/web/src/components/orders/InstallationTimeDialog.tsx`
- Modify: `apps/web/src/app/orders/[id]/page.tsx` — строка «Установка 15.10, 10:30» (или «Время установки не назначено») и кнопка «Перенести» для диспетчеров в трёх допустимых статусах

**Interfaces:**
- Consumes: `orders.changeStatus({ installationAt })`, `orders.scheduleInstallation` (задача 6).

- [ ] **Step 1: Implement**: значение `datetime-local` → `new Date(value)` (время браузера — ташкентское у пользователей панели); «Убрать время» → `at: null`.
- [ ] **Step 2: Verify**: typecheck, lint; Playwright: назначить установщика со временем → строка на карточке; перенести → новое время; у швеи кнопки нет.
- [ ] **Step 3: Commit** — `git commit -m "Installation time in the panel: on assignment and reschedule"`

---

### Task 12: ТВ — план и машинка

**Files:**
- Modify: `apps/web/src/components/monitor/TvBoard.tsx`, `tvLabels.ts`

Подпись под именем — «Машинка №3» (иначе категория или роль); под строками работы — полоса плана (`PlanBar` в варианте `tv`, em-размеры); на пьедестале — «% плана». Подписи ru/uz: «План месяца» / «Oylik reja», «план не задан» / «reja belgilanmagan», «Машинка №{n}» / «{n}-mashina».

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify**: скриншоты `/tv/<token>` 1920×1080 и 1366×768 — все карточки видны, прокрутки нет; язык uz. - [ ] **Step 3: Commit** — `git commit -m "TV: plan bar and workstation"`

---

### Task 13: Приложение — время установки

**Files:**
- Create: `apps/mobile/src/components/order/InstallationTimeRow.tsx`
- Modify: `apps/mobile/src/components/OrderManagement.tsx` (строка под назначением установщика), `apps/mobile/src/screens/OrderDetailScreen.tsx` (строка «Установка 15.10 в 10:30»), `apps/mobile/src/components/OrderCard.tsx` (у заказов с временем — время вместо срока для установщика), `apps/mobile/src/i18n/messages.ts`

**Interfaces:**
- Consumes: `orders.scheduleInstallation`, `formatInstallSlot`.

`InstallationTimeRow`: показ текущего времени или «Не назначено»; нажатие — выбор даты, затем времени (`DateTimePicker` `mode="date"` → `mode="time"`), сохранение `scheduleInstallation`; «Убрать время». Видна диспетчерам в трёх допустимых статусах.

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify**: `pnpm --filter @curtain-crm/mobile typecheck && lint`; веб-сборка приложения (Expo web) на 390×844 — строка в карточке заказа и в «Работе» установщика. - [ ] **Step 3: Commit** — `git commit -m "App: installation time on orders"`

---

### Task 14: Приложение — табло

**Files:**
- Create: `apps/mobile/src/screens/MonitorBoardScreen.tsx`, `apps/mobile/src/screens/MonitorPersonScreen.tsx`, `apps/mobile/src/components/monitor/PersonRow.tsx`, `PlanRing.tsx`, `MonitorPodium.tsx`
- Modify: `apps/mobile/src/types/index.ts` (`MonitorBoard: { group: MonitorGroup }`, `MonitorPerson: { userId: number }`), `apps/mobile/src/navigation/RootNavigator.tsx`, `apps/mobile/src/screens/HomeScreen.tsx` (блок «Табло»: плитки «Швеи» и «Установщики» с «на смене 7 из 10» у директора, админа, менеджера), `apps/mobile/src/screens/ManagementScreen.tsx` (те же пункты), `apps/mobile/src/i18n/messages.ts`

**Interfaces:**
- Consumes: `trpc.monitor.board`, `trpc.monitor.person`, `MONITOR_POLL_MS`, `filterPeople`, `LIVE_STATUS_LABELS`, `PLAN_PACE_LABELS`.

По §5 спецификации: чипы статусов (горизонтальная прокрутка, `flexShrink: 0`), пьедестал лентой арок, список `PersonRow` (фото 84×100 с местом, имя, машинка, статус, текущий заказ, полоса плана, сегодня / неделя / месяц); потянуть — обновить; опрос только пока экран в фокусе (`useIsFocused`). `MonitorPersonScreen`: фото ≈250 px с именем, машинкой и статусом поверх, начало смены, текущая работа с «Открыть заказ» (`OrderDetail`), кольцо плана (`react-native-svg`), сегодня / неделя / месяц, столбики за 30 дней, очередь, у установщика — фото.

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify**: typecheck, lint, сборка мобильного бандла (как в CI); Expo web 390×844 под директором — главная → «Швеи» → человек → «Открыть заказ»; у швеи плиток нет. - [ ] **Step 3: Commit** — `git commit -m "App: monitor board and person screens"`

---

### Task 15: Документация и финальная проверка

**Files:**
- Modify: `docs/BUSINESS_LOGIC.md` (раздел «Табло»: план, темп, машинка, время установки; убрать «Чего на табло пока нет»), `docs/API.md` (`monitor.plans.*`, `orders.scheduleInstallation`, новое поле `installationAt`, уведомление), `docs/superpowers/specs/2026-10-14-monitor-board-design.md` (отметки о решениях, принятых по ходу)

- [ ] **Step 1: Write docs.**
- [ ] **Step 2: Full verification**: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @curtain-crm/web build && pnpm --filter @curtain-crm/api run smoke`, сборка мобильного бандла; агенты `security-auditor` и `code-quality-auditor`; финальное ревью всей ветки.
- [ ] **Step 3: Commit and push** — `git commit -m "Docs: monitor board release 2"`, `git push -u origin claude/keen-hamilton-1lz8tt`.

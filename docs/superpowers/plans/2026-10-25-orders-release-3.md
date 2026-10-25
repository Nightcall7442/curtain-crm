# Выпуск 3 «Заказы» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** текущий исполнитель в списках, правка заказа со страницы заказа, поиск и фильтры в приложении, запрет закрывать заказ с долгом, назначение без выдачи ролей.

**Architecture:** правила (кто исполнитель этапа, кто правит заказ, блокирует ли долг закрытие, кто видит деньги клиента) — чистые функции в `packages/shared/src/orders/rules.ts`. Сервер применяет их в единственных точках: `assignExecutor`, `changeOrderStatus`, `orders.list`, `orders.update`. Новые серверные поля (`currentExecutor`, `blockedReason`, фильтры `withDebt`/`overdue`) рисуют сайт и приложение. Одна миграция — значение `order_updated` в перечислении уведомлений.

**Tech Stack:** PostgreSQL 16 + Drizzle 0.38, Hono + tRPC 11, Next.js 15 (Tailwind), Expo / React Native, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-orders-release-3-design.md`.

## Global Constraints

- Как в выпусках 1–2: без `any`, TODO и заглушек; роли, статусы и подписи — только из `@curtain-crm/shared`; Zod на входах; комментарии по-русски, в стиле окружающего кода.
- Ни одним путём заказ `custom`/`ready_made` с `remainingPayment > 0` не переходит в `completed`. `stock` правилом не затронут.
- Назначение на заказ не пишет в `user_roles` никогда.
- Деньги клиента видят по роли: руководство, менеджер, продавец (`canSeeClientMoney`); у своего заказа — ещё установщик (как `maskStageFees` сейчас).
- Тексты (ru → uz, uz — в `errorTranslations.ts` / `notificationTranslations.ts` / `messages.ts`):
  - «У сотрудника нет роли «{role}». Роли меняет директор» → «Xodimda «{role}» roli yo'q. Rollarni direktor o'zgartiradi»
  - «Остаток {sum} — сначала примите оплату» → «Qoldiq {sum} — avval to'lovni qabul qiling»
  - «Без установки готовые шторы продаются только при полной оплате» → «O'rnatishsiz tayyor pardalar faqat to'liq to'lov bilan sotiladi»
  - «Заказ закрыт — правка недоступна» → «Buyurtma yopilgan — tahrirlab bo'lmaydi»
  - «Состав продажи готовых штор изменить нельзя» → «Tayyor pardalar sotuvi tarkibini o'zgartirib bo'lmaydi»
  - «Фильтр «С долгом» доступен только тем, кто видит оплаты» → ««Qarzdor» filtri faqat to'lovlarni ko'radiganlar uchun»
  - Комментарий истории при закрытии по оплате: «Оплата получена полностью — заказ закрыт автоматически»; при остановке по фото: «Загружено фото после установки — заказ ждёт оплаты».
  - Уведомление: заголовок «Заказ {n} изменён» → «{n} buyurtmasi o'zgartirildi»; тело «Изменён состав заказа — проверьте позиции» → «Buyurtma tarkibi o'zgardi — pozitsiyalarni tekshiring» либо «Изменены данные заказа» → «Buyurtma ma'lumotlari o'zgardi».
  - Подписи: «Ждёт оплаты» / «To'lov kutilmoqda»; «С долгом» / «Qarzdor»; «не назначен» / «tayinlanmagan»; «Исполнитель» / «Ijrochi».
- Значение pg-enum добавляется отдельной миграцией `ADD VALUE IF NOT EXISTS`, как `0070_installation_scheduled_notification.sql`; имя — `0071_order_updated_notification.sql`, тег в `meta/_journal.json` поправлен.
- Каждая новая строка приложения — в `apps/mobile/src/i18n/messages.ts`, ru и uz.

## Review Focus

1. **Последний платёж от продавца или установщика**, а не от руководства: заказ в `installation_done` закрывается, а не падает с FORBIDDEN на проверке закрепления этапа. Тест — смоук задачи 3 (платёж от установщика заказа).
2. **Фото «после установки» при долге**: фото сохранено, статус `installation_done`, ошибки нет; повторное фото того же этапа тоже не падает. Тест — смоук задачи 3.
3. **Снижение цены до оплаченного** (правкой или `setPrice`) закрывает заказ в `installation_done`; снижение у заказа в пошиве статус не трогает. Тест — смоук задачи 3 (`setPrice`) и задачи 6 (`update`).
4. **Метраж при правке позиций**: позиция с прежним кодом сохраняет метраж, проставленный админом; код сменили — метраж `null`. Тест — задача 1 (`editedMaterialMeters`) и смоук задачи 6.
5. **Подгрузка и фильтры вместе**: при смене поиска или фильтра список в приложении начинается с первой страницы, а не дописывает к старой выдаче. Тест — ручная проверка задачи 12 (сценарий в шаге проверки).

---

### Task 1: Правила заказа в `shared`

**Files:**
- Create: `packages/shared/src/orders/rules.ts`, `packages/shared/src/orders/rules.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `ORDER_STATUS_OWNER: Readonly<Partial<Record<OrderStatus, AssignableRole>>>` — таблица из `STATUS_OWNER` (`apps/api/src/services/orderWorkflow.service.ts:89-115`) один в один, с её комментариями.
  - `currentExecutorRole(status: OrderStatus): AssignableRole | null`
  - `AUTHOR_EDITABLE_STATUSES: readonly OrderStatus[]` — `new`, `pending_admin_review`, `rejected_to_ceo` (переезжает из `orders.router.ts:113`).
  - `canEditOrder(order: { status: OrderStatus; createdBy: number }, user: { id: number; roles: readonly Role[] }): boolean`
  - `canSeeClientMoney(roles: readonly Role[]): boolean` — `isManagement || canDispatchOrders || roles.includes(Role.SELLER)`.
  - `closeBlockedByDebt(order: { orderType: OrderType; remainingPayment: string | null }): boolean` — `null` (скрыто) → `false`; `stock` → `false`; иначе `parseMoney(remainingPayment) > 0`.
  - `isAwaitingPayment(order: { status: OrderStatus; orderType: OrderType; remainingPayment: string | null }): boolean` — `installation_done` и `closeBlockedByDebt`.
  - `DEBT_STATUSES: readonly OrderStatus[] = [installation_done, completed]`.
  - `editedMaterialMeters(material: { code: string; originalCode: string | null; meters: number | null }): number | null` — `code.trim() === originalCode` → `meters`, иначе `null`.
  - Подписи `AWAITING_PAYMENT_LABEL`, `DEBT_FILTER_LABEL`, `EXECUTOR_NOT_ASSIGNED_LABEL`, `EXECUTOR_LABEL`: `Readonly<Record<Locale, string>>` — тексты из Global Constraints.

- [ ] **Step 1: Write the failing tests** (`rules.test.ts`)

```ts
describe('исполнитель этапа', () => {
  it('пошив — швея', () => expect(currentExecutorRole(OrderStatus.SEWING_IN_PROGRESS)).toBe(Role.SEWER));
  it('брак — контролёр', () => expect(currentExecutorRole(OrderStatus.QC_FAILED)).toBe(Role.QC));
  it('установка завершена — установщик', () =>
    expect(currentExecutorRole(OrderStatus.INSTALLATION_DONE)).toBe(Role.INSTALLER));
  it('новый и закрытый — никого', () => {
    expect(currentExecutorRole(OrderStatus.NEW)).toBeNull();
    expect(currentExecutorRole(OrderStatus.COMPLETED)).toBeNull();
  });
});

describe('правка заказа', () => {
  const seller = { id: 5, roles: [Role.SELLER] };
  const manager = { id: 9, roles: [Role.MANAGER] };
  it('продавец — свой новый', () => expect(canEditOrder({ status: OrderStatus.NEW, createdBy: 5 }, seller)).toBe(true));
  it('продавец — свой принятый нельзя', () =>
    expect(canEditOrder({ status: OrderStatus.SEWING_IN_PROGRESS, createdBy: 5 }, seller)).toBe(false));
  it('продавец — чужой нельзя', () => expect(canEditOrder({ status: OrderStatus.NEW, createdBy: 6 }, seller)).toBe(false));
  it('менеджер — любой открытый', () =>
    expect(canEditOrder({ status: OrderStatus.INSTALLATION_DONE, createdBy: 5 }, manager)).toBe(true));
  it('закрытый и отменённый — никто', () => {
    expect(canEditOrder({ status: OrderStatus.COMPLETED, createdBy: 9 }, manager)).toBe(false);
    expect(canEditOrder({ status: OrderStatus.CANCELLED, createdBy: 9 }, { id: 1, roles: [Role.CEO] })).toBe(false);
  });
});

describe('долг блокирует закрытие', () => {
  it('остаток больше нуля', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '800000.00' })).toBe(true));
  it('ноль и переплата — нет', () => {
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '0.00' })).toBe(false);
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '-100.00' })).toBe(false);
  });
  it('пошив на склад — нет', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.STOCK, remainingPayment: '5.00' })).toBe(false));
  it('сумма скрыта — не решаем за сервер', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: null })).toBe(false));
  it('ждёт оплаты — только после установки', () => {
    const debt = { orderType: OrderType.CUSTOM, remainingPayment: '10.00' };
    expect(isAwaitingPayment({ ...debt, status: OrderStatus.INSTALLATION_DONE })).toBe(true);
    expect(isAwaitingPayment({ ...debt, status: OrderStatus.SEWING_IN_PROGRESS })).toBe(false);
  });
});

describe('деньги клиента', () => {
  it('цех не видит', () => expect(canSeeClientMoney([Role.SEWER, Role.INSTALLER])).toBe(false));
  it('продавец и менеджер видят', () => {
    expect(canSeeClientMoney([Role.SELLER])).toBe(true);
    expect(canSeeClientMoney([Role.MANAGER])).toBe(true);
  });
});

describe('метраж при правке позиции', () => {
  it('код прежний — метраж остаётся', () =>
    expect(editedMaterialMeters({ code: 'П-31 ', originalCode: 'П-31', meters: 3.5 })).toBe(3.5));
  it('код сменили — метраж сброшен', () =>
    expect(editedMaterialMeters({ code: 'П-40', originalCode: 'П-31', meters: 3.5 })).toBeNull());
  it('новый материал — без метража', () =>
    expect(editedMaterialMeters({ code: 'П-40', originalCode: null, meters: null })).toBeNull());
});
```

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/shared test -- rules` — Expected: FAIL, модуль `./rules` не найден.
- [ ] **Step 3: Implement** `rules.ts` по Interfaces; экспорт `export * from './orders/rules'` в `index.ts`.
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/shared test && pnpm --filter @curtain-crm/shared typecheck` — Expected: всё зелёное.
- [ ] **Step 5: Commit** `Shared order rules: executor, edit rights, debt, client money`

### Task 2: Роли — без автовыдачи, список для директора

**Files:**
- Modify: `apps/api/src/services/orderWorkflow.service.ts` (`STATUS_OWNER` → импорт `ORDER_STATUS_OWNER`; `ensureUserHasRole` → `assertAssignableExecutor`; комментарий у `changeOrderStatus` шаг 5a)
- Modify: `apps/api/src/routers/users.router.ts` (процедура `autoGrantedRoles`), `apps/api/src/lib/errorTranslations.ts`
- Modify: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `ORDER_STATUS_OWNER` (задача 1).
- Produces: `users.autoGrantedRoles` (`ceoProcedure`, без входа) → `{ userId: number; fullName: string; role: Role; grantedAt: Date; grantedByName: string | null }[]`, по `grantedAt` убыванию. Строка попадает, если есть `user_roles (userId, role)` и запись `audit_log` с `action = 'user.role_granted'`, `entity_id = userId`, `details->>'role' = role`, `details->>'viaOrderAssignment' = 'true'`.

- [ ] **Step 1: Smoke-проверки** (в `smoke.ts`, в стиле соседних `check(...)`):
  - назначить продавца установщиком через `orders.assign` → ошибка с текстом «У сотрудника нет роли «Установщик». Роли меняет директор»; в `user_roles` у него по-прежнему только `seller`;
  - то же через `changeStatus` с `assigneeId`;
  - вставить фикстурой запись аудита автовыдачи + роль → `autoGrantedRoles` от CEO возвращает её; от админа — FORBIDDEN; после `revokeRole` строки нет.
  - Поправить комментарий у фикстуры (`smoke.ts` ~2043: «выдаётся роль установщика») — роль там вставляется вручную.
- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api smoke` — Expected: новые проверки FAIL (сейчас роль выдаётся).
- [ ] **Step 3: Implement** `assertAssignableExecutor(executor, userId, role)`: нет пользователя — NOT_FOUND; неактивен — прежняя ошибка; нет строки `user_roles` с этой ролью — `BAD_REQUEST` с текстом из Global Constraints (`ROLE_LABELS_RU[role]`). Без аудита и уведомлений. `autoGrantedRoles` — один SQL с `join` на `audit_log` и `users` (имя выдавшего — через `user_roles.granted_by`). Перевод ошибки — шаблоном в `errorTranslations.ts`.
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/api typecheck && pnpm --filter @curtain-crm/api test && pnpm --filter @curtain-crm/api smoke` — Expected: всё зелёное.
- [ ] **Step 5: Commit** `Assignment never grants roles; CEO sees auto-granted roles`

### Task 3: Долг блокирует закрытие

**Files:**
- Modify: `apps/api/src/services/orderWorkflow.service.ts` (`changeOrderStatus`: проверка долга и параметр `settlement`; новая `closeIfSettled`)
- Modify: `apps/api/src/routers/orderPhotos.router.ts` (`autoCompleteIfInstallFinished`)
- Modify: `apps/api/src/routers/payments.router.ts` (`acceptForOrder`)
- Modify: `apps/api/src/routers/orders.router.ts` (`setPrice`, `sellReadyMade`, `availableTransitions`)
- Modify: `apps/api/src/lib/errorTranslations.ts`, `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `closeBlockedByDebt`, `ORDER_STATUS_OWNER` (задача 1).
- Produces:
  - `ChangeOrderStatusParams.settlement?: true` — пропускает `assertCanTouchOrder` и `assertActorOwnsOrder` (права проверила вызывающая процедура). Используется только `closeIfSettled`.
  - `closeIfSettled(executor: DbExecutor, params: { orderId: number; actor: AuthenticatedUser; ipAddress: string | null }): Promise<boolean>` — `installation_done` и `!closeBlockedByDebt` → `changeOrderStatus(..., toStatus: completed, systemInitiated: true, settlement: true, comment: «Оплата получена полностью — заказ закрыт автоматически»)`; иначе `false`.
  - `orders.availableTransitions` → у каждого перехода `blockedReason: string | null` — «Остаток {sum} — сначала примите оплату» (`formatMoney`) для перехода в `completed` при долге, иначе `null`.

- [ ] **Step 1: Smoke-проверки:**
  - заказ в `installation_done` с остатком: `changeStatus → completed` от админа — ошибка «Остаток … — сначала примите оплату»; `changeStatusBatch` из двух заказов (один оплачен) — один `ok`, у второго та же причина;
  - `availableTransitions` у должника: у перехода в `completed` есть `blockedReason`, у оплаченного — `null`;
  - фото `install_after` у заказа в `installation_in_progress` с долгом → статус `installation_done`, фото в `order_photos` есть; второе такое фото — без ошибки;
  - `acceptForOrder` на весь остаток **от установщика заказа** → статус `completed`, в истории комментарий «Оплата получена полностью…»; частичный платёж → статус не меняется;
  - `setPrice` до оплаченной суммы у должника в `installation_done` → `completed`; у заказа в пошиве → статус прежний;
  - `sellReadyMade` без установки с `deposit` меньше цены → ошибка «Без установки готовые шторы продаются только при полной оплате»; с полной оплатой → `completed`; с установкой и частичной оплатой → проходит как раньше.
- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api smoke` — Expected: новые проверки FAIL.
- [ ] **Step 3: Implement.**
  - `changeOrderStatus`: после шага 1 (легальность) — если `toStatus === completed && closeBlockedByDebt(order)` → `CONFLICT` с текстом и суммой.
  - `autoCompleteIfInstallFinished`: путь по `autoCompletePathFrom`, но перед шагом в `completed` перечитать заказ (`loadOrderForUpdate`) и при долге остановиться; комментарий перехода в `installation_done` в этом случае — «…заказ ждёт оплаты». Возвращаемое значение — «закрыт ли».
  - `acceptForOrder`: после `post` и аудита — `closeIfSettled`. Ответ дополняется `status`.
  - `setPrice`: закрытый/отменённый заказ → `CONFLICT` «Заказ закрыт — правка недоступна»; после записи — `closeIfSettled`.
  - `sellReadyMade`: без установки и без переделки — `parseMoney(deposit) !== parseMoney(цена со скидкой)` → `BAD_REQUEST` (цена со скидкой — та же величина, что пишется в `workPrice`).
  - Переводы ошибок — в `errorTranslations.ts`.
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/api typecheck && pnpm --filter @curtain-crm/api test && pnpm --filter @curtain-crm/api smoke` — Expected: зелёное.
- [ ] **Step 5: Commit** `Orders with debt never close; full payment closes them`

### Task 4: «Сроки и опоздания» — от завершения установки

**Files:**
- Modify: `apps/api/src/services/reports.service.ts:249` (`lateDays`)
- Modify: `apps/api/src/scripts/smoke.ts`

- [ ] **Step 1: Smoke:** заказ со сроком D, `installation_done` в D (история), закрыт оплатой в D+5 → в отчёте месяца он «вовремя»; заказ без установки, закрытый в D+2 → «опоздал на 2».
- [ ] **Step 2: Run smoke** — Expected: первая проверка FAIL.
- [ ] **Step 3: Implement:** `lateDays` = `(coalesce(<последняя запись installation_done в order_status_history>, o.completed_at) at time zone 'Asia/Tashkent')::date - o.deadline` — подзапрос `max(h.created_at)`; месяц отчёта — по-прежнему `completed_at`.
- [ ] **Step 4: Run** typecheck + smoke — Expected: зелёное.
- [ ] **Step 5: Commit** `Lateness counts from installation, not from payment`

### Task 5: `orders.list` — исполнитель, «С долгом», просроченные, страницы

**Files:**
- Modify: `apps/api/src/routers/orders.router.ts` (`list`, `maskStageFees`, `visibilityFilter` без изменений)
- Modify: `apps/api/src/lib/errorTranslations.ts`, `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `currentExecutorRole`, `canSeeClientMoney`, `DEBT_STATUSES` (задача 1).
- Produces (вход `orders.list`):
  - `withDebt: z.boolean().default(false)` — `status in DEBT_STATUSES and remaining_payment > 0`; без `canSeeClientMoney(roles)` → `FORBIDDEN` с текстом из Global Constraints. Снимает скрытие архива.
  - `overdue: z.boolean().default(false)` — `deadline < <сегодня по Ташкенту, из workshopToday()>` и статус не в `ARCHIVED_ORDER_STATUSES`.
  - `cursor: z.number().int().min(1).optional()` — номер страницы для `useInfiniteQuery`; приоритетнее `page`.
  - `assigneeId` — плюс `corniceInstallerId`.
- Produces (выход, у каждой строки): `currentExecutor: { role: AssignableRole; userId: number | null; fullName: string | null } | null`.
- `maskStageFees`: `seesClientMoney = canSeeClientMoney(user.roles) || order.installerId === user.id`.

- [ ] **Step 1: Smoke:** заказ в пошиве со швеёй → `currentExecutor = { role: 'sewer', userId, fullName }`; в `pending_qc` без контролёра → `{ role: 'qc', userId: null, fullName: null }`; `new` → `null`; `withDebt` от продавца — только должники в `installation_done`/`completed`; от швеи — FORBIDDEN; `overdue` — заказ со вчерашним сроком в работе есть, закрытый — нет; `assigneeId` карнизчика находит его заказ; `cursor: 2` отдаёт вторую страницу.
- [ ] **Step 2: Run smoke** — Expected: FAIL.
- [ ] **Step 3: Implement.** Имена — одним `select id, full_name from users where id in (…)` по id исполнителей страницы.
- [ ] **Step 4: Run** typecheck + test + smoke — Expected: зелёное.
- [ ] **Step 5: Commit** `Order list: current executor, debt and overdue filters, cursor`

### Task 6: `orders.update` — права, цена, позиции, уведомление

**Files:**
- Create: `packages/db/migrations/0071_order_updated_notification.sql` (+ `meta/_journal.json`)
- Modify: `packages/shared/src/enums/notificationType.enum.ts` (`order_updated`: тон `info`, ведёт на заказ — по образцу `installation_scheduled`)
- Modify: `apps/api/src/routers/orders.router.ts` (`update`), `apps/api/src/services/notifications.service.ts` (`notifyOrderUpdated`), `apps/api/src/lib/notificationTranslations.ts`, `apps/api/src/lib/errorTranslations.ts`, `apps/mobile/src/components/Icon.tsx` (иконка типа — `edit`, она же заводится в задаче 12; если задача 12 ещё не сделана, завести здесь). Новых действий аудита нет: пишутся существующие `order.updated` и `order.price_changed`.
- Modify: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `canEditOrder`, `currentExecutorRole`, `closeIfSettled` (задачи 1, 3).
- Produces: вход `orders.update` дополняется `workPrice?: money`, `discountAmount?: money`, `discountReason?: text(300)`; `notifyOrderUpdated(executor, order: OrderNotificationContext, userId: number, itemsChanged: boolean): Promise<void>`.

- [ ] **Step 1: Smoke:** закрытый заказ, правка от CEO → «Заказ закрыт — правка недоступна»; продавец правит свой `new` (клиент, цена) → ок, аудит `order.updated` и `order.price_changed`; продавец — свой в пошиве → прежняя ошибка «Заказ уже в работе…»; менеджер меняет позиции заказа в пошиве → у швеи уведомление `order_updated` с телом «Изменён состав заказа — проверьте позиции», у самого менеджера уведомления нет; позиция отправлена с прежним метражом → метраж в БД сохранён; `ready_made` с `items` → «Состав продажи готовых штор изменить нельзя»; правка цены до оплаченной у должника в `installation_done` → `completed`.
- [ ] **Step 2: Run smoke** — Expected: FAIL.
- [ ] **Step 3: Implement.** Проверка прав — `canEditOrder` (с прежними текстами ошибок для автора и новым для закрытого). Цена — тот же патч и аудит, что в `setPrice` (вынести общую функцию `applyPriceChange(tx, order, input, actor, ip)` и звать из обеих процедур). Уведомление — исполнителю `currentExecutorRole(status)`, если назначен и не автор правки. Миграция — `ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'order_updated';`.
- [ ] **Step 4: Run** `pnpm db:migrate && pnpm --filter @curtain-crm/shared test && pnpm --filter @curtain-crm/api typecheck && pnpm --filter @curtain-crm/api smoke` — Expected: зелёное.
- [ ] **Step 5: Commit** `Order edit: shared rights, price, items with meters, executor notified`

### Task 7: Сайт — роли

**Files:**
- Modify: `apps/web/src/components/orders/useAssigneeCandidates.ts` (только `own` + текущий; убрать `showMore`, `canShowMore`, `mainRole`), `OrderManagePanel.tsx:288-338`, `OrderActionDialog.tsx:281-327` (убрать «Ещё сотрудники»)
- Create: `apps/web/src/components/employees/AutoGrantedRoles.tsx`
- Modify: `apps/web/src/app/employees/page.tsx` (блок над «Список сотрудников», только `hasRole(Role.CEO)`)

- [ ] **Step 1:** Блок «Роли, выданные системой автоматически»: строка — сотрудник, роль (`ROLE_LABELS`), дата (`formatDateTime`), «назначил: {имя}», кнопка «Снять роль» → `users.revokeRole.mutate({ id, role })`, после — инвалидация `autoGrantedRoles`; ошибка — `FormError`. Пусто — блок не рендерится.
- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/web typecheck && pnpm --filter @curtain-crm/web lint` — Expected: зелёное.
- [ ] **Step 3: Commit** `Web: assign only people with the role; CEO reviews auto-granted roles`

### Task 8: Сайт — долги

**Files:**
- Modify: `apps/web/src/app/orders/[id]/page.tsx` (кнопки переходов :319-353 — `disabled` и подсказка `blockedReason` под кнопкой; бейдж «Ждёт оплаты» в шапке :199-204 по `isAwaitingPayment`)
- Modify: `apps/web/src/components/orders/OrdersView.tsx` (бейдж в ячейке статуса; вкладка «С долгом» → `withDebt: true`), `apps/web/src/app/orders/page.tsx` (пресет «С долгом», виден при `canSeeClientMoney(user.roles)`)
- Modify: `apps/web/src/components/orders/SellReadyMadeDialog.tsx` (без установки и переделки: предоплата = цена со скидкой, поле заблокировано с подписью «Без установки — только полная оплата»)
- Modify: `apps/web/src/components/orders/OrderPhotos.tsx:177-181` (текст: «Фото стадии «После установки» закроет заказ, если он оплачен. Иначе заказ будет ждать оплаты.»)

**Interfaces:**
- Consumes: `isAwaitingPayment`, `canSeeClientMoney`, `AWAITING_PAYMENT_LABEL`, `DEBT_FILTER_LABEL` (задача 1); `blockedReason`, `withDebt` (задачи 3, 5).
- `OrdersPreset` получает поле `withDebt?: true`; в запрос — `withDebt: true` без `status`.

- [ ] **Step 1:** Реализация по Files.
- [ ] **Step 2: Run** web typecheck + lint — Expected: зелёное.
- [ ] **Step 3: Commit** `Web: debt blocks closing, awaiting-payment badge, debt tab`

### Task 9: Сайт — исполнитель в списке

**Files:**
- Modify: `apps/web/src/components/orders/OrdersView.tsx` (колонка `executor` после `status`)

- [ ] **Step 1:** Ячейка: `currentExecutor === null` → «—»; `userId === null` → серое `EXECUTOR_NOT_ASSIGNED_LABEL`; иначе имя и под ним мелко `ROLE_LABELS[locale][role]`. Заголовок — `EXECUTOR_LABEL`. `sortValue` — имя.
- [ ] **Step 2: Run** web typecheck + lint — Expected: зелёное.
- [ ] **Step 3: Commit** `Web: current executor column`

### Task 10: Сайт — правка заказа

**Files:**
- Create: `apps/web/src/components/orders/OrderFormFields.tsx` — разделы «Клиент», «Условия» (без денег), «Позиции» и хук `useOrderCatalog`, вынесенные из `OrderCreateDialog.tsx` (:130-296, :360-558); функции `itemDraftToInput(draft: ItemDraft): OrderItemInput` и `orderItemToDraft(item: OrderItemRow): ItemDraft`
- Create: `apps/web/src/components/orders/OrderEditDialog.tsx`
- Modify: `apps/web/src/components/orders/OrderCreateDialog.tsx` (на общих полях), `apps/web/src/components/orders/OrderItemFields.tsx` (`MaterialDraft` += `originalCode: string | null`, `meters: number | null`; `toMaterial` пишет `meters: editedMaterialMeters(...)`), `apps/web/src/app/orders/[id]/page.tsx` (кнопка «Изменить» с иконкой карандаша в шапке при `canEditOrder`)

**Interfaces:**
- Consumes: `canEditOrder`, `editedMaterialMeters` (задача 1); вход `orders.update` (задача 6).

- [ ] **Step 1:** Вынести поля без изменения поведения создания; проверить, что создание заказа и пошив на склад работают как раньше (dev-сервер, создать по одному заказу каждого вида).
- [ ] **Step 2:** `OrderEditDialog({ order, open, onClose })`: начальные значения из `orders.byId`; деньги — `DiscountFields` и цена, скрыты для `stock` и для тех, у кого `workPrice === null`; клиент скрыт для `stock`; позиции скрыты для `ready_made`; отправляются только изменённые поля; успех — `toast.success('Заказ изменён')` и инвалидация `orders.byId`.
- [ ] **Step 3: Run** web typecheck + lint — Expected: зелёное.
- [ ] **Step 4: Commit** `Web: edit order from the order page`

### Task 11: Приложение — роли, долги, исполнитель в карточке

**Files:**
- Modify: `apps/mobile/src/components/OrderManagement.tsx:249-345` (только `own` + текущий; убрать `showOthers` и чип «Ещё»)
- Modify: `apps/mobile/src/screens/OrderDetailScreen.tsx` (основная кнопка и строки шторки «Все действия»: `blockedReason` → `disabled` и строка-подсказка `styles.sheetHint`; `Pill` «Ждёт оплаты» рядом со статусом)
- Modify: `apps/mobile/src/components/OrderCard.tsx` (props `executor?: { name: string | null } | null`, `awaitingPayment?: boolean`; строка с именем под `Pill`, серое «не назначен»), `apps/mobile/src/screens/WorkScreen.tsx:423-436` (передать)
- Modify: `apps/mobile/src/screens/SellReadyMadeScreen.tsx` (без установки и переделки — предоплата = цена со скидкой, поле заблокировано, подпись)
- Modify: `apps/mobile/src/i18n/messages.ts` (`photo.willClose` → «Снимок этой стадии закроет заказ, если он оплачен.»; новые ключи `order.awaitingPayment`, `order.executorNone`, `sell.fullPaymentOnly`)

- [ ] **Step 1:** Реализация по Files.
- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/mobile typecheck && pnpm --filter @curtain-crm/mobile lint` — Expected: зелёное.
- [ ] **Step 3: Commit** `App: roles picker, debt hints, executor on order cards`

### Task 12: Приложение — поиск и фильтры на «Работе»

**Files:**
- Create: `apps/mobile/src/components/work/OrderSearchBar.tsx` (поле + чипы «Статус», «Исполнитель», выбранные фильтры, «Сбросить»), `apps/mobile/src/components/work/StatusFilterSheet.tsx`, `apps/mobile/src/components/work/ExecutorFilterSheet.tsx`
- Modify: `apps/mobile/src/screens/WorkScreen.tsx` (запрос → `trpc.orders.list.useInfiniteQuery` с `cursor`, `pageSize: 30`, `onEndReached`; `overdue: filter === 'overdue'` вместо фильтра на телефоне; поиск с задержкой 300 мс), `apps/mobile/src/components/Icon.tsx` (`search`, `close`, `edit` → Ionicons `search`, `close`, `create-outline`), `apps/mobile/src/i18n/messages.ts`

**Interfaces:**
- Consumes: `withDebt`, `overdue`, `cursor`, `assigneeId` (задача 5); `canSeeClientMoney`, `DEBT_FILTER_LABEL` (задача 1); `PRODUCTION_STAGES`/`statusesOfProductionStage`, `ORDER_STATUS_LABELS` из shared.
- Фильтр «Исполнитель» — только при `useCanDispatchOrders()`; список — `users.assignable` с полем поиска по имени.
- Ключ запроса включает поиск и фильтры — смена любого начинает выдачу с первой страницы.

- [ ] **Step 1:** Реализация по Files.
- [ ] **Step 2: Run** mobile typecheck + lint — Expected: зелёное.
- [ ] **Step 3: Ручная проверка (Expo web, как в выпуске 2):** ввести «DH-0001» → список сузился; выбрать статус «Пошив» → только пошив; прокрутить «Все» до конца → подгрузилась вторая страница; сменить поиск → список с начала, без старых строк; «Просрочены» показывают заказ со сроком вчера.
- [ ] **Step 4: Commit** `App: order search with status and executor filters`

### Task 13: Приложение — правка заказа

**Files:**
- Create: `apps/mobile/src/components/order/OrderForm.tsx` (разделы клиента, условий, позиций, сканер — вынесены из `OrderCreateScreen.tsx`; `draftItemToInput`, `orderItemToDraft`), `apps/mobile/src/screens/OrderEditScreen.tsx`
- Modify: `apps/mobile/src/screens/OrderCreateScreen.tsx` (на `OrderForm`), `apps/mobile/src/components/order/OrderItemCard.tsx` (`MaterialDraft` += `originalCode`, `meters`; `toMaterial` через `editedMaterialMeters`), `apps/mobile/src/types/index.ts` (`OrderEdit: { orderId: number }`), `apps/mobile/src/navigation/RootNavigator.tsx` (экран `OrderEdit`; у `OrderDetail` — `headerRight` с иконкой `edit` по образцу `SellReadyMade` :99-120, видна при `canEditOrder`), `apps/mobile/src/i18n/messages.ts`

**Interfaces:**
- Consumes: `canEditOrder`, `editedMaterialMeters` (задача 1); вход `orders.update` (задача 6).
- Поведение — как у `OrderEditDialog` задачи 10 (скрытие разделов по типу заказа и видимости денег, только изменённые поля). Видимость карандаша решается внутри экрана заказа: шапка получает флаг через `navigation.setOptions` после загрузки `orders.byId`.

- [ ] **Step 1:** Вынести форму без изменения поведения создания; проверить создание на Expo web.
- [ ] **Step 2:** `OrderEditScreen` + карандаш.
- [ ] **Step 3: Run** mobile typecheck + lint — Expected: зелёное.
- [ ] **Step 4: Commit** `App: edit order from the order screen`

### Task 14: Документация и финальная проверка

**Files:**
- Modify: `docs/REQUIREMENTS.md` (п. 3.9), `docs/BUSINESS_LOGIC.md` («Автозакрытие», «Роли», «Оплаты»), `docs/API.md` (`orders.list`, `orders.update`, `orders.availableTransitions`, `payments.acceptForOrder`, `users.autoGrantedRoles`)
- Modify: `apps/api/src/scripts/demo.ts` — один заказ в `installation_done` с остатком (для «Ждёт оплаты» и вкладки «С долгом»)

- [ ] **Step 1:** Документы по спецификации §2–4.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @curtain-crm/api smoke` — Expected: всё зелёное.
- [ ] **Step 3:** Снимки Playwright: список заказов (колонка «Исполнитель», вкладка «С долгом»), заказ-должник (кнопка «Закрыть заказ» с подсказкой), диалог правки, блок автоназначенных ролей; в приложении — «Работа» с поиском и фильтрами, карточка с исполнителем, экран правки.
- [ ] **Step 4: Commit** `Docs: release 3 rules`

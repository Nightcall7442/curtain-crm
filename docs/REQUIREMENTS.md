# Требования заказчика — проверяемый чек-лист

Формализация исходного ТЗ на CRM для шторной мастерской «Design House».
Документ существует ради одной цели: дать агентам-аудиторам и ревьюерам
конкретные утверждения, каждое из которых можно подтвердить или опровергнуть
кодом. Формулировки вида «система должна быть удобной» сюда не попадают.

Столбец «Проверка» указывает, ГДЕ искать подтверждение.

---

## 1. Роли и права

| № | Требование | Проверка |
|---|---|---|
| 1.1 | Восемь ролей: `ceo`, `admin`, `seller`, `master`, `sewer`, `qc`, `installer`, `smm` | `packages/shared/src/enums/role.enum.ts` |
| 1.2 | Роль — множество (many-to-many), один человек может быть мастером И швеёй. Колонки `role` в `users` быть НЕ должно | `packages/db/src/schema/users.schema.ts` |
| 1.3 | Роли создаёт и меняет ТОЛЬКО CEO. Админ ролями не управляет | `users.grantRole` / `users.revokeRole` объявлены как `ceoProcedure` |
| 1.4 | Права проверяются в tRPC-middleware по каждой процедуре, а не только во фронтенде | `middleware/roleGuard.middleware.ts`, использование в роутерах |

## 2. Мультифилиальность

| № | Требование | Проверка |
|---|---|---|
| 2.1 | Таблица `branches` с `id, name, lat, lon, radius_meters, is_active` | `branches.schema.ts` |
| 2.2 | Сотрудник привязан к одному или нескольким филиалам (`user_branches`) | `users.schema.ts` |
| 2.3 | Радиус чек-ина = 100 м по умолчанию, ОДИНАКОВ для всех ролей, хранится в `branches.radius_meters`, а не в коде | `DEFAULT_CHECK_IN_RADIUS_METERS`, отсутствие захардкоженного радиуса в сервисах |
| 2.4 | Радиус редактируется CEO/админом из веб-панели | `branches.update` + UI |

## 3. Жизненный цикл заказа

| № | Требование | Проверка |
|---|---|---|
| 3.1 | 17 статусов ровно в заданном перечне | `orderStatus.enum.ts` |
| 3.2 | Возможен откат на предыдущий шаг при браке | переходы `kind: 'rollback'` |
| 3.3 | Каждый переход пишется в `order_status_history`; записи НИКОГДА не перезаписываются | `orderWorkflow.service.ts` — только `insert`, нигде нет `update`/`delete` по этой таблице |
| 3.4 | Откат — обычный переход с обязательным `comment` | `requiresComment()` |
| 3.5 | Заказ создаёт ТОЛЬКО `seller` или `admin`, проверка в процедуре | `orders.create` = `orderIntakeProcedure` |
| 3.6 | Шаг замера НЕ обязателен: админ может перевести заказ сразу в `pending_sewing_assignment` | наличие перехода `pending_admin_review -> pending_sewing_assignment` |
| 3.7 | `cancelled` и `completed` не удаляются, остаются в основной таблице, архив — фильтр по статусу | `archive.router.ts`, отсутствие отдельной таблицы архива |
| 3.8 | `installer_id` — один ответственный; бригада опциональна и не блокирует MVP | `orders.schema.ts`, `order_installation_team` |
| 3.9 | Загрузка фото `install_after` АВТОМАТИЧЕСКИ переводит заказ в `completed`, без подтверждения клиента | `orderPhotos.router.ts` |
| 3.10 | `cancelled` доступен в любой момент, только CEO/админу, с причиной | таблица переходов + check-констрейнт |

## 4. Замеры, фото, комментарии

| № | Требование | Проверка |
|---|---|---|
| 4.1 | Стадии фото: `measurement`, `fabric`, `cutting`, `sewing_process`, `qc`, `install_before`, `install_after`, `general` | `photoStage.enum.ts` |
| 4.2 | Фото — file references, абстракция `services/storage.service.ts` с `upload/getUrl/delete` | наличие интерфейса `StorageDriver` |
| 4.3 | Disk-драйвер для разработки + заглушка под S3 | `DiskStorageDriver`, `S3StorageDriver` |
| 4.4 | Комментарии текстовые и голосовые (`order_comments.is_voice`), доступны всем участникам заказа | `orderComments.schema.ts`, `orderComments.router.ts` |

## 5. Смены и геолокация

| № | Требование | Проверка |
|---|---|---|
| 5.1 | Чек-ин/чек-аут одним блоком (`shift_started_at`, `shift_ended_at`), без перерывов | `shifts.schema.ts` |
| 5.2 | Координаты сверяются с ближайшим активным филиалом по haversine | `geolocation.ts`, `geolocation.service.ts` |
| 5.3 | Радиус берётся из `branches.radius_meters` | `resolveCheckInBranch` |
| 5.4 | Вне радиуса — `TRPCError` с кодом `FORBIDDEN` и сообщением на русском | `geolocation.service.ts` |
| 5.5 | Admin/CEO может скорректировать смену задним числом через `shifts.adjustManually` | `shifts.router.ts` |
| 5.6 | Корректировка требует указания, кто и почему; пишется в `audit_log` | `adjustManually` |

## 6. Закупки

| № | Требование | Проверка |
|---|---|---|
| 6.1 | Каталог `purchase_items`: `name, unit, price, category`; ведут CEO и админ | `purchases.schema.ts`, `purchases.items.*` |
| 6.2 | `purchases` привязаны к заказу: `order_id, item_id, quantity, total_price, comment` | `purchases.schema.ts` |
| 6.3 | Себестоимость заказа = сумма `purchases` по заказу | `purchases.orderCost` |

## 7. Зарплата

| № | Требование | Проверка |
|---|---|---|
| 7.1 | `payroll_schemes`: `role, type (fixed/hourly/kpi/commission), base_amount, rate, kpi_target, commission_percent` | `payroll.schema.ts` |
| 7.2 | Поля nullable, согласованность проверяется на уровне сервиса в зависимости от `type` | check-констрейнт + `PAYROLL_SCHEME_REQUIRED_FIELDS` |
| 7.3 | `payroll_records`: `user_id, period, scheme_snapshot (JSON), calculated_amount, kpi_percent, paid_amount, status (draft/approved/paid)` | `payroll.schema.ts` |
| 7.4 | Снимок схемы фиксируется, чтобы прошлые месяцы не пересчитывались | `saveDraft` пропускает не-`draft` |
| 7.5 | Расчёт — отдельная ЧИСТАЯ функция на каждый `type`, без побочных эффектов | `payroll.service.ts` |
| 7.6 | Расчётные функции покрыты юнит-тестами | `payroll.service.test.ts` |
| 7.7 | Схему начисления можно настроить без изменения кода | `payroll.schemes.upsert` |

## 8. Уведомления

| № | Требование | Проверка |
|---|---|---|
| 8.1 | Внутренние уведомления сотруднику о ЕГО задачах | `notifications.service.ts` |
| 8.2 | Модель `notifications`: `user_id, type, title, body, related_order_id, is_read, created_at` | `notifications.schema.ts` |
| 8.3 | Роутер с `list`, `markAsRead`, `unreadCount` | `notifications.router.ts` |
| 8.4 | Клиентские SMS НЕ реализуются, но модель их не блокирует | отсутствие клиентских каналов, расширяемый `NOTIFICATION_TYPES` |

## 9. Качество кода

| № | Требование | Проверка |
|---|---|---|
| 9.1 | TypeScript strict везде, `noUncheckedIndexedAccess: true` | `tsconfig.base.json` |
| 9.2 | Zod-схемы для входных данных ВСЕХ процедур | роутеры |
| 9.3 | Корректные внешние ключи с осознанными политиками `onDelete`, неочевидные — с обоснованием в комментарии | схемы БД |
| 9.4 | Общие enum'ы и константы ТОЛЬКО в `packages/shared`; никаких дублирующихся строковых литералов в `apps/*` | поиск литералов вида `'admin'`, `'sewing_done'` в приложениях |
| 9.5 | Ошибки — `TRPCError` с осмысленными кодами и русскими сообщениями | роутеры и сервисы |
| 9.6 | Никакой бизнес-логики в компонентах React/RN — только вызов хуков и рендер | `apps/web/src`, `apps/mobile/src` |
| 9.7 | Каждый роутер — с JSDoc сверху про роли и доступ | `apps/api/src/routers/*.ts` |
| 9.8 | README с инструкцией: Postgres, миграции, переменные окружения | `README.md` |
| 9.9 | Без `any`, без `TODO`, без заглушек-моков вместо логики (кроме явно оговорённых) | весь код |

## 10. Явные ограничения от заказчика

| № | Требование | Проверка |
|---|---|---|
| 10.1 | Роль SMM: функционал НЕ придумывать, зарезервировать в enum, `smm.router.ts` — одна заглушка `ping` | `smm.router.ts` |
| 10.2 | Заказ, созданный админом, ВСЁ РАВНО проходит `pending_admin_review` (подтверждено заказчиком) | `orders.create` |
| 10.3 | Клиентские уведомления не реализуются | — |
| 10.4 | Перерывы внутри смены не учитываются | `shifts.schema.ts` |

---

## Как пользоваться

Запуск аудита агентами:

```
Агенты в .claude/agents/:
  spec-auditor          — соответствие этому чек-листу
  security-auditor      — права и границы доверия
  workflow-auditor      — жизненный цикл заказа
  code-quality-auditor  — требования раздела 9
  api-contract-auditor  — поведение на живой БД
```

Каждый агент возвращает вердикт по пунктам: `СООТВЕТСТВУЕТ`,
`НЕ СООТВЕТСТВУЕТ` (с указанием файла и строки) либо
`ЧАСТИЧНО` (с описанием расхождения).

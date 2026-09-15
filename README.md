<div align="center">

# Curtain CRM

**Система учёта для мастерской штор Design House · Parda Bozor**

Заказы от замера до установки, смены по геолокации, касса и инкассация,
зарплата по схемам, готовые шторы и склад — в веб-панели для руководства
и мобильном приложении для персонала.

[![CI](https://github.com/Nightcall7442/curtain-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/Nightcall7442/curtain-crm/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9-f69220?logo=pnpm&logoColor=white)

[Возможности](#возможности) · [Архитектура](#архитектура) · [Быстрый старт](#быстрый-старт) · [Документация](#документация)

</div>

---

## Возможности

| Раздел | Что делает |
|---|---|
| **Заказы** | Полный жизненный цикл: замер → пошив → ОТК → установка. Позиции, фото по стадиям, откаты с причиной, история статусов, сбор на выезд для установщиков |
| **Готовые шторы и витрина** | Продажа с витрины мимо цеха, пошив для склада, розничный склад |
| **Касса** | Приход по источникам и способам оплаты, инкассация с чеком онлайн-кассы, наличные на руках у сотрудников |
| **Смены и табель** | Чек-ин/чек-аут по геолокации, отлучки, выезды, табель по дням, выходные по заявке и по назначению руководителя |
| **Зарплата** | Схемы по ролям: оклад, процент, за этапы, от расценки. Утверждение периодов, отметка выплат |
| **Сотрудники** | Роли и филиалы, доп и личные работы, рейтинг, журнал действий |
| **Склад** | Справочник кодов материалов с импортом и экспортом в Excel и PDF |
| **Отчёты** | Дашборд, выручка и маржа по месяцам, производственные этапы |
| **Мобильное приложение** | Всё, что нужно в цехе и на объекте: свои заказы, смена, касса, график, уведомления. Русский и узбекский |

## Архитектура

```
apps/
  api       Hono + tRPC v11 — роутеры, сервисы, middleware
  web       Next.js 15 — панель руководства
  mobile    Expo 57 / React Native — приложение персонала
packages/
  shared    Перечисления, константы, чистые утилиты — единственный источник правды
  db        Схемы Drizzle, миграции, сид
  config    ESLint-пресет и базовый tsconfig
```

| Слой | Технология |
|---|---|
| API | [Hono](https://hono.dev) + [tRPC 11](https://trpc.io) — типобезопасный контракт без REST |
| База | PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team) |
| Веб | Next.js 15 (App Router), Tailwind CSS |
| Мобильное | Expo 57, React Navigation |
| Монорепозиторий | pnpm workspaces + Turborepo |

Принципы, на которых всё держится:

- **Один источник правды.** Роли, статусы и переходы живут только в `packages/shared`. Строковых литералов вроде `'admin'` в приложениях нет.
- **Статус заказа меняется в одном месте** — `changeOrderStatus()`. Каждый переход записан в историю и порождает уведомления.
- **Права проверяет сервер.** Скрытая кнопка — удобство; граница доверия — tRPC-процедура с guard'ом.
- **Зарплата — чистые функции**, покрытые тестами. Утверждённый период хранит снимок схемы и не пересчитывается.

Подробно — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Быстрый старт

Нужны Node.js 20.11+, pnpm 9 (`corepack enable`) и PostgreSQL 16.

```bash
pnpm install
cp .env.example .env && cp apps/api/.env.example apps/api/.env
```

В `apps/api/.env` задайте `JWT_SECRET` (не короче 32 символов):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Поднимите базу, накатите миграции и запустите всё:

```bash
pnpm docker:up        # или свой PostgreSQL на localhost:5432
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Приложение | Адрес |
|---|---|
| API | http://localhost:3000/trpc (`/health` для проверки) |
| Панель | http://localhost:3001 |
| Мобильное | `pnpm --filter @curtain-crm/mobile dev` → QR в Expo Go |

Сид создаёт филиал и директора — логин `+998901234567`, пароль `DesignHouse2026!`
(переопределяются `SEED_CEO_PHONE` / `SEED_CEO_PASSWORD`). **Смените пароль после первого входа.**

> **Windows PowerShell 5.1** не понимает `&&` — выполняйте команды по одной или через `;`.

## Команды

```bash
pnpm typecheck        # tsc --noEmit во всех пакетах
pnpm lint             # ESLint с проверкой типов
pnpm test             # юнит-тесты (Vitest)
pnpm db:generate      # миграция из схем Drizzle — обязательно после правки схемы
pnpm db:studio        # Drizzle Studio

pnpm --filter @curtain-crm/api run smoke   # проверки на живой базе
pnpm --filter @curtain-crm/api run demo    # демо-данные: 2 филиала, 21 сотрудник, ~66 заказов
pnpm --filter @curtain-crm/api backup      # дамп базы + файловое хранилище
```

## Развёртывание

- **Railway** — три сервиса, один домен; панель проксирует `/trpc` и `/files` в API. Пошагово: [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md).
- **Свой сервер** — `docker-compose.prod.yml`: база, API, панель и Caddy с автоматическим HTTPS. См. [docs/OPERATIONS.md](docs/OPERATIONS.md).
- **Мобильное** — сборка через EAS из `apps/mobile` (`eas build --profile preview`, APK).

## Документация

| Документ | О чём |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Направление зависимостей, инварианты, права, хранилище |
| [BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) | Жизненный цикл заказа, роли, смены, формулы зарплаты |
| [API.md](docs/API.md) | Справочник процедур tRPC: доступ, ошибки, пагинация |
| [OPERATIONS.md](docs/OPERATIONS.md) | Развёртывание, резервные копии, уборка хранилища, CI, известные ограничения |
| [DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md) | Выкладка на Railway |
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | Требования заказчика |
| [TASKS.md](docs/TASKS.md) | План работ |

---

<div align="center">
<sub>Design House · Parda Bozor · Ургенч</sub>
</div>

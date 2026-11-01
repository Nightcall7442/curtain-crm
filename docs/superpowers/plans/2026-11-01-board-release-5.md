# Выпуск 5 «Табло» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** фото людей табло по статусам (страница «Табло → Настройки») и ТВ «всё сразу»: швеи и установщики по статусам, очереди ОТК и карнизов.

**Architecture:** правила — в `packages/shared` (`boardPhotoKindOf`, `fitStatusLanes`, подписи). Фото — таблица `board_photos` (миграция 0072), процедуры `monitor.photos.*`, выбор фото по статусу в `buildBoard`/`buildPerson`. Очереди — `loadQueues` и процедуры `monitor.queues` / `display.queues`. Сайт — страница настроек и компонент `TvWall` вместо `TvBoard` с ротацией.

**Tech Stack:** PostgreSQL 16 + Drizzle 0.38, Hono + tRPC 11, Next.js 15 (Tailwind), sharp (превью), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-board-release-5-design.md`.

## Global Constraints

- Как в выпусках 1–4: без `any`, TODO и заглушек; подписи — из `@curtain-crm/shared` (ru и uz); Zod на входах; комментарии по-русски в стиле окружающего кода.
- На ТВ (`display.*`) нет `userId`, клиента, телефона и адреса; новые поля для ТВ проходят через белый список (`monitor.redact.ts`).
- Фото табло нигде, кроме табло (`monitor.*`, `display.*`), не отдаются: `users.*`, профиль, шапка — прежняя аватарка.
- Файлы фото: оригинал и превью webp через `makeAvatarPreview`; на ТВ — только превью; `storage-gc.ts` знает новые ключи.
- Подписи: «Работает / Без заказа / На перерыве» → «Ishlamoqda / Buyurtmasiz / Tanaffusda»; статус табло `break` — «На перерыве» / «Tanaffusda».

## Review Focus

1. **Фото не утекают**: `users.byId`, `users.list`, `auth.me` возвращают аватарку, а не фото табло. Тест — смоук задачи 3.
2. **Права**: загрузка/удаление — только руководство; человек вне групп табло — отказ; чужой токен ТВ — `NOT_FOUND`. Тест — смоук задач 3–4.
3. **ТВ по ссылке без цеха** не получает очередь ОТК; без установщиков — очередь карнизов. Тест — смоук задачи 4.
4. **Раскладка на 1366×768 и 1920×1080**: все люди видны, ничего не обрезано, без прокрутки. Тест — `fitStatusLanes` и Playwright задачи 6.

---

### Task 1: Правила в `shared`

**Files:** Create `packages/shared/src/monitor/boardPhoto.ts`, `packages/shared/src/monitor/wallLayout.ts` (+ тесты); Modify `packages/shared/src/enums/monitor.enum.ts` (подпись `break`), `packages/shared/src/index.ts`, `apps/web/src/components/monitor/tvLabels.ts` (`breakUntil`).

**Produces:**
- `BOARD_PHOTO_KINDS = ['working','idle','break']`, `BoardPhotoKind`, `boardPhotoKindSchema`, `BOARD_PHOTO_KIND_LABELS: Translated<BoardPhotoKind>`.
- `boardPhotoKindOf(status: LiveStatus): BoardPhotoKind`.
- `WALL_LANE_ORDER: readonly LiveStatus[]` и `wallLaneOf(status): 'working'|'trip'|'break'|'idle'|'off'`.
- `fitStatusLanes(counts: readonly number[], area: { width; height; gap; laneHeader }): { tile: number; rows: number; cols: number[] }` — наибольшая ширина плитки (высота = ширина × `WALL_TILE_RATIO`), при которой все непустые полосы встают в строку.

- [ ] тесты: `boardPhotoKindOf` по всем статусам; `fitStatusLanes([6,2,3,4], 1100×420)` — все помещаются, `Σ cols × tile + gaps ≤ width`, `rows × tileH + header ≤ height`; пустые полосы — `cols = 0`; плитка не больше `WALL_TILE_MAX`.
- [ ] FAIL → реализация → PASS; typecheck, lint; commit «Shared: board photo kinds, wall lanes layout».

### Task 2: Таблица `board_photos`

**Files:** Create `packages/db/src/schema/boardPhotos.schema.ts`; Modify `packages/db/src/schema/enums.ts`, `packages/db/src/schema/index.ts`, `apps/api/src/scripts/storage-gc.ts`; Generate `packages/db/migrations/0072_board_photos.sql` (+ meta).

- [ ] схема, `pnpm db:generate`, имя миграции `0072_board_photos`, `pnpm db:migrate` на локальной базе.
- [ ] `storage-gc.ts`: ключи `board_photos.storage_key/preview_key` — живые.
- [ ] typecheck; commit «DB: board photos by status».

### Task 3: Фото по статусу — сервер

**Files:** Create `apps/api/src/routers/boardPhotos.router.ts`; Modify `apps/api/src/routers/monitor.router.ts` (`photos`), `apps/api/src/services/monitor.service.ts`, `apps/api/src/services/monitor.queries.ts`, `apps/api/src/scripts/smoke.ts`.

- [ ] смоук «11. Выпуск 5 — фото» (сначала): загрузка фото «Работает» швее → `monitor.board` у работающей швеи отдаёт его URL (ключ `board-photos/…`); `users.byId` — аватарка; удаление → снова аватарка; продавцу — `BAD_REQUEST`; менеджеру загрузка — `FORBIDDEN`.
- [ ] `loadBoardPhotos(db, ids)`; `photoUrlOf(person, kindPhotos, status, previewOnly)`; в `buildBoard` фото после статуса; `buildPerson` — так же.
- [ ] `monitor.photos.list/set/remove` (руководство), аудит.
- [ ] смоук PASS; commit «Board photos by status: upload, board picks the photo of the status».

### Task 4: Очереди ОТК и карнизов

**Files:** Create `apps/api/src/services/monitor.queues.ts`; Modify `monitor.router.ts` (`queues`), `display.router.ts` (`queues`), `monitor.redact.ts` (+ тест), `smoke.ts`.

- [ ] смоук (сначала): заказ в `pending_qc` — в `monitor.queues.qc` со швеёй; карниз «ставят» — в `cornice` с карнизчиком; `display.queues` без клиента; ссылка без цеха → `qc: null`.
- [ ] реализация; redact-тест: в очереди ТВ только белый список полей.
- [ ] commit «Board queues: QC and cornices for the TV wall».

### Task 5: Сайт — «Табло → Настройки»

**Files:** Create `apps/web/src/app/monitor/settings/page.tsx`, `apps/web/src/components/monitor/BoardPhotosEditor.tsx`; Modify `apps/web/src/components/layout/navigation.ts`.

- [ ] страница: группы, у человека три ячейки (превью, «Загрузить/Заменить», «Убрать»); подсказка «Фото видно только на табло и ТВ».
- [ ] typecheck, lint; Playwright: загрузка фото → превью в ячейке → на табло у человека это фото.
- [ ] commit «Web: board settings with photos by status».

### Task 6: ТВ «всё сразу»

**Files:** Create `apps/web/src/components/monitor/TvWall.tsx`; Modify `apps/web/src/app/tv/[token]/page.tsx`, `apps/web/src/app/monitor/tv/page.tsx`, `tvLabels.ts`; Delete `TvBoard`-ротацию, если не используется (`useTvRotation.ts`).

- [ ] шапка со сводкой; панели «Швеи» и «Установщики» с полосами статусов (`fitStatusLanes`); справа «Лучшие месяца», «ОТК — очередь», «Карнизы — очередь».
- [ ] typecheck, lint; Playwright 1920×1080 и 1366×768 (по ссылке и у руководителя), ru и uz.
- [ ] commit «Web: TV wall — everyone by status, QC and cornice queues».

### Task 7: Демо, документация, проверка

- [ ] `demo.ts`: заказы в ОТК и карнизы в работе (если их нет).
- [ ] `docs/BUSINESS_LOGIC.md` (Табло), `docs/API.md` (monitor.photos, queues, display.queues), `docs/REQUIREMENTS.md`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test`, смоук; commit «Docs: board release 5».

# Монитор-табло, выпуск 1 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** табло «Цех» и «Установщики» в веб-панели и на ТВ по секретной ссылке — на данных, которые в системе уже есть.

**Architecture:** правила (статус человека, выходной, состав заказа, место, фильтры) — чистые функции в `packages/shared`. Серверный модуль `monitor` собирает один согласованный снимок табло SQL-запросами; панель получает его через `monitor.board` / `monitor.person`, ТВ — через публичную `display.board`, которая проверяет токен и урезает снимок отдельным преобразованием. Клиенты опрашивают раз в 20 с.

**Tech Stack:** PostgreSQL 16 + Drizzle, Hono + tRPC 11, Next.js 15 (App Router, Tailwind), Vitest, `sharp` (превью фото).

**Spec:** `docs/superpowers/specs/2026-10-14-monitor-board-design.md` (выпуск 1 — раздел 7).

## Global Constraints

- Никаких `any`, `TODO`, заглушек; ESLint с типами должен проходить (`pnpm lint`).
- Роли, статусы, группы, подписи — только из `@curtain-crm/shared`; строковых литералов вроде `'sewer'`, `'working'` в `apps/*` нет.
- Входы процедур — Zod; `idSchema` из `apps/api/src/lib/schemas.ts`, язык — `z.enum(LOCALES)`.
- Периоды — по Ташкенту (`workshopPeriodStarts`); неделя с понедельника.
- Определения выработки — как в `rating.service.ts`: швея — штуки заказов с последним `sewing_done` в периоде (`greatest(sum(quantity), 1)`), установщик — заказы с последним `installation_done`, карнизчик — `cornice_done_at`; отменённые не считаются.
- На ТВ нет денег, клиентов, телефонов, адресов, `orderId`.
- Подписи интерфейса панели — по-русски; подписи перечислений — `Translated` ru/uz.
- Комментарии в коде — по-русски, в стиле соседних файлов («почему», а не «что»).
- После правки схемы — `pnpm db:generate`, миграция коммитится.
- Опрос `MONITOR_POLL_MS = 20_000`; «нет связи» после `MONITOR_STALE_AFTER_MS = 60_000`; ТВ: смена табло `TV_ROTATE_MS = 30_000`, страницы `TV_PAGE_MS = 15_000`, перезагрузка раз в 6 ч.
- Выпуск 1 **без плана**: полосы и % плана не рисуются вовсе (поле `plan` в снимке отсутствует).

## Review Focus

1. **Человек с двумя ролями группы** (установщик + карнизчик) — одна карточка, выработка — сумма по ролям. Тест — смоук, задача 4.
2. **Забытая смена** (открыта дольше 16 ч) — статус «нет отметки» или «выходной», а не «работает». Тест — задача 1.
3. **Вышел в свой выходной** — «работает», а не «выходной». Тест — задача 1.
4. **Филиалы**: человек другого филиала не попадает на табло филиала; заказы другого филиала не идут в выработку. Тест — смоук, задача 4.
5. **Фото, которое `sharp` не смог прочитать** (заявлено `image/png`, внутри мусор — сервер проверяет только заявленный тип), не ломает загрузку: оригинал сохраняется, превью `null`, табло берёт оригинал. Тест — юнит и смоук, задача 2.

---

### Task 1: Правила табло в `shared`

**Files:**
- Create: `packages/shared/src/enums/monitor.enum.ts`
- Create: `packages/shared/src/constants/monitor.ts`
- Create: `packages/shared/src/monitor/liveStatus.ts`, `packages/shared/src/monitor/dayOff.ts`, `packages/shared/src/monitor/items.ts`, `packages/shared/src/monitor/board.ts`
- Create: `packages/shared/src/monitor/monitor.test.ts`
- Modify: `packages/shared/src/index.ts` (экспорт новых модулей)

**Interfaces:**
- Produces:
  - `MONITOR_GROUPS = ['workshop', 'installation'] as const`, `type MonitorGroup`, `MonitorGroup` (`WORKSHOP`, `INSTALLATION`), `monitorGroupSchema`, `MONITOR_GROUP_ROLES: Readonly<Record<MonitorGroup, readonly Role[]>>` (`workshop → [Role.SEWER]`, `installation → [Role.INSTALLER, Role.CORNICE_INSTALLER]`), `MONITOR_GROUP_LABELS: Translated<MonitorGroup>` (ru: «Цех», «Установщики»; uz: «Sex», «O'rnatuvchilar»).
  - `LIVE_STATUSES = ['trip', 'break', 'working', 'idle', 'finished', 'day_off', 'absent'] as const` (порядок = приоритет), `type LiveStatus`, `LiveStatus` const, `LIVE_STATUS_LABELS: Translated<LiveStatus>` — ru: «На выезде», «Отлучка», «Работает», «Без заказа», «Смена закрыта», «Выходной», «Нет отметки»; uz: «Chiqishda», «Vaqtincha chiqib ketgan», «Ishlamoqda», «Buyurtmasiz», «Smena yopilgan», «Dam olish kuni», «Belgilanmagan».
  - `constants/monitor.ts`: `MONITOR_POLL_MS`, `MONITOR_STALE_AFTER_MS`, `TV_ROTATE_MS`, `TV_PAGE_MS` (значения — Global Constraints), `TV_RELOAD_MS = 6 * 60 * 60 * 1000`, `MONITOR_QUEUE_PREVIEW = 3`, `MONITOR_PODIUM_SIZE = 5`, `MONITOR_UNIT: Readonly<Record<MonitorGroup, 'pieces' | 'orders'>>`, `AVATAR_PREVIEW_MAX_PX = 640`, `MONITOR_SORTS = ['place', 'name'] as const`, `type MonitorSort`.
  - `deriveLiveStatus(input: LiveStatusInput): LiveStatusResult` — типы ниже.
  - `isDayOffOn(dayIso: string, weeklyDayOff: number | null, approved: readonly { startDate: string; endDate: string }[]): boolean`.
  - `summarizeItems(items: readonly { kind: OrderItemKind; quantity: number; areaM2: number | null }[], locale: Locale): ItemsSummary`, `interface ItemsSummary { text: string; pieces: number; areaM2: number }`.
  - `deltaPercent(current: number, previous: number): number | null`.
  - `filterPeople<T extends { fullName: string; status: LiveStatus }>(people: readonly T[], status: LiveStatus | 'all', query: string): T[]`; `sortPeople<T extends { fullName: string; place: number }>(people: readonly T[], sort: MonitorSort): T[]`.

```ts
export interface LiveStatusInput {
  readonly now: Date;
  /** Смена, начатая сегодня (по Ташкенту), либо ещё открытая. Самая поздняя. */
  readonly shift: { readonly startedAt: Date; readonly endedAt: Date | null } | null;
  readonly openBreak: { readonly startedAt: Date; readonly plannedMinutes: number } | null;
  readonly openTrip: { readonly startedAt: Date } | null;
  readonly dayOff: boolean;
  readonly hasCurrentWork: boolean;
}
export interface LiveStatusResult {
  readonly status: LiveStatus;
  readonly since: Date | null;
  /** Только для отлучки: начало + заявленные минуты. */
  readonly until: Date | null;
}
```

Правило `deriveLiveStatus`: смена «идёт», если `endedAt === null` и ей меньше `SHIFT_FORGOTTEN_AFTER_HOURS`. Идёт + выезд → `trip` (since = начало выезда); идёт + отлучка → `break` (since, until); идёт → `working` при `hasCurrentWork`, иначе `idle` (since = начало смены); смена закрыта (`endedAt !== null`) → `finished` (since = `endedAt`); иначе `dayOff` → `day_off`; иначе `absent`.

- [ ] **Step 1: Write the failing tests** в `monitor.test.ts`:

```ts
const at = (iso: string) => new Date(iso);
const base = { now: at('2026-10-14T07:40:00Z'), shift: null, openBreak: null, openTrip: null, dayOff: false, hasCurrentWork: false };

it('выезд важнее отлучки и работы', () => {
  const r = deriveLiveStatus({ ...base, shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null },
    openTrip: { startedAt: at('2026-10-14T07:05:00Z') }, openBreak: { startedAt: at('2026-10-14T07:00:00Z'), plannedMinutes: 20 }, hasCurrentWork: true });
  expect(r).toEqual({ status: 'trip', since: at('2026-10-14T07:05:00Z'), until: null });
});
it('отлучка: until = начало + заявленные минуты', () => {
  const r = deriveLiveStatus({ ...base, shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null },
    openBreak: { startedAt: at('2026-10-14T07:40:00Z'), plannedMinutes: 30 } });
  expect(r.status).toBe('break');
  expect(r.until).toEqual(at('2026-10-14T08:10:00Z'));
});
it('работает / без заказа', () => {
  const shift = { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null };
  expect(deriveLiveStatus({ ...base, shift, hasCurrentWork: true })).toEqual({ status: 'working', since: shift.startedAt, until: null });
  expect(deriveLiveStatus({ ...base, shift }).status).toBe('idle');
});
it('забытая смена (17 ч) — не работает', () => {
  const r = deriveLiveStatus({ ...base, shift: { startedAt: at('2026-10-13T14:00:00Z'), endedAt: null }, hasCurrentWork: true });
  expect(r.status).toBe('absent');
});
it('вышел в выходной — работает', () => {
  const r = deriveLiveStatus({ ...base, dayOff: true, hasCurrentWork: true, shift: { startedAt: at('2026-10-14T04:00:00Z'), endedAt: null } });
  expect(r.status).toBe('working');
});
it('смена закрыта сегодня → finished, since = endedAt', () => {
  const r = deriveLiveStatus({ ...base, dayOff: true, shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: at('2026-10-14T06:00:00Z') } });
  expect(r).toEqual({ status: 'finished', since: at('2026-10-14T06:00:00Z'), until: null });
});
it('без смены: выходной → day_off, иначе absent', () => {
  expect(deriveLiveStatus({ ...base, dayOff: true }).status).toBe('day_off');
  expect(deriveLiveStatus(base).status).toBe('absent');
});

it('isDayOffOn: еженедельный выходной и одобренный интервал включительно', () => {
  expect(isDayOffOn('2026-10-16', 5, [])).toBe(true);          // пятница
  expect(isDayOffOn('2026-10-14', 5, [])).toBe(false);
  expect(isDayOffOn('2026-10-14', null, [{ startDate: '2026-10-13', endDate: '2026-10-14' }])).toBe(true);
  expect(isDayOffOn('2026-10-15', null, [{ startDate: '2026-10-13', endDate: '2026-10-14' }])).toBe(false);
});
it('summarizeItems: группировка по виду в порядке появления, ×N только при N>1', () => {
  const s = summarizeItems([{ kind: 'window', quantity: 1, areaM2: 2.5 }, { kind: 'door', quantity: 1, areaM2: 3 }, { kind: 'window', quantity: 1, areaM2: 2.1 }], 'ru');
  expect(s).toEqual({ text: 'Окно ×2, Дверь', pieces: 3, areaM2: 7.6 });
  expect(summarizeItems([], 'ru')).toEqual({ text: '', pieces: 0, areaM2: 0 });
});
it('deltaPercent', () => {
  expect(deltaPercent(112, 100)).toBe(12);
  expect(deltaPercent(5, 0)).toBeNull();
});
it('filterPeople / sortPeople', () => {
  const people = [
    { fullName: 'Фёдорова Зарина', status: 'working' as const, place: 2 },
    { fullName: 'Азизова Нигора', status: 'idle' as const, place: 2 },
    { fullName: 'Каримова Гулнора', status: 'working' as const, place: 1 },
  ];
  expect(filterPeople(people, 'all', '')).toHaveLength(3);
  expect(filterPeople(people, 'working', '').map((p) => p.place)).toEqual([2, 1]);
  expect(filterPeople(people, 'all', 'федор').map((p) => p.fullName)).toEqual(['Фёдорова Зарина']);
  expect(sortPeople(people, 'place').map((p) => p.fullName)).toEqual(['Каримова Гулнора', 'Азизова Нигора', 'Фёдорова Зарина']);
  expect(sortPeople(people, 'name').map((p) => p.fullName)).toEqual(['Азизова Нигора', 'Каримова Гулнора', 'Фёдорова Зарина']);
});
```

Подписи вида — `ORDER_ITEM_KIND_LABELS[locale]` («Окно», «Дверь», …); тесты строк берут их оттуда же, если в словаре написано иначе.

- [ ] **Step 2: Run tests to verify they fail**
Run: `pnpm --filter @curtain-crm/shared test` — Expected: FAIL (модули не найдены).

- [ ] **Step 3: Implement** перечисления, константы и четыре модуля по интерфейсам выше; экспортировать из `src/index.ts` (блоки «Перечисления», «Константы», новый «Табло»). `areaM2` — сумма `areaM2 × quantity`, округление до 0,1. Поиск в `filterPeople`: `toLocaleLowerCase('ru')` и замена «ё» на «е» у обеих сторон.

- [ ] **Step 4: Run tests to verify they pass**
Run: `pnpm --filter @curtain-crm/shared test && pnpm --filter @curtain-crm/shared typecheck && pnpm --filter @curtain-crm/shared lint` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Monitor rules in shared: live status, day off, item summary"`

---

### Task 2: Фото для табло — превью и стабильные ссылки

**Files:**
- Modify: `packages/db/src/schema/users.schema.ts` (колонка `avatarPreviewKey: text('avatar_preview_key')` рядом с `avatarStorageKey`)
- Create: миграция `packages/db/migrations/00xx_*.sql` (через `pnpm db:generate`)
- Modify: `apps/api/package.json` (`sharp` в dependencies — версия из lockfile, `^0.35.4`; скрипт `"avatars:previews": "tsx src/scripts/avatar-previews.ts"`), `pnpm-lock.yaml`
- Create: `apps/api/src/services/avatarPreview.service.ts`, `apps/api/src/services/avatarPreview.service.test.ts`
- Modify: `apps/api/src/services/storage.service.ts` (опция `stableWithinHour`, метод `read`)
- Create: `apps/api/src/services/storage.service.test.ts`
- Modify: `apps/api/src/routers/users.router.ts:221-261` (`replaceAvatar`) и `removeAvatar`
- Modify: `apps/api/src/scripts/storage-gc.ts:60-73` (превью — тоже живые ключи)
- Create: `apps/api/src/scripts/avatar-previews.ts`
- Test: `apps/api/src/scripts/smoke.ts` (проверки фото)

**Interfaces:**
- Produces:
  - `GetUrlOptions.stableWithinHour?: boolean`. Disk: `expiresAt = (Math.floor(nowSec / 3600) + 2) * 3600`. S3: `getSignedUrl(..., { expiresIn: 7200, signingDate: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000) })`. В пределах часа адрес не меняется.
  - `StorageDriver.read(key: string): Promise<Buffer>` — нужен скрипту превью (disk: `readFile`, S3: `GetObjectCommand` → `transformToByteArray`).
  - `makeAvatarPreview(body: Buffer): Promise<Buffer | null>` — `sharp(body).rotate().resize({ width: AVATAR_PREVIEW_MAX_PX, height: AVATAR_PREVIEW_MAX_PX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })`; любая ошибка → `null`.
  - `users.avatarPreviewKey: string | null`; ключ превью — `buildStorageKey(['avatars', userId, 'preview'], 'image/webp')`.

- [ ] **Step 1: Write the failing tests**

```ts
// storage.service.test.ts
it('stableWithinHour: два вызова в пределах часа дают один адрес, подпись проходит', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T07:05:00Z'));
  const driver = new DiskStorageDriver({ rootPath: tmp, publicBaseUrl: 'http://x/files', signingSecret: 's'.repeat(32) });
  const a = await driver.getUrl('avatars/1/a.jpg', { stableWithinHour: true });
  vi.setSystemTime(new Date('2026-10-14T07:55:00Z'));
  const b = await driver.getUrl('avatars/1/a.jpg', { stableWithinHour: true });
  expect(a).toBe(b);
  const url = new URL(b);
  expect(verifyFileUrl({ key: 'avatars/1/a.jpg', expires: url.searchParams.get('expires'), signature: url.searchParams.get('sig'), secret: 's'.repeat(32) })).toBe(true);
});
// avatarPreview.service.test.ts
it('превью: не шире 640, webp', async () => {
  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2a7d5c' } }).png().toBuffer();
  const out = await makeAvatarPreview(png);
  const meta = await sharp(out!).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(640);
});
it('нечитаемый файл → null, без исключения', async () => {
  expect(await makeAvatarPreview(Buffer.from('not an image'))).toBeNull();
});
```

Параметры конструктора `DiskStorageDriver` и `verifyFileUrl` — сверить с `storage.service.ts:145-195` и подставить настоящие имена.

Смоук (`apps/api/src/scripts/smoke.ts`, сотрудник с префиксом `SMOKE`, вызов от директора):

```ts
await ceoCaller.users.setAvatar({ userId: worker.id, file: pixel });            // настоящий PNG 1×1
check('фото: превью создано', (await keysOf(worker.id)).avatarPreviewKey !== null);
await ceoCaller.users.setAvatar({ userId: worker.id, file: { mimeType: 'image/png', content: Buffer.from('not an image').toString('base64') } });
const broken = await keysOf(worker.id);
check('фото: битый файл сохранён без превью', broken.avatarStorageKey !== null && broken.avatarPreviewKey === null);
```

`keysOf` — выборка `avatarStorageKey`, `avatarPreviewKey` из `users`; `pixel` уже объявлен в смоуке (`smoke.ts:1253`) — поднять его объявление выше, к началу `run`.

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api test` — Expected: FAIL.
- [ ] **Step 3: Implement**: колонка + `pnpm db:generate`; `pnpm --filter @curtain-crm/api add sharp@^0.35.4`; опция и `read` в обоих драйверах; `makeAvatarPreview`. В `replaceAvatar`: после загрузки оригинала — превью; если `makeAvatarPreview` вернул буфер, загрузить его и записать `avatarPreviewKey` той же `update`, что и `avatarStorageKey`; при ошибке записи удалить оба загруженных файла; старое превью удалить после успешной записи. `removeAvatar` обнуляет оба ключа и удаляет оба файла. `storage-gc` считает живыми и `avatarPreviewKey`. Скрипт `avatar-previews.ts`: пользователи с `avatarStorageKey is not null and avatarPreviewKey is null` → `read` → превью → `upload` → `update`; печатает «сделано N, пропущено M».
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/api test && pnpm --filter @curtain-crm/api typecheck && pnpm --filter @curtain-crm/api lint && pnpm --filter @curtain-crm/api s3:check` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Avatar previews and hour-stable photo URLs for the board"`

---

### Task 3: Ссылки для ТВ — таблица, сервис, процедуры директора

**Files:**
- Create: `packages/db/src/schema/displayLinks.schema.ts`; Modify: `packages/db/src/schema/index.ts`; миграция через `pnpm db:generate`
- Create: `apps/api/src/services/displayLinks.service.ts`, `apps/api/src/services/displayLinks.service.test.ts`
- Create: `apps/api/src/routers/displayLinks.router.ts`; Modify: `apps/api/src/routers/index.ts`
- Modify: `apps/api/src/lib/constants.ts:141` (`AUDIT_ACTIONS` += `'display_link.created'`, `'display_link.revoked'`), `apps/web/src/app/audit/page.tsx:134` (подписи «Ссылка для ТВ создана», «Ссылка для ТВ отозвана»)

**Interfaces:**
- Produces:
  - Таблица `display_links`: `id serial pk`, `label text not null` (check 1–60 символов), `branch_id int null → branches restrict`, `show_workshop bool not null`, `show_installation bool not null` (check: хотя бы одно true), `locale text not null default 'ru'` (check `in ('ru','uz')`), `token_hash text not null unique`, `created_by int not null → users restrict`, `created_at timestamptz default now()`, `revoked_at timestamptz null`, `last_seen_at timestamptz null`. Экспорт `displayLinks`.
  - `generateDisplayToken(): { token: string; hash: string }` — 32 байта `randomBytes`, base64url; `hashDisplayToken(token: string): string` — sha256 hex.
  - `findActiveDisplayLink(executor: DbExecutor, token: string): Promise<DisplayLinkRow | null>` — по хешу, `revoked_at is null`; `DisplayLinkRow = typeof displayLinks.$inferSelect & { branchName: string | null }`.
  - `touchDisplayLinkSeen(executor, link: DisplayLinkRow, now: Date): Promise<void>` — пишет, только если `last_seen_at` пуст или старше 60 с.
  - Роутер `displayLinks` (`ceoProcedure`): `list()` → `{ id, label, branchId, branchName, showWorkshop, showInstallation, locale, createdAt, lastSeenAt, revokedAt }[]` (новые сверху); `create({ label, branchId?, showWorkshop, showInstallation, locale })` → `{ id, token }`; `revoke({ id })` → `{ ok: true }`. Обе мутации пишут аудит. Ошибка «Выберите хотя бы одно табло» при обоих false.

- [ ] **Step 1: Write the failing tests**

```ts
it('токен: 43 символа base64url, хеш — sha256 этого токена', () => {
  const { token, hash } = generateDisplayToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
  expect(hashDisplayToken(token)).toBe(hash);
});
it('два токена не совпадают', () => { expect(generateDisplayToken().token).not.toBe(generateDisplayToken().token); });
```

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api test` — FAIL.
- [ ] **Step 3: Implement** схему, миграцию, сервис, роутер; подключить `displayLinks: displayLinksRouter` в `appRouter`.
- [ ] **Step 4: Run** `pnpm db:migrate && pnpm --filter @curtain-crm/api test && pnpm typecheck && pnpm lint` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "TV display links: table, token service, director procedures"`

---

### Task 4: Снимок табло — `monitor.board`

**Files:**
- Create: `apps/api/src/services/periods.ts` (перенести `workshopPeriodStarts` и `workshopDay` из `apps/api/src/routers/reports.router.ts:70-105` без изменения поведения; `reports.router.ts` импортирует оттуда)
- Create: `apps/api/src/services/monitor.queries.ts` (SQL), `apps/api/src/services/monitor.service.ts` (сборка снимка, DTO)
- Create: `apps/api/src/routers/monitor.router.ts`; Modify: `apps/api/src/routers/index.ts`

**Interfaces:**
- Consumes: всё из задачи 1; `employeeRating` (`rating.service.ts:420`) для качества и «вовремя»; `getStorage().getUrl(key, { stableWithinHour: true })` из задачи 2.
- Produces (экспорт из `monitor.service.ts`, клиенты берут через `RouterOutputs['monitor']['board']`):

```ts
export interface MonitorWork {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly items: ItemsSummary;
  readonly deadline: string | null;      // YYYY-MM-DD
  readonly since: Date | null;           // вход в текущий статус (история), для очереди null
  readonly overdue: boolean;             // срок < сегодня по Ташкенту
  readonly rework: boolean;              // статус qc_failed
  readonly address: string | null;      // только установка; на ТВ вырезается
}
export interface MonitorPerson {
  readonly userId: number;
  readonly fullName: string;
  readonly photoUrl: string | null;      // превью, иначе оригинал
  readonly roles: readonly Role[];       // только роли группы
  readonly hiredAt: string | null;
  readonly sewerCategory: number | null; // ручная, иначе расчётная (`sewerCategory.service.ts`)
  readonly status: LiveStatus;
  readonly statusSince: Date | null;
  readonly statusUntil: Date | null;
  readonly current: readonly MonitorWork[];
  readonly queue: readonly MonitorWork[];   // первые MONITOR_QUEUE_PREVIEW
  readonly queueTotal: number;
  readonly cornicePool: number | null;      // только у карнизчика: pending карнизов филиала
  readonly counts: { readonly today: number; readonly week: number; readonly month: number };
  readonly place: number;                   // за текущий месяц, assignPlaces по counts.month
  readonly qualityPercent: number | null;
  readonly onTimePercent: number | null;
}
export interface MonitorTrip {
  readonly userId: number; readonly fullName: string;
  readonly startedAt: Date; readonly returnedAt: Date | null;
  readonly orderNumber: string | null; readonly address: string | null;
}
export interface MonitorBoard {
  readonly group: MonitorGroup;
  readonly unit: 'pieces' | 'orders';
  readonly generatedAt: Date;
  readonly people: readonly MonitorPerson[];        // по месту, затем имени
  readonly podium: { readonly month: string; readonly entries: readonly { userId: number; fullName: string; photoUrl: string | null; value: number }[] };
  readonly summary: {
    readonly monthTotal: number;
    readonly monthDeltaPercent: number | null;      // к прошлому месяцу на ту же дату
    readonly headcount: number;
    readonly onShift: number;                       // working + idle + break + trip
    readonly averagePerPerson: number;              // monthTotal / headcount, 0 при пустой группе
    readonly qualityPercent: number | null;         // цех
    readonly onTimePercent: number | null;          // установщики
  };
  readonly statusCounts: Readonly<Record<LiveStatus, number>>;
  readonly trips: readonly MonitorTrip[] | null;    // только installation: выезды сегодня
}
export function buildBoard(db: Database, params: { group: MonitorGroup; branchId: number | null; now: Date; locale: Locale }): Promise<MonitorBoard>;
```

- Процедура `monitor.board`: `orderDispatchProcedure`, вход `{ group: monitorGroupSchema, branchId: idSchema.optional() }`.

Запросы в `monitor.queries.ts` (по функции на каждый; все фильтруются по `branchId`, если он задан):
1. `loadGroupPeople` — активные пользователи с ролью группы; при филиале — через `user_branches`. Человек с двумя ролями группы — одна строка, `roles` — обе.
2. `loadPresence(userIds, now)` — последняя смена каждого (открытая моложе 16 ч или начатая сегодня по Ташкенту), её открытая отлучка и открытый выезд (с `order_id`).
3. `loadDayOffs(userIds, dayIso)` — одобренные `day_off_requests`, покрывающие день.
4. `loadWork(group, userIds)` — текущие: `sewing_in_progress`+`sewer_id`; `installation_in_progress`+`installer_id`; `cornice_status = in_progress`+`cornice_installer_id`. Очередь: швея — `pending_sewing_assignment` и `qc_failed` с её `sewer_id` (приоритет, срок, id); установщик — `installation_assigned` с его `installer_id` (срок, id). Позиции заказов — одним запросом по всем id. `since` — `max(created_at)` истории с `to_status` = текущему статусу. Пул карнизов — `count(*) where cornice_status = 'pending'`.
5. `loadOutput(group, userIds, starts)` — один запрос на роль с `count/sum … filter (where done.at >= …)` для сегодня, недели, месяца, прошлого месяца и прошлого месяца до той же даты; возвращает `Map<userId, { today, week, month, prevMonth, prevMonthToDate }>` (у установщика-карнизчика суммы складываются).
6. `loadTripsToday(userIds, dayStart)` — `installation_trips` смен этих людей, начатые сегодня, с номером и адресом заказа.

`activityOf` для `hasCurrentWork`: `current.length > 0 || openTrip !== null`. Выезд с заказом, которого нет в `current`, добавляется в начало `current`.

- [ ] **Step 1: Write the failing smoke checks** в `apps/api/src/scripts/smoke.ts` (новый раздел «Табло»; сотрудники и заказы с префиксом `SMOKE`, как в остальном файле): сид — швея A (смена открыта, заказ `sewing_in_progress` с двумя позициями `window`), швея B (смена закрыта сегодня), швея C (другой филиал), установщик-карнизчик D (обе роли; один `installation_done` и один `cornice_done_at` сегодня). Проверки через `createCallerFactory(appRouter)` с менеджером:

```ts
const board = await managerCaller.monitor.board({ group: MonitorGroup.WORKSHOP, branchId: branch.id });
check('табло: швея с заказом — working, заказ и состав', personA.status === LiveStatus.WORKING && personA.current[0]?.items.text === 'Окно ×2');
check('табло: закрытая смена — finished', personB.status === LiveStatus.FINISHED);
check('табло: швея другого филиала не видна', !board.people.some((p) => p.userId === sewerC.id));
const inst = await managerCaller.monitor.board({ group: MonitorGroup.INSTALLATION, branchId: branch.id });
check('табло: две роли — одна карточка, выработка сложена', inst.people.filter((p) => p.userId === d.id).length === 1 && personD.counts.today === 2);
await expectRejected('табло: швее закрыто', () => sewerCaller.monitor.board({ group: MonitorGroup.WORKSHOP }));
```

Очистка: новые таблицы и данные — в `cleanup()` (сначала `display_links` и `installation_trips` по пользователям `SMOKE`).

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api run smoke` — Expected: FAIL (`monitor` нет в роутере).
- [ ] **Step 3: Implement** `periods.ts`, `monitor.queries.ts`, `monitor.service.ts`, `monitor.router.ts`; подключить `monitor: monitorRouter`.
- [ ] **Step 4: Run** `pnpm --filter @curtain-crm/api run smoke && pnpm --filter @curtain-crm/api test && pnpm typecheck && pnpm lint` — Expected: все проверки смоука OK; время `buildBoard` на демо-данных — в логе, цель ≤ 150 мс.
- [ ] **Step 5: Commit** — `git commit -m "Monitor board snapshot: monitor.board for dispatchers"`

---

### Task 5: Карточка человека — `monitor.person`

**Files:**
- Modify: `apps/api/src/services/monitor.queries.ts`, `apps/api/src/services/monitor.service.ts`, `apps/api/src/routers/monitor.router.ts`
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Produces:

```ts
export interface MonitorPersonDetail extends MonitorPerson {
  readonly group: MonitorGroup;
  readonly unit: 'pieces' | 'orders';
  readonly queueAll: readonly MonitorWork[];
  readonly daily: readonly { readonly day: string; readonly value: number }[]; // 30 дней по Ташкенту, сегодня последним, пустые дни = 0
  readonly shiftToday: {
    readonly startedAt: Date; readonly endedAt: Date | null;
    readonly breaks: readonly { startedAt: Date; returnedAt: Date | null; plannedMinutes: number }[];
    readonly trips: readonly { startedAt: Date; returnedAt: Date | null; orderNumber: string | null }[];
  } | null;
  readonly photos: readonly { id: number; url: string; orderNumber: string; createdAt: Date }[]; // installation: 8 последних фото, загруженных им; workshop: []
}
export function buildPerson(db: Database, params: { userId: number; now: Date; locale: Locale }): Promise<MonitorPersonDetail>;
```

Группа человека — первая подходящая: есть `sewer` → `workshop`; есть `installer`/`cornice_installer` → `installation`; иначе `TRPCError NOT_FOUND` «Сотрудника нет на табло». Карточка (`MonitorPerson`) берётся из `buildBoard` его группы без фильтра филиала — одно правило на всё.

- [ ] **Step 1: Write the failing smoke checks**: `person({ userId: personA })` → `daily.length === 30`, последний день = `counts.today`; `shiftToday.startedAt` совпадает со сменой; `person({ userId: продавец })` → `NOT_FOUND`.
- [ ] **Step 2: Run** smoke — FAIL.
- [ ] **Step 3: Implement** `monitor.person` (`orderDispatchProcedure`, вход `{ userId: idSchema }`).
- [ ] **Step 4: Run** smoke, test, typecheck, lint — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Monitor person detail: monitor.person"`

---

### Task 6: Табло для ТВ — `display.board`

**Files:**
- Create: `apps/api/src/services/monitor.redact.ts`, `apps/api/src/services/monitor.redact.test.ts`
- Create: `apps/api/src/routers/display.router.ts`; Modify: `apps/api/src/routers/index.ts`
- Modify: `apps/api/src/index.ts:124-140` (ограничитель: префиксы `/trpc/auth.` **и** `/trpc/display.`)
- Test: `apps/api/src/scripts/smoke.ts`

**Interfaces:**
- Consumes: `buildBoard` (задача 4), `findActiveDisplayLink`, `touchDisplayLinkSeen` (задача 3).
- Produces:
  - `toDisplayBoard(board: MonitorBoard, link: { label: string; branchName: string | null; showWorkshop: boolean; showInstallation: boolean; locale: Locale }): DisplayBoard` — собирает **новый** объект из разрешённых полей: у `MonitorWork` — `orderNumber`, `items`, `deadline`, `since`, `overdue`, `rework`; у `MonitorTrip` — `fullName`, `startedAt`, `returnedAt`, `orderNumber`; у людей — всё, кроме этих вложенных. Плюс `link`.
  - `display.board({ token: z.string().min(20).max(100), group: monitorGroupSchema })` (`baseProcedure`): нет ссылки → `UNAUTHORIZED` «Ссылка недействительна»; группа выключена → `FORBIDDEN`; филиал — из ссылки.

- [ ] **Step 1: Write the failing tests**

```ts
it('на ТВ нет адресов, клиентов и id заказов', () => {
  const out = toDisplayBoard(boardWith({ address: 'ул. Аль-Хорезми, 12', clientName: 'Иванов' }), link);
  const json = JSON.stringify(out);
  expect(json).not.toContain('Аль-Хорезми');
  expect(json).not.toContain('Иванов');
  expect(json).not.toContain('"orderId"');
  expect(json).not.toContain('"address"');
});
```

`boardWith` — фабрика в тесте, собирающая `MonitorBoard` с одной карточкой и одним выездом; лишнее поле `clientName` подложено через приведение типа — проверка, что преобразование не копирует объекты целиком.

Смоук: директор создаёт ссылку (`displayLinks.create`, только цех) → `display.board({ token, group: workshop })` отдаёт людей; `group: installation` → `FORBIDDEN`; после `revoke` → `UNAUTHORIZED`.

- [ ] **Step 2: Run** `pnpm --filter @curtain-crm/api test` и smoke — FAIL.
- [ ] **Step 3: Implement** редакцию, роутер, ограничитель.
- [ ] **Step 4: Run** test, smoke, typecheck, lint — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Public TV board by secret link, redacted on the server"`

---

### Task 7: Демо-данные для табло

**Files:**
- Modify: `apps/api/src/scripts/demo.ts:690-780` (`advanceTo`) и блок смен (`:339-395`)

Падение `Сначала соберитесь на выезд` чинится отметкой листа сборов перед `INSTALLATION_IN_PROGRESS`: `loadPackList(tx, orderId)` → вставка `order_pack_checks` по каждому `key` от имени установщика. Дополнить: открытые сегодняшние смены у всех швей, установщиков и карнизчиков, кроме одного каждой группы; одна открытая отлучка на 30 мин; у установщиков с заказом `installation_in_progress` — открытый выезд с этим заказом; один еженедельный выходной на сегодняшний день недели; фото-аватары не создаются.

- [ ] **Step 1: Run** `pnpm --filter @curtain-crm/api run demo` на чистой базе (`pnpm db:migrate && pnpm db:seed`) — Expected: падение `Сначала соберитесь на выезд`.
- [ ] **Step 2: Implement** отметку сборов и живые данные.
- [ ] **Step 3: Run** demo заново — Expected: «готово», без ошибок; `monitor.board` через смоук-вызов или панель показывает все статусы: работает, без заказа, отлучка, выезд, выходной, нет отметки, смена закрыта.
- [ ] **Step 4: Commit** — `git commit -m "Demo data: pack checks before installation, live shifts for the board"`

---

### Task 8: Табло в панели

**Files:**
- Create: `apps/web/src/lib/publicRoutes.ts` — `isPublicPath(pathname: string): boolean` (`/`, `/login`, `/tv/…`); Modify: `apps/web/src/components/providers/AuthProvider.tsx:54-60` и `apps/web/src/components/layout/Shell.tsx:21,65` — использовать его вместо своих множеств
- Modify: `apps/web/src/components/layout/navigation.ts` — пункт `{ href: '/monitor', label: 'Табло', icon: MonitorPlay, roles: ORDER_DISPATCH_ROLES, children: [Цех /monitor/workshop, Установщики /monitor/installation] }` после «Заказы»
- Create: `apps/web/src/app/monitor/page.tsx` (redirect на `/monitor/workshop`, как `app/sewing/page.tsx`), `app/monitor/workshop/page.tsx`, `app/monitor/installation/page.tsx`
- Create: `apps/web/src/components/monitor/useMonitorBoard.ts`, `LiveIndicator.tsx`, `MonitorBoard.tsx` (тело страницы: шапка, фильтры, сетка, состояния), `PersonPhoto.tsx`, `PersonCard.tsx`, `Podium.tsx`, `SummaryPanel.tsx`, `StatusChips.tsx`, `TripsToday.tsx`

**Interfaces:**
- Consumes: `trpc.monitor.board`, `trpc.branches.list` (выбор филиала, если их > 1), `filterPeople`/`sortPeople`, `MONITOR_POLL_MS`, `MONITOR_STALE_AFTER_MS`, `LIVE_STATUS_LABELS`, `formatTenure`.
- Produces:
  - `useMonitorBoard(group: MonitorGroup, branchId: number | null)` → `{ board, isLoading, isError, refetch, lastSuccessAt: Date | null, stale: boolean }` (`refetchInterval: MONITOR_POLL_MS`, `refetchIntervalInBackground: false`, `placeholderData: keepPreviousData`).
  - `<MonitorBoard group />`; `<LiveIndicator lastSuccessAt stale />` — «онлайн · обновлено 12 с назад» / «нет связи · данные от 14:02».
  - `<PersonPhoto name photoUrl variant />`, `variant`: `'card' | 'podium' | 'tv' | 'drawer'` — фото (`object-fit: cover`, `object-position: 50% 30%`) или монограмма на штрихованной подложке с подписью «Фото не загружено». Используется и в задачах 9–10.
- Фильтр и сортировка — в адресе: `?status=<LiveStatus|all>&sort=<place|name>&q=`.

Вид — по макетам из спецификации: фото полосой 150 px с местом и статусом поверх; арки пьедестала с рамками золото/серебро/бронза и короной у первого; сводка справа; чипы со счётчиками. Цвета — токены Tailwind панели (`accent`, `positive`, `warning`, `danger`, `info`, `stage-installation` для выезда, `brass`), обе схемы. Подпись под именем: у швеи — категория («2 кат.»), у остальных — «Стаж …» (`formatTenure`). Пустой блок работы: «Без заказа», «Отлучка до 14:30», «Нет отметки», «Выходной», «Смена закрыта в 17:40». Просроченный срок — `danger`. У «Установщиков» справа `TripsToday`: «Выезды сегодня (N)» — время выезда, номер заказа, кто, адрес, «вернулся в …» или «на объекте». Скелетон по форме страницы; ошибка — `ErrorState` с «Повторить»; пустая группа — `EmptyState` «В цехе пока нет швей: дайте сотруднику роль „Швея“» (у установщиков — «…роль „Установщик“ или „Карнизчик“»).

- [ ] **Step 1: Implement** по интерфейсам.
- [ ] **Step 2: Verify**: `pnpm --filter @curtain-crm/web typecheck && pnpm --filter @curtain-crm/web lint && pnpm --filter @curtain-crm/web build`; API + панель + демо-данные; под директором, админом и менеджером открывается `/monitor/workshop`, у швеи пункта меню нет; `/tv/abc` без входа не уводит на `/login`; скриншоты Playwright `/monitor/workshop` и `/monitor/installation` на 1536×1024 (тёмная и светлая схема) и 390 px; на всех `document.documentElement.scrollWidth <= clientWidth`.
- [ ] **Step 3: Commit** — `git commit -m "Monitor board in the panel"`

---

### Task 9: Боковая панель человека

**Files:**
- Create: `apps/web/src/components/monitor/PersonDrawer.tsx`; Modify: `MonitorBoard.tsx` (открытие по клику и `?person=<id>`)

Содержимое: большое фото, имя, статус, начало смены; текущая работа со ссылкой «Открыть заказ» (`/orders/<id>`); столбики за 30 дней (`components/charts/Bars.tsx`); смена сегодня (отлучки, выезды); вся очередь; у установщиков — сетка фото. Без фото — кнопка «Загрузить фото» → `/employees?user=<id>` (сверить параметр открытия карточки с `app/employees/page.tsx`). Данные — `trpc.monitor.person`.

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify** typecheck, lint, скриншот открытой панели. - [ ] **Step 3: Commit** — `git commit -m "Monitor person drawer"`

---

### Task 10: ТВ-режим

**Files:**
- Create: `apps/web/src/components/monitor/TvBoard.tsx` — раскладка ТВ (по макету: шапка с логотипом, табло, филиалом, часами и индикатором; пьедестал; сетка без прокрутки; страницы по `TV_PAGE_MS`, если людей больше, чем помещается)
- Create: `apps/web/src/components/monitor/useTvRuntime.ts` — Wake Lock (если `navigator.wakeLock` есть), скрытие курсора через 3 с, `location.reload()` через `TV_RELOAD_MS`
- Create: `apps/web/src/app/tv/[token]/page.tsx` — `trpc.display.board`, ротация групп ссылки по `TV_ROTATE_MS` с полосой таймера, экран «Ссылка недействительна, попросите новую у руководителя» на `UNAUTHORIZED`; язык подписей — `link.locale`
- Create: `apps/web/src/app/monitor/tv/page.tsx` — то же для вошедшего руководителя по `trpc.monitor.board`, `?group=`; кнопка «На весь экран» в `MonitorBoard` ведёт сюда и вызывает `requestFullscreen()`

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify**: скриншоты 1920×1080 и 1366×768 — все карточки видны, прокрутки нет; отозванная ссылка показывает экран ошибки; при остановленном API через 60 с плашка «нет связи», данные на месте. - [ ] **Step 3: Commit** — `git commit -m "TV mode: public board by link and fullscreen for managers"`

---

### Task 11: Ссылки для ТВ в настройках

**Files:**
- Create: `apps/web/src/components/settings/DisplayLinksManager.tsx`; Modify: `apps/web/src/app/settings/page.tsx` (блок «Табло на ТВ», только директору — `ROLE_MANAGER_ROLES`)

Список (название, филиал, табло, язык, «был на связи 5 мин назад» / «ещё не открывали», «отозвана»), кнопка «Создать ссылку» → модалка (`Modal`, `Field`, `Input`, `Select`, чекбоксы «Цех», «Установщики», язык) → после создания показ адреса `${location.origin}/tv/<token>`, кнопка «Скопировать» и QR (`lib/qrImage.ts`) с пометкой «Адрес показывается один раз»; «Отозвать» с подтверждением.

- [ ] **Step 1: Implement**. - [ ] **Step 2: Verify** typecheck, lint; создать ссылку, открыть её в другом браузерном контексте без входа — табло открывается; отозвать — экран «Ссылка недействительна». - [ ] **Step 3: Commit** — `git commit -m "Settings: TV display links for the director"`

---

### Task 12: Документация и финальная проверка

**Files:**
- Modify: `docs/BUSINESS_LOGIC.md` (раздел «Табло»: статусы и их приоритет, что считается выработкой, топ-5 по объёму, ТВ-ссылки), `docs/API.md` (`monitor.*`, `displayLinks.*`, `display.board`), `docs/ARCHITECTURE.md` (уровень доступа `orderDispatchProcedure`; публичная процедура по токену; превью фото), `docs/superpowers/specs/2026-10-14-monitor-board-design.md` (выпуск 1: полоса плана не показывается вовсе)

- [ ] **Step 1: Write docs.**
- [ ] **Step 2: Full verification**: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @curtain-crm/web build && pnpm --filter @curtain-crm/api run smoke && pnpm --filter @curtain-crm/api s3:check`; агенты проекта `security-auditor` и `code-quality-auditor` по ветке; найденное — исправить.
- [ ] **Step 3: Commit and push** — `git commit -m "Docs: monitor board release 1"`, `git push -u origin claude/keen-hamilton-1lz8tt`.

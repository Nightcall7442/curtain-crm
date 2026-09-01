import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Конфигурация приложения и константы, не относящиеся к домену.
 *
 * Доменные перечисления (роли, статусы, стадии) здесь НЕ дублируются —
 * они импортируются из `@curtain-crm/shared`.
 */

/* -------------------------------------------------------------------------- */
/*                             Переменные окружения                           */
/* -------------------------------------------------------------------------- */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязательна'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),

  /**
   * Секрет подписи JWT. Минимум 32 символа: с более коротким ключом HS256
   * теряет заявленную стойкость, а тихо принять слабый секрет хуже,
   * чем не запуститься.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET должен быть не короче 32 символов'),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * Стоит ли API за обратным прокси.
   *
   * Влияет на то, чей адрес считается адресом клиента при ограничении
   * обращений. По умолчанию `false`: заголовок `X-Forwarded-For` подделывается
   * одной строкой, и доверять ему при прямом подключении означало бы отдать
   * обход ограничителя любому желающему. Включать только тогда, когда перед
   * API действительно стоит прокси, который этот заголовок перезаписывает.
   */
  TRUST_PROXY_HEADERS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  STORAGE_DISK_PATH: z.string().default('./storage'),
  STORAGE_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000/files'),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().max(100).default(15),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

/**
 * Читает и валидирует переменные окружения.
 *
 * Функция, а не константа верхнего уровня: иначе любой импорт этого модуля
 * (в том числе из юнит-теста чистой функции) требовал бы полного окружения.
 * Результат кешируется — разбор происходит один раз за процесс.
 */
export function getEnv(): AppEnv {
  if (cachedEnv !== null) return cachedEnv;

  loadDotenv({ path: ['.env', '../../.env'] });

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }

  // S3-драйвер без реквизитов молча деградировал бы до неработающих загрузок,
  // поэтому проверяем зависимость между переменными явно.
  if (parsed.data.STORAGE_DRIVER === 's3') {
    const missing = (
      ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
    ).filter((key) => parsed.data[key] === undefined);

    if (missing.length > 0) {
      throw new Error(`STORAGE_DRIVER=s3 требует переменные: ${missing.join(', ')}`);
    }
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/** Сброс кеша конфигурации. Нужен только тестам. */
export function resetEnvCache(): void {
  cachedEnv = null;
}

/* -------------------------------------------------------------------------- */
/*                            Действия для аудита                             */
/* -------------------------------------------------------------------------- */

/**
 * Коды действий, попадающих в `audit_log`.
 *
 * В БД колонка текстовая (чтобы новый сценарий не требовал миграции энума),
 * но записывать произвольную строку нельзя: `audit.service.ts` принимает
 * только значения отсюда.
 */
export const AUDIT_ACTIONS = [
  'user.created',
  'user.updated',
  'user.deactivated',
  'user.activated',
  'user.password_reset',
  'user.role_granted',
  'user.role_revoked',
  'user.branches_changed',

  'branch.created',
  'branch.updated',

  'shift.adjusted',
  'shift.deleted',

  'order.created',
  'order.updated',
  'order.status_changed',
  'order.cancelled',
  'order.assignee_changed',
  'order.price_changed',

  'purchase_item.created',
  'purchase_item.price_changed',
  'purchase_item.deactivated',
  'purchase_item.activated',

  'payroll.scheme_changed',
  'payroll.calculated',
  'payroll.approved',
  'payroll.paid',

  'catalog.item_created',
  'catalog.item_updated',
  'catalog.item_deactivated',
  'task.created',
  'task.completed',
  'task.cancelled',

  'dayoff.requested',
  'dayoff.approved',
  'dayoff.rejected',
  'dayoff.cancelled',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditActionSchema = z.enum(AUDIT_ACTIONS);

/* -------------------------------------------------------------------------- */
/*                            Прочие ограничения                              */
/* -------------------------------------------------------------------------- */

/* ------------------------------ Попытки входа ----------------------------- */

/**
 * Порог блокировки входа: столько неудач подряд по одному номеру закрывают
 * вход. Пять — компромисс: опечатку в пароле сотрудник исправляет с первой-
 * второй попытки, а перебору пяти вариантов из миллионов проку нет.
 */
export const LOGIN_MAX_FAILURES = 5;

/** Окно, в котором неудачи считаются подряд идущими. */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;

/** На сколько закрывается вход после исчерпания попыток. */
export const LOGIN_BLOCK_MS = 15 * 60_000;

/**
 * Потолок обращений к `auth.*` с одного адреса за минуту.
 *
 * Считается не по пользователям, а по адресу, поэтому запас взят с расчётом
 * на офис за общим NAT: два десятка сотрудников с открытой панелью дают
 * порядка полусотни запросов `auth.me` в минуту. Подбору пароля этот потолок
 * не мешает (его закрывает `LOGIN_MAX_FAILURES`) — он держит процессор,
 * которому каждая проверка пароля стоит около 100 мс.
 */
export const AUTH_IP_REQUESTS_PER_MINUTE = 120;

/** Сколько ключей ограничитель держит в памяти, прежде чем убрать истёкшие. */
export const LOGIN_THROTTLE_MAX_TRACKED = 10_000;

/** Пагинация: значения по умолчанию и потолок, общий для всех списков. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Допустимые MIME-типы загружаемых фотографий. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

/** Допустимые MIME-типы голосовых комментариев. */
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
] as const;

/**
 * Срок жизни подписанной ссылки на файл, секунды.
 *
 * Час — компромисс между «ссылка не должна жить вечно» и «открытая карточка
 * заказа не должна ломаться, пока её читают». Ссылка выдаётся заново на каждый
 * запрос, поэтому перезагрузка страницы чинит истёкшую.
 */
export const FILE_URL_TTL_SECONDS = 3600;

/** Максимальная длительность голосового комментария, секунды. */
export const MAX_VOICE_DURATION_SECONDS = 300;

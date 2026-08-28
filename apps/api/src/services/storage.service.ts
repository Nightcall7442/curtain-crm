import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, sep } from 'node:path';

import { TRPCError } from '@trpc/server';

import { FILE_URL_TTL_SECONDS, getEnv } from '../lib/constants';

/**
 * Файловое хранилище.
 *
 * Абстракция намеренно узкая — `upload` / `getUrl` / `delete` / `exists`:
 * ровно то, что нужно фотографиям заказов, голосовым комментариям и аватарам.
 * В БД хранится только ключ объекта; публичный URL получают через `getUrl()`,
 * потому что в S3 он подписанный и живёт минуты.
 *
 * Реализации:
 *  - `DiskStorageDriver` — рабочая, для локальной разработки;
 *  - `S3StorageDriver` — заглушка, которая ЯВНО падает с понятной ошибкой.
 *    Молчаливая заглушка здесь опаснее отсутствия: фото «загружались» бы,
 *    а файлов не было бы.
 */

export interface UploadInput {
  /** Ключ объекта, например `orders/123/qc/uuid.jpg`. Строится `buildStorageKey()`. */
  readonly key: string;
  readonly body: Uint8Array;
  readonly mimeType: string;
}

export interface StoredObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface GetUrlOptions {
  /** Срок жизни ссылки, секунды. Игнорируется disk-драйвером. */
  readonly expiresInSeconds?: number;
}

export interface StorageDriver {
  upload(input: UploadInput): Promise<StoredObject>;
  getUrl(key: string, options?: GetUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/* -------------------------------------------------------------------------- */
/*                                  Ключи                                     */
/* -------------------------------------------------------------------------- */

/** Ключ: только латиница, цифры, `-`, `_`, `.` и `/` как разделитель. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,255}$/;

/**
 * Проверяет ключ объекта.
 *
 * Ключ приходит из данных БД и из аргументов процедур, а disk-драйвер
 * превращает его в путь на файловой системе. Без этой проверки ключ
 * `../../etc/passwd` вышел бы за пределы каталога хранилища.
 */
export function assertValidStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Некорректный ключ файла в хранилище',
    });
  }
}

/**
 * Строит ключ объекта: `<префикс>/<uuid>.<расширение>`.
 * UUID исключает коллизии и не раскрывает исходное имя файла.
 */
export function buildStorageKey(prefixParts: readonly string[], mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType] ?? 'bin';
  const prefix = prefixParts
    .map((part) => part.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
    .filter((part) => part.length > 0)
    .join('/');

  const key = `${prefix}/${randomUUID()}.${extension}`;
  assertValidStorageKey(key);
  return key;
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
};

/* -------------------------------------------------------------------------- */
/*                             Подпись ссылок                                 */
/* -------------------------------------------------------------------------- */

/**
 * Подпись ссылки на файл disk-драйвера.
 *
 * Раздача `/files/*` шла без всякой проверки: угадать ключ мешал только
 * `randomUUID()`, но ключ попадает в историю браузера, в логи прокси и
 * в пересланную ссылку — и после этого фотография объекта клиента доступна
 * кому угодно навсегда. Подпись со сроком превращает «навсегда» в «час».
 *
 * Схема как у S3: сам файл отдаётся обычным GET — иначе `<img src>` и
 * `<audio src>` не работают, заголовок Authorization они не шлют, — но
 * в адресе есть срок и HMAC от пары «ключ + срок».
 *
 * Префикс `files:` разделяет назначения: тем же секретом подписываются
 * access-токены, и без разделителя подпись одного механизма теоретически
 * могла бы подойти другому.
 */
const fileSignature = (key: string, expiresAt: number, secret: string): string =>
  createHmac('sha256', secret).update(`files:${key}:${expiresAt.toString()}`).digest('hex');

/** Имена параметров в подписанном адресе. */
export const FILE_EXPIRES_PARAM = 'expires';
export const FILE_SIGNATURE_PARAM = 'sig';

/**
 * Проверяет подпись и срок.
 *
 * Сравнение подписей — `timingSafeEqual`: обычное `===` сравнивает строки
 * посимвольно и по времени ответа выдаёт, сколько символов уже совпало.
 */
export function verifyFileUrl(params: {
  readonly key: string;
  readonly expires: string | null;
  readonly signature: string | null;
  readonly secret: string;
  readonly nowSeconds?: number;
}): boolean {
  const { key, expires, signature, secret } = params;
  if (expires === null || signature === null) return false;

  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isSafeInteger(expiresAt)) return false;

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (expiresAt < now) return false;

  const expected = Buffer.from(fileSignature(key, expiresAt, secret), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.byteLength !== received.byteLength) return false;

  return timingSafeEqual(expected, received);
}

/* -------------------------------------------------------------------------- */
/*                            Локальный диск                                  */
/* -------------------------------------------------------------------------- */

export class DiskStorageDriver implements StorageDriver {
  constructor(
    private readonly rootPath: string,
    private readonly publicBaseUrl: string,
    /** Секрет подписи ссылок. Тот же, что у токенов, но с другим префиксом. */
    private readonly signingSecret: string,
  ) {}

  private resolvePath(key: string): string {
    assertValidStorageKey(key);

    const absoluteRoot = normalize(this.rootPath);
    const absolutePath = normalize(join(absoluteRoot, key));

    // Вторая линия защиты после `assertValidStorageKey`: сравниваем итоговый
    // путь с корнем уже после нормализации.
    if (!absolutePath.startsWith(absoluteRoot.endsWith(sep) ? absoluteRoot : absoluteRoot + sep)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Некорректный ключ файла в хранилище' });
    }

    return absolutePath;
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    const path = this.resolvePath(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);

    return {
      key: input.key,
      sizeBytes: input.body.byteLength,
      mimeType: input.mimeType,
    };
  }

  getUrl(key: string, options?: GetUrlOptions): Promise<string> {
    assertValidStorageKey(key);

    const ttl = options?.expiresInSeconds ?? FILE_URL_TTL_SECONDS;
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const signature = fileSignature(key, expiresAt, this.signingSecret);

    const base = `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    return Promise.resolve(
      `${base}?${FILE_EXPIRES_PARAM}=${expiresAt.toString()}&${FILE_SIGNATURE_PARAM}=${signature}`,
    );
  }

  async delete(key: string): Promise<void> {
    // `force: true` — удаление уже отсутствующего файла не ошибка:
    // сценарий «запись в БД удалили, файл почистили раньше» штатный.
    await rm(this.resolvePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const stats = await stat(this.resolvePath(key));
      return stats.isFile();
    } catch {
      return false;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   S3                                       */
/* -------------------------------------------------------------------------- */

/**
 * S3-совместимое хранилище.
 *
 * Работает и с AWS S3, и с совместимыми сервисами (MinIO, Yandex Object
 * Storage, Cloudflare R2) — им нужен только `S3_ENDPOINT`.
 *
 * `forcePathStyle` включён всегда: адрес вида `endpoint/bucket/key` понимают
 * все совместимые сервисы, а virtual-host (`bucket.endpoint/key`) требует
 * поддержки поддоменов и wildcard-сертификата, чего у локального MinIO нет.
 * У самого AWS путевой стиль тоже работает.
 *
 * Ссылки подписываются самим S3 и живут ограниченное время — та же схема,
 * что и у disk-драйвера, только подпись считает SDK, а проверяет её хранилище.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      readonly endpoint?: string | undefined;
      readonly region: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    },
  ) {
    this.client = new S3Client({
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    });
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    assertValidStorageKey(input.key);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.mimeType,
      }),
    );

    return { key: input.key, sizeBytes: input.body.byteLength, mimeType: input.mimeType };
  }

  async getUrl(key: string, options?: GetUrlOptions): Promise<string> {
    assertValidStorageKey(key);

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: options?.expiresInSeconds ?? FILE_URL_TTL_SECONDS },
    );
  }

  async delete(key: string): Promise<void> {
    assertValidStorageKey(key);
    // S3 не считает ошибкой удаление отсутствующего объекта — как и
    // disk-драйвер с `force: true`. Сценарий «строку удалили, файл почистили
    // раньше» штатный.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    assertValidStorageKey(key);

    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      // Отсутствие объекта — это ответ, а не сбой. Всё остальное (нет доступа,
      // хранилище недоступно) пробрасываем: молча вернуть `false` значило бы
      // выдать недоступность за отсутствие файла.
      if (error instanceof NotFound) return false;
      if (
        error instanceof S3ServiceException &&
        (error.$metadata.httpStatusCode === 404 || error.name === 'NoSuchKey')
      ) {
        return false;
      }
      throw error;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                          Обход содержимого диска                           */
/* -------------------------------------------------------------------------- */

/** Один объект в хранилище: ключ и время последней записи. */
export interface StoredKey {
  readonly key: string;
  readonly modifiedAt: Date;
}

/**
 * Перечисляет всё, что лежит в каталоге disk-драйвера.
 *
 * Функция отдельная, а не метод `StorageDriver`: перечисление нужно ровно
 * одному сценарию — уборке осиротевших файлов, — и в интерфейсе оно обязывало
 * бы S3-драйвер реализовать листинг бакета, который для этого сценария там
 * не нужен (у S3 есть собственные правила жизненного цикла объектов).
 *
 * Возвращает ключи в том же виде, в каком они лежат в БД: с прямыми слэшами
 * независимо от платформы.
 */
export async function listDiskStorageKeys(rootPath: string): Promise<StoredKey[]> {
  const root = normalize(rootPath);
  const found: StoredKey[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const full = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;

      const stats = await stat(full).catch(() => null);
      if (stats === null) continue;

      found.push({
        key: relative(root, full).split(sep).join('/'),
        modifiedAt: stats.mtime,
      });
    }
  };

  await walk(root);
  return found;
}
/* -------------------------------------------------------------------------- */
/*                          Приём файла из запроса                            */
/* -------------------------------------------------------------------------- */

export interface DecodeBase64Options {
  readonly allowedMimeTypes: readonly string[];
  readonly maxBytes: number;
}

/**
 * Декодирует файл, пришедший в теле tRPC-запроса.
 *
 * tRPC работает поверх JSON, поэтому бинарные данные передаются в base64.
 * Проверки идут именно здесь, до записи в хранилище:
 *  - тип файла из белого списка (иначе через «фото» можно залить что угодно);
 *  - размер после декодирования, а не длина строки — base64 раздувает данные
 *    примерно на треть, и проверка по строке пропустила бы файлы больше лимита;
 *  - непустой результат: строка, не являющаяся base64, декодируется молча,
 *    и без этой проверки в хранилище попал бы файл нулевой длины.
 */
export function decodeBase64Payload(
  file: { readonly mimeType: string; readonly content: string },
  options: DecodeBase64Options,
): Uint8Array {
  if (!options.allowedMimeTypes.includes(file.mimeType)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Формат «${file.mimeType}» не поддерживается. Допустимо: ${options.allowedMimeTypes.join(', ')}`,
    });
  }

  // Мобильные клиенты часто присылают data-URL целиком.
  const base64 = file.content.replace(/^data:[^;]+;base64,/, '');
  const body = Buffer.from(base64, 'base64');

  if (body.byteLength === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Файл пуст или повреждён' });
  }

  if (body.byteLength > options.maxBytes) {
    const limitMb = Math.round(options.maxBytes / (1024 * 1024));
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: `Файл больше ${limitMb.toString()} МБ`,
    });
  }

  return body;
}

/* -------------------------------------------------------------------------- */

let cachedDriver: StorageDriver | null = null;

/** Драйвер хранилища, выбранный переменной `STORAGE_DRIVER`. */
export function getStorage(): StorageDriver {
  if (cachedDriver !== null) return cachedDriver;

  const env = getEnv();

  if (env.STORAGE_DRIVER === 's3') {
    // Наличие всех пяти переменных уже проверено в `getEnv()` — если бы
    // хоть одной не было, процесс не стартовал бы. Здесь остаётся только
    // убедить в этом компилятор: в схеме они `optional`, потому что при
    // disk-драйвере их и не должно быть.
    const bucket = env.S3_BUCKET;
    const region = env.S3_REGION;
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;

    if (
      bucket === undefined ||
      region === undefined ||
      accessKeyId === undefined ||
      secretAccessKey === undefined
    ) {
      throw new Error('STORAGE_DRIVER=s3 требует S3_BUCKET, S3_REGION и ключи доступа');
    }

    cachedDriver = new S3StorageDriver(bucket, {
      region,
      accessKeyId,
      secretAccessKey,
      endpoint: env.S3_ENDPOINT,
    });

    return cachedDriver;
  }

  cachedDriver = new DiskStorageDriver(
    env.STORAGE_DISK_PATH,
    env.STORAGE_PUBLIC_BASE_URL,
    env.JWT_SECRET,
  );

  return cachedDriver;
}

/** Подмена драйвера. Нужна только тестам. */
export function setStorage(driver: StorageDriver | null): void {
  cachedDriver = driver;
}

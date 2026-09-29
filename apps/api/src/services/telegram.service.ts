import { createHmac, timingSafeEqual } from 'node:crypto';

import { users, type DbExecutor } from '@curtain-crm/db';
import { eq } from 'drizzle-orm';

import { getEnv } from '../lib/constants';

/**
 * Доставка уведомлений в Telegram.
 *
 * От прежнего бота мастерской (`curtain-bot`) взят ровно один предмет —
 * токен. Его код сюда не переносится: там своя база SQLite со своими
 * заказами, сменами и списками сотрудников в переменных окружения, то есть
 * вторая система рядом с этой. Владелец выбрал уведомления, а не второй
 * ввод, — а для уведомлений весь нужный код это два запроса к Bot API.
 *
 * Уведомления не заводятся заново: их уже создаёт `notifications.service`
 * в свою таблицу, и здесь та же запись просто дублируется в Telegram тем,
 * кто привязал аккаунт. Один источник событий, две доставки.
 *
 * Если токен не задан, модуль молчит целиком: ни опроса, ни отправки, ни
 * единой ошибки в журнале. Система обязана работать без Telegram — он
 * дополнение к приложению, а не его условие.
 */

const API_ROOT = 'https://api.telegram.org';

/** Токен бота или `null`, если Telegram не подключён. */
function botToken(): string | null {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  return token === undefined || token === '' ? null : token;
}

export function isTelegramEnabled(): boolean {
  return botToken() !== null;
}

async function callBotApi<T>(method: string, payload: unknown): Promise<T | null> {
  const token = botToken();
  if (token === null) return null;

  try {
    const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      // Файлы уходят формой: заголовок multipart с границей fetch ставит сам.
      ...(payload instanceof FormData
        ? { body: payload }
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
    });

    const body = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!body.ok) {
      process.stderr.write(`Telegram ${method}: ${body.description ?? 'отказ без описания'}\n`);
      return null;
    }

    return body.result ?? null;
  } catch (error) {
    /*
      Сеть до Telegram — не наша ответственность и не повод ронять действие,
      внутри которого мы оказались. Уведомление в системе уже создано и
      видно в приложении; недоставленное сообщение в мессенджер — потеря
      меньшая, чем незакрытый заказ из-за упавшей транзакции.
    */
    process.stderr.write(`Telegram ${method}: ${String(error)}\n`);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                             Привязка аккаунта                              */
/* -------------------------------------------------------------------------- */

/**
 * Код привязки — подписанный, а не сохранённый.
 *
 * Отдельная таблица одноразовых кодов здесь не нужна: код живёт минуты и
 * проверяется вычислением. Формат `<id>.<до какой минуты>.<подпись>` — он
 * должен уместиться в 64 символа полезной нагрузки диплинка Telegram, а
 * JWT туда не влезает вовсе.
 */
const LINK_CODE_TTL_MINUTES = 30;

function signLinkCode(userId: number, expiresAtMinute: number): string {
  return createHmac('sha256', getEnv().JWT_SECRET)
    .update(`telegram-link:${userId.toString()}:${expiresAtMinute.toString()}`)
    .digest('base64url')
    .slice(0, 16);
}

export function createLinkCode(userId: number): string {
  const expiresAtMinute = Math.floor(Date.now() / 60_000) + LINK_CODE_TTL_MINUTES;
  return `${userId.toString()}.${expiresAtMinute.toString()}.${signLinkCode(userId, expiresAtMinute)}`;
}

/** Проверяет код и возвращает id сотрудника. `null` — код чужой или истёк. */
export function verifyLinkCode(code: string): number | null {
  const [rawId, rawExpiry, signature] = code.split('.');
  if (rawId === undefined || rawExpiry === undefined || signature === undefined) return null;

  const userId = Number.parseInt(rawId, 10);
  const expiresAtMinute = Number.parseInt(rawExpiry, 10);
  if (!Number.isInteger(userId) || !Number.isInteger(expiresAtMinute)) return null;

  if (Math.floor(Date.now() / 60_000) > expiresAtMinute) return null;

  const expected = Buffer.from(signLinkCode(userId, expiresAtMinute));
  const received = Buffer.from(signature);
  // Сравнение постоянного времени: иначе по скорости отказа подпись
  // подбирается посимвольно.
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  return userId;
}

/** Имя бота для диплинка `https://t.me/<имя>?start=<код>`. */
let cachedBotUsername: string | null = null;

export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== null) return cachedBotUsername;

  const me = await callBotApi<{ username?: string }>('getMe', {});
  cachedBotUsername = me?.username ?? null;
  return cachedBotUsername;
}

/* -------------------------------------------------------------------------- */
/*                                 Отправка                                   */
/* -------------------------------------------------------------------------- */

/** Экранирование для `parse_mode: HTML` — в тексте бывают имена клиентов. */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Заголовок жирным и текст под ним — вид всех сообщений бота. */
const formatHtml = (title: string, body: string): string =>
  `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`;

export async function sendTelegramMessage(
  chatId: number,
  title: string,
  body: string,
): Promise<void> {
  await callBotApi('sendMessage', {
    chat_id: chatId,
    text: formatHtml(title, body),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Чат группы для ленты действий или `null`, если группа не настроена. */
function groupChatId(): string | null {
  const id = getEnv().TELEGRAM_GROUP_CHAT_ID;
  return id === undefined || id === '' ? null : id;
}

export function isTelegramGroupEnabled(): boolean {
  return botToken() !== null && groupChatId() !== null;
}

/**
 * Сообщение в группу мастерской — лента действий.
 *
 * Пишется всем сразу и никому лично: группа для того и заведена, чтобы
 * владелец и админы видели происходящее, не открывая журнал. Текст уже
 * собран вызывающим; экранирование — здесь, чтобы имя клиента с «<» не
 * ломало разметку.
 */
export async function sendTelegramGroupMessage(title: string, body: string): Promise<void> {
  const chatId = groupChatId();
  if (chatId === null) return;

  await callBotApi('sendMessage', {
    chat_id: chatId,
    text: formatHtml(title, body),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    disable_notification: true,
  });
}

/** Фото для группы — самим файлом, а не ссылкой. */
export interface TelegramPhoto {
  readonly body: Uint8Array;
  readonly mimeType: string;
}

/** Больше этого Telegram не принимает файл как фото. */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Столько фото помещается в один альбом. */
const ALBUM_MAX_PHOTOS = 10;
/** Форматы, которые Telegram показывает как фото; HEIC с айфона — нет. */
const TELEGRAM_PHOTO_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

const FILE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function attachFile(form: FormData, field: string, photo: TelegramPhoto): void {
  const extension = FILE_EXTENSIONS[photo.mimeType] ?? 'bin';
  form.set(field, new Blob([photo.body], { type: photo.mimeType }), `${field}.${extension}`);
}

function groupForm(chatId: string, fields: Readonly<Record<string, string>>): FormData {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('disable_notification', 'true');
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

async function sendAsDocument(chatId: string, caption: string, photo: TelegramPhoto): Promise<void> {
  const form = groupForm(chatId, { caption, parse_mode: 'HTML' });
  attachFile(form, 'document', photo);
  await callBotApi('sendDocument', form);
}

/** Одно фото или альбом до десяти; `null` — Telegram не принял. */
async function sendAlbum(
  chatId: string,
  caption: string,
  photos: readonly TelegramPhoto[],
): Promise<unknown> {
  const [single] = photos;
  if (photos.length === 1 && single !== undefined) {
    const form = groupForm(chatId, { caption, parse_mode: 'HTML' });
    attachFile(form, 'photo', single);
    return callBotApi('sendPhoto', form);
  }

  const form = groupForm(chatId, {
    media: JSON.stringify(
      photos.map((_, index) => ({
        type: 'photo',
        media: `attach://photo${index.toString()}`,
        // Подпись альбома — подпись его первого фото.
        ...(index === 0 ? { caption, parse_mode: 'HTML' } : {}),
      })),
    ),
  });
  photos.forEach((photo, index) => {
    attachFile(form, `photo${index.toString()}`, photo);
  });
  return callBotApi('sendMediaGroup', form);
}

/**
 * Фото в группу мастерской — альбомами по десять, с подписью.
 *
 * Файлы отправляются самими байтами, а не ссылкой из хранилища: ссылку на
 * диск сервера Telegram может и не достать, а подписанная ссылка S3
 * протухает. Что Telegram не примет как фото (HEIC, больше 10 МБ, или
 * альбом отклонён целиком — например, из-за размеров кадра), уходит
 * документами: фото должно дойти, пусть и без превью.
 */
export async function sendTelegramGroupPhotos(
  title: string,
  body: string,
  photos: readonly TelegramPhoto[],
): Promise<void> {
  const chatId = groupChatId();
  if (chatId === null) return;

  const caption = formatHtml(title, body);
  const isPhoto = (photo: TelegramPhoto): boolean =>
    TELEGRAM_PHOTO_MIME_TYPES.has(photo.mimeType) && photo.body.byteLength <= PHOTO_MAX_BYTES;

  const documents = photos.filter((photo) => !isPhoto(photo));
  const albumPhotos = photos.filter(isPhoto);

  for (let start = 0; start < albumPhotos.length; start += ALBUM_MAX_PHOTOS) {
    const chunk = albumPhotos.slice(start, start + ALBUM_MAX_PHOTOS);
    const sent = await sendAlbum(chatId, caption, chunk);
    if (sent === null) documents.push(...chunk);
  }

  for (const photo of documents) await sendAsDocument(chatId, caption, photo);
}

/* -------------------------------------------------------------------------- */
/*                           Приём сообщений боту                             */
/* -------------------------------------------------------------------------- */

interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: {
    readonly text?: string;
    readonly chat: { readonly id: number; readonly type?: string; readonly title?: string };
  };
}

/**
 * Обрабатывает одно сообщение боту.
 *
 * Бот понимает ровно одну команду — `/start <код>`, которой сотрудник
 * привязывает свой Telegram. Всё остальное получает подсказку: делать в
 * этом боте больше нечего, работа идёт в приложении.
 */
async function handleUpdate(executor: DbExecutor, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (message?.text === undefined) return;

  const chatId = message.chat.id;
  const [command, argument] = message.text.trim().split(/\s+/, 2);

  /*
    `/id` в группе — чтобы узнать её номер.

    Лента действий шлётся в чат, номер которого лежит в переменной
    `TELEGRAM_GROUP_CHAT_ID`, а узнать его иначе как у самого Telegram
    нельзя: в ссылке-приглашении номера нет. Команда отвечает номером —
    владелец переносит его в настройки Railway и лента оживает.
  */
  if (command === '/id') {
    await sendTelegramMessage(
      chatId,
      message.chat.title ?? 'Этот чат',
      `Номер чата: ${chatId.toString()}
Впишите его в TELEGRAM_GROUP_CHAT_ID, чтобы сюда шла лента действий.`,
    );
    return;
  }

  // В группе бот молчит: иначе на каждое сообщение коллег отвечал бы подсказкой.
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (isGroup) return;

  if (command !== '/start' || argument === undefined) {
    await sendTelegramMessage(
      chatId,
      'Design House',
      'Этот бот только присылает уведомления. Чтобы подключить их, откройте приложение → Профиль → Уведомления в Telegram.',
    );
    return;
  }

  const userId = verifyLinkCode(argument);
  if (userId === null) {
    await sendTelegramMessage(
      chatId,
      'Ссылка не подошла',
      'Код привязки истёк или неверный. Откройте приложение и получите новую ссылку.',
    );
    return;
  }

  const [user] = await executor
    .update(users)
    .set({ telegramId: chatId, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ fullName: users.fullName });

  if (user === undefined) return;

  await sendTelegramMessage(
    chatId,
    'Уведомления подключены',
    `${user.fullName}, теперь всё, что приходит в приложение, будет дублироваться сюда.`,
  );
}

/**
 * Опрос обновлений бота.
 *
 * Опрос, а не вебхук: вебхук требует публичного адреса и его регистрации,
 * то есть ещё одной настройки, которую надо не забыть при переезде. Здесь
 * поток событий — редкие `/start` при подключении сотрудника, и держать
 * ради них внешний адрес незачем.
 *
 * Рассчитано на ОДИН экземпляр API: два процесса, читающих один и тот же
 * поток обновлений, будут отбирать их друг у друга. Прод запускается одним
 * экземпляром; если появится второй — привязку надо будет перевести на
 * вебхук.
 */
export function startTelegramPolling(executor: DbExecutor): () => void {
  if (!isTelegramEnabled()) return () => undefined;

  let offset = 0;
  let stopped = false;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      const updates = await callBotApi<TelegramUpdate[]>('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });

      if (updates === null) {
        // Отказ или обрыв — ждём, чтобы не забить журнал и не долбить API.
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        continue;
      }

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleUpdate(executor, update);
        } catch (error) {
          process.stderr.write(`Telegram: обработка обновления — ${String(error)}\n`);
        }
      }
    }
  };

  void loop();

  /* Остановка при выключении сервера: без неё процесс висел бы на открытом
     длинном запросе к Telegram ещё полминуты после SIGTERM. */
  return () => {
    stopped = true;
  };
}

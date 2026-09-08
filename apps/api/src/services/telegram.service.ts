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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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

export async function sendTelegramMessage(
  chatId: number,
  title: string,
  body: string,
): Promise<void> {
  await callBotApi('sendMessage', {
    chat_id: chatId,
    text: `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/* -------------------------------------------------------------------------- */
/*                           Приём сообщений боту                             */
/* -------------------------------------------------------------------------- */

interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: {
    readonly text?: string;
    readonly chat: { readonly id: number };
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

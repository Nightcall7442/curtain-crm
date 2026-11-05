import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ORDER_STATUS_LABELS } from '@curtain-crm/shared';
import { describe, expect, it } from 'vitest';

import { KNOWN_ERROR_MESSAGES, translateErrorMessage } from './errorTranslations';
import {
  KNOWN_NOTIFICATION_TEXTS,
  modernizeStoredNotification,
  translateNotificationText,
} from './notificationTranslations';

/**
 * Таблица переводов ошибок обязана знать каждый текст из исходников.
 *
 * Перевод ищется по русской строке, поэтому изменённое или новое сообщение
 * без пары в таблице молча ушло бы узбекскому клиенту по-русски. Тест
 * вычитывает все `message: '…'` из роутеров, сервисов и middleware плюс
 * тексты zod-схем и падает на первом непереведённом.
 */

const SRC = join(__dirname, '..');

/** Файлы, чьи строки не уходят клиенту как сообщения об ошибках. */
const SKIP_FILES = new Set([
  'constants.ts', // ошибки конфигурации окружения — оператору, не клиенту
  'notifications.service.ts', // уведомления — своя таблица, проверяется ниже
  'telegram.service.ts',
  'audit.service.ts',
  'performance.service.ts', // SQL
  'rating.service.ts', // SQL
  'timesheet.service.ts',
]);

/** Отдельные строки, которые попадают под шаблон, но ошибками не являются. */
const SKIP_TEXTS = new Set([
  'roleGuard требует хотя бы одну роль', // ошибка программиста, не клиента
  'STORAGE_DRIVER=s3 требует S3_BUCKET, S3_REGION и ключи доступа', // конфигурация
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'scripts') yield* walk(path);
      continue;
    }
    if (!path.endsWith('.ts') || path.endsWith('.test.ts')) continue;
    if (SKIP_FILES.has(entry)) continue;
    yield path;
  }
}

/** `${выражение}` → `{}`; скобки внутри выражения могут быть вложенными. */
function normalizeTemplate(literal: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < literal.length; i += 1) {
    const ch = literal[i];
    if (depth === 0 && ch === '$' && literal[i + 1] === '{') {
      depth = 1;
      out += '{}';
      i += 1;
      continue;
    }
    if (depth > 0) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      continue;
    }
    out += ch;
  }
  // Две подстановки подряд (`${a}${tail}`) — одна дыра в шаблоне.
  return out.replace(/(\{\})+/g, '{}').replace(/\s+/g, ' ').trim();
}

const normalizePattern = (pattern: string): string =>
  pattern.replace(/\{\w+\}/g, '{}').replace(/(\{\})+/g, '{}').replace(/\s+/g, ' ').trim();

/**
 * Русские строки, которые уходят клиенту: аргумент `message:` (в том числе
 * склеенный из нескольких литералов) и тексты zod (`.min(3, '…')`,
 * `nonEmptyString(200, '…')`, `.refine(…, '…')`).
 */
function clientMessages(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1');

  const found: string[] = [];
  const messageRx =
    /message:\s*((?:`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")(?:\s*\+\s*(?:`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"))*)/g;
  for (const match of code.matchAll(messageRx)) {
    const parts = [...(match[1] ?? '').matchAll(/`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)];
    found.push(parts.map((p) => p[1] ?? p[2] ?? p[3] ?? '').join(''));
  }

  const zodRx =
    /\.(?:min|max|nonnegative|positive|refine|int)\((?:[^()'"`]|\([^()]*\))*?,?\s*(?:`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*\)|nonEmptyString\(\d+,\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\)/g;
  for (const match of code.matchAll(zodRx)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');
  }

  return found.filter((text) => /[А-Яа-яЁё]/.test(text));
}

/**
 * Литерал из исходника может быть лишь началом сообщения: хвост
 * подставляется тернарником (`+ (x ? '…' : '…')`). Такой текст считается
 * покрытым, если хотя бы один шаблон с него начинается.
 */
function coverage(table: { readonly exact: readonly string[]; readonly patterns: readonly string[] }) {
  const known = new Set<string>([...table.exact, ...table.patterns.map(normalizePattern)]);
  return (text: string): boolean => {
    if (known.has(text)) return true;
    const normalized = normalizeTemplate(text);
    if (known.has(normalized)) return true;
    // Хвост-подстановка (`…».${reason}`) — тоже «что угодно дальше».
    const prefix = normalized.endsWith('{}') ? normalized.slice(0, -2) : normalized;
    // Литерал-хвост из тернарника (` — срок до ${date}`) начинается не с
    // буквы: он покрыт, если входит в какой-нибудь шаблон целиком.
    const isTail = /^[^А-Яа-яЁёA-Za-z{]/.test(text);
    return (
      text.includes('${') &&
      table.patterns.some((pattern) => {
        const known = normalizePattern(pattern);
        return isTail ? known.includes(prefix) : known.startsWith(prefix);
      })
    );
  };
}

describe('errorTranslations', () => {
  const covered = coverage(KNOWN_ERROR_MESSAGES);

  it('знает каждый текст ошибки из исходников API', () => {
    const missing: string[] = [];
    let total = 0;

    for (const file of walk(SRC)) {
      for (const text of clientMessages(readFileSync(file, 'utf8'))) {
        total += 1;
        if (SKIP_TEXTS.has(text) || covered(text)) continue;
        missing.push(`${file.slice(SRC.length + 1)}: ${text}`);
      }
    }

    // Страховка от «регулярка перестала находить строки, и тест зелёный»:
    // в API больше двухсот сообщений, и меньше полутора сотен быть не может.
    expect(total).toBeGreaterThan(150);
    expect(missing, 'непереведённые сообщения').toEqual([]);
  });

  it('переводит точные тексты и шаблоны с подстановками', () => {
    expect(translateErrorMessage('Сотрудник не найден', 'uz')).toBe('Xodim topilmadi');
    expect(translateErrorMessage('Сотрудник не найден', 'ru')).toBe('Сотрудник не найден');
    expect(translateErrorMessage('Файл больше 10 МБ', 'uz')).toBe('Fayl 10 MB dan katta');
    // Подпись роли внутри сообщения тоже переводится.
    expect(translateErrorMessage('У сотрудника нет роли «Швея»', 'uz')).toBe(
      "Xodimda «Tikuvchi» roli yo'q",
    );
    // Неизвестный текст остаётся как есть, а не превращается в пустоту.
    expect(translateErrorMessage('Нечто новое', 'uz')).toBe('Нечто новое');
  });

  it('расстояние в отказе отметиться — с латинскими единицами', () => {
    expect(
      translateErrorMessage(
        'Вы находитесь в 1,2\u00A0км от филиала «Чиланзар». Отметиться можно в пределах 150 м',
        'uz',
      ),
    ).toBe("Siz «Чиланзар» filialidan 1,2\u00A0km masofadasiz. Belgilash 150 m radiusda mumkin");
    expect(
      translateErrorMessage('Вы находитесь в 850\u00A0м от филиала «Юнусабад». Отметиться можно в пределах 150 м', 'uz'),
    ).toBe("Siz «Юнусабад» filialidan 850\u00A0m masofadasiz. Belgilash 150 m radiusda mumkin");
    // «мин» — не метры.
    expect(translateErrorMessage('Слишком много неудачных попыток входа. Повторите через 15 мин. или обратитесь к руководству', 'uz')).not.toContain(' m.');
  });
});

describe('notificationTranslations', () => {
  const covered = coverage(KNOWN_NOTIFICATION_TEXTS);

  /** `title:` и `body:` из `notifications.service.ts` — в том числе склеенные. */
  function notificationTexts(source: string): string[] {
    // Тот же разбор, что у ошибок: `title:`/`body:` читаются как `message:`.
    const code = source.replace(/\b(?:title|body):/g, 'message:');
    const found = clientMessages(code);

    // `title: x ? 'А' : 'Б'` — два текста в одном выражении; разбор выше
    // литерал после условия не видит, тернарник читается отдельно.
    const ternary = /message:[\s\S]{0,120}?\?\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')\s*:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')/g;
    for (const match of code.matchAll(ternary)) {
      found.push((match[1] ?? '').slice(1, -1), (match[2] ?? '').slice(1, -1));
    }
    return found.filter((text) => /[А-Яа-яЁё]/.test(text));
  }

  it('знает каждый заголовок и тело уведомления', () => {
    const source = readFileSync(join(SRC, 'services', 'notifications.service.ts'), 'utf8');
    const texts = notificationTexts(source);
    // 16 уведомлений, у большинства — и заголовок, и тело с русскими словами.
    expect(texts.length).toBeGreaterThan(28);
    expect(texts.filter((text) => !covered(text)), 'непереведённые уведомления').toEqual([]);
  });

  it('долг при закрытии — по-узбекски и с узбекской валютой', () => {
    expect(translateErrorMessage('Остаток 800\u00A0000 сум — сначала примите оплату', 'uz')).toBe(
      "Qoldiq 800\u00A0000 so'm — avval to'lovni qabul qiling",
    );
  });

  it('переводит статус, роль и месяц внутри текста', () => {
    expect(translateNotificationText('Заказ DH-000012: В пошиве', 'uz')).toBe(
      `Buyurtma DH-000012: ${ORDER_STATUS_LABELS.uz.sewing_in_progress}`,
    );
    expect(translateNotificationText('Расчёт за Сентябрь 2026 утверждён', 'uz')).toBe(
      'Sentabr 2026 uchun hisob tasdiqlandi',
    );
    expect(translateNotificationText('Rustamov Muzaffar: каждую неделю — пятница', 'uz')).toBe(
      'Rustamov Muzaffar: har hafta — juma',
    );
    expect(translateNotificationText('Aziza: «Перешить ламбрекен»', 'uz')).toBe(
      'Aziza: «Перешить ламбрекен»',
    );
  });

  it('безличные тексты — с узбекской парой', () => {
    expect(
      translateNotificationText('Статус заказа изменён на «В пошиве» (Азизова Нигора). Причина: клиент просил', 'uz'),
    ).toBe(`Buyurtma «${ORDER_STATUS_LABELS.uz.sewing_in_progress}» holatiga o'tkazildi (Азизова Нигора). Sabab: клиент просил`);
    expect(translateNotificationText('Время смены изменено (Мирзаев Дилшод). Причина: забыл', 'uz')).toBe(
      "Smena vaqti o'zgartirildi (Мирзаев Дилшод). Sabab: забыл",
    );
    expect(translateNotificationText('Запрос на 18.11 — 19.11 одобрен (Мирзаев Дилшод)', 'uz')).toBe(
      "18.11 — 19.11 uchun so'rovingiz tasdiqlandi (Мирзаев Дилшод)",
    );
  });
});

describe('modernizeStoredNotification', () => {
  const body = (type: Parameters<typeof modernizeStoredNotification>[0], text: string): string =>
    modernizeStoredNotification(type, 'Заголовок', text).body;

  it('переписывает старые формулировки, уже лежащие в базе', () => {
    expect(modernizeStoredNotification('shift_adjusted', 'Смена 2026-10-25 скорректирована', '').title).toBe(
      'Смена 25.10 скорректирована',
    );
    expect(
      body('shift_adjusted', 'Система изменил время смены. Причина: Закрыта автоматически: сотрудник не отметил уход'),
    ).toBe('Смена закрыта автоматически — вы не отметили уход');
    expect(body('shift_adjusted', 'Мирзаев Дилшод изменил время смены. Причина: забыл')).toBe(
      'Время смены изменено (Мирзаев Дилшод). Причина: забыл',
    );
    expect(body('order_completed', 'Нигора Азизова перевёл заказ в статус «Выполнен». Причина: оплачено')).toBe(
      'Статус заказа изменён на «Выполнен» (Нигора Азизова). Причина: оплачено',
    );
    expect(body('role_changed', 'Директор назначил вам роль «Швея»')).toBe('Вам назначена роль «Швея» (Директор)');
    expect(body('day_off_requested', 'Зухра Нормуродова просит выходные: 2026-11-18 — 2026-11-19')).toBe(
      'Зухра Нормуродова просит выходные: 18.11 — 19.11',
    );
    expect(body('day_off_approved', 'Директор одобрил ваш запрос на 2026-11-18')).toBe('Запрос на 18.11 одобрен (Директор)');
    expect(body('day_off_approved', 'Директор: 2026-11-18 — 2026-11-19')).toBe('Директор: 18.11 — 19.11');
    expect(body('day_off_rejected', '2026-11-18 — 2026-11-19 — 2026-11-20 занят')).toBe('18.11 — 19.11 — 2026-11-20 занят');
    expect(body('task_assigned', 'Директор: «Убрать склад» — срок до 2026-11-20')).toBe(
      'Директор: «Убрать склад» — срок до 20.11',
    );
  });

  it('не трогает чужой текст и нынешние записи', () => {
    expect(body('order_comment_added', 'Азиз: 2026-11-20')).toBe('Азиз: 2026-11-20');
    // Комментарий или поручение, написанные человеком, могут случайно
    // совпасть со старым шаблоном — их текст не переписывается.
    expect(body('order_comment_added', 'Азиз перевёл заказ в статус «Готов». Проверьте')).toBe(
      'Азиз перевёл заказ в статус «Готов». Проверьте',
    );
    expect(body('task_replied', 'Я изменил время смены. Причина: пробки')).toBe(
      'Я изменил время смены. Причина: пробки',
    );
    expect(body('order_comment_added', 'Бригадир назначил вам роль «старшего»')).toBe(
      'Бригадир назначил вам роль «старшего»',
    );
    expect(body('task_replied', 'Шеф просит выходные: 2026-11-18')).toBe('Шеф просит выходные: 2026-11-18');
    expect(body('order_comment_added', 'Азиз: «Замер» — срок до 2026-11-20')).toBe(
      'Азиз: «Замер» — срок до 2026-11-20',
    );
    expect(body('order_completed', 'Статус заказа изменён на «Выполнен» (Директор).')).toBe(
      'Статус заказа изменён на «Выполнен» (Директор).',
    );
  });
});

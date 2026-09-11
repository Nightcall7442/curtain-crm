import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KNOWN_ERROR_MESSAGES, translateErrorMessage } from './errorTranslations';

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
  'notifications.service.ts', // тексты уведомлений — данные, хранятся в БД
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

describe('errorTranslations', () => {
  const known = new Set<string>([
    ...KNOWN_ERROR_MESSAGES.exact,
    ...KNOWN_ERROR_MESSAGES.patterns.map(normalizePattern),
  ]);

  /*
    Литерал из исходника может быть лишь началом сообщения: хвост
    подставляется тернарником (`+ (x ? '…' : '…')`). Такой текст считается
    покрытым, если хотя бы один шаблон с него начинается.
  */
  const covered = (text: string): boolean => {
    if (known.has(text)) return true;
    const normalized = normalizeTemplate(text);
    if (known.has(normalized)) return true;
    return (
      text.includes('${') &&
      KNOWN_ERROR_MESSAGES.patterns.some((pattern) =>
        normalizePattern(pattern).startsWith(normalized),
      )
    );
  };

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
});

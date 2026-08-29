/**
 * Светлая и тёмная схема.
 *
 * Три состояния, а не два. «Как в системе» — не то же самое, что «светлая»:
 * у большинства система переключается сама по расписанию, и человек, выбравший
 * системный вариант, ждёт, что панель потемнеет вечером вместе с остальными
 * приложениями. Жёстко выбранная светлая при тёмной системе — это осознанное
 * решение, и его нужно уметь выразить.
 *
 * Сами палитры лежат в `styles/globals.css`: `@media (prefers-color-scheme)`
 * обслуживает системный вариант, атрибут `data-theme` на корне — явный выбор.
 * Здесь только список, хранение и применение.
 *
 * Выбор хранится в браузере по той же причине, что и оформление: это
 * настройка рабочего места, а не сотрудника. За общим компьютером в цехе и
 * за ноутбуком в кабинете освещение разное.
 */

export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'system';

export const THEME_INFO: Readonly<
  Record<Theme, { readonly label: string; readonly hint: string }>
> = {
  system: { label: 'Как в системе', hint: 'Следует настройке телефона или компьютера' },
  light: { label: 'Светлая', hint: 'Всегда светлая, даже если система тёмная' },
  dark: { label: 'Тёмная', hint: 'Всегда тёмная — цех вечером, ночная смена' },
};

/** Ключ в хранилище браузера. */
export const THEME_STORAGE_KEY = 'curtain-crm.theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Применяет схему к документу.
 *
 * Системный вариант СНИМАЕТ атрибут, а не пишет `data-theme="system"`:
 * решение в этом случае принимает медиазапрос, и лишний атрибут только
 * мешал бы правилам сработать.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  if (theme === DEFAULT_THEME) {
    delete document.documentElement.dataset['theme'];
    return;
  }

  document.documentElement.dataset['theme'] = theme;
}

/** Сохранённый выбор; `DEFAULT_THEME`, если выбора нет или хранилище недоступно. */
export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // В приватном окне и при запрете хранения данных сайта сам доступ
    // к `localStorage` бросает исключение — панель не должна из-за этого падать.
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Выбор проживёт до перезагрузки страницы — это лучше, чем падение.
  }
}

/**
 * Код, применяющий схему ДО первой отрисовки.
 *
 * Встраивается в `<head>` строкой и выполняется синхронно, раньше React.
 * Без него панель сначала рисуется светлой и через кадр темнеет — вспышка
 * белым в тёмной комнате, ровно то, ради чего тёмную схему и включают.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
try {
  var t = localStorage.getItem('${THEME_STORAGE_KEY}');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
`.trim();

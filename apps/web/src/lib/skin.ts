/**
 * Скины оформления — палитра «Ателье».
 *
 * Скин меняет акцент, навигацию И НЕЙТРАЛИ — фон, поверхности, рамки и три
 * ступени текста. Сами правила лежат в `styles/globals.css` под
 * `:root[data-skin='…']`. Здесь только список, хранение выбора и его
 * применение к документу.
 *
 * Почему выбор хранится в браузере, а не на сервере: это настройка рабочего
 * места, а не сотрудника. Один и тот же человек за ноутбуком в кабинете и за
 * общим компьютером в цехе — разные условия освещения, и навязывать им один
 * акцент незачем. Когда понадобится «как у меня везде», значение переедет
 * в профиль, а этот модуль останется единственным местом правки.
 */

export const SKINS = ['forest', 'indigo', 'clay'] as const;

export type Skin = (typeof SKINS)[number];

export const DEFAULT_SKIN: Skin = 'forest';

/**
 * Описание скина для интерфейса.
 *
 * Цвета образца здесь НЕТ намеренно. Взять его из `--accent` нельзя: в момент
 * отрисовки переменная содержит цвет ТЕКУЩЕГО скина, а не того, который
 * предлагает кнопка. Дублировать значение в JS тоже нельзя — оно должно
 * меняться вместе со схемой, а тёмная схема выбирается медиазапросом, о
 * котором JS знать не обязан.
 *
 * Поэтому в CSS заведены отдельные переменные `--swatch-forest`,
 * `--swatch-indigo`, `--swatch-clay`. Они не зависят от активного скина,
 * переворачиваются вместе со схемой, и образец всегда показывает тот цвет,
 * который человек получит по нажатию.
 */
export const SKIN_INFO: Readonly<
  Record<Skin, { readonly label: string; readonly hint: string }>
> = {
  forest: {
    label: 'Хвоя',
    hint: 'Глубокая зелень. Основное оформление мастерской',
  },
  indigo: {
    label: 'Сумерки',
    hint: 'Приглушённый синий с холодным фоном — спокойнее на ярком свету',
  },
  clay: {
    label: 'Терракота',
    hint: 'Тёплый обожжённый оттенок с тёплым фоном',
  },
};

/** Ключ в хранилище браузера. */
export const SKIN_STORAGE_KEY = 'curtain-crm.skin';

export function isSkin(value: unknown): value is Skin {
  return typeof value === 'string' && (SKINS as readonly string[]).includes(value);
}

/**
 * Применяет скин к документу.
 *
 * Скин по умолчанию не пишет атрибут, а СНИМАЕТ его: правила базовой палитры
 * живут на голом `:root`, и лишний `data-skin="forest"` потребовал бы
 * дублировать их ещё раз просто ради симметрии.
 */
export function applySkin(skin: Skin): void {
  if (typeof document === 'undefined') return;

  if (skin === DEFAULT_SKIN) {
    delete document.documentElement.dataset['skin'];
    return;
  }

  document.documentElement.dataset['skin'] = skin;
}

/** Сохранённый выбор; `DEFAULT_SKIN`, если выбора нет или хранилище недоступно. */
export function readStoredSkin(): Skin {
  if (typeof window === 'undefined') return DEFAULT_SKIN;

  try {
    const stored = window.localStorage.getItem(SKIN_STORAGE_KEY);
    return isSkin(stored) ? stored : DEFAULT_SKIN;
  } catch {
    // В приватном окне и при запрете хранения данных сайта сам доступ
    // к `localStorage` бросает исключение — панель не должна из-за этого падать.
    return DEFAULT_SKIN;
  }
}

export function storeSkin(skin: Skin): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Выбор проживёт до перезагрузки страницы — это лучше, чем падение.
  }
}

/**
 * Код, применяющий скин ДО первой отрисовки.
 *
 * Встраивается в `<head>` строкой и выполняется синхронно, раньше React.
 * Без этого панель сначала показывает палитру по умолчанию, а через кадр
 * перекрашивается — заметная вспышка зелёного при выбранном синем.
 *
 * Обёрнуто в try/catch по той же причине, что и чтение выше: недоступное
 * хранилище не должно ронять страницу ещё до её появления.
 */
export const SKIN_BOOTSTRAP_SCRIPT = `
try {
  var s = localStorage.getItem('${SKIN_STORAGE_KEY}');
  if (s && s !== '${DEFAULT_SKIN}' && ${JSON.stringify(SKINS)}.indexOf(s) !== -1) {
    document.documentElement.dataset.skin = s;
  }
} catch (e) {}
`.trim();

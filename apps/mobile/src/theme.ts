/**
 * Тема мобильного приложения — «Полотно».
 *
 * Одна палитра с веб-панелью: небелёный лён в поверхностях, чернильный текст,
 * акцент цвета глины. Раньше приложение было бирюзовым и выглядело отдельным
 * продуктом — теперь это одна система, просто в других условиях.
 *
 * Корпус остаётся СВЕТЛЫМ, и это по-прежнему осознанно: приложением
 * пользуются в цехе и на объекте, часто при дневном свете и прямом солнце,
 * где тёмный экран нечитаем.
 *
 * Токены не вынесены в общий пакет намеренно: React Native не понимает
 * CSS-переменные, а `packages/shared` не должен зависеть ни от React, ни от
 * способа оформления. Общими остаются ДАННЫЕ и их подписи, а не раскладка
 * цветов — совпадение значений здесь поддерживается вручную и осознанно.
 */

export const colors = {
  /** Фон экрана — небелёный лён. */
  background: '#FAF8F5',
  /** Карточки. */
  surface: '#FFFFFF',
  /** Вторичная поверхность: полосы прогресса, разделители-подложки. */
  surfaceMuted: '#F2EFE9',

  /** Шапка — чернильная, как левая половина экрана входа в панели. */
  header: '#1A1714',
  headerText: '#F4F0EA',

  /** Основной акцент — действия и фирменные места. */
  accent: '#B4532A',
  accentSoft: '#F6EAE3',
  /** Приглушённый акцент для тёмного фона шапки. */
  accentOnDark: '#E0BFA8',

  textPrimary: '#1A1714',
  textSecondary: '#57504A',
  textMuted: '#8C8379',

  border: '#E5E0D8',

  /**
   * Состояния.
   *
   * Оттенки те же, что в панели: сотрудник видит «брак» одного цвета
   * и в цехе на телефоне, и в кабинете на экране руководителя.
   */
  // Багрянец, а не кирпич: кирпичный оттенок сливался с глиняным акцентом,
  // и «Критический» переставал отличаться от номера заказа.
  danger: '#A81D2D',
  dangerSoft: '#FBEAEC',
  warning: '#8A6A12',
  warningSoft: '#FAF3E4',
  info: '#2F6FB0',
  infoSoft: '#EDF2F8',
  positive: '#3F7D4E',
  positiveSoft: '#EFF4EF',
} as const;

/**
 * Цвета этапов производства.
 *
 * Те же восемь, что и в панели, — значения обязаны совпадать со
 * `--stage-*` в `apps/web/src/styles/globals.css`, где записаны и замеры:
 * контраст к белому не ниже 5,17:1, расхождение соседних плиток не меньше
 * ΔE 23,2 при дейтеранопии.
 *
 * Цвет всегда идёт вместе с подписью — на солнце различить оттенки труднее,
 * чем прочитать слово.
 */
export const stageColors = {
  new: '#2E6FB6',
  measurement: '#0B5A63',
  cutting: '#8F6300',
  sewing: '#8E3D7A',
  qc: '#5A6B12',
  ready_for_install: '#B25014',
  installation: '#5A4FA3',
  done: '#22683F',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 18, fontWeight: '600' as const },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 14 },
  caption: { fontSize: 12 },
  label: { fontSize: 12, color: colors.textMuted },
  value: { fontSize: 15, fontWeight: '500' as const, color: colors.textPrimary },
} as const;

/**
 * Тень карточки.
 *
 * iOS и Android используют разные механизмы, поэтому задаются оба набора
 * свойств: только `elevation` не даст тени на iOS, только `shadow*` — на Android.
 *
 * На светлом фоне тень тёплая и слабая: границу несёт рамка, тень лишь
 * отделяет карточку от полотна.
 */
export const cardShadow = {
  shadowColor: '#1A1714',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/**
 * Тема мобильного приложения.
 *
 * СВЕТЛАЯ — в отличие от тёмной веб-панели, и это осознанно, а не недосмотр:
 * приложением пользуются в цехе и на объекте, часто при дневном свете и
 * прямом солнце, где тёмный экран нечитаем. Панелью же пользуются в кабинете.
 * По той же причине темы не вынесены в общий пакет: это два разных продукта
 * для разных условий, а не одна тема с переключателем.
 *
 * Общими остаются ДАННЫЕ и их подписи (`@curtain-crm/shared`), а не оформление.
 */

export const colors = {
  /** Фон экрана. */
  background: '#F1F4F4',
  /** Карточки. */
  surface: '#FFFFFF',
  /** Вторичная поверхность: полосы прогресса, разделители-подложки. */
  surfaceMuted: '#EEF2F2',

  /** Шапка и акцент бренда. */
  header: '#14504A',
  headerText: '#FFFFFF',

  /** Основной акцент — действия и положительные состояния. */
  accent: '#16A34A',
  accentSoft: '#DCFCE7',

  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',

  border: '#E5E7EB',

  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  info: '#3B82F6',
  infoSoft: '#DBEAFE',
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
 */
export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { cardShadow, colors, hairline, radius, spacing, typography } from '../theme';

import { Icon, type IconName } from './Icon';

/**
 * Базовые блоки экранов.
 *
 * Только представление: обращений к API и проверок прав здесь нет —
 * бизнес-логика живёт на бэкенде.
 */

export function Card({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}): ReactElement {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Карточка под список строк.
 *
 * Отличие от обычной — НУЛЕВОЙ внутренний отступ: его берут на себя строки.
 * Иначе подсветка нажатой строки не доходит до краёв карточки и выглядит
 * приклеенной наклейкой, а не нажатой строкой. Отступ от края при этом не
 * теряется — он просто переезжает внутрь строки.
 *
 * `overflow: 'hidden'` обязателен: без него подсветка первой и последней
 * строки вылезает за скруглённые углы прямоугольными ушами.
 */
export function ListCard({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}): ReactElement {
  return <View style={[styles.card, styles.listCard, style]}>{children}</View>;
}

/**
 * Заголовок секции НАД карточкой.
 *
 * Так устроены системные настройки: подпись группы стоит снаружи, мелкая и
 * приглушённая, а карточка под ней остаётся чистой. Заголовок внутри карточки
 * съедает её первую строку и мешает списку начинаться сразу.
 */
export function SectionHeader({
  title,
  action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title.toUpperCase()}</Text>
      {action !== undefined && <View style={styles.sectionHeaderAction}>{action}</View>}
    </View>
  );
}

export function CardTitle({
  title,
  icon,
  action,
}: {
  readonly title: string;
  /** Иконка называется по роли — список в `Icon.tsx`. */
  readonly icon?: IconName;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.titleRow}>
      {icon !== undefined && (
        <View style={styles.titleIcon}>
          <Icon name={icon} size={16} color={colors.accent} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {action !== undefined && <View style={styles.titleAction}>{action}</View>}
    </View>
  );
}

/** Строка «подпись — значение». */
export function Row({
  label,
  value,
  valueColor,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
}): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor === undefined ? null : { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

/** Цветная метка состояния. Цвет всегда сопровождается текстом. */
export function Pill({
  text,
  tone = 'neutral',
}: {
  readonly text: string;
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
}): ReactElement {
  const palette = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
    positive: { bg: colors.positiveSoft, fg: colors.positive },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.infoSoft, fg: colors.info },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      {/*
        Точка-индикатор перед текстом — из утверждённого макета «Хвоя UI».
        Помимо ритма она страхует восприятие: на солнце тонированная
        подложка выцветает первой, а плотная точка остаётся видимой.
      */}
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Полоса прогресса. */
export function Progress({
  percent,
  color = colors.accent,
}: {
  readonly percent: number;
  readonly color?: string;
}): ReactElement {
  // NaN пролезал бы в ширину как «NaN%», и полоса пропадала бы целиком.
  // Проверка на null от нечислового значения не защищает: она пропускает
  // результат неудачного разбора строки, а он тут вполне возможен.
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View style={[styles.progressFill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

/**
 * Состояние «нет данных».
 *
 * Отдельный компонент: пустая карточка без пояснения читается как сбой
 * загрузки, а объяснение снимает половину вопросов к поддержке.
 */
export function Empty({
  message,
  hint,
}: {
  readonly message: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
      {hint !== undefined && <Text style={styles.emptyHint}>{hint}</Text>}
    </View>
  );
}

/**
 * Состояние «не удалось загрузить».
 *
 * Отдельно от `Empty`, и это главное в компоненте. Пока ошибка отрисовывалась
 * тем же пустым состоянием, экран при обрыве связи писал «Заказов пока нет» —
 * сотрудник читал это как «мне ничего не назначили» и уходил домой. Пусто и
 * сломано — разные вещи, и выглядеть они обязаны по-разному.
 */
export function ErrorState({
  message = 'Не удалось загрузить',
  hint = 'Проверьте связь и потяните вниз',
}: {
  readonly message?: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <View style={styles.empty} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

/**
 * Строка сгруппированного списка.
 *
 * Главная деталь — РАЗДЕЛИТЕЛЬ, и он рисуется внутри строки со сдвигом
 * влево, а не по всей ширине карточки. Так устроены системные списки iOS:
 * линия начинается там, где начинается текст, и не пересекает колонку с
 * иконками. Разделитель во всю ширину режет карточку на куски и выглядит
 * как таблица, а не как список.
 *
 * Линия волосяная (`hairline`), а не в пиксель: на плотном экране пиксельная
 * черта выглядит грубо.
 *
 * Последняя строка идёт без разделителя — линия у самого низа карточки
 * дублировала бы её край.
 */
export function ListRow({
  icon,
  label,
  value,
  tone = 'default',
  isLast = false,
  onPress,
}: {
  readonly icon?: IconName;
  readonly label: string;
  readonly value?: string;
  readonly tone?: 'default' | 'danger';
  readonly isLast?: boolean;
  /** Если задан, строка становится кнопкой с шевроном. */
  readonly onPress?: () => void;
}): ReactElement {
  const labelColor = tone === 'danger' ? colors.danger : colors.textPrimary;

  const content = (
    <>
      {icon !== undefined && (
        <View style={styles.listIcon}>
          <Icon name={icon} size={19} color={tone === 'danger' ? colors.danger : colors.accent} />
        </View>
      )}

      <View style={[styles.listBody, isLast ? null : styles.listDivider]}>
        <Text style={[styles.listLabel, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>

        {value !== undefined && (
          <Text style={styles.listValue} numberOfLines={1}>
            {value}
          </Text>
        )}

        {onPress !== undefined && (
          <Icon name="chevron" size={17} color={colors.textMuted} />
        )}
      </View>
    </>
  );

  if (onPress === undefined) {
    return <View style={styles.listRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? label : `${label}: ${value}`}
      style={({ pressed }) => [styles.listRow, pressed ? styles.listRowPressed : null]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Заглушка на время первой загрузки.
 *
 * Держит высоту, чтобы список не «прыгал», когда данные приедут. Без неё
 * экран сначала показывает пустое состояние, а через долю секунды —
 * содержимое, и это читается как мигание.
 */
export function Skeleton({ rows = 3 }: { readonly rows?: number }): ReactElement {
  return (
    <View style={styles.skeleton}>
      {Array.from({ length: rows }, (_unused, index) => (
        <View key={index} style={styles.skeletonRow}>
          {/*
            Заглушка повторяет ФОРМУ строки, а не рисует серую полосу во всю
            ширину. Полоса ничего не обещает, и когда данные приезжают, экран
            перестраивается целиком. Два блока — короткий слева и длинный
            справа — заранее занимают те же места, что займут подпись и
            значение, поэтому появление данных не двигает раскладку.

            Ширины намеренно разной длины по строкам: одинаковые выглядят
            как таблица, а живой список так не выглядит никогда.
          */}
          <View style={[styles.skeletonBlock, { width: index % 2 === 0 ? '42%' : '34%' }]} />
          <View style={[styles.skeletonBlock, { width: index % 2 === 0 ? '22%' : '30%' }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  titleIcon: {
    marginRight: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleAction: {
    marginLeft: 'auto',
    // Без отступа заголовок слипается с действием: в карточке зарплаты
    // выходило «ЗарплатаАвгуст 2026» без пробела между ними.
    paddingLeft: spacing.sm,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textMuted,
    // Подпись из фиксированного словаря — ужиматься должно ЗНАЧЕНИЕ.
    // Пока сжимались обе, пара «Контроль качества — Абдурахмонов Шерзодбек
    // Улугбекович» разъезжалась в три этажа и переставала читаться.
    flexShrink: 0,
    marginRight: spacing.md,
  },
  rowValue: {
    ...typography.value,
    textAlign: 'right',
    flexShrink: 1,
    flexGrow: 1,
    // Через эту строку идёт вся числовая и денежная отчётность приложения:
    // без табличных цифр правый край колонки сумм получается неровным.
    fontVariant: ['tabular-nums'],
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    // Плашка обязана ужиматься: в узкой карточке «Смена закрыта» вылезала
    // за белый край на серый фон — RN без этого ничего не обрезает.
    flexShrink: 1,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  listCard: {
    padding: 0,
    // Иначе подсветка крайних строк вылезает за скруглённые углы.
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // Прижат к своей карточке снизу и отбит сверху от предыдущей: подпись
    // должна принадлежать тому, что под ней, а не висеть между блоками.
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionHeaderText: {
    ...typography.footnote,
    color: colors.textMuted,
    // Разрядка — единственное место, где она уместна: мелкие прописные без
    // неё сливаются в сплошную полосу.
    letterSpacing: 0.6,
    fontWeight: '600',
    flex: 1,
  },
  sectionHeaderAction: {
    marginLeft: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    // Отступ от края карточки живёт здесь, а не на карточке: только так
    // подсветка нажатой строки доходит до её краёв.
    paddingHorizontal: spacing.lg,
  },
  listRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  listIcon: {
    width: 30,
    alignItems: 'flex-start',
  },
  /**
   * Разделитель живёт ЗДЕСЬ, а не на всей строке.
   *
   * Блок начинается после колонки с иконкой, поэтому линия автоматически
   * получает тот же левый отступ, что и текст, — без магических чисел и
   * без ручной подгонки под ширину иконки.
   */
  listBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  listDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  listLabel: {
    ...typography.body,
    flex: 1,
  },
  listValue: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  skeleton: {
    paddingVertical: spacing.xs,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Высота строки та же, что у настоящей: 44 — минимальная зона нажатия,
    // и заглушка обязана занимать ровно столько же, иначе список подпрыгнет.
    minHeight: 44,
    paddingVertical: spacing.md,
  },
  skeletonBlock: {
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

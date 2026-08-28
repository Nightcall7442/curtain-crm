import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { cardShadow, colors, radius, spacing, typography } from '../theme';

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

export function CardTitle({
  title,
  icon,
  action,
}: {
  readonly title: string;
  readonly icon?: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.titleRow}>
      {icon !== undefined && <Text style={styles.titleIcon}>{icon}</Text>}
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
      <Text style={[styles.pillText, { color: palette.fg }]}>{text}</Text>
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
  const clamped = Math.min(100, Math.max(0, percent));

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
    fontSize: 15,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleAction: {
    marginLeft: 'auto',
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
    flexShrink: 1,
    marginRight: spacing.md,
  },
  rowValue: {
    ...typography.value,
    textAlign: 'right',
    flexShrink: 1,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
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
});

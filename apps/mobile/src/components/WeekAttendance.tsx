import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, radius, spacing, typography } from '../theme';

import { Card } from './Card';

/**
 * Неделя сотрудника: в какие дни была смена.
 *
 * Показывает ФАКТ по сменам, а не график работы: графиков смен в системе нет,
 * и рисовать «плановый выходной» было бы выдумкой. День без смены помечается
 * как «нет смены», а не как «выходной» — это разные вещи, и подменять одно
 * другим значит скрывать прогулы.
 *
 * Будущие дни недели показываются приглушённо и без отметки: сказать про них
 * ещё нечего.
 */

export interface WeekDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hasShift: boolean;
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export function WeekAttendance({
  days,
  today,
}: {
  readonly days: readonly WeekDay[];
  readonly today: string;
}): ReactElement {
  return (
    <Card>
      <View style={styles.row}>
        {days.map((day, index) => {
          const isFuture = day.date > today;
          const isWeekend = index >= 5;

          return (
            <View key={day.date} style={styles.day}>
              <Text style={[styles.weekday, isWeekend ? styles.weekend : null]}>
                {WEEKDAY_LABELS[index]}
              </Text>
              <Text style={[styles.date, isWeekend ? styles.weekend : null]}>
                {day.date.slice(8, 10)}
              </Text>

              <View
                style={[
                  styles.mark,
                  isFuture
                    ? styles.markFuture
                    : day.hasShift
                      ? styles.markPresent
                      : styles.markAbsent,
                ]}
              >
                <Text style={styles.markGlyph}>
                  {isFuture ? '·' : day.hasShift ? '✓' : '✕'}
                </Text>
              </View>

              <Text style={styles.caption} numberOfLines={2}>
                {isFuture ? '—' : day.hasShift ? 'Смена была' : 'Нет смены'}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    flex: 1,
  },
  weekday: {
    ...typography.caption,
    color: colors.textMuted,
  },
  date: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 1,
  },
  weekend: {
    color: colors.danger,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  markPresent: {
    backgroundColor: colors.accent,
  },
  markAbsent: {
    backgroundColor: colors.danger,
  },
  markFuture: {
    backgroundColor: colors.surfaceMuted,
  },
  markGlyph: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  caption: {
    fontSize: 9.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});

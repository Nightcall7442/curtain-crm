import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, radius, spacing, typography } from '../theme';

import { Card } from './Card';
import { useLocale } from '../hooks/useLocale';

/**
 * Неделя сотрудника: в какие дни была смена.
 *
 * Показывает ФАКТ по сменам, а не график работы. День без смены помечается
 * как «нет смены», а не как «выходной» — это разные вещи, и подменять одно
 * другим значит скрывать прогулы. Единственный плановый знак — выходной,
 * который поставил руководитель (`weekly_day_off`): его видно и в будущем,
 * и в прошлом, и в такой день «нет смены» — не прогул.
 *
 * Остальные будущие дни показываются приглушённо и без отметки: сказать про
 * них ещё нечего.
 */

export interface WeekDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hasShift: boolean;
  /** Выходной по графику, назначенный руководителем. */
  readonly isDayOff?: boolean;
}

const WEEKDAY_LABELS = ['week.mon', 'week.tue', 'week.wed', 'week.thu', 'week.fri', 'week.sat', 'week.sun'] as const;

export function WeekAttendance({
  days,
  today,
}: {
  readonly days: readonly WeekDay[];
  readonly today: string;
}): ReactElement {
  const { m } = useLocale();

  return (
    <Card>
      <View style={styles.row}>
        {days.map((day, index) => {
          const isFuture = day.date > today;
          const isWeekend = index >= 5;
          const isDayOff = day.isDayOff === true && !day.hasShift;

          return (
            <View key={day.date} style={styles.day}>
              <Text style={[styles.weekday, isWeekend ? styles.weekend : null]}>
                {m(WEEKDAY_LABELS[index] ?? 'week.mon')}
              </Text>
              <Text style={[styles.date, isWeekend ? styles.weekend : null]}>
                {day.date.slice(8, 10)}
              </Text>

              <View
                style={[
                  styles.mark,
                  isDayOff
                    ? styles.markDayOff
                    : isFuture
                      ? styles.markFuture
                      : day.hasShift
                        ? styles.markPresent
                        : styles.markAbsent,
                ]}
              >
                <Text style={[styles.markGlyph, isDayOff ? styles.markGlyphDayOff : null]}>
                  {isDayOff ? m('week.dayOffGlyph') : isFuture ? '·' : day.hasShift ? '✓' : '✕'}
                </Text>
              </View>

              <Text style={styles.caption} numberOfLines={2}>
                {isDayOff ? m('week.dayOff') : isFuture ? '—' : day.hasShift ? m('week.shiftWas') : m('week.noShift')}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  /*
    Неделя собрана по центру, а не растянута на всю ширину карточки.

    С `space-between` и `flex: 1` семь колонок разъезжались к краям, между
    ними появлялись широкие промежутки, а подписи «Нет смены» переставали
    помещаться в свою колонку и наезжали на соседнюю — полоса выглядела
    сплошной строкой. Фиксированная ширина дня плюс центрирование держат
    её компактной и одинаковой на любом экране.
  */
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  day: {
    alignItems: 'center',
    width: 44,
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
  markDayOff: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markGlyphDayOff: {
    color: colors.textMuted,
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

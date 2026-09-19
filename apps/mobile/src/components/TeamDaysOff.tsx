import { formatMonthPeriod, workshopToday } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { Card, CardTitle, Empty, Skeleton } from './Card';

/**
 * Кто отдыхает в этом месяце — руководству.
 *
 * Не сетка с именами в клетках (не влезут), а список по числам: «12 —
 * Иван, Пётр». Числа без отдыхающих не показываются: вопрос директора —
 * «кого не будет», а не «кто будет».
 *
 * Берётся из табеля: там же и еженедельные выходные, и согласованные
 * запросы — одним полем `daysOff`.
 */
export function TeamDaysOff(): ReactElement {
  const { m, locale } = useLocale();
  const today = workshopToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);

  const timesheet = trpc.shifts.timesheet.useQuery({ year, month });

  const step = (delta: number): void => {
    const next = month + delta;
    if (next < 1) {
      setMonth(12);
      setYear(year - 1);
      return;
    }
    if (next > 12) {
      setMonth(1);
      setYear(year + 1);
      return;
    }
    setMonth(next);
  };

  const byDay = new Map<number, string[]>();
  for (const row of timesheet.data?.rows ?? []) {
    for (const day of row.daysOff) {
      byDay.set(day, [...(byDay.get(day) ?? []), row.userFullName]);
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <Card>
      <CardTitle
        title={m('teamDaysOff.title')}
        icon="calendar"
        action={
          <View style={styles.nav}>
            <Pressable
              onPress={() => {
                step(-1);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('schedule.prevMonth')}
              style={({ pressed }) => [styles.navButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.period}>{formatMonthPeriod(year, month, locale)}</Text>
            <Pressable
              onPress={() => {
                step(1);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('schedule.nextMonth')}
              style={({ pressed }) => [styles.navButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>
        }
      />

      {timesheet.isLoading ? (
        <Skeleton rows={3} />
      ) : days.length === 0 ? (
        <Empty message={m('teamDaysOff.empty')} />
      ) : (
        days.map((day) => {
          const isToday = day === today.day && month === today.month && year === today.year;
          return (
            <View key={day} style={styles.row}>
              <Text style={[styles.day, isToday ? styles.dayToday : null]}>{day}</Text>
              <Text style={styles.names}>{(byDay.get(day) ?? []).join(', ')}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  navButton: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  period: {
    ...typography.footnote,
    color: colors.textSecondary,
    minWidth: 96,
    textAlign: 'center',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  day: {
    ...typography.value,
    color: colors.textSecondary,
    width: 28,
    textAlign: 'center',
  },
  dayToday: {
    color: colors.accent,
  },
  names: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});

import { formatMonthPeriod, WORKSHOP_TIME_ZONE } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Skeleton } from './Card';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

/**
 * Мой график: когда я работал и когда отдыхаю.
 *
 * Сотрудник знал про свои смены только то, что помнил: приложение показывало
 * текущую смену и часы за месяц одним числом. Вопрос «а в четверг я работаю?»
 * приходилось задавать в цехе вслух.
 *
 * Месяц — сеткой, как в календаре: в клетке часы за отработанный день, «В» —
 * согласованный выходной (свой запрос или назначенный руководителем), пусто —
 * ни того, ни другого. Будущие выходные видно наперёд, и это главное: смены
 * уже прошли, а отдых ещё предстоит.
 */

const WEEKDAYS = ['week.mon', 'week.tue', 'week.wed', 'week.thu', 'week.fri', 'week.sat', 'week.sun'] as const;

/** Седьмая часть ширины — литералом: вычисленную строку типы RN не принимают. */
const COLUMN_WIDTH = '14.2857%';

/** Сегодняшний день по времени мастерской: `{year, month, day}`. */
function workshopToday(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());

  const value = (type: string): number =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);

  return { year: value('year'), month: value('month'), day: value('day') };
}

/** Часы в клетке: «7,5», «8». */
const cellHours = (hours: number): string =>
  hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function MonthSchedule(): ReactElement {
  const { m, locale } = useLocale();
  const today = workshopToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);

  const schedule = trpc.shifts.myMonth.useQuery({ year, month });

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

  const row = schedule.data?.rows[0];
  const daysInMonth = schedule.data?.daysInMonth ?? 30;
  const hoursByDay = new Map((row?.days ?? []).map((day) => [day.day, day.hours]));
  const daysOff = new Set(row?.daysOff ?? []);

  /*
    Смещение первой клетки: неделя начинается с понедельника, а `getUTCDay()`
    считает с воскресенья. Без сдвига первое число вставало бы не под своим
    днём недели, и весь месяц читался бы неверно.
  */
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <Card>
      <CardTitle
        title={m('schedule.title')}
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

      {schedule.isLoading ? (
        <Skeleton />
      ) : (
        <>
          <View style={styles.week}>
            {WEEKDAYS.map((name) => (
              <Text key={name} style={styles.weekday}>
                {m(name)}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day === null) return <View key={`gap-${index.toString()}`} style={styles.cell} />;

              const hours = hoursByDay.get(day);
              const isOff = daysOff.has(day);
              const isToday =
                day === today.day && month === today.month && year === today.year;

              return (
                <View
                  key={day}
                  style={[
                    styles.cell,
                    hours !== undefined ? styles.cellWorked : null,
                    isOff && hours === undefined ? styles.cellOff : null,
                    isToday ? styles.cellToday : null,
                  ]}
                >
                  <Text style={styles.cellDay}>{day}</Text>
                  <Text style={styles.cellValue}>
                    {hours === undefined ? (isOff ? m('week.dayOffGlyph') : ' ') : cellHours(hours)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <Text style={styles.legendText}>{m('schedule.legendHours')}</Text>
            <Text style={styles.legendText}>{m('schedule.legendOff')}</Text>
          </View>

          <Text style={styles.total}>
            {m('schedule.total', { shifts: row?.shiftsCount ?? 0, hours: cellHours(row?.totalHours ?? 0) })}
          </Text>
        </>
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
  week: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  weekday: {
    ...typography.footnote,
    color: colors.textMuted,
    width: COLUMN_WIDTH,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: COLUMN_WIDTH,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: 'transparent',
  },
  cellWorked: {
    backgroundColor: colors.accentSoft,
  },
  cellOff: {
    backgroundColor: colors.surfaceMuted,
  },
  cellToday: {
    borderColor: colors.accent,
  },
  cellDay: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  cellValue: {
    ...typography.footnote,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  legend: {
    marginTop: spacing.sm,
    gap: 2,
  },
  legendText: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  total: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

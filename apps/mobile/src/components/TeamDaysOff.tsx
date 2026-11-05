import { workshopToday } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, typography } from '../theme';
import { Card, CardTitle, Empty, ErrorState, Skeleton } from './Card';
import { MonthNav } from './MonthSchedule';

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
  const { m } = useLocale();
  const today = workshopToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);

  const timesheet = trpc.shifts.timesheet.useQuery({ year, month });

  const byDay = new Map<number, string[]>();
  for (const row of timesheet.data?.rows ?? []) {
    for (const day of row.daysOff) {
      byDay.set(day, [...(byDay.get(day) ?? []), row.userFullName]);
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <Card>
      {/*
        Переключатель месяца — тот же, что в графике сотрудника: кнопки
        с полной зоной нажатия и значками набора вместо «‹ ›» из шрифта.
      */}
      <CardTitle
        title={m('teamDaysOff.title')}
        icon="calendar"
        action={
          <MonthNav
            year={year}
            month={month}
            onChange={(nextYear, nextMonth) => {
              setYear(nextYear);
              setMonth(nextMonth);
            }}
          />
        }
      />

      {/* Сбой — ошибкой с повтором, а не пустым «никто не отдыхает». */}
      {timesheet.isError ? (
        <ErrorState />
      ) : timesheet.isLoading ? (
        <Skeleton rows={3} />
      ) : days.length === 0 ? (
        <Empty message={m('teamDaysOff.empty')} />
      ) : (
        days.map((day, index) => {
          const isToday = day === today.day && month === today.month && year === today.year;
          return (
            <View key={day} style={[styles.row, index === 0 ? null : styles.rowDivided]}>
              <Text style={[styles.day, isToday ? styles.dayToday : null]}>{day}</Text>
              <Text style={styles.names}>{(byDay.get(day) ?? []).join(', ')}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

/** Колонка числа: «30» жирным с запасом, чтобы имена стояли ровным краем. */
const DAY_COLUMN = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  /*
    Линия — только МЕЖДУ числами. Над первым она стояла вплотную под
    заголовком и дублировала его нижний отступ, а строки по 4 точки сверху
    и снизу слипались в таблицу.
  */
  rowDivided: {
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  day: {
    ...typography.value,
    color: colors.textSecondary,
    width: DAY_COLUMN,
    textAlign: 'center',
    // Строка числа — как у имён рядом: иначе при переносе имён число
    // стояло выше первой строки.
    lineHeight: typography.body.lineHeight,
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

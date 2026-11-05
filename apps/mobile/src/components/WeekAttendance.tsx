import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, fonts, hairline, radius, spacing, typography } from '../theme';

import { Card } from './Card';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n/messages';

/**
 * Неделя сотрудника: в какие дни была смена.
 *
 * Показывает ФАКТ по сменам, а не график работы. День без смены помечается
 * как «нет смены», а не как «выходной» — это разные вещи, и подменять одно
 * другим значит скрывать прогулы. Единственный плановый знак — выходной,
 * который поставил руководитель (`weekly_day_off`): его видно и в будущем,
 * и в прошлом, и в такой день «нет смены» — не прогул.
 *
 * Остальные будущие дни показываются пустым кольцом без отметки: сказать
 * про них ещё нечего.
 *
 * Суббота и воскресенье красным не выделяются: цех работает и в выходные,
 * и красное число без выходного читалось как «нерабочий день» — а месячный
 * график в профиле выходные дни недели не выделяет вовсе.
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

  const kindOf = (day: WeekDay): DayKind => {
    if (day.isDayOff === true && !day.hasShift) return 'dayOff';
    if (day.date > today) return 'future';
    return day.hasShift ? 'present' : 'absent';
  };
  const kinds = days.map(kindOf);
  // Легенда — только для знаков, которые на этой неделе действительно есть.
  const legend = LEGEND.filter((entry) => kinds.includes(entry.kind));

  return (
    <Card>
      <View style={styles.row}>
        {days.map((day, index) => {
          const kind = kinds[index] ?? 'future';

          return (
            <View
              key={day.date}
              style={styles.day}
              accessible
              accessibilityLabel={`${m(WEEKDAY_LABELS[index] ?? 'week.mon')} ${day.date.slice(8, 10)}${
                kind === 'future' ? '' : `: ${m(CAPTIONS[kind])}`
              }`}
            >
              <Text style={styles.weekday}>{m(WEEKDAY_LABELS[index] ?? 'week.mon')}</Text>
              <Text style={styles.date}>{day.date.slice(8, 10)}</Text>

              <View style={[styles.mark, MARK_STYLE[kind]]}>
                {kind !== 'future' && (
                  <Text style={[styles.markGlyph, kind === 'dayOff' ? styles.markGlyphDayOff : null]}>
                    {kind === 'dayOff' ? m('week.dayOffGlyph') : kind === 'present' ? '✓' : '✕'}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/*
        Подписи — одной легендой под неделей, а не под каждым днём.

        Под днём на них оставалось 44 px: «Нет смены» и «Smena bo'lgan»
        шли кеглем 9,5 и всё равно ломались в две строки, а семь колонок
        вместе с подписями не помещались в карточку и вылезали за её края.
        Знак дня остаётся тем же, а слово к нему читается один раз, полным
        кеглем.
      */}
      {legend.length > 0 && (
        <View style={styles.legend}>
          {legend.map((entry) => (
            <View key={entry.kind} style={styles.legendItem}>
              <View style={[styles.legendMark, MARK_STYLE[entry.kind]]}>
                <Text
                  style={[
                    styles.legendGlyph,
                    entry.kind === 'dayOff' ? styles.markGlyphDayOff : null,
                  ]}
                >
                  {entry.kind === 'dayOff' ? m('week.dayOffGlyph') : entry.kind === 'present' ? '✓' : '✕'}
                </Text>
              </View>
              <Text style={styles.legendText}>{m(CAPTIONS[entry.kind])}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

type DayKind = 'present' | 'absent' | 'dayOff' | 'future';

const CAPTIONS = {
  present: 'week.shiftWas',
  absent: 'week.noShift',
  dayOff: 'week.dayOff',
  future: 'week.noShift',
} as const satisfies Record<DayKind, MessageKey>;

const LEGEND: readonly { readonly kind: Exclude<DayKind, 'future'> }[] = [
  { kind: 'present' },
  { kind: 'absent' },
  { kind: 'dayOff' },
];

const styles = StyleSheet.create({
  /*
    Семь равных колонок на всю ширину карточки.

    Было по-другому: фиксированные 44 px на день и центрирование. Семь
    колонок с промежутками — 332 px, а у карточки на экране 360 внутри
    296, и неделя вылезала за её края на 18 px с каждой стороны.
    Колонки теперь делят ширину поровну (`flex: 1`), а прежняя беда
    «равных колонок» — подписи наезжали на соседей — ушла вместе с
    подписями: они переехали в легенду.
  */
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  day: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  weekday: {
    ...typography.caption,
    color: colors.textMuted,
  },
  date: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
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
  /* Будущий день — пустое кольцо: сказать про него ещё нечего, но место дня видно. */
  markFuture: {
    borderWidth: 1,
    borderColor: colors.border,
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
    fontFamily: fonts.bold,
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendMark: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendGlyph: {
    fontFamily: fonts.bold,
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  legendText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

const MARK_STYLE = {
  present: styles.markPresent,
  absent: styles.markAbsent,
  dayOff: styles.markDayOff,
  future: styles.markFuture,
} as const satisfies Record<DayKind, unknown>;

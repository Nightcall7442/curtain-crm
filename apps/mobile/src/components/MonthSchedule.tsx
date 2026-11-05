import { formatMonthPeriod, workshopToday } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, ErrorState } from './Card';
import { Icon } from './Icon';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';
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

const WEEKDAYS = [
  'week.mon',
  'week.tue',
  'week.wed',
  'week.thu',
  'week.fri',
  'week.sat',
  'week.sun',
] as const;

/** Седьмая часть ширины — литералом: вычисленную строку типы RN не принимают. */
const COLUMN_WIDTH = '14.2857%';

/**
 * Часы в клетке: «7,5», «8».
 *
 * Не меньше нуля: у только что открытой смены часы приходят крошечным
 * минусом (часы телефона и сервера расходятся на секунды), и в клетке
 * сегодняшнего дня стояло «-0».
 */
const cellHours = (hours: number): string =>
  Math.max(0, hours).toLocaleString('ru-RU', { maximumFractionDigits: 1 }).replace(/^-/, '');

export function MonthSchedule(): ReactElement {
  const { m } = useLocale();
  const today = workshopToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);

  const schedule = trpc.shifts.myMonth.useQuery({ year, month });

  const row = schedule.data?.rows[0];
  // Число дней известно и без сервера: сетка месяца рисуется сразу, пока
  // данные грузятся, и не прыгает, когда они приходят.
  const daysInMonth = schedule.data?.daysInMonth ?? new Date(Date.UTC(year, month, 0)).getUTCDate();
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

      {/*
        Сбой — ошибкой, а не пустым месяцем: «смен: 0, часов: 0» на пустой
        сетке читалось как факт, хотя смена 1-го и выходной 12-го были.
        Без текста сервера: служебное «Internal server error» по-английски
        в узбекском интерфейсе ничего не объясняло, а общее «Не удалось
        загрузить» с кнопкой повтора — объясняет.
      */}
      {schedule.isError ? (
        <ErrorState />
      ) : (
        <>
          <View style={styles.week}>
            {WEEKDAYS.map((name) => (
              <Text key={name} style={styles.weekday}>
                {m(name)}
              </Text>
            ))}
          </View>

          {/*
            Пока месяц грузится, сетка уже стоит — числа те же, клеток
            столько же, нет только часов. Прежняя заглушка из трёх полос
            была втрое ниже сетки, и страница прыгала при каждом «‹ ›».
          */}
          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day === null) return <View key={`gap-${index.toString()}`} style={styles.slot} />;

              const hours = hoursByDay.get(day);
              const isOff = daysOff.has(day);
              const isToday = day === today.day && month === today.month && year === today.year;
              const value = hours === undefined ? (isOff ? m('week.dayOffGlyph') : null) : cellHours(hours);

              return (
                <View key={day} style={styles.slot}>
                  <View
                    style={[
                      styles.cell,
                      hours !== undefined ? styles.cellWorked : null,
                      isOff && hours === undefined ? styles.cellOff : null,
                      isToday ? styles.cellToday : null,
                    ]}
                  >
                    <Text style={styles.cellDay}>{day}</Text>
                    {/*
                      Вторая строка — только когда в ней что-то есть. Пустая
                      строка-заглушка поднимала число на 8 точек выше
                      середины клетки, и это было видно по рамке «сегодня».
                    */}
                    {value !== null && <Text style={styles.cellValue}>{value}</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <Text style={styles.legendText}>{m('schedule.legendHours')}</Text>
            <Text style={styles.legendText}>{m('schedule.legendOff')}</Text>
          </View>

          {schedule.isLoading ? (
            <View style={styles.totalPlaceholder} />
          ) : (
            <Text style={styles.total}>
              {m('schedule.total', {
                shifts: row?.shiftsCount ?? 0,
                hours: cellHours(row?.totalHours ?? 0),
              })}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Переключатель месяца «‹ Ноябрь 2026 ›» в шапке карточки.
 *
 * Общий для графика сотрудника и «Кто отдыхает» у руководителя: прежде у
 * второго были свои кнопки 28 × 28 со знаками «‹ ›» из шрифта — мимо них
 * промахивались пальцем, и на одном и том же месте два экрана выглядели
 * по-разному.
 */
export function MonthNav({
  year,
  month,
  onChange,
}: {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly onChange: (year: number, month: number) => void;
}): ReactElement {
  const { m, locale } = useLocale();

  const step = (delta: -1 | 1): void => {
    const next = month + delta;
    if (next < 1) onChange(year - 1, 12);
    else if (next > 12) onChange(year + 1, 1);
    else onChange(year, next);
  };

  return (
    <View style={styles.nav}>
      <NavButton
        icon="back"
        label={m('schedule.prevMonth')}
        onPress={() => {
          step(-1);
        }}
      />

      <Text style={styles.period}>{formatMonthPeriod(year, month, locale)}</Text>

      <NavButton
        icon="chevron"
        label={m('schedule.nextMonth')}
        onPress={() => {
          step(1);
        }}
      />
    </View>
  );
}

/**
 * Кнопка «‹ ›» месяца.
 *
 * Зона нажатия — полные 44 точки, рамка внутри — 32. Было 28 на 28 без
 * запаса: мимо промахивались пальцем, а `hitSlop` в браузере не работает
 * вовсе. Отрицательный отступ со всех сторон оставляет в раскладке только
 * рамку: строка заголовка не растёт, а «‹ Ноябрь 2026 ›» по-прежнему
 * помещается рядом с «Мой график» на узком экране.
 */
function NavButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: 'back' | 'chevron';
  readonly label: string;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.navButton, pressed ? styles.pressed : null]}
    >
      <View style={styles.navFrame}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

/** Видимая рамка кнопки месяца; зона нажатия вокруг неё — до `touchTarget`. */
const NAV_FRAME = 32;
const NAV_TARGET = sizes.touchTarget;

const styles = StyleSheet.create({
  // Без зазора: воздух между рамками и месяцем даёт `minWidth` подписи, и
  // вся навигация занимает те же 160 точек, что и до увеличения кнопок.
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    width: NAV_TARGET,
    height: NAV_TARGET,
    margin: -(NAV_TARGET - NAV_FRAME) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navFrame: {
    width: NAV_FRAME,
    height: NAV_FRAME,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: spacing.xs,
  },
  weekday: {
    ...typography.caption,
    color: colors.textMuted,
    width: COLUMN_WIDTH,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  /*
    Место клетки в сетке и сама клетка — раздельно. Зазор в 2 точки между
    соседними клетками не даёт заливке выходного и рамке «сегодня» слипнуться
    в одно пятно, а седьмая часть ширины остаётся точной.
  */
  slot: {
    width: COLUMN_WIDTH,
    aspectRatio: 1,
    padding: 2,
  },
  cell: {
    flex: 1,
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
    ...typography.caption,
    color: colors.textMuted,
  },
  cellValue: {
    ...typography.footnote,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
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
    // Насыщенность — семейством: вес поверх Medium браузер дорисовывал
    // поддельным жирным, и итог в PWA был мутнее и шире, чем в APK.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  /* Строка итога, пока он не пришёл: та же высота, что у текста. */
  totalPlaceholder: {
    height: typography.body.lineHeight,
    width: '60%',
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

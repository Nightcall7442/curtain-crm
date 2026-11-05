import { terminalPayTypeOf, type TerminalChecksSummary } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, fonts, hairline, spacing, typography } from '../theme';
import { PayTypeBadge } from './PayTypeBadge';

/**
 * Сумма терминальных чеков за день и разбивка по типам оплаты.
 *
 * Заказчик (05.11) обвёл место под «День»: там должна стоять общая сумма.
 * Разбивка — чтобы вечером сверить с Click, Payme и банком без калькулятора.
 */
export function TerminalDaySummary({
  summary,
  title,
}: {
  readonly summary: TerminalChecksSummary;
  /** «Итого за день» или «Итого за сегодня». */
  readonly title: string;
}): ReactElement {
  const { m, money } = useLocale();

  return (
    <View style={styles.host}>
      <View style={styles.totalRow}>
        <View style={styles.totalText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.count}>{m('terminal.checks', { n: summary.count })}</Text>
        </View>
        <Text style={styles.total}>{money(summary.total)}</Text>
      </View>
      {summary.byType.map((line) => (
        <View key={line.payType ?? 'none'} style={styles.line}>
          {/*
            Значок — в ячейке одной ширины на всех строках: «× N» шёл сразу
            за значком, и у click, payme и «Наличные» начинался в трёх разных
            местах — столбец счётчиков ломался лесенкой на полсотни точек.
          */}
          <View style={styles.typeCell}>
            {terminalPayTypeOf(line.payType) === null ? (
              <Text style={styles.noType}>{m('terminal.noType')}</Text>
            ) : (
              <PayTypeBadge type={line.payType} />
            )}
          </View>
          <Text style={styles.lineCount}>× {line.count}</Text>
          <Text style={styles.lineAmount}>{money(line.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Ширина ячейки значка — по самому широкому из них, «Наличные» с купюрой
 * (около 90 точек). Значок короче остаётся у левого края ячейки.
 */
const TYPE_CELL_WIDTH = 96;

const styles = StyleSheet.create({
  host: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  totalText: {
    flexShrink: 1,
  },
  /*
    Заголовок блока — главнее счётчика под ним. Было наоборот: «Итого за
    день» мелкой сноской, а «чеков: 3» под ним крупнее и темнее, и подпись
    читалась примечанием к числу чеков.
  */
  title: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  count: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  total: {
    ...typography.title,
    color: colors.textPrimary,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // `minWidth`, а не `width`: значок шире ячейки (новый тип, крупный шрифт
  // в системе) сдвинет «× N», но не наедет на него.
  typeCell: {
    minWidth: TYPE_CELL_WIDTH,
    alignItems: 'flex-start',
  },
  noType: {
    ...typography.caption,
    color: colors.textMuted,
  },
  lineCount: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  // Вес — семейством: `fontWeight` поверх Medium из `body` браузер рисует
  // дорисованным жирным, а Android не применяет вовсе.
  lineAmount: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

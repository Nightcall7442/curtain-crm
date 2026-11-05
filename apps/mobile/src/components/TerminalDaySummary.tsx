import type { TerminalChecksSummary } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, hairline, spacing, typography } from '../theme';
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
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.count}>{m('terminal.checks', { n: summary.count })}</Text>
        </View>
        <Text style={styles.total}>{money(summary.total)}</Text>
      </View>
      {summary.byType.map((line) => (
        <View key={line.payType ?? 'none'} style={styles.line}>
          {line.payType === null ? (
            <Text style={styles.noType}>{m('terminal.noType')}</Text>
          ) : (
            <PayTypeBadge type={line.payType} />
          )}
          <Text style={styles.lineCount}>× {line.count}</Text>
          <Text style={styles.lineAmount}>{money(line.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

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
    paddingBottom: spacing.xs,
  },
  title: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
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
  noType: {
    ...typography.caption,
    color: colors.textMuted,
  },
  lineCount: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  lineAmount: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

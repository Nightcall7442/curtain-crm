import { formatMoney, parseMoney } from '@curtain-crm/shared';
import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, spacing, typography } from '../theme';

import { Card, CardTitle, Empty, Progress } from './Card';

/**
 * Зарплата за период.
 *
 * «Целевая» — сумма, которую даёт схема при стопроцентном выполнении плана;
 * она берётся из СНИМКА схемы, сохранённого в расчёте, а не из текущих
 * настроек: иначе повышение ставки задним числом переписывало бы прошлые
 * месяцы прямо на экране сотрудника.
 *
 * Для схем без KPI (оклад, почасовая, процент) шкала выполнения не
 * показывается — выполнять там нечего.
 */
export function KpiCard({
  periodLabel,
  targetAmount,
  calculatedAmount,
  kpiPercent,
  isLoading,
}: {
  readonly periodLabel: string;
  /** Строка `numeric` из снимка схемы либо `null`, если схема без KPI. */
  readonly targetAmount: string | null;
  readonly calculatedAmount: string | null;
  readonly kpiPercent: string | null;
  readonly isLoading: boolean;
}): ReactElement {
  const percent = kpiPercent === null ? null : Number.parseFloat(kpiPercent);

  return (
    <Card style={styles.card}>
      <CardTitle
        title="Зарплата"
        icon="payroll"
        action={<Text style={styles.period}>{periodLabel}</Text>}
      />

      {isLoading ? (
        <Empty message="Загружаем расчёт…" />
      ) : calculatedAmount === null ? (
        <Empty
          message="Расчёта за этот месяц пока нет"
          hint="Он появится после того, как руководство проведёт начисление"
        />
      ) : (
        <>
          {targetAmount !== null && (
            <>
              <Text style={styles.label}>Целевая зарплата</Text>
              <Text style={styles.amountMuted}>
                {formatMoney(parseMoney(targetAmount))}
              </Text>
            </>
          )}

          {percent !== null && (
            <View style={styles.kpiBlock}>
              <Text style={styles.label}>Выполнено KPI</Text>
              <Text
                style={[
                  styles.percent,
                  { color: percent >= 100 ? colors.positive : colors.warning },
                ]}
              >
                {`${percent.toFixed(0)}%`}
              </Text>
              <Progress
                percent={percent}
                color={percent >= 100 ? colors.positive : colors.warning}
              />
            </View>
          )}

          <View style={styles.totalBlock}>
            <Text style={styles.label}>Начислено</Text>
            <Text style={styles.amount}>{formatMoney(parseMoney(calculatedAmount))}</Text>
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  period: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  amountMuted: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  kpiBlock: {
    marginTop: spacing.md,
  },
  percent: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  totalBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
  },
});

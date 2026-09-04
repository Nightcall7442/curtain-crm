import { formatMoney, parseMoney } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

import { Card, CardTitle, Empty, Progress } from './Card';
import { Icon } from './Icon';

/**
 * Чем закрыта сумма, пока её не открыли.
 *
 * Длина примерно равна длине настоящей суммы: с более короткой маской
 * карточка заметно дёргается в момент открытия.
 */
const MASKED_AMOUNT = '••• ••• сум';

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

  /*
    Суммы закрыты, пока сотрудник сам их не откроет.

    Зарплату смотрят в цеху и в транспорте, где экран видит сосед, а
    «сколько ты получаешь» — разговор, который человек заводит сам или не
    заводит вовсе. Это не пароль: прятать сумму от владельца телефона
    бессмысленно. Это заслонка от чужого взгляда, и снимается она одним
    нажатием.

    Состояние живёт в компоненте и сбрасывается при уходе с экрана — иначе
    однажды открытая сумма осталась бы видимой до перезапуска приложения.
  */
  const [revealed, setRevealed] = useState(false);

  const money = (value: string): string =>
    revealed ? formatMoney(parseMoney(value)) : MASKED_AMOUNT;

  return (
    <Card style={styles.card}>
      <CardTitle
        title="Зарплата"
        icon="payroll"
        action={
          <View style={styles.titleAction}>
            <Text style={styles.period}>{periodLabel}</Text>
            {calculatedAmount !== null && (
              <Pressable
                onPress={() => {
                  setRevealed((current) => !current);
                }}
                accessibilityRole="button"
                accessibilityLabel={revealed ? 'Скрыть зарплату' : 'Показать зарплату'}
                hitSlop={12}
                style={({ pressed }) => (pressed ? styles.eyePressed : null)}
              >
                <Icon
                  name={revealed ? 'eyeOff' : 'eye'}
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        }
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
              <Text style={styles.amountMuted}>{money(targetAmount)}</Text>
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
            <Text style={styles.amount}>{money(calculatedAmount)}</Text>
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
  titleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyePressed: {
    opacity: 0.6,
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

import {
  formatMoney,
  parseMoney,
  PAYROLL_RECORD_STATUS_LABELS,
  ROLE_LABELS,
  type PayrollRecordStatus,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Input } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Ведомость за месяц: утвердить расчёт и отметить выплату.
 *
 * Раньше сотрудник получал уведомление о зарплате и подтверждал получение
 * прямо в приложении, а сам расчёт директор мог утвердить только в панели.
 * Круг замыкался наполовину: половина разговора о деньгах шла в телефоне,
 * половина — за столом.
 *
 * Пересчёт (`payroll.calculate`) сюда не вынесен намеренно. Это операция
 * по всей ведомости сразу, с разбором ошибок по каждому сотруднику —
 * работа для большого экрана, а не для очереди в цеху. Здесь только
 * решения по уже посчитанному.
 *
 * Сумма выплаты может отличаться от расчётной: аванс, удержание, округление
 * до купюр. Поле необязательное — пустое значит «выплачено как посчитано».
 */
export function PayrollApprovalsScreen(): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  /** Запись, которой отмечают выплату. `null` — никакая. */
  const [paying, setPaying] = useState<number | null>(null);
  const [amount, setAmount] = useState('');

  const query = trpc.payroll.list.useQuery(period);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.payroll.list.invalidate(),
      utils.payroll.my.invalidate(),
      utils.notifications.list.invalidate(),
    ]);
  };

  const approve = trpc.payroll.approve.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось утвердить', error.message);
    },
  });

  const markPaid = trpc.payroll.markPaid.useMutation({
    async onSuccess() {
      notifySuccess();
      setPaying(null);
      setAmount('');
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить выплату', error.message);
    },
  });

  if (query.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={query.error.message} />
      </View>
    );
  }

  if (query.data === undefined) {
    return (
      <View style={styles.content}>
        <Card>
          <Skeleton />
        </Card>
      </View>
    );
  }

  if (query.data.items.length === 0) {
    return (
      <View style={styles.content}>
        <Card>
          <Empty
            message="За этот месяц расчёта нет"
            hint="Начисление делается в панели, здесь — только утверждение и выплата"
          />
        </Card>
      </View>
    );
  }

  const isBusy = approve.isPending || markPaid.isPending;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {query.data.items.map((row) => (
        <Card key={row.id}>
          <CardTitle
            title={row.userFullName}
            icon="person"
            action={
              <Pill
                text={t(PAYROLL_RECORD_STATUS_LABELS, row.status)}
                tone={toneOf(row.status)}
              />
            }
          />

          <Text style={styles.role}>{t(ROLE_LABELS, row.role)}</Text>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Начислено</Text>
            <Text style={styles.amountValue}>
              {formatMoney(parseMoney(row.calculatedAmount))}
            </Text>
          </View>

          {row.paidAmount !== null && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Выплачено</Text>
              <Text style={styles.amountValue}>{formatMoney(parseMoney(row.paidAmount))}</Text>
            </View>
          )}

          {/*
            Подтверждение получения приходит от самого сотрудника — он
            нажимает его в уведомлении. Директору важно видеть здесь, что
            деньги реально дошли, а не только что он их отметил.
          */}
          {row.receiptConfirmedAt !== null && (
            <Text style={styles.confirmed}>Сотрудник подтвердил получение</Text>
          )}

          {row.comment !== null && <Text style={styles.comment}>{row.comment}</Text>}

          {row.status === 'draft' && (
            <Pressable
              onPress={() => {
                approve.mutate({ id: row.id });
              }}
              disabled={isBusy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              {approve.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Утвердить расчёт</Text>
              )}
            </Pressable>
          )}

          {row.status === 'approved' && paying !== row.id && (
            <Pressable
              onPress={() => {
                setPaying(row.id);
                setAmount('');
              }}
              disabled={isBusy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.buttonPrimaryText}>Отметить выплату</Text>
            </Pressable>
          )}

          {paying === row.id && (
            <View style={styles.payBox}>
              <Text style={styles.payLabel}>
                {`Сколько выдали, сум — пусто значит «${formatMoney(
                  parseMoney(row.calculatedAmount),
                )}»`}
              </Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder={Number.parseFloat(row.calculatedAmount).toString()}
                keyboardType="numeric"
                autoFocus
              />

              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    setPaying(null);
                    setAmount('');
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonFlex,
                    styles.buttonGhost,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Text style={styles.buttonGhostText}>Отмена</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const typed = Number.parseFloat(amount.replace(',', '.'));
                    markPaid.mutate({
                      id: row.id,
                      ...(Number.isFinite(typed) && typed > 0 ? { paidAmount: typed } : {}),
                    });
                  }}
                  disabled={isBusy}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonFlex,
                    styles.buttonPrimary,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  {markPaid.isPending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.buttonPrimaryText}>Выплачено</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

function toneOf(status: PayrollRecordStatus): 'positive' | 'info' | 'neutral' {
  if (status === 'paid') return 'positive';
  if (status === 'approved') return 'info';
  return 'neutral';
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  role: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  amountLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  amountValue: {
    ...typography.value,
    color: colors.textPrimary,
  },
  confirmed: {
    ...typography.caption,
    color: colors.positive,
    marginTop: spacing.sm,
  },
  comment: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  buttonFlex: {
    flex: 1,
    marginTop: 0,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: opacity.pressed,
  },
  buttonPrimaryText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  buttonGhostText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  payBox: {
    marginTop: spacing.md,
  },
  payLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});

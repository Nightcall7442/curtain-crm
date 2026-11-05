import {
  formatMonthPeriod,
  groupDigits,
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Pill, SectionHeader, Skeleton } from '../components/Card';
import { MoneyInput } from '../components/Field';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

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
  const { t, m, money, locale } = useLocale();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();
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
      Alert.alert(m('payroll.approveError'), error.message);
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
      Alert.alert(m('payroll.payError'), error.message);
    },
  });

  const isBusy = approve.isPending || markPaid.isPending;

  /*
    Месяц — словами над списком. Ведомость всегда за текущий месяц, но
    экран нигде этого не говорил: «Начислено 4 250 000 сум» читалось без
    периода, а «За этот месяц расчёта нет» не называло месяца.
  */
  const periodLabel = formatMonthPeriod(period.year, period.month, locale);

  /*
    Загрузка, пусто и ошибка — внутри того же прокручиваемого списка, что и
    ведомость: жест обновления работает в любом состоянии, а ошибка — свой
    локализованный текст с кнопкой «Повторить», а не ответ сервера как есть
    («Internal server error» по-английски) в тупике без выхода.
  */
  return (
    <ScrollView
      /*
        Снизу — обычный отступ и безопасная зона, а не место под панель
        вкладок: ведомость открыта поверх вкладок, панели под ней нет, и
        прежний отступ оставлял под последней карточкой 114 точек пустоты.
      */
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <SectionHeader title={periodLabel} />
      <View style={styles.list}>
        {query.isError ? (
          <Card>
            <ErrorState />
          </Card>
        ) : query.data === undefined ? (
          <Card>
            <Skeleton />
          </Card>
        ) : query.data.items.length === 0 ? (
          <Card>
            <Empty message={m('payroll.none')} hint={m('payroll.noneHint')} />
          </Card>
        ) : (
          query.data.items.map((row) => (
            <Card key={row.id}>
              <CardTitle
                title={row.userFullName}
                icon="person"
                action={
                  <Pill text={t(PAYROLL_RECORD_STATUS_LABELS, row.status)} tone={toneOf(row.status)} />
                }
              />

              <Text style={styles.role}>{t(ROLE_LABELS, row.role)}</Text>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>{m('payroll.accrued')}</Text>
                <Text style={styles.amountValue}>{money(parseMoney(row.calculatedAmount))}</Text>
              </View>

              {row.paidAmount !== null && parseMoney(row.paidAmount) > 0 && (
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>{m('payroll.paid')}</Text>
                  <Text style={styles.amountValue}>{money(parseMoney(row.paidAmount))}</Text>
                </View>
              )}

              {/* Выплата частями: пока есть остаток, он виден отдельной строкой. */}
              {row.status === 'approved' && parseMoney(row.paidAmount ?? '0') > 0 && (
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>{m('payroll.remaining')}</Text>
                  <Text style={styles.amountValue}>
                    {money(parseMoney(row.calculatedAmount) - parseMoney(row.paidAmount ?? '0'))}
                  </Text>
                </View>
              )}

              {/*
                Подтверждение получения приходит от самого сотрудника — он
                нажимает его в уведомлении. Директору важно видеть здесь, что
                деньги реально дошли, а не только что он их отметил.
              */}
              {row.receiptConfirmedAt !== null && (
                <Text style={styles.confirmed}>{m('payroll.confirmed')}</Text>
              )}

              {row.comment !== null && <Text style={styles.comment}>{row.comment}</Text>}

              {/*
                Залитая кнопка в карточке одна — та, что двигает деньги. Две
                одинаковые зелёные «Утвердить расчёт» и «Отметить выплату»
                друг под другом не говорили, какая из них главная; утверждение
                — шаг перед выплатой, и выглядит оно второстепенным.
              */}
              {row.status === 'draft' && (
                <Pressable
                  onPress={() => {
                    approve.mutate({ id: row.id });
                  }}
                  disabled={isBusy}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonSecondary,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  {approve.isPending ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Text style={styles.buttonSecondaryText}>{m('payroll.approve')}</Text>
                  )}
                </Pressable>
              )}

              {/* Выплата и из черновика: она сама его утверждает — ежедневный расчёт в одну кнопку. */}
              {row.status !== 'paid' && paying !== row.id && (
                <SubmitButton
                  label={m('payroll.markPaid')}
                  disabled={isBusy}
                  onPress={() => {
                    setPaying(row.id);
                    setAmount('');
                  }}
                />
              )}

              {paying === row.id && (
                <View style={styles.payBox}>
                  <Text style={styles.payLabel}>
                    {m('payroll.amountLabel', {
                      amount: money(
                        parseMoney(row.calculatedAmount) - parseMoney(row.paidAmount ?? '0'),
                      ),
                    })}
                  </Text>
                  <MoneyInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder={groupDigits(
                      (
                        (parseMoney(row.calculatedAmount) - parseMoney(row.paidAmount ?? '0')) /
                        100
                      ).toString(),
                    )}
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
                      <Text style={styles.buttonGhostText}>{m('common.cancel')}</Text>
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
                        <Text style={styles.buttonPrimaryText}>{m('payroll.paidBtn')}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function toneOf(status: PayrollRecordStatus): 'positive' | 'info' | 'neutral' {
  if (status === 'paid') return 'positive';
  if (status === 'approved') return 'info';
  return 'neutral';
}

/*
  Кнопки — той же высоты и формы, что общая `SubmitButton` (48, таблетка):
  в одном денежном потоке рядом жили 52, 48, 46 и 44 точки и два разных
  скругления.
*/
const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
  },
  list: {
    gap: spacing.lg,
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
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
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
  buttonSecondary: {
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  buttonGhost: {
    borderWidth: hairline,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: opacity.pressed,
  },
  buttonPrimaryText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
  },
  buttonSecondaryText: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
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

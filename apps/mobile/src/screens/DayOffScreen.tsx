import { DAY_OFF_STATUS_LABELS, DayOffStatus, formatIsoDateShort } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Запрос на выходные.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену,
 * руководитель (директор или админ) одобряет или отклоняет — на своей
 * стороне, в веб-панели или здесь же, в мобилке, если у него есть телефон
 * под рукой. Экран собирает и форму нового запроса, и историю своих —
 * искать статус решения на отдельном экране незачем.
 *
 * Даты — свободным текстом `2026-09-15`, тем же форматом, что и срок заказа:
 * своего календаря-пикера в приложении нет ни у одной формы, и заводить его
 * ради одного поля значило бы разойтись с остальными.
 */
export function DayOffScreen(): ReactElement {
  const { t } = useLocale();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const myRequests = trpc.dayOff.my.useQuery();

  const request = trpc.dayOff.request.useMutation({
    async onSuccess() {
      await myRequests.refetch();
      setStartDate('');
      setEndDate('');
      setReason('');
      setShowErrors(false);
    },
    onError(error) {
      Alert.alert('Не удалось отправить запрос', error.message);
    },
  });

  const cancel = trpc.dayOff.cancel.useMutation({
    onSuccess() {
      void myRequests.refetch();
    },
    onError(error) {
      Alert.alert('Не удалось отозвать запрос', error.message);
    },
  });

  const errors = validate({ startDate, endDate });
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    request.mutate({
      startDate: startDate.trim(),
      endDate: endDate.trim(),
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
  };

  const confirmCancel = (id: number, period: string): void => {
    Alert.alert(`Отозвать запрос на ${period}?`, 'Руководитель больше не увидит его в очереди на решение.', [
      { text: 'Не отзывать', style: 'cancel' },
      {
        text: 'Отозвать',
        style: 'destructive',
        onPress: () => {
          cancel.mutate({ id });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle title="Новый запрос" icon="calendar" />

          <View style={styles.dates}>
            <View style={styles.dateItem}>
              <Field label="С" required error={showErrors ? errors.startDate : undefined}>
                <Input
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-09-15"
                  keyboardType="numbers-and-punctuation"
                  invalid={showErrors && errors.startDate !== undefined}
                />
              </Field>
            </View>
            <View style={styles.dateItem}>
              <Field label="По" required error={showErrors ? errors.endDate : undefined}>
                <Input
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2026-09-16"
                  keyboardType="numbers-and-punctuation"
                  invalid={showErrors && errors.endDate !== undefined}
                />
              </Field>
            </View>
          </View>

          <Field label="Причина" hint="Не обязательно">
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="Например: семейные обстоятельства"
              multiline
            />
          </Field>

          <Pressable
            onPress={submit}
            disabled={request.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submit,
              request.isPending ? styles.submitBusy : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {request.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.submitText}>Отправить запрос</Text>
            )}
          </Pressable>
        </Card>

        <Card>
          <CardTitle title="Мои запросы" icon="calendar" />

          {myRequests.isLoading ? (
            <Skeleton />
          ) : myRequests.isError ? (
            <ErrorState />
          ) : (myRequests.data ?? []).length === 0 ? (
            <Empty message="Запросов пока нет" />
          ) : (
            (myRequests.data ?? []).map((item) => {
              const period = formatPeriod(item.startDate, item.endDate);

              return (
                <View key={item.id} style={styles.requestRow}>
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestPeriod}>{period}</Text>
                    <Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={statusTone(item.status)} />
                  </View>

                  {item.reason !== null && <Text style={styles.requestNote}>{item.reason}</Text>}
                  {item.rejectionReason !== null && (
                    <Text style={styles.requestRejection}>{`Причина отказа: ${item.rejectionReason}`}</Text>
                  )}

                  {item.status === DayOffStatus.PENDING && (
                    <Pressable
                      onPress={() => {
                        confirmCancel(item.id, period);
                      }}
                      accessibilityRole="button"
                      hitSlop={8}
                      disabled={cancel.isPending}
                    >
                      <Text style={styles.cancelLink}>Отозвать</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */

function formatPeriod(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatIsoDateShort(startDate);
  return `${formatIsoDateShort(startDate)} – ${formatIsoDateShort(endDate)}`;
}

function statusTone(status: DayOffStatus): 'neutral' | 'positive' | 'warning' | 'danger' {
  switch (status) {
    case DayOffStatus.APPROVED:
      return 'positive';
    case DayOffStatus.REJECTED:
      return 'danger';
    case DayOffStatus.CANCELLED:
      return 'neutral';
    default:
      return 'warning';
  }
}

/**
 * Проверка формы.
 *
 * Дублирует часть серверных правил намеренно — та же логика, что у срока
 * заказа: подсказать до отправки дешевле, чем показать отказ после запроса.
 */
function validate(values: {
  readonly startDate: string;
  readonly endDate: string;
}): Partial<Record<'startDate' | 'endDate', string>> {
  const errors: Record<string, string> = {};
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(values.startDate.trim())) {
    errors['startDate'] = 'Дата в виде 2026-09-15';
  }
  if (!datePattern.test(values.endDate.trim())) {
    errors['endDate'] = 'Дата в виде 2026-09-15';
  }
  if (
    errors['startDate'] === undefined &&
    errors['endDate'] === undefined &&
    values.endDate.trim() < values.startDate.trim()
  ) {
    errors['endDate'] = 'Конец раньше начала';
  }

  return errors;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  dates: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateItem: {
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  submit: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBusy: {
    opacity: opacity.disabled,
  },
  submitText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
  requestRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  requestPeriod: {
    ...typography.value,
    color: colors.textPrimary,
  },
  requestNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  requestRejection: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  cancelLink: {
    ...typography.footnote,
    color: colors.danger,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});

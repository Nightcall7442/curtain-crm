import {
  DAY_OFF_STATUS_LABELS,
  formatIsoDate,
  type DayOffStatus,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Input } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Заявки на отгул: одобрить или отклонить.
 *
 * Решение по отгулу — самое «телефонное» из всего, что делает директор:
 * человек подходит и просит, ответ нужен здесь и сейчас. До этого экрана
 * ответить можно было только из веб-панели, то есть вернувшись к столу.
 *
 * Показываются все заявки, а не только ждущие: директор приходит сюда и
 * с вопросом «а что я решил на той неделе». Ждущие идут первыми — так их
 * упорядочивает сервер.
 *
 * Причина отказа обязательна и вводится прямо в карточке, а не в
 * `Alert.prompt`: тот есть только на iOS, и на Android отказ молча
 * не работал бы.
 */
export function DayOffApprovalsScreen(): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  /** Заявка, которой пишут причину отказа. `null` — никому. */
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const query = trpc.dayOff.list.useQuery({});

  const refresh = async (): Promise<void> => {
    await Promise.all([utils.dayOff.list.invalidate(), utils.notifications.list.invalidate()]);
  };

  const approve = trpc.dayOff.approve.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось одобрить', error.message);
    },
  });

  const reject = trpc.dayOff.reject.useMutation({
    async onSuccess() {
      notifySuccess();
      setRejecting(null);
      setReason('');
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отклонить', error.message);
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
          <Empty message="Заявок нет" hint="Здесь появятся просьбы об отгуле" />
        </Card>
      </View>
    );
  }

  const isBusy = approve.isPending || reject.isPending;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {query.data.items.map((item) => {
        const isPending = item.status === 'pending';

        return (
          <Card key={item.id}>
            <CardTitle
              title={item.requester.fullName}
              icon="person"
              action={<Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={toneOf(item.status)} />}
            />

            <Text style={styles.dates}>
              {item.startDate === item.endDate
                ? formatIsoDate(item.startDate)
                : `${formatIsoDate(item.startDate)} — ${formatIsoDate(item.endDate)}`}
            </Text>

            {item.reason !== null && <Text style={styles.reason}>{item.reason}</Text>}

            {item.rejectionReason !== null && (
              <Text style={styles.decision}>
                {`Причина отказа: ${item.rejectionReason}`}
              </Text>
            )}

            {isPending && rejecting !== item.id && (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    setRejecting(item.id);
                    setReason('');
                  }}
                  disabled={isBusy}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonGhost,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Text style={styles.buttonGhostText}>Отклонить</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    approve.mutate({ id: item.id });
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
                    <Text style={styles.buttonPrimaryText}>Одобрить</Text>
                  )}
                </Pressable>
              </View>
            )}

            {rejecting === item.id && (
              <View style={styles.rejectBox}>
                <Text style={styles.rejectLabel}>Почему отказ</Text>
                <Input
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Сотрудник должен понять причину"
                  multiline
                  autoFocus
                />

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => {
                      setRejecting(null);
                      setReason('');
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonGhost,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.buttonGhostText}>Отмена</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      reject.mutate({ id: item.id, reason: reason.trim() });
                    }}
                    disabled={reason.trim().length === 0 || isBusy}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonDanger,
                      reason.trim().length === 0 ? styles.buttonOff : null,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    {reject.isPending ? (
                      <ActivityIndicator color={colors.onAccent} size="small" />
                    ) : (
                      <Text style={styles.buttonPrimaryText}>Отклонить</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function toneOf(status: DayOffStatus): 'positive' | 'danger' | 'neutral' {
  if (status === 'approved') return 'positive';
  if (status === 'rejected') return 'danger';
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
  dates: {
    ...typography.value,
    color: colors.textPrimary,
  },
  type: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  decision: {
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
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonOff: {
    opacity: 0.4,
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
  rejectBox: {
    marginTop: spacing.md,
  },
  rejectLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});

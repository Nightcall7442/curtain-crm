import {
  DAY_OFF_STATUS_LABELS,
  DayOffStatus,
  formatIsoDateShort,
  type DayOffStatus as DayOffStatusName,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { TeamDaysOff } from '../components/TeamDaysOff';
import { Input } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';

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
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();
  /* Снизу — безопасная зона и обычный отступ, а не место под панель
     вкладок: это экран стека, панели под ним нет. */
  const contentStyle = [styles.content, { paddingBottom: spacing.xl + insets.bottom }];

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
      Alert.alert(m('approvals.approveError'), error.message);
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
      Alert.alert(m('approvals.rejectError'), error.message);
    },
  });

  const isBusy = approve.isPending || reject.isPending;

  /*
    Сбой и загрузка — внутри своей карточки, а не вместо всего экрана.

    Прежде при обрыве связи экран целиком заменялся надписью по центру:
    пропадал и график «Кто отдыхает», который грузится отдельно и мог быть
    цел, а текстом шёл служебный ответ сервера, порой по-английски.
  */
  return (
    <ScrollView contentContainerStyle={contentStyle}>
      <TeamDaysOff />

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
          <Empty message={m('approvals.none')} hint={m('approvals.noneHint')} />
        </Card>
      ) : null}

      {(query.data?.items ?? []).map((item) => {
        const isPending = item.status === DayOffStatus.PENDING;

        return (
          <Card key={item.id}>
            <CardTitle
              title={item.requester.fullName}
              icon="person"
              action={
                <Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={toneOf(item.status)} />
              }
            />

            <Text style={styles.dates}>{formatPeriod(item.startDate, item.endDate)}</Text>

            {item.reason !== null && <Text style={styles.reason}>{item.reason}</Text>}

            {item.rejectionReason !== null && (
              <Text style={styles.decision}>
                {m('dayoff.rejection', { reason: item.rejectionReason })}
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
                  <Text style={styles.buttonGhostText}>{m('approvals.reject')}</Text>
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
                    <Text style={styles.buttonPrimaryText}>{m('approvals.approve')}</Text>
                  )}
                </Pressable>
              </View>
            )}

            {rejecting === item.id && (
              <View style={styles.rejectBox}>
                <Text style={styles.rejectLabel}>{m('approvals.why')}</Text>
                <Input
                  value={reason}
                  onChangeText={setReason}
                  placeholder={m('approvals.whyPlaceholder')}
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
                    <Text style={styles.buttonGhostText}>{m('common.cancel')}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      reject.mutate({ id: item.id, reason: reason.trim() });
                    }}
                    disabled={reason.trim().length === 0 || isBusy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: reason.trim().length === 0 || isBusy, busy: reject.isPending }}
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
                      <Text style={styles.buttonPrimaryText}>{m('approvals.reject')}</Text>
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

/*
  Период и тон статуса — те же, что у сотрудника в «Моих запросах»
  (`DayOffScreen`).

  Прежде одна и та же заявка выглядела на двух экранах по-разному: у
  сотрудника «Ждёт решения» янтарная, у директора — серая, того же цвета,
  что и «Отозван», и заявка, ждущая решения, сливалась с закрытыми; даты —
  «18.11 – 19.11» там и «18.11.2026 — 19.11.2026» здесь.
*/
function formatPeriod(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatIsoDateShort(startDate);
  return `${formatIsoDateShort(startDate)} – ${formatIsoDateShort(endDate)}`;
}

function toneOf(status: DayOffStatusName): 'neutral' | 'positive' | 'warning' | 'danger' {
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

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  dates: {
    ...typography.value,
    color: colors.textPrimary,
  },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  decision: {
    ...typography.caption,
    // Причина отказа — терракотой, как у сотрудника: это отказ, а не сноска.
    color: colors.danger,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  /*
    Кнопки — общей системы приложения (`SubmitButton`): высота кнопки
    действия, таблетка, подпись основным кеглем жирным начертанием. Своя
    здесь только пара в ряд и цвет «Отклонить» — общая кнопка не умеет ни
    того, ни другого. Было скругление 14 и полужирный — рядом с таблетками
    соседних экранов кнопки выглядели взятыми из другого набора.
  */
  button: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
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
  // Одна прозрачность «недоступно» на всё приложение — как у `SubmitButton`.
  buttonOff: {
    opacity: opacity.disabled,
  },
  buttonPressed: {
    opacity: opacity.pressed,
  },
  buttonPrimaryText: {
    ...typography.body,
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  buttonGhostText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
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

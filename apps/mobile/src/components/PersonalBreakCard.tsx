import { PERSONAL_BREAK_DURATION_OPTIONS } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Pill } from './Card';

/**
 * Личная отлучка — сотрудник ненадолго отходит по своим делам, не закрывая
 * смену. Заявляет срок сам, потолок общий для всех (тридцать минут),
 * возврат отмечает тем же жестом, каким отлучку начинал.
 *
 * Показывается только при открытой смене — карточка сама решает, рисовать
 * ли себя, и родительский экран (`CheckInOutScreen`) её всегда монтирует;
 * так экрану не нужно знать про состояние отлучки, только про смену.
 */
export function PersonalBreakCard({
  shiftOpen,
}: {
  readonly shiftOpen: boolean;
}): ReactElement | null {
  const current = trpc.shifts.currentBreak.useQuery(undefined, { enabled: shiftOpen });

  const startBreak = trpc.shifts.startBreak.useMutation({
    async onSuccess() {
      notifySuccess();
      await current.refetch();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось начать отлучку', error.message);
    },
  });

  const endBreak = trpc.shifts.endBreak.useMutation({
    async onSuccess() {
      notifySuccess();
      await current.refetch();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить возвращение', error.message);
    },
  });

  const active = current.data ?? null;

  // Тикает раз в секунду, только пока отлучка открыта — на минуту, а не на
  // сутки, поэтому секунды здесь читаемы и не выглядят лишней точностью.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (active === null) return undefined;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!shiftOpen || current.isLoading) return null;

  if (active === null) {
    return (
      <Card>
        <CardTitle title="Личная отлучка" icon="deadline" />
        <Text style={styles.hint}>
          Отходите по своим делам — выберите срок, и коллеги увидят, когда вас ждать
        </Text>
        <View style={styles.chips}>
          {PERSONAL_BREAK_DURATION_OPTIONS.map((minutes) => (
            <Pressable
              key={minutes}
              onPress={() => {
                startBreak.mutate({ plannedMinutes: minutes });
              }}
              disabled={startBreak.isPending}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
            >
              <Text style={styles.chipText}>{`${minutes.toString()} мин`}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    );
  }

  const startedAt = new Date(active.startedAt).getTime();
  const expectedReturn = startedAt + active.plannedMinutes * 60_000;
  const overdue = now > expectedReturn;
  const remainingSeconds = Math.max(0, Math.round((expectedReturn - now) / 1000));
  const overdueSeconds = Math.max(0, Math.round((now - expectedReturn) / 1000));

  return (
    <Card>
      <CardTitle
        title="Личная отлучка"
        icon="deadline"
        action={<Pill text={overdue ? 'Просрочено' : 'В отлучке'} tone={overdue ? 'danger' : 'warning'} />}
      />

      <Text style={[styles.timer, overdue ? styles.timerOverdue : null]}>
        {overdue ? `−${formatDuration(overdueSeconds)}` : formatDuration(remainingSeconds)}
      </Text>
      <Text style={styles.hint}>
        {overdue
          ? 'Заявленное время вышло — отметьте возвращение'
          : `Вернуться до ${new Date(expectedReturn).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
      </Text>

      <Pressable
        onPress={() => {
          endBreak.mutate();
        }}
        disabled={endBreak.isPending}
        accessibilityRole="button"
        style={({ pressed }) => [styles.returnButton, pressed ? styles.pressed : null]}
      >
        {endBreak.isPending ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.returnButtonText}>Я вернулся</Text>
        )}
      </Pressable>
    </Card>
  );
}

/** `05:41` для отсчёта в пределах часа — отлучка дольше часа не бывает. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  timer: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  timerOverdue: {
    color: colors.danger,
  },
  returnButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  returnButtonText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
});

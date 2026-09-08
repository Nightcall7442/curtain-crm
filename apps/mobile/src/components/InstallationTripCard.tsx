import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocation } from '../hooks/useLocation';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Pill } from './Card';

/**
 * Выезд на установку: сотрудник уходит с объекта работы, но не с работы.
 *
 * Раньше выбор был из двух: закрыть смену — и заново открывать её потом, —
 * или не отмечаться вовсе, и тогда человек числится в цеху, где его нет.
 * Смена остаётся открытой, но рабочее время встаёт на паузу и продолжается
 * с того же места по возвращении; руководитель видит в явке «на установке».
 *
 * Часы выезда не идут в почасовую оплату намеренно: установка оплачивается
 * сдельной расценкой за этап, и засчитать её ещё и часами значило бы
 * заплатить дважды.
 *
 * От личной отлучки отличается тем, что срока нет и просрочки нет: в
 * тревоги на главной выезд не попадает.
 *
 * Координаты обязательны на обоих концах — так просил владелец. Радиусом
 * цеха выезд не проверяется: из цеха как раз уезжают.
 */
export function InstallationTripCard({
  shiftOpen,
}: {
  readonly shiftOpen: boolean;
}): ReactElement | null {
  const current = trpc.shifts.currentTrip.useQuery(undefined, { enabled: shiftOpen });
  const { requestPosition, isRequesting, error: locationError } = useLocation();
  const utils = trpc.useUtils();

  /* Кольцо таймера берёт паузу из `shifts.current`: без обновления этого
     запроса время на экране продолжало бы идти после нажатия кнопки. */
  const refresh = async (): Promise<void> => {
    await Promise.all([current.refetch(), utils.shifts.current.invalidate()]);
  };

  const startTrip = trpc.shifts.startTrip.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить выезд', error.message);
    },
  });

  const endTrip = trpc.shifts.endTrip.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить возвращение', error.message);
    },
  });

  const active = current.data ?? null;

  // Тикает раз в минуту: выезд длится часами, и секунды в нём — ложная
  // точность, из-за которой экран перерисовывался бы весь день.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (active === null) return undefined;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!shiftOpen || current.isLoading) return null;

  const busy = isRequesting || startTrip.isPending || endTrip.isPending;

  const withPosition = (send: (position: { latitude: number; longitude: number }) => void): void => {
    void (async () => {
      const position = await requestPosition();
      // Без координат не отправляем вовсе: выезд — событие «где именно»,
      // и запись без места отвечала бы только на «когда».
      if (position === null) return;
      send(position);
    })();
  };

  if (active === null) {
    return (
      <Card>
        <CardTitle title="Установка" icon="deadline" />
        <Text style={styles.hint}>
          Уезжаете на объект — отметьтесь. Смена не закроется, но рабочее время
          встанет на паузу и продолжится с того же места, когда вернётесь.
        </Text>

        {locationError !== null && <Text style={styles.error}>{locationError}</Text>}

        <Pressable
          disabled={busy}
          onPress={() => {
            withPosition((position) => {
              startTrip.mutate(position);
            });
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            pressed ? styles.pressed : null,
            busy ? styles.disabled : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.actionText}>Выхожу на установку</Text>
          )}
        </Pressable>
      </Card>
    );
  }

  const startedAt = new Date(active.startedAt);
  const minutes = Math.max(0, Math.floor((now - startedAt.getTime()) / 60_000));
  const away = `${Math.floor(minutes / 60).toString()} ч ${(minutes % 60).toString()} мин`;

  return (
    <Card>
      <CardTitle
        title="Установка"
        icon="deadline"
        action={<Pill text="На установке" tone="info" />}
      />

      <View style={styles.status}>
        <Text style={styles.away}>{away}</Text>
        <Text style={styles.hint}>
          {`С ${startedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
          {active.orderNumber === null ? '' : ` · заказ ${active.orderNumber}`}
        </Text>
      </View>

      {locationError !== null && <Text style={styles.error}>{locationError}</Text>}

      <Pressable
        disabled={busy}
        onPress={() => {
          withPosition((position) => {
            endTrip.mutate(position);
          });
        }}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.action,
          pressed ? styles.pressed : null,
          busy ? styles.disabled : null,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.actionText}>Пришёл с установки</Text>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  status: {
    marginTop: spacing.sm,
  },
  away: {
    ...typography.title,
    color: colors.textPrimary,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  action: {
    minHeight: 48,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  pressed: { opacity: opacity.pressed },
  disabled: { opacity: opacity.disabled },
});

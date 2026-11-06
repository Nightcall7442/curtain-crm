import { formatTime } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useLocation } from '../hooks/useLocation';
import { notifyError, notifySuccess } from '../lib/haptics';
import { serverNow } from '../lib/serverClock';
import { trpc } from '../lib/trpc';
import { colors, spacing, typography } from '../theme';

import { Card, CardTitle, Pill } from './Card';
import { SubmitButton } from './SubmitButton';
import { useLocale } from '../hooks/useLocale';

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
  const { m } = useLocale();
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
      Alert.alert(m('trip.startError'), error.message);
    },
  });

  const endTrip = trpc.shifts.endTrip.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('trip.endError'), error.message);
    },
  });

  const active = current.data ?? null;

  // Тикает раз в минуту: выезд длится часами, и секунды в нём — ложная
  // точность, из-за которой экран перерисовывался бы весь день.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (active === null) return undefined;

    const timer = setInterval(() => {
      setNow(serverNow());
    }, 60_000);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!shiftOpen || current.isLoading) return null;

  const busy = isRequesting || startTrip.isPending || endTrip.isPending;

  const withPosition = (
    send: (position: { latitude: number; longitude: number }) => void,
  ): void => {
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
        {/*
          Значок — машина, а не будильник: у личной отлучки ниже свой, и две
          карточки паузы с одним значком на одном экране читались одной.
        */}
        <CardTitle title={m('trip.title')} icon="trip" />
        <Text style={styles.hint}>{m('trip.hint')}</Text>

        {locationError !== null && <Text style={styles.error}>{locationError}</Text>}

        {/* Общая кнопка приложения — та же, что «Я вернулся» у отлучки ниже. */}
        <View style={styles.actionSlot}>
          <SubmitButton
            label={m('trip.start')}
            onPress={() => {
              withPosition((position) => {
                startTrip.mutate(position);
              });
            }}
            pending={busy}
          />
        </View>
      </Card>
    );
  }

  const startedAt = new Date(active.startedAt);
  const minutes = Math.max(0, Math.floor((now - startedAt.getTime()) / 60_000));
  // Первый час — без «0 ч»: нулевые часы ничего не сообщают.
  const away =
    minutes < 60
      ? m('shift.minutes', { n: minutes })
      : m('trip.away', { h: Math.floor(minutes / 60), m: minutes % 60 });

  return (
    <Card>
      <CardTitle
        title={m('trip.title')}
        icon="trip"
        /*
          Янтарный, как кольцо таймера на этом же экране: и выезд, и
          отлучка ставят рабочее время на паузу. Синяя плашка под янтарным
          кольцом читалась как третье, отдельное состояние.
        */
        action={<Pill text={m('trip.onSite')} tone="warning" />}
      />

      {/* Таймер — как у личной отлучки: тот же кегль и по центру. */}
      <Text style={styles.away}>{away}</Text>
      <Text style={[styles.hint, styles.awayHint]}>
        {m('trip.since', { time: formatTime(startedAt) })}
        {active.orderNumber === null ? '' : m('trip.order', { n: active.orderNumber })}
      </Text>

      {locationError !== null && <Text style={styles.error}>{locationError}</Text>}

      <View style={styles.actionSlot}>
        <SubmitButton
          label={m('trip.end')}
          onPress={() => {
            withPosition((position) => {
              endTrip.mutate(position);
            });
          }}
          pending={busy}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  /* Тот же таймер, что у `PersonalBreakCard`: одна ступень шкалы на обе карточки. */
  away: {
    ...typography.timer,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  awayHint: {
    textAlign: 'center',
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  /* Кнопка сама даёт 8 сверху; вместе выходит 12 — как было. */
  actionSlot: {
    marginTop: spacing.xs,
  },
});

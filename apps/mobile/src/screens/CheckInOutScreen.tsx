import { useState, type ReactElement } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Pill, Row } from '../components/Card';
import { ShiftRing } from '../components/ShiftRing';
import { SlideToConfirm } from '../components/SlideToConfirm';
import { useLocation } from '../hooks/useLocation';
import { notifyError } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Отметка начала и конца смены.
 *
 * Открыть смену можно только рядом с одним из СВОИХ филиалов — проверку
 * выполняет сервер по координатам и радиусу филиала. Отказ приходит с
 * понятным текстом, включая фактическое расстояние: «вы в 340 м от цеха
 * "Цех №1", отметиться можно в пределах 100 м».
 *
 * Закрытие смены по расстоянию НЕ ограничивается: сотрудник мог уехать
 * на объект, а незакрытая смена ломает расчёт часов сильнее, чем неточная
 * геометка.
 */
export function CheckInOutScreen(): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { requestPosition, isRequesting, error: locationError } = useLocation();

  const current = trpc.shifts.current.useQuery();

  const refresh = async (): Promise<void> => {
    await Promise.all([utils.shifts.current.invalidate(), utils.shifts.my.invalidate()]);
  };

  const checkIn = trpc.shifts.checkIn.useMutation({
    onSuccess: async () => {
      setServerError(null);
      await refresh();
    },
    onError: (error) => {
      // Отказ сопровождается вибрацией: жест уже дотянут, взгляд мог уйти
      // с экрана, и без тактильного сигнала отказ легко пропустить.
      notifyError();
      setServerError(error.message);
    },
  });

  const checkOut = trpc.shifts.checkOut.useMutation({
    onSuccess: async () => {
      setServerError(null);
      await refresh();
    },
    onError: (error) => {
      notifyError();
      setServerError(error.message);
    },
  });

  const isBusy = isRequesting || checkIn.isPending || checkOut.isPending;
  const shift = current.data ?? null;

  const handleCheckIn = (): void => {
    setServerError(null);
    void (async () => {
      const position = await requestPosition();
      if (position === null) return;
      checkIn.mutate(position);
    })();
  };

  const handleCheckOut = (): void => {
    setServerError(null);
    void (async () => {
      // Координаты при закрытии необязательны: если отказали в доступе,
      // смену всё равно нужно дать закрыть.
      const position = await requestPosition();
      checkOut.mutate(position ?? {});
    })();
  };

  const startedAt = shift === null ? null : new Date(shift.startedAt);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <CardTitle
          title="Смена"
          icon="shift"
          action={
            <Pill
              text={shift === null ? 'Не открыта' : 'Открыта'}
              tone={shift === null ? 'neutral' : 'positive'}
            />
          }
        />

        {current.isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : shift === null ? (
          <Text style={styles.description}>
            Смена не открыта. Нажмите «Начать смену», находясь на территории цеха —
            приложение определит филиал по вашим координатам.
          </Text>
        ) : (
          <View>
            <Row label="Филиал" value={shift.branchName} />
            <Row
              label="Начало"
              value={startedAt === null
                ? '—'
                : startedAt.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
            />
            {shift.startDistanceMeters !== null && (
              <Row
                label="Отметка в"
                value={`${shift.startDistanceMeters.toString()} м от цеха`}
              />
            )}
          </View>
        )}
      </Card>

      {/* Счётчик времени смены — центральный элемент экрана в макете */}
      <Card>
        <ShiftRing startedAt={startedAt} />
      </Card>

      {(locationError !== null || serverError !== null) && (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{locationError ?? serverError}</Text>
        </View>
      )}

      {/*
        Жест вместо кнопки — по утверждённому макету «Хвоя UI»: случайное
        касание в кармане смену не откроет, а завершение протяжки —
        естественный момент запросить геолокацию. Для экранного диктора
        компонент остаётся обычной кнопкой.
      */}
      <SlideToConfirm
        label={shift === null ? 'Проведите, чтобы начать смену →' : 'Проведите, чтобы завершить →'}
        onConfirm={shift === null ? handleCheckIn : handleCheckOut}
        disabled={current.isLoading}
        busy={isBusy}
      />

      <Text style={styles.footnote}>
        {isRequesting
          ? 'Определяем местоположение…'
          : 'Геолокация запрашивается только в момент отметки и не отслеживается в фоне.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
});

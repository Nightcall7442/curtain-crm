import { useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useLocation } from '../hooks/useLocation';
import { notifyError } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Pill, Row } from './Card';
import { ShiftRing } from './ShiftRing';
import { SlideToConfirm } from './SlideToConfirm';
import { useLocale } from '../hooks/useLocale';

/**
 * Своя смена: открыть и закрыть.
 *
 * Вынесено из экрана в компонент, потому что отмечаться должны все, включая
 * руководство. У директора и админа средняя вкладка показывает явку цеха, и
 * до сих пор это означало, что сами они отметиться из приложения не могут
 * вовсе — их часов в табеле просто не было.
 *
 * Открыть смену можно только рядом с одним из СВОИХ филиалов: проверку
 * делает сервер по координатам и радиусу филиала, отказ приходит с
 * фактическим расстоянием. Закрытие по расстоянию не ограничивается —
 * сотрудник мог уехать на объект, а незакрытая смена ломает расчёт часов
 * сильнее, чем неточная геометка.
 */
export function ShiftControl({
  /** Кольцо таймера. У руководителя под ним ещё список явки — там оно лишнее. */
  showTimer = true,
  /*
    То, что происходит ВНУТРИ смены — выезд и отлучка. Рисуется между
    таймером и жестом отметки: сначала «что сейчас», потом «закончить», а
    подпись про геолокацию остаётся последней строкой экрана.
  */
  children,
}: {
  readonly showTimer?: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { m } = useLocale();
  const { requestPosition, isRequesting, error: locationError } = useLocation();

  const current = trpc.shifts.current.useQuery();

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.shifts.current.invalidate(),
      utils.shifts.my.invalidate(),
      // Руководитель отмечается на том же экране, где смотрит явку цеха:
      // без этого его собственная строка появилась бы там только после
      // ручного обновления списка.
      utils.shifts.list.invalidate(),
    ]);
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
    <>
      <Card>
        <CardTitle
          title={m('shift.title')}
          icon="shift"
          action={
            <Pill
              text={shift === null ? m('shift.notOpen') : m('shift.open')}
              tone={shift === null ? 'neutral' : 'positive'}
            />
          }
        />

        {current.isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : shift === null ? (
          <Text style={styles.description}>{m('shift.closedHint')}</Text>
        ) : (
          <View>
            <Row label={m('shift.branch')} value={shift.branchName} />
            <Row
              label={m('shift.start')}
              value={
                startedAt === null
                  ? '—'
                  : startedAt.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
              }
            />
            {shift.startDistanceMeters !== null && (
              <Row
                label={m('shift.markedAt')}
                value={m('shift.metersFrom', { m: shift.startDistanceMeters })}
              />
            )}
          </View>
        )}
      </Card>

      {showTimer && (
        <Card>
          <ShiftRing
            startedAt={startedAt}
            pausedSeconds={shift?.pausedSeconds ?? 0}
            pausedSince={
              shift?.pausedSince == null ? null : new Date(shift.pausedSince)
            }
            pausedReason={shift?.pausedReason ?? null}
          />
        </Card>
      )}

      {children}

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
        label={shift === null ? m('shift.slideStart') : m('shift.slideEnd')}
        onConfirm={shift === null ? handleCheckIn : handleCheckOut}
        disabled={current.isLoading}
        busy={isBusy}
      />

      <Text style={styles.footnote}>
        {isRequesting
          ? m('shift.locating')
          : m('shift.geoNote')}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
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

import { formatTime, Role } from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { notifyError } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography, fonts } from '../theme';

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
  const { user } = useAuth();
  const { requestPosition, isRequesting, error: locationError } = useLocation();
  /** Швея закрывает смену со снимком рабочего стола; остальным он не нужен. */
  const needsDeskPhoto = (user?.roles ?? []).includes(Role.SEWER);

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
    onError: async (error) => {
      notifyError();
      setServerError(error.message);
      /*
        Сбой мог прийти уже ПОСЛЕ того, как сервер закрыл смену: ответ потерялся
        по дороге, а смена закрыта. Перечитываем её, чтобы экран не показывал
        «Тугатиш учун суринг» над уже закрытой сменой.
      */
      await refresh();
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

  /**
   * Снимок рабочего стола — только с камеры, без галереи: смысл в том, что
   * стол сфотографирован сейчас, а не взят из старых снимков.
   */
  const captureDeskPhoto = async (): Promise<{ content: string; mimeType: string } | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(m('photo.noAccess'), m('photo.allowCamera'));
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      exif: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
      return null;
    }
    return { content: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
  };

  const finishShift = (photo: { content: string; mimeType: string } | null): void => {
    void (async () => {
      // Координаты при закрытии необязательны: если отказали в доступе,
      // смену всё равно нужно дать закрыть.
      const position = await requestPosition();
      checkOut.mutate({ ...(position ?? {}), ...(photo === null ? {} : { photo }) });
    })();
  };

  const handleCheckOut = (): void => {
    setServerError(null);
    if (!needsDeskPhoto) {
      finishShift(null);
      return;
    }
    // Швее — сначала просьба и снимок: «убедитесь, что всё убрано и чисто».
    // Отмена в любой точке оставляет смену открытой.
    Alert.alert(m('shift.deskTitle'), m('shift.deskText'), [
      { text: m('common.cancel'), style: 'cancel' },
      {
        text: m('shift.deskTake'),
        onPress: () => {
          void (async () => {
            const photo = await captureDeskPhoto();
            if (photo !== null) finishShift(photo);
          })();
        },
      },
    ]);
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
              value={startedAt === null ? '—' : formatTime(startedAt)}
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
            pausedSince={shift?.pausedSince == null ? null : new Date(shift.pausedSince)}
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

      <Text style={styles.footnote}>{isRequesting ? m('shift.locating') : m('shift.geoNote')}</Text>
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
    fontFamily: fonts.medium,
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

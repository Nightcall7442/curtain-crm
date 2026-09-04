import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, spacing, typography } from '../theme';

/**
 * Круглый счётчик времени открытой смены.
 *
 * Кольцо СПЛОШНОЕ, а не заполняющееся. Заполнение означало бы «столько-то
 * процентов рабочего дня пройдено», а нормы рабочего дня в системе нет:
 * ни в смене, ни в схемах зарплаты она не задаётся. Кольцо, ползущее к
 * восьми часам, выглядело бы как факт, взятый из данных, хотя эти восемь
 * часов пришлось бы выдумать. Поэтому кольцо здесь — рамка вокруг числа,
 * и оно меняет только цвет: зелёное при открытой смене, серое при закрытой.
 *
 * Счётчик тикает раз в секунду и останавливается вместе с размонтированием
 * экрана: таймер без очистки продолжил бы будить React в фоне.
 */

const SIZE = 190;
const STROKE = 12;

export function ShiftRing({
  startedAt,
}: {
  /** Момент открытия смены; `null` — смена закрыта. */
  readonly startedAt: Date | null;
}): ReactElement {
  const elapsed = useElapsed(startedAt);
  const isOpen = startedAt !== null;

  // Радиус считается от центра до середины линии, иначе толстое кольцо
  // обрезается краем холста.
  const center = SIZE / 2;
  const ringRadius = center - STROKE / 2;

  return (
    <View style={styles.wrapper}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={colors.surfaceMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        {isOpen && (
          <Circle
            cx={center}
            cy={center}
            r={ringRadius}
            stroke={colors.accentBright}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>

      <View style={styles.inner} pointerEvents="none">
        <Text style={styles.caption}>{isOpen ? 'Сейчас на работе' : 'Смена не открыта'}</Text>
        <Text style={[styles.time, isOpen ? styles.timeOpen : styles.timeClosed]}>{elapsed}</Text>
        <Text style={styles.caption}>{isOpen ? 'Рабочее время' : 'с начала смены'}</Text>
      </View>
    </View>
  );
}

/**
 * Время с начала смены в формате `09:41:32`.
 *
 * Пересчитывается по часам устройства, а не накоплением секунд: свернув
 * приложение на час, сотрудник увидел бы отставание ровно на этот час, потому
 * что интервалы в фоне не выполняются.
 */
function useElapsed(startedAt: Date | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return undefined;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);

  if (startedAt === null) return '00:00:00';

  // Отрицательное значение возможно при расхождении часов телефона и сервера;
  // показывать «-1:59:59» нельзя, поэтому отсчёт начинается с нуля.
  const seconds = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));

  const pad = (value: number): string => value.toString().padStart(2, '0');

  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map(pad)
    .join(':');
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  time: {
    fontSize: 30,
    fontWeight: '700',
    marginVertical: spacing.xs,
    // Табличные цифры: иначе число дёргается каждую секунду, когда единица
    // сменяется восьмёркой.
    fontVariant: ['tabular-nums'],
  },
  timeOpen: {
    color: colors.textPrimary,
  },
  timeClosed: {
    color: colors.textMuted,
  },
});

import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

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
  pausedSeconds = 0,
  pausedSince = null,
  pausedReason = null,
}: {
  /** Момент открытия смены; `null` — смена закрыта. */
  readonly startedAt: Date | null;
  /** Уже накопленная пауза за закрытые выезды. */
  readonly pausedSeconds?: number;
  /** Начало незакрытой паузы; `null` — сотрудник в цеху. */
  readonly pausedSince?: Date | null;
  /** Из-за чего стоит время: выезд на установку или личная отлучка. */
  readonly pausedReason?: 'trip' | 'break' | null;
}): ReactElement {
  const { m } = useLocale();
  const elapsed = useElapsed(startedAt, pausedSeconds, pausedSince);
  const isOpen = startedAt !== null;
  const isPaused = isOpen && pausedSince !== null;

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
            /* На паузе кольцо гаснет до янтарного: время стоит, и цвет
               «всё идёт как надо» здесь сказал бы неправду. */
            stroke={isPaused ? colors.warning : colors.accentBright}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>

      <View style={styles.inner} pointerEvents="none">
        <Text style={styles.caption}>
          {!isOpen
            ? m('ring.notOpen')
            : !isPaused
              ? m('ring.working')
              : pausedReason === 'break'
                ? m('ring.onBreak')
                : m('ring.onTrip')}
        </Text>
        <Text
          style={[
            styles.time,
            isOpen ? styles.timeOpen : styles.timeClosed,
            isPaused ? styles.timePaused : null,
          ]}
        >
          {elapsed}
        </Text>
        <Text style={styles.caption}>
          {!isOpen ? m('ring.sinceStart') : isPaused ? m('ring.paused') : m('ring.workTime')}
        </Text>
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
function useElapsed(
  startedAt: Date | null,
  pausedSeconds: number,
  pausedSince: Date | null,
): string {
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

  /*
    Выезд на установку и личная отлучка останавливают счётчик: показанное
    здесь число должно совпадать с тем, что уйдёт в зарплату, а там обе
    паузы вычитаются (`workedSecondsExpression` на сервере). Закрытые
    приходят суммой, открытая — моментом начала: с него время не растёт.
  */
  /*
    Проверка на «дату, которой нет», а не перестраховка: сервер однажды уже
    отдал момент паузы строкой Postgres, Hermes её не разобрал, и на экране
    смены висело «NaN:NaN:NaN» вместо часов. Час без паузы честнее, чем
    отсутствие часов вовсе.
  */
  const pausedAt =
    pausedSince === null || !Number.isFinite(pausedSince.getTime()) ? null : pausedSince;

  const away = pausedAt === null ? 0 : Math.max(0, (now - pausedAt.getTime()) / 1000);

  // Отрицательное значение возможно при расхождении часов телефона и сервера;
  // показывать «-1:59:59» нельзя, поэтому отсчёт начинается с нуля.
  const seconds = Math.max(
    0,
    Math.floor(
      (now - startedAt.getTime()) / 1000 - (Number.isFinite(pausedSeconds) ? pausedSeconds : 0) - away,
    ),
  );

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
  timePaused: {
    color: colors.warning,
  },
  timeClosed: {
    color: colors.textMuted,
  },
});

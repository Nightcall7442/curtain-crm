import { useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { NATIVE_DRIVER } from '../lib/animation';
import { notifySuccess } from '../lib/haptics';
import { colors, opacity, radius, spacing, typography } from '../theme';

import { Icon } from './Icon';

/**
 * «Проведите, чтобы подтвердить» — жест вместо кнопки.
 *
 * Используется для отметки смены: случайное касание в кармане смену не
 * откроет, а завершение протяжки — естественный момент запросить
 * геолокацию. Порог — 82 % ширины дорожки; недотянутый бегунок пружиной
 * возвращается к началу.
 *
 * Жест недоступен экранному диктору, поэтому компонент ОСТАЁТСЯ кнопкой
 * для Accessibility: `accessibilityRole="button"` на всей дорожке, и
 * активация ассистивным нажатием (`onAccessibilityTap` эквивалент —
 * `accessibilityActions`) запускает то же действие без протяжки.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  busy = false,
}: {
  readonly label: string;
  /**
   * Действие по дотянутому бегунку. `false` (или обещание, которое им
   * кончилось) — действие не состоялось, и бегунок сразу возвращается.
   */
  readonly onConfirm: () => void | boolean | Promise<void | boolean>;
  readonly disabled?: boolean;
  readonly busy?: boolean;
}): ReactElement {
  const pos = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const trackWidth = useRef(0);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = useRef({ disabled, busy, onConfirm });
  state.current = { disabled, busy, onConfirm };

  const returnThumb = (): void => {
    Animated.spring(pos, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 0, speed: 14 }).start();
    current.current = 0;
  };

  // Мутация завершилась (успехом или отказом) — бегунок возвращается.
  useEffect(() => {
    if (!busy) returnThumb();
    // `returnThumb` пересоздаётся на каждом рендере, но держит только `pos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, pos]);

  useEffect(
    () => () => {
      if (graceTimer.current !== null) clearTimeout(graceTimer.current);
    },
    [],
  );

  const responder = useRef(
    PanResponder.create({
      /*
        Бегунок забирает касание сразу, ещё до движения.

        Раньше жест перехватывался только по `onMoveShouldSetPanResponder`,
        то есть после того, как палец уже проехал несколько пикселей. Но
        компонент лежит внутри вертикального ScrollView, и та за это время
        успевала объявить жест своим — протяжка срывалась на середине или
        не начиналась вовсе.
      */
      onStartShouldSetPanResponder: () => !state.current.disabled && !state.current.busy,
      onStartShouldSetPanResponderCapture: () => !state.current.disabled && !state.current.busy,

      /*
        Порог сравнивает горизонталь с вертикалью, а не с числом.

        Было `Math.abs(gesture.dy) < 14`: палец, ведущий вбок по дуге,
        выходил за эти четырнадцать пикселей на середине дорожки, и жест
        обрывался. Человек при этом видел, что бегунок «залипает».
      */
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !state.current.disabled &&
        !state.current.busy &&
        Math.abs(gesture.dx) > 4 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),

      /*
        Начатую протяжку не отдаём никому.

        Без этого ScrollView вправе отобрать жест по ходу движения —
        достаточно чуть повести палец вниз, и смена не откроется, хотя
        человек дотянул до конца.
      */
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderMove: (_event, gesture) => {
        const max = Math.max(0, trackWidth.current - THUMB - PAD * 2);
        current.current = Math.max(0, Math.min(max, gesture.dx));
        pos.setValue(current.current);
      },
      onPanResponderRelease: () => {
        const max = Math.max(0, trackWidth.current - THUMB - PAD * 2);
        if (max > 0 && current.current > max * 0.82) {
          // Бегунок дотянут: фиксируем в конце и запускаем действие.
          // Возврат случится, когда `busy` снова станет false.
          Animated.spring(pos, { toValue: max, useNativeDriver: NATIVE_DRIVER, bounciness: 0, speed: 20 }).start();
          current.current = max;
          notifySuccess();
          const result = state.current.onConfirm();
          if (result === false) {
            returnThumb();
            return;
          }
          if (result instanceof Promise) {
            void result.then((ok) => {
              if (ok === false) returnThumb();
            });
          }
          /*
            Страховка: действие так и не началось.

            Бегунок ждёт в конце, пока `busy` не станет true и снова false.
            Но у швеи перед закрытием смены — диалог «сфотографируйте стол»,
            и при «Отмене» (или закрытой камере) `busy` не менялся вовсе:
            бегунок оставался в конце дорожки поверх подписи, хотя смена
            открыта, и жест выглядел выполненным. Не начался запрос за
            `CONFIRM_GRACE_MS` — бегунок возвращается сам.
          */
          if (graceTimer.current !== null) clearTimeout(graceTimer.current);
          graceTimer.current = setTimeout(() => {
            graceTimer.current = null;
            if (!state.current.busy) returnThumb();
          }, CONFIRM_GRACE_MS);
          return;
        }
        Animated.spring(pos, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 4, speed: 14 }).start();
        current.current = 0;
      },
      onPanResponderTerminate: () => {
        Animated.spring(pos, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 0, speed: 20 }).start();
        current.current = 0;
      },
    }),
  ).current;

  return (
    <View
      style={[styles.track, WEB_GESTURE, disabled ? styles.trackDisabled : null]}
      onLayout={(event: LayoutChangeEvent) => {
        trackWidth.current = event.nativeEvent.layout.width;
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !disabled && !busy) {
          void onConfirm();
        }
      }}
    >
      {/*
        Подпись — в свободной части дорожки, справа от бегунка, а не по
        центру всей дорожки: на 360 точках она переносилась, и на второй
        строке оставалась одна стрелка, а первая буква узбекской подписи
        заходила под бегунок. Стрелки в подписи больше нет вовсе — её
        рисует бегунок, и словарь её не повторяет.
      */}
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {/*
        Область захвата шире самого бегунка, но не на всю дорожку: палец
        редко попадает точно в кружок — смену отмечают на ходу, часто в
        перчатках, — а касание любой точки дорожки не должно тянуть
        ползунок. Зона — это сам двигающийся блок, а не `hitSlop`: в
        браузере `hitSlop` не работает, и в PWA бегунок ловился только
        кружком в 48 точек.
      */}
      <Animated.View
        style={[styles.grab, WEB_GESTURE, { transform: [{ translateX: pos }] }]}
        {...responder.panHandlers}
      >
        <View style={styles.thumb}>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Icon name="forward" size={20} color={colors.accent} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const THUMB = 48;
const PAD = 5;
/** Сколько точек справа от кружка ещё ловят палец. */
const GRAB_EXTRA = 24;

/*
  В браузере жест у дорожки забирает сам браузер.

  React Native Web слушает касания на документе пассивно и отменить
  прокрутку страницы не может, а любой `scroll` обрывает начатый жест.
  Экран «Смена» на телефоне длиннее экрана, поэтому едва заметный увод
  пальца вниз запускал прокрутку — и бегунок в PWA не ехал вовсе или
  срывался на середине. `touch-action: none` говорит браузеру не
  прокручивать от касаний внутри дорожки; `user-select: none` убирает
  выделение текста при долгом нажатии на айфоне. На телефоне в APK
  жестом и так управляет сам React Native — там стиль не нужен.
*/
const WEB_GESTURE: ViewStyle | null =
  Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle) : null;
/** Сколько ждать, что дотянутый жест запустил действие (`busy`). */
const CONFIRM_GRACE_MS = 400;

const styles = StyleSheet.create({
  track: {
    height: THUMB + PAD * 2,
    borderRadius: radius.pill,
    backgroundColor: colors.header,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackDisabled: {
    opacity: opacity.disabled,
  },
  label: {
    ...typography.headline,
    // Строка — из шкалы, как у основного текста того же кегля: две строки
    // подписи (42) с запасом входят в дорожку (58).
    lineHeight: typography.body.lineHeight,
    color: colors.headerText,
    textAlign: 'center',
    // Свободная часть дорожки: от правого края бегунка (с зазором) до конца.
    // Отступ — снаружи текста, а не внутри: иначе рамка подписи лежала
    // под бегунком, и проверка раскладки видела в ней наложение на значок.
    marginLeft: PAD + THUMB + PAD + spacing.sm,
    marginRight: spacing.lg,
  },
  grab: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: PAD + THUMB + GRAB_EXTRA,
    paddingLeft: PAD,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});

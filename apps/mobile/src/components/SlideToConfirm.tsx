import { useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

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
  const text = label.replace(TRAILING_ARROW, '');

  const state = useRef({ disabled, busy, onConfirm });
  state.current = { disabled, busy, onConfirm };

  const returnThumb = (): void => {
    Animated.spring(pos, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
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
          Animated.spring(pos, { toValue: max, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
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
        Animated.spring(pos, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
        current.current = 0;
      },
      onPanResponderTerminate: () => {
        Animated.spring(pos, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        current.current = 0;
      },
    }),
  ).current;

  return (
    <View
      style={[styles.track, disabled ? styles.trackDisabled : null]}
      onLayout={(event: LayoutChangeEvent) => {
        trackWidth.current = event.nativeEvent.layout.width;
      }}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: disabled || busy }}
      accessibilityActions={[{ name: 'activate', label: text }]}
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
        заходила под бегунок. Стрелка в конце подписи срезается: её и так
        рисует бегунок, второй раз она лишь удлиняла строку.
      */}
      <Text style={styles.label} numberOfLines={2}>
        {text}
      </Text>
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: pos }] }]}
        // Палец редко попадает точно в кружок: смену отмечают на ходу, часто
        // в перчатках. Область захвата шире самого бегунка, но не на всю
        // дорожку — иначе касание любой её точки уже тянуло бы ползунок.
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
        {...responder.panHandlers}
      >
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Icon name="forward" size={20} color={colors.accent} />
        )}
      </Animated.View>
    </View>
  );
}

const THUMB = 48;
const PAD = 5;
/** Сколько ждать, что дотянутый жест запустил действие (`busy`). */
const CONFIRM_GRACE_MS = 400;
const TRAILING_ARROW = /\s*→\s*$/;

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
    lineHeight: 19,
    color: colors.headerText,
    textAlign: 'center',
    // Свободная часть дорожки: от правого края бегунка (с зазором) до конца.
    paddingLeft: PAD + THUMB + PAD + spacing.sm,
    paddingRight: spacing.lg,
  },
  thumb: {
    position: 'absolute',
    left: PAD,
    top: PAD,
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

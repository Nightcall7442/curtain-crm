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
import { colors, opacity, radius, typography } from '../theme';

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
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
}): ReactElement {
  const pos = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const trackWidth = useRef(0);

  const state = useRef({ disabled, busy, onConfirm });
  state.current = { disabled, busy, onConfirm };

  // Мутация завершилась (успехом или отказом) — бегунок возвращается.
  useEffect(() => {
    if (!busy) {
      Animated.spring(pos, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
      current.current = 0;
    }
  }, [busy, pos]);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !state.current.disabled &&
        !state.current.busy &&
        Math.abs(gesture.dx) > 6 &&
        Math.abs(gesture.dy) < 14,
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
          state.current.onConfirm();
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
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !disabled && !busy) {
          onConfirm();
        }
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: pos }] }]}
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
    color: colors.headerText,
    textAlign: 'center',
    // Подпись по центру всей дорожки; бегунок лежит поверх её начала.
    paddingHorizontal: THUMB,
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

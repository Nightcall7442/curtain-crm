import { useRef, type ReactElement, type ReactNode } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';

import { opacity } from '../theme';

/**
 * Нажимаемая обёртка с пружинным откликом.
 *
 * Элемент слегка проседает под пальцем и возвращается пружиной. Разница с
 * простым гашением прозрачности кажется мелочью, но именно она отличает
 * «нажалось» от «мигнуло»: палец закрывает собой половину кнопки, и
 * изменение прозрачности под ним почти не видно, а изменение РАЗМЕРА
 * заметно по краям, которые остаются на виду.
 *
 * Масштаб 0,97, а не 0,9: сильное сжатие выглядит игрушечным и на крупных
 * карточках сдвигает соседей. Прозрачность оставлена как второй, более
 * слабый сигнал — на случай, если анимации в системе отключены.
 *
 * `useNativeDriver` обязателен: без него каждый кадр пружины идёт через
 * мост JS → нативный слой, и на дешёвом телефоне в цехе анимация начинает
 * заикаться ровно тогда, когда список одновременно подгружает данные.
 */
export function PressableScale({
  children,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  /** Насколько проседает элемент. Мелкие цели — сильнее, крупные — слабее. */
  scaleTo = 0.97,
}: {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: ViewStyle;
  readonly scaleTo?: number;
}): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (toValue: number): void => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      // Без колебания: кнопка должна вернуться на место, а не покачаться.
      // Пружина здесь ради естественного замедления, а не ради «пружинистости».
      bounciness: 0,
      speed: 20,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPressIn={() => {
        animate(scaleTo);
      }}
      onPressOut={() => {
        animate(1);
      }}
      style={({ pressed }) => [style, pressed ? { opacity: opacity.pressed } : null]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

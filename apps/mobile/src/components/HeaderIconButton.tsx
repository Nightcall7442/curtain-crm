import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { opacity, sizes, spacing } from '../theme';

/**
 * Значок-кнопка в шапке.
 *
 * В браузере у неё своя рамка 48×48 с отступом от края: `hitSlop` веб не
 * поддерживает, и значок «склада» в шапке продажи был целью 22×24,
 * прижатой вплотную к правому краю экрана. На телефоне шапку раскладывает
 * система — с её отступами, а `hitSlop` добирает цель до пальца.
 */
export function HeaderIconButton({
  label,
  edge,
  onPress,
  children,
}: {
  readonly label: string;
  readonly edge: 'left' | 'right';
  readonly onPress: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      /* Нажатие показывается прозрачностью, а не цветом: на тёмной
         шапке любой акцентный зелёный темнее её же текста. */
      style={({ pressed }) => [
        Platform.OS === 'web' ? styles.webHeaderButton : null,
        Platform.OS === 'web' ? (edge === 'left' ? styles.webHeaderLeft : styles.webHeaderRight) : null,
        pressed ? { opacity: opacity.pressed } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * Кнопка шапки в браузере — 48, как у шапки Android: значок 24 при отступе 4
 * встаёт в 16 от края. Это та же высота, что у кнопки действия
 * (`sizes.buttonHeight`), и своего числа для неё не заводим.
 */
const HEADER_BUTTON = sizes.buttonHeight;

const styles = StyleSheet.create({
  webHeaderButton: {
    width: HEADER_BUTTON,
    height: HEADER_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webHeaderLeft: {
    marginLeft: spacing.xs,
  },
  webHeaderRight: {
    marginRight: spacing.xs,
  },
});

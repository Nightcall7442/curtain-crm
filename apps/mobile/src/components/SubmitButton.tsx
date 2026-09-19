import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, opacity, radius, spacing, typography } from '../theme';

/**
 * Главная кнопка формы в шторке: акцентная таблетка, пока запрос идёт —
 * крутилка вместо подписи.
 *
 * Одна на все шторки с суммой и комментарием — до этого та же кнопка
 * была переписана в каждой из них своими стилями, и «отключена» в одной
 * гасило кнопку, а в другой — нет.
 */
export function SubmitButton({
  label,
  onPress,
  disabled = false,
  pending = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.submit,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  submit: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  text: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});

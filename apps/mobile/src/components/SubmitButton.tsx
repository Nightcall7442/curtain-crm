import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';

/**
 * Главная кнопка формы в шторке: акцентная таблетка, пока запрос идёт —
 * крутилка вместо подписи.
 *
 * Одна на все шторки с суммой и комментарием — до этого та же кнопка
 * была переписана в каждой из них своими стилями, и «отключена» в одной
 * гасило кнопку, а в другой — нет.
 *
 * `variant="secondary"` — второе действие рядом с главным («Позиция»,
 * «Создать инкассацию»): та же таблетка той же высоты, но на светлой
 * зелёной подложке. Одна система кнопок на экране, а не кнопки из
 * разных наборов с разными высотами и скруглениями.
 */
export function SubmitButton({
  label,
  onPress,
  disabled = false,
  pending = false,
  variant = 'primary',
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly variant?: 'primary' | 'secondary';
}): ReactElement {
  const secondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      style={({ pressed }) => [
        styles.submit,
        secondary ? styles.secondary : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={secondary ? colors.accentStrong : colors.onAccent} />
      ) : (
        <Text style={[styles.text, secondary ? styles.textSecondary : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  submit: {
    // Общая высота кнопки действия: на экране одна система кнопок.
    minHeight: sizes.buttonHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Длинная подпись (узбекская бывает вдвое длиннее русской) переносится,
    // а не упирается в скруглённый край.
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  secondary: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  text: {
    ...typography.body,
    // Жирное начертание, а не `fontWeight` поверх Medium из `body`: браузер
    // дорисовывал ложный полужирный, и подпись в PWA была размытой и шире,
    // чем в приложении.
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  textSecondary: {
    color: colors.accentStrong,
  },
});

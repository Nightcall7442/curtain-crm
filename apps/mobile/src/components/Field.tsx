import { forwardRef, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

/**
 * Поля ввода.
 *
 * Появились вместе с первой формой в приложении: до неё единственный ввод был
 * на экране входа и жил там же инлайном. Второй экран с полями — повод завести
 * общий примитив, а не скопировать стили: разъехавшиеся поля видно сразу, а
 * чинить их приходится по всем экранам.
 *
 * Подпись — настоящий `<Text>` над полем, а не подсказка внутри. Подсказка
 * исчезает, как только человек начинает печатать, и через минуту он уже не
 * помнит, что это за поле; на форме из десяти строк это критично.
 */

export function Field({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {children}

      {error !== undefined ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : (
        hint !== undefined && <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );
}

/**
 * Однострочный ввод.
 *
 * `forwardRef` нужен для перевода фокуса по клавише «Далее»: без него форму
 * из десяти полей приходится проходить, целясь пальцем в каждое.
 */
export const Input = forwardRef<TextInput, TextInputProps & { readonly invalid?: boolean }>(
  function Input({ invalid = false, style, ...rest }, ref): ReactElement {
    return (
      <TextInput
        ref={ref}
        {...rest}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, invalid ? styles.inputInvalid : null, style]}
      />
    );
  },
);

/**
 * Выбор одного значения из нескольких.
 *
 * Чипами, а не системным списком: вариантов здесь три-четыре, и открывать
 * ради них модальное окно — лишний шаг в форме, которую заполняют стоя
 * у клиента.
 */
export function ChipSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              pressed ? { opacity: opacity.pressed } : null,
            ]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    // Высота больше порога нажатия: поле — такая же цель для пальца, как кнопка.
    minHeight: 46,
    paddingVertical: spacing.sm,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  hint: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.footnote,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
});

import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, hairline, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

/**
 * Выбор одного значения из справочника.
 *
 * У React Native нет системного `<select>`, а справочники — от десятка
 * моделей штор до полусотни аксессуаров — слишком длинны для чипов
 * (`ChipSelect`), которые хороши на три-четыре варианта и расползаются
 * в простыню на большем числе. Здесь то же самое действие, что открывает
 * `BottomSheet` с действиями по заказу, только выбор вместо действия:
 * шторка со списком, тап по строке выбирает и закрывает.
 */
export function CatalogPicker({
  value,
  placeholder,
  options,
  onChange,
  sheetTitle,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
  readonly sheetTitle: string;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={sheetTitle}
        style={({ pressed }) => [styles.control, pressed ? styles.controlPressed : null]}
      >
        <Text style={[styles.value, value === '' ? styles.placeholder : null]} numberOfLines={1}>
          {value === '' ? placeholder : value}
        </Text>
        <Icon name="chevron" size={16} color={colors.textMuted} />
      </Pressable>

      <BottomSheet
        visible={open}
        title={sheetTitle}
        onClose={() => {
          setOpen(false);
        }}
      >
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          {options.length === 0 ? (
            <Text style={styles.empty}>Справочник пуст</Text>
          ) : (
            options.map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
              >
                <Text style={styles.optionText}>{option}</Text>
                {option === value && <Icon name="completed" size={18} color={colors.accent} />}
              </Pressable>
            ))
          )}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  controlPressed: {
    opacity: 0.7,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
  sheetScroll: {
    maxHeight: 380,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionPressed: {
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  empty: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
});

import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, hairline, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { useLocale } from '../hooks/useLocale';

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
  loading = false,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
  readonly sheetTitle: string;
  /**
   * Справочник ещё грузится.
   *
   * Пока запрос не вернулся, вызывающие экраны передают пустой список, и
   * шторка, открытая в эту секунду, писала «Справочник пуст» — продавец
   * читал это как «моделей нет». Пустой и ещё не пришедший справочник —
   * разные вещи, и выглядеть они обязаны по-разному.
   */
  readonly loading?: boolean;
}): ReactElement {
  const { m } = useLocale();
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
          {loading && options.length === 0 ? (
            <View style={styles.loading} accessibilityRole="progressbar">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : options.length === 0 ? (
            <Text style={styles.empty}>{m('catalog.empty')}</Text>
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
  /*
    Список шире содержимого шторки на отступ строки с каждой стороны: у
    строки свой отступ под подсветку нажатия, и без этого текст вариантов
    стоял на 8 точек правее заголовка шторки. Теперь край текста — общий
    с заголовком, а подсветка выходит за него, как в системных списках.
  */
  sheetScroll: {
    maxHeight: 380,
    marginHorizontal: -spacing.sm,
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
  // Та же высота, что у строки «Справочник пуст», — шторка не прыгает.
  loading: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';

import { Icon, type IconName } from './Icon';

/**
 * Сегменты на дорожке: «Неделя / Месяц», «Выходные / Опоздание».
 *
 * Один вид на всё приложение. Переключатель периода рейтинга был первым,
 * и второй — тип запроса на экране выходных — собран из него же, а не
 * скопирован: копия уже однажды разошлась с оригиналом (сегменты на
 * дорожке в одном месте и тёмные чипы в другом для одного и того же выбора).
 *
 * Каждый сегмент — полная цель для пальца (`touchTarget`), а не подпись с
 * `hitSlop`: в браузере `hitSlop` не работает. Для чтеца — вкладки
 * (`tablist` / `tab` с отметкой выбранной): это выбор вида, а не действие.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    /** Значок перед подписью — когда сегменты различаются по смыслу, а не по мере. */
    readonly icon?: IconName;
  }[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const active = value === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active ? styles.segmentActive : null,
              pressed && !active ? styles.pressed : null,
            ]}
          >
            {option.icon !== undefined && (
              <Icon name={option.icon} size={16} color={active ? colors.accent : colors.textSecondary} />
            )}
            <Text style={[styles.text, active ? styles.textActive : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    minHeight: sizes.touchTarget,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    // Подпись по центру кнопки: с одними вертикальными полями она стояла
    // на 5 точек выше середины (8 сверху, 18 снизу).
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  textActive: {
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    color: colors.accent,
    fontWeight: '600',
  },
});

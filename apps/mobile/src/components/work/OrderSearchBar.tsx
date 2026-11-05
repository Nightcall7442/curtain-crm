import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, fonts, opacity, radius, spacing, typography } from '../../theme';
import { Icon } from '../Icon';

/**
 * Поиск и фильтры над списком заказов на «Работе».
 *
 * Поле ищет по номеру, клиенту и телефону — на сервере, по всем заказам, а
 * не по загруженной странице. Чипы открывают шторки выбора; выбранное
 * показывается на самом чипе и снимается крестиком.
 *
 * Цели здесь — полные 44 точки, без `hitSlop`: в браузере его нет вовсе,
 * и в PWA крестик был мишенью 14×15, а «Сбросить» — строкой высотой 18.
 */
export function OrderSearchBar({
  search,
  onSearch,
  statusLabel,
  onStatusPress,
  onStatusClear,
  executorLabel,
  onExecutorPress,
  onExecutorClear,
  showExecutor,
  onReset,
}: {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  /** `null` — фильтр не выбран. */
  readonly statusLabel: string | null;
  readonly onStatusPress: () => void;
  readonly onStatusClear: () => void;
  readonly executorLabel: string | null;
  readonly onExecutorPress: () => void;
  readonly onExecutorClear: () => void;
  readonly showExecutor: boolean;
  readonly onReset: () => void;
}): ReactElement {
  const { m } = useLocale();
  const anyActive = search.length > 0 || statusLabel !== null || executorLabel !== null;

  /*
    Чип — не кнопка целиком, а пара кнопок рядом: подпись открывает шторку,
    крестик снимает фильтр. Крестик внутри кнопки-чипа был `<button>` в
    `<button>`: React сыпал ошибками в консоль, а промах мимо крестика
    открывал шторку вместо того, чтобы снять фильтр.
  */
  const chip = (
    label: string | null,
    placeholder: string,
    onPress: () => void,
    onClear: () => void,
  ): ReactElement => (
    <View style={[styles.chip, label === null ? null : styles.chipActive]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.chipMain,
          label === null ? null : styles.chipMainActive,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.chipText, label === null ? null : styles.chipTextActive]} numberOfLines={1}>
          {label ?? placeholder}
        </Text>
        {label === null && <Icon name="chevron" size={13} color={colors.textMuted} />}
      </Pressable>
      {label !== null && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={m('work.filterReset')}
          style={({ pressed }) => [styles.chipClear, pressed ? styles.pressed : null]}
        >
          <Icon name="close" size={14} color={colors.headerText} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.host}>
      <View style={styles.field}>
        <Icon name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder={m('work.search')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={m('work.search')}
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => {
              onSearch('');
            }}
            accessibilityRole="button"
            accessibilityLabel={m('work.filterReset')}
            style={({ pressed }) => [styles.searchClear, pressed ? styles.pressed : null]}
          >
            <Icon name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.chips}>
        {chip(statusLabel, m('work.filterStatus'), onStatusPress, onStatusClear)}
        {showExecutor && chip(executorLabel, m('work.filterExecutor'), onExecutorPress, onExecutorClear)}
        {anyActive && (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            style={({ pressed }) => [styles.reset, pressed ? styles.pressed : null]}
          >
            <Text style={styles.resetText}>{m('work.filterReset')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  /* Крестик — во всю высоту поля и вплотную к его правому краю: значок
     стоит там же, где стоял, а цель для пальца — 44 × 44. */
  searchClear: {
    width: 44,
    height: 44,
    marginRight: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  /*
    44, как чипы фильтров строкой выше: прежние 36 рядом с ними давали на
    одном экране две высоты одной и той же таблетки.

    Ширина — до края строки, а не до 220: длинный статус по-узбекски
    («Admin tekshiruvini kutmoqda») обрезался при свободной половине строки.
  */
  chip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
  },
  /* Справа — крестик со своими полями: подпись ему место не уступает. */
  chipMainActive: {
    paddingRight: 0,
  },
  chipClear: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  chipTextActive: {
    color: colors.headerText,
    fontFamily: fonts.semibold,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  reset: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.accent,
    fontWeight: '600',
  },
});

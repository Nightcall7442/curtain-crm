import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, radius, spacing, typography } from '../../theme';
import { Icon } from '../Icon';

/**
 * Поиск и фильтры над списком заказов на «Работе».
 *
 * Поле ищет по номеру, клиенту и телефону — на сервере, по всем заказам, а
 * не по загруженной странице. Чипы открывают шторки выбора; выбранное
 * показывается на самом чипе и снимается крестиком.
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

  const chip = (
    label: string | null,
    placeholder: string,
    onPress: () => void,
    onClear: () => void,
  ): ReactElement => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        label === null ? null : styles.chipActive,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.chipText, label === null ? null : styles.chipTextActive]} numberOfLines={1}>
        {label ?? placeholder}
      </Text>
      {label === null ? (
        <Icon name="chevron" size={13} color={colors.textMuted} />
      ) : (
        <Pressable
          onPress={onClear}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={m('work.filterReset')}
        >
          <Icon name="close" size={14} color={colors.headerText} />
        </Pressable>
      )}
    </Pressable>
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
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={m('work.filterReset')}
          >
            <Icon name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.chips}>
        {chip(statusLabel, m('work.filterStatus'), onStatusPress, onStatusClear)}
        {showExecutor && chip(executorLabel, m('work.filterExecutor'), onExecutorPress, onExecutorClear)}
        {anyActive && (
          <Pressable onPress={onReset} accessibilityRole="button" hitSlop={8} style={styles.reset}>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  reset: {
    paddingHorizontal: spacing.xs,
  },
  resetText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
});

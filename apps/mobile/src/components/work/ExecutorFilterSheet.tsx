import { ROLE_LABELS } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { trpc } from '../../lib/trpc';
import { colors, radius, spacing, typography } from '../../theme';
import { BottomSheet } from '../BottomSheet';
import { Skeleton } from '../Card';
import { Input } from '../Field';

/**
 * Выбор исполнителя: все действующие сотрудники с поиском по имени.
 *
 * Только для тех, кто ведёт заказы (директор, админ, менеджер): остальные и
 * так видят лишь свои заказы, а список сотрудников им сервер не отдаст.
 */
export function ExecutorFilterSheet({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly selectedId: number | null;
  readonly onSelect: (person: { readonly id: number; readonly fullName: string }) => void;
  readonly onClose: () => void;
}): ReactElement {
  const { m, t } = useLocale();
  const [query, setQuery] = useState('');
  const people = trpc.users.assignable.useQuery(undefined, { enabled: visible });

  const needle = query.trim().toLowerCase();
  const list = (people.data ?? []).filter(
    (person) => needle.length === 0 || person.fullName.toLowerCase().includes(needle),
  );

  return (
    <BottomSheet visible={visible} title={m('work.executorSheet')} onClose={onClose}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={m('work.executorSearch')}
        autoCorrect={false}
      />
      {people.isLoading ? (
        <Skeleton rows={3} />
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {list.length === 0 ? (
            <Text style={styles.empty}>{m('work.noMatches')}</Text>
          ) : (
            list.map((person) => {
              const active = person.id === selectedId;
              return (
                <Pressable
                  key={person.id}
                  onPress={() => {
                    onSelect({ id: person.id, fullName: person.fullName });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.row,
                    active ? styles.rowActive : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.name, active ? styles.nameActive : null]} numberOfLines={1}>
                      {person.fullName}
                    </Text>
                    <Text style={styles.roles} numberOfLines={1}>
                      {person.roles.map((role) => t(ROLE_LABELS, role)).join(', ')}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 400,
    marginTop: spacing.sm,
  },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowText: {
    gap: 2,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  nameActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  roles: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  empty: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});

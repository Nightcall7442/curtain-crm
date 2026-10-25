import {
  ORDER_STATUS_LABELS,
  PRODUCTION_STAGE_LABELS,
  PRODUCTION_STAGES,
  type OrderStatus,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, radius, spacing, typography } from '../../theme';
import { BottomSheet } from '../BottomSheet';
import type { StatusFilter } from './orderFilter';

/**
 * Выбор статуса: этапы конвейера и статусы внутри них.
 *
 * Строка этапа выбирает его целиком, строка статуса — только его. «С долгом»
 * сверху и только для тех, кто видит деньги клиента: остальным сервер этот
 * фильтр не отдаст.
 */
export function StatusFilterSheet({
  visible,
  value,
  withDebt,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly value: StatusFilter | null;
  readonly withDebt: boolean;
  readonly onSelect: (filter: StatusFilter) => void;
  readonly onClose: () => void;
}): ReactElement {
  const { m, locale } = useLocale();

  const isActive = (filter: StatusFilter): boolean =>
    value !== null && JSON.stringify(value) === JSON.stringify(filter);

  const row = (filter: StatusFilter, label: string, nested: boolean): ReactElement => (
    <Pressable
      key={JSON.stringify(filter)}
      onPress={() => {
        onSelect(filter);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive(filter) }}
      style={({ pressed }) => [
        styles.row,
        nested ? styles.nested : null,
        isActive(filter) ? styles.rowActive : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <Text
        style={[nested ? styles.status : styles.stage, isActive(filter) ? styles.textActive : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} title={m('work.statusSheet')} onClose={onClose}>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {withDebt && row({ kind: 'debt' }, m('work.debt'), false)}
        {PRODUCTION_STAGES.map((stage) => [
          row({ kind: 'stage', stage: stage.key }, PRODUCTION_STAGE_LABELS[locale][stage.key], false),
          ...(stage.statuses.length > 1
            ? stage.statuses.map((status: OrderStatus) =>
                row({ kind: 'status', status }, ORDER_STATUS_LABELS[locale][status], true),
              )
            : []),
        ])}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 440,
  },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  nested: {
    paddingLeft: spacing.xl,
    minHeight: 40,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  stage: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  status: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  textActive: {
    color: colors.accent,
  },
});

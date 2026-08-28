import { isActiveStatus } from '@curtain-crm/shared';

import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty } from '../components/Card';
import { OrderCard } from '../components/OrderCard';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Мои заказы.
 *
 * Сервер отдаёт только те заказы, в которых сотрудник участвует, — фильтры
 * на этом экране лишь сужают выдачу, а не расширяют её. Обойти ограничение,
 * подобрав параметры, невозможно.
 */

type Filter = 'active' | 'all' | 'overdue';

const FILTERS: readonly { readonly key: Filter; readonly label: string }[] = [
  { key: 'active', label: 'В работе' },
  { key: 'overdue', label: 'Просрочены' },
  { key: 'all', label: 'Все' },
];

export function WorkScreen(): ReactElement {
  const navigation = useNavigation();
  const [filter, setFilter] = useState<Filter>('active');

  const query = trpc.orders.list.useQuery({
    page: 1,
    pageSize: 50,
    includeArchived: filter === 'all',
  });

  const items = (query.data?.items ?? []).filter((order) => {
    if (filter === 'overdue') {
      return (
        order.deadline !== null &&
        new Date(order.deadline) < new Date() &&
        isActiveStatus(order.status)
      );
    }
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {FILTERS.map((entry) => {
          const isActive = entry.key === filter;
          return (
            <Pressable
              key={entry.key}
              onPress={() => {
                setFilter(entry.key);
              }}
              style={[styles.filter, isActive ? styles.filterActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterText, isActive ? styles.filterTextActive : null]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshing={query.isFetching && !query.isLoading}
        onRefresh={() => {
          void query.refetch();
        }}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Empty
              message={
                filter === 'overdue' ? 'Просроченных заказов нет' : 'Заказов пока нет'
              }
              hint="Здесь появляются заказы, в которых вы участвуете"
            />
          )
        }
        renderItem={({ item }) => (
          <OrderCard
            orderNumber={item.orderNumber ?? `#${item.id.toString()}`}
            clientName={item.clientName}
            status={item.status}
            priority={item.priority}
            deadline={item.deadline}
            workPrice={item.workPrice}
            onPress={() => {
              navigation.navigate('OrderDetail', { orderId: item.id });
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
  },
});

import { isActiveStatus, isOverdueDate, ORDER_INTAKE_ROLES } from '@curtain-crm/shared';

import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Skeleton } from '../components/Card';
import { Icon } from '../components/Icon';
import { OrderCard } from '../components/OrderCard';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

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
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('active');

  /**
   * Кнопку создания видят только те, кому сервер это разрешает.
   *
   * Это удобство, а не защита: `orders.create` — процедура уровня приёмки,
   * и швея получит отказ, даже если доберётся до экрана в обход интерфейса.
   * Но показывать кнопку, которая заведомо откажет, незачем.
   */
  const canCreate = (user?.roles ?? []).some((role) => ORDER_INTAKE_ROLES.includes(role));

  const query = trpc.orders.list.useQuery({
    page: 1,
    pageSize: 50,
    includeArchived: filter === 'all',
  });

  const items = (query.data?.items ?? []).filter((order) => {
    if (filter === 'overdue') {
      return (
        isOverdueDate(order.deadline) &&
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

      {canCreate && (
        <Pressable
          onPress={() => {
            navigation.navigate('OrderCreate');
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.create, pressed ? styles.createPressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.onAccent} />
          <Text style={styles.createText}>Новый заказ</Text>
        </Pressable>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshing={query.isFetching && !query.isLoading}
        onRefresh={() => {
          void query.refetch();
        }}
        ListEmptyComponent={
          query.isLoading ? (
            <Skeleton />
          ) : query.isError ? (
            <ErrorState />
          ) : (
            <Empty
              message={filter === 'overdue' ? 'Просроченных заказов нет' : 'Заказов пока нет'}
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
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /**
   * Выбранный фильтр — тёмная хвоя, как в макете.
   *
   * Не зелёный: зелёным в приложении красятся ДЕЙСТВИЯ, и чип, выглядящий
   * кнопкой, сотрудник жмёт, ожидая, что что-то произойдёт. Здесь же
   * происходит только сужение списка.
   */
  filterActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  filterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  createPressed: {
    opacity: opacity.pressed,
  },
  createText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    paddingBottom: tabBarSpace,
  },
});

import {
  isActiveStatus,
  isOverdueDate,
  ORDER_INTAKE_ROLES,
  TaskStatus,
} from '@curtain-crm/shared';

import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Skeleton } from '../components/Card';
import { Icon } from '../components/Icon';
import { OrderCard } from '../components/OrderCard';
import { TaskCard } from '../components/TaskCard';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Работа сотрудника: его заказы И поручения от руководства.
 *
 * Заказы — этапы конвейера, где сотрудник исполнитель; поручения —
 * дополнительная работа мимо конвейера («съезди за тканью»), которую выдаёт
 * директор или админ. Оба списка живут в одной вкладке: у сотрудника одно
 * место, где лежит вся его работа.
 *
 * Сервер отдаёт только те заказы, в которых сотрудник участвует, — фильтры
 * на этом экране лишь сужают выдачу, а не расширяют её. Обойти ограничение,
 * подобрав параметры, невозможно.
 */

type Filter = 'active' | 'all' | 'overdue' | 'tasks';

const FILTERS: readonly { readonly key: Filter; readonly label: string }[] = [
  { key: 'active', label: 'В работе' },
  { key: 'overdue', label: 'Просрочены' },
  { key: 'all', label: 'Все' },
  { key: 'tasks', label: 'Поручения' },
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

  const query = trpc.orders.list.useQuery(
    {
      page: 1,
      pageSize: 50,
      includeArchived: filter === 'all',
    },
    { enabled: filter !== 'tasks' },
  );

  /**
   * Поручения запрашиваются всегда, а не только на своей вкладке: счётчик
   * на чипе — единственное место, откуда сотрудник узнаёт о новом поручении,
   * не заходя в уведомления.
   */
  const tasksQuery = trpc.tasks.my.useQuery();
  const openTasks = (tasksQuery.data ?? []).filter(
    (task) => task.status === TaskStatus.OPEN,
  );

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
          const label =
            entry.key === 'tasks' && openTasks.length > 0
              ? `${entry.label} (${openTasks.length.toString()})`
              : entry.label;
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filter === 'tasks' ? (
        <FlatList
          data={tasksQuery.data ?? []}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshing={tasksQuery.isFetching && !tasksQuery.isLoading}
          onRefresh={() => {
            void tasksQuery.refetch();
          }}
          ListEmptyComponent={
            tasksQuery.isLoading ? (
              <Skeleton />
            ) : tasksQuery.isError ? (
              <ErrorState />
            ) : (
              <Empty
                message="Поручений нет"
                hint="Здесь появляются задания от директора или администратора"
              />
            )
          }
          renderItem={({ item }) => <TaskCard task={item} />}
        />
      ) : (
      <>
      {canCreate && (
        <View style={styles.createRow}>
          <Pressable
            onPress={() => {
              navigation.navigate('OrderCreate');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.create,
              styles.createFlex,
              pressed ? styles.createPressed : null,
            ]}
          >
            <Icon name="assigned" size={18} color={colors.onAccent} />
            <Text style={styles.createText}>Новый заказ</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              navigation.navigate('SellReadyMade');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.createSecondary,
              styles.createFlex,
              pressed ? styles.createPressed : null,
            ]}
          >
            <Icon name="orders" size={18} color={colors.accentStrong} />
            <Text style={styles.createSecondaryText}>Готовые шторы</Text>
          </Pressable>
        </View>
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
            clientPhone={item.clientPhone}
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
      </>
      )}
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
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  createFlex: {
    flex: 1,
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  createSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: colors.surface,
  },
  createPressed: {
    opacity: opacity.pressed,
  },
  createText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
  createSecondaryText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    paddingBottom: tabBarSpace,
  },
});

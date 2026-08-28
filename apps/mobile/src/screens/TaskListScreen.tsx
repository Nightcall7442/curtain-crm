import {
  availableTransitions,
  ORDER_STATUS_LABELS_RU,
  TransitionKind,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, Pill } from '../components/Card';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

/**
 * Мои задачи.
 *
 * Отдельной сущности «задача» в системе нет — есть заказы и этапы их
 * жизненного цикла. Задачей здесь считается заказ, по которому сотрудник
 * ПРЯМО СЕЙЧАС может выполнить действие: список действий приходит из той же
 * таблицы переходов, что и кнопки в карточке заказа.
 *
 * Это честная замена «5 из 6 выполнено» с макета: придумывать сущность,
 * которой заказчик не заказывал, мы не стали, а показывать выдуманный
 * счётчик — тем более.
 */
export function TaskListScreen(): ReactElement {
  const navigation = useNavigation();
  const { user } = useAuth();

  const orders = trpc.orders.list.useQuery({ page: 1, pageSize: 50 });

  const tasks = useMemo(() => {
    const roles = user?.roles ?? [];

    return (orders.data?.items ?? [])
      .map((order) => ({
        order,
        // Отмену исключаем: «отменить заказ» — не задача исполнителя.
        actions: availableTransitions(order.status, roles).filter(
          (transition) => transition.kind !== TransitionKind.CANCEL,
        ),
      }))
      .filter((entry) => entry.actions.length > 0);
  }, [orders.data, user]);

  return (
    <FlatList
      data={tasks}
      keyExtractor={(entry) => entry.order.id.toString()}
      contentContainerStyle={styles.list}
      refreshing={orders.isFetching && !orders.isLoading}
      onRefresh={() => {
        void orders.refetch();
      }}
      ListHeaderComponent={
        tasks.length === 0 ? null : (
          <Text style={styles.heading}>
            {`Заказов, ждущих вашего действия: ${tasks.length.toString()}`}
          </Text>
        )
      }
      ListEmptyComponent={
        orders.isLoading ? null : (
          <Empty
            message="Задач нет"
            hint="Здесь появляются заказы, по которым вы можете сделать следующий шаг"
          />
        )
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            navigation.navigate('OrderDetail', { orderId: item.order.id });
          }}
          style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <View style={styles.headerRow}>
            <Text style={styles.number}>
              {item.order.orderNumber ?? `#${item.order.id.toString()}`}
            </Text>
            <Pill text={ORDER_STATUS_LABELS_RU[item.order.status]} tone="info" />
          </View>

          <Text style={styles.client} numberOfLines={1}>
            {item.order.clientName}
          </Text>

          <View style={styles.actions}>
            {item.actions.map((action) => (
              <Text key={action.to} style={styles.action}>
                {`• ${action.label}`}
              </Text>
            ))}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  heading: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {
    ...typography.value,
    color: colors.header,
    fontWeight: '700',
  },
  client: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
  },
});

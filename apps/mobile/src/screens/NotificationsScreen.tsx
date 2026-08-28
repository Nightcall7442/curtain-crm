import { useNavigation } from '@react-navigation/native';
import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty } from '../components/Card';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

/**
 * Уведомления.
 *
 * Лента всегда собственная: адресат берётся из контекста запроса на сервере,
 * поэтому чужие уведомления сюда не попадут даже при подмене параметров.
 *
 * Нажатие открывает связанный заказ и одновременно отмечает уведомление
 * прочитанным: отдельная кнопка «прочитано» на маленьком экране только
 * добавляет промахов пальцем.
 */
export function NotificationsScreen(): ReactElement {
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const query = trpc.notifications.list.useQuery({ page: 1, pageSize: 50 });

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      utils.notifications.list.invalidate(),
      utils.notifications.unreadCount.invalidate(),
    ]);
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: invalidate });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: invalidate });

  const items = query.data?.items ?? [];
  const hasUnread = items.some((item) => !item.isRead);

  return (
    <View style={styles.container}>
      {hasUnread && (
        <Pressable
          onPress={() => {
            markAllAsRead.mutate();
          }}
          style={({ pressed }) => [styles.markAll, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Text style={styles.markAllText}>Отметить все прочитанными</Text>
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
          query.isLoading ? null : (
            <Empty
              message="Уведомлений пока нет"
              hint="Здесь появятся события по вашим заказам и сменам"
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (!item.isRead) markAsRead.mutate({ id: item.id });
              if (item.relatedOrderId !== null) {
                navigation.navigate('OrderDetail', { orderId: item.relatedOrderId });
              }
            }}
            style={({ pressed }) => [
              styles.card,
              item.isRead ? null : styles.cardUnread,
              pressed ? styles.pressed : null,
            ]}
            accessibilityRole="button"
          >
            <View style={styles.headerRow}>
              {!item.isRead && <View style={styles.dot} />}
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
            </View>

            <Text style={styles.body} numberOfLines={3}>
              {item.body}
            </Text>

            <Text style={styles.time}>
              {new Date(item.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Pressable>
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
  markAll: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markAllText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.value,
    flex: 1,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});

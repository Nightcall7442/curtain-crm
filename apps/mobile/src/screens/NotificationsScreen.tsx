import {
  isImportantNotification,
  NOTIFICATION_TONES,
  type NotificationTone,
  type NotificationType,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Skeleton } from '../components/Card';
import { Icon, NOTIFICATION_ICONS } from '../components/Icon';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, tabBarSpace, typography, opacity } from '../theme';

/**
 * Уведомления.
 *
 * Лента всегда собственная: адресат берётся из контекста запроса на сервере,
 * поэтому чужие уведомления сюда не попадут даже при подмене параметров.
 *
 * Нажатие открывает связанный заказ и одновременно отмечает уведомление
 * прочитанным: отдельная кнопка «прочитано» на маленьком экране только
 * добавляет промахов пальцем.
 *
 * Фильтры считаются НА КЛИЕНТЕ по уже полученной странице, а не запросом на
 * сервер: лента сотрудника короткая, а переключение вкладки, которое ждёт
 * сеть, ощущается сломанным. Если лента вырастет, фильтр придётся унести в
 * процедуру вместе с пагинацией — сейчас это было бы преждевременно.
 */

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'unread', label: 'Непрочитанные' },
  { key: 'important', label: 'Важные' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export function NotificationsScreen(): ReactElement {
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<FilterKey>('all');

  const query = trpc.notifications.list.useQuery({ page: 1, pageSize: 50 });

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      utils.notifications.list.invalidate(),
      utils.notifications.unreadCount.invalidate(),
    ]);
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: invalidate });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: invalidate });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const visible = useMemo(() => {
    if (filter === 'unread') return items.filter((item) => !item.isRead);
    if (filter === 'important') return items.filter((item) => isImportantNotification(item.type));

    return items;
  }, [items, filter]);

  const hasUnread = items.some((item) => !item.isRead);

  return (
    <View style={styles.container}>
      {/* Фильтры-чипы */}
      <View style={styles.filters}>
        {FILTERS.map((entry) => {
          const active = filter === entry.key;

          return (
            <Pressable
              key={entry.key}
              onPress={() => {
                setFilter(entry.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
        data={visible}
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
              message={emptyMessage(filter)}
              hint={
                filter === 'all'
                  ? 'Здесь появятся события по вашим заказам и сменам'
                  : 'Переключите фильтр, чтобы увидеть остальные'
              }
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
            style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <TypeTile type={item.type} />

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.time}>{shortTime(item.createdAt)}</Text>
              </View>

              <Text style={styles.text} numberOfLines={2}>
                {item.body}
              </Text>
            </View>

            {/* Точка непрочитанного — справа, как в макете */}
            {!item.isRead && <View style={styles.dot} accessibilityLabel="Не прочитано" />}
          </Pressable>
        )}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/** Цветная плитка со значком типа события. */
function TypeTile({ type }: { readonly type: NotificationType }): ReactElement {
  const palette = TILE_PALETTE[NOTIFICATION_TONES[type]];

  return (
    <View style={[styles.tile, { backgroundColor: palette.background }]}>
      <Icon name={NOTIFICATION_ICONS[type]} size={19} color={palette.foreground} />
    </View>
  );
}

const TILE_PALETTE: Readonly<
  Record<NotificationTone, { readonly background: string; readonly foreground: string }>
> = {
  accent: { background: colors.accentSoft, foreground: colors.accent },
  info: { background: colors.infoSoft, foreground: colors.info },
  warning: { background: colors.warningSoft, foreground: colors.warning },
  danger: { background: colors.dangerSoft, foreground: colors.danger },
  neutral: { background: colors.neutralSoft, foreground: colors.textSecondary },
};

/**
 * Время события.
 *
 * Сегодняшнее показывается часами, вчерашнее — словом, остальное — датой.
 * Полная дата и время у каждой строки превратили бы ленту в таблицу, а
 * сотруднику нужно понять «только что или на прошлой неделе».
 */
function shortTime(value: string | Date): string {
  const date = new Date(value);
  const now = new Date();

  const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

  if (sameDay(date, now)) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(date, yesterday)) return 'Вчера';

  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function emptyMessage(filter: FilterKey): string {
  if (filter === 'unread') return 'Непрочитанных нет';
  if (filter === 'important') return 'Важных уведомлений нет';

  return 'Уведомлений пока нет';
}

/* -------------------------------------------------------------------------- */

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
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  markAll: {
    minHeight: 44,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
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
    opacity: opacity.pressed,
  },
  list: {
    padding: spacing.lg,
    flexGrow: 1,
    paddingBottom: tabBarSpace,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  title: {
    ...typography.value,
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accentBright,
    marginLeft: spacing.sm,
  },
});

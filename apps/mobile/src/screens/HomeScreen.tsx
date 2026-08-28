import { isActiveStatus, ORDER_STATUS_LABELS_RU } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderCard } from '../components/OrderCard';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, spacing, typography } from '../theme';

/**
 * Главный экран: что нужно сотруднику в первые пять секунд после запуска.
 *
 * Открыта ли смена, сколько заказов на нём и что горит по срокам. Сводных
 * показателей компании здесь нет — они в веб-панели у руководства, рядовому
 * сотруднику важны только его собственные задачи.
 */
export function HomeScreen(): ReactElement {
  const navigation = useNavigation();
  const { user } = useAuth();

  const utils = trpc.useUtils();
  const shift = trpc.shifts.current.useQuery();
  const orders = trpc.orders.list.useQuery({ page: 1, pageSize: 50 });
  const unread = trpc.notifications.unreadCount.useQuery();

  const active = useMemo(
    () =>
      (orders.data?.items ?? []).filter((order) => isActiveStatus(order.status)),
    [orders.data],
  );

  const overdue = useMemo(
    () =>
      active.filter(
        (order) => order.deadline !== null && new Date(order.deadline) < new Date(),
      ),
    [active],
  );

  /** Ближайшие по сроку — то, чем стоит заняться сегодня. */
  const upcoming = useMemo(
    () =>
      [...active]
        .sort((a, b) => {
          if (a.deadline === null) return 1;
          if (b.deadline === null) return -1;
          return a.deadline.localeCompare(b.deadline);
        })
        .slice(0, 5),
    [active],
  );

  const isRefreshing = orders.isFetching && !orders.isLoading;

  const refresh = (): void => {
    void Promise.all([
      utils.shifts.current.invalidate(),
      utils.orders.list.invalidate(),
      utils.notifications.unreadCount.invalidate(),
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <Card>
        <Text style={styles.greeting}>{`Здравствуйте, ${user?.fullName ?? ''}`}</Text>
        <View style={styles.shiftRow}>
          <Pill
            text={shift.data === null || shift.data === undefined ? 'Смена не открыта' : 'Смена открыта'}
            tone={shift.data === null || shift.data === undefined ? 'warning' : 'positive'}
          />
        </View>

        {shift.data !== null && shift.data !== undefined && (
          <View style={styles.shiftDetails}>
            <Row label="Филиал" value={shift.data.branchName} />
            <Row
              label="Начало смены"
              value={new Date(shift.data.startedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          </View>
        )}
      </Card>

      <View style={styles.stats}>
        <StatTile label="Заказов в работе" value={active.length.toString()} />
        <StatTile
          label="Просрочено"
          value={overdue.length.toString()}
          tone={overdue.length > 0 ? 'danger' : 'neutral'}
        />
        <StatTile
          label="Уведомлений"
          value={(unread.data ?? 0).toString()}
          tone={(unread.data ?? 0) > 0 ? 'accent' : 'neutral'}
        />
      </View>

      <Card>
        <CardTitle
          title="Ближайшие сроки"
          icon="⏱"
          action={
            // Единственный вход на экран «Мои задачи»: он показывает заказы,
            // по которым сотрудник МОЖЕТ что-то сделать прямо сейчас, — это
            // другой вопрос, чем «что горит по срокам» ниже.
            <Pressable
              onPress={() => {
                navigation.navigate('TaskList');
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              {({ pressed }) => (
                <Text style={[styles.taskLink, pressed ? styles.taskLinkPressed : null]}>
                  Мои задачи ›
                </Text>
              )}
            </Pressable>
          }
        />
        {upcoming.length === 0 ? (
          <Empty
            message="Активных заказов нет"
            hint="Новые заказы появятся здесь, как только вас на них назначат"
          />
        ) : (
          <View>
            {upcoming.map((order) => (
              <View key={order.id} style={styles.upcomingRow}>
                <Text style={styles.upcomingNumber}>
                  {order.orderNumber ?? `#${order.id.toString()}`}
                </Text>
                <Text style={styles.upcomingStatus} numberOfLines={1}>
                  {ORDER_STATUS_LABELS_RU[order.status]}
                </Text>
                <Text style={styles.upcomingDeadline}>
                  {order.deadline === null
                    ? '—'
                    : new Date(order.deadline).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {overdue.length > 0 && (
        <View>
          <Text style={styles.sectionHeading}>Просроченные заказы</Text>
          {overdue.slice(0, 5).map((order) => (
            <OrderCard
              key={order.id}
              orderNumber={order.orderNumber ?? `#${order.id.toString()}`}
              clientName={order.clientName}
              status={order.status}
              priority={order.priority}
              deadline={order.deadline}
              workPrice={order.workPrice}
              onPress={() => {
                navigation.navigate('OrderDetail', { orderId: order.id });
              }}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'neutral' | 'danger' | 'accent';
}): ReactElement {
  const color =
    tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.textPrimary;

  return (
    <Card style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  taskLink: {
    ...typography.caption,
    color: colors.accent,
  },
  taskLinkPressed: {
    opacity: 0.6,
  },
  shiftRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  shiftDetails: {
    marginTop: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  tileValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  tileLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  upcomingNumber: {
    ...typography.value,
    color: colors.header,
    marginRight: spacing.md,
  },
  upcomingStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  upcomingDeadline: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sectionHeading: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});

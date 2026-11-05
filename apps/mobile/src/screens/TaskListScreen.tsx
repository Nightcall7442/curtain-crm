import {
  availableTransitions,
  isActiveStatus,
  isOverdueDate,
  isTaskActive,
  ORDER_STATUS_LABELS,
  OrderStatus,
  transitionLabel,
  TransitionKind,
  type OrderStatus as OrderStatusName,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Pill, SectionHeader, Skeleton } from '../components/Card';
import { TaskCard } from '../components/TaskCard';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, typography, opacity } from '../theme';

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
  const { t, m, locale } = useLocale();
  const navigation = useNavigation();
  const { user } = useAuth();

  const orders = trpc.orders.list.useQuery({ page: 1, pageSize: 50 });
  /*
    Поручения руководителя — тоже задачи сотрудника. Без них экран писал
    «Задач нет», а рядом, в «Доп работах» и в профиле, висело открытое
    поручение: два «списка задач» противоречили друг другу.
  */
  const assigned = trpc.tasks.my.useQuery();
  const activeAssigned = (assigned.data ?? []).filter((task) => isTaskActive(task.status));

  const tasks = useMemo(() => {
    const roles = user?.roles ?? [];

    return (orders.data?.items ?? [])
      .map((order) => ({
        order,
        // Отмену исключаем: «отменить заказ» — не задача исполнителя.
        // Тип заказа передаём: у готовых штор часть переходов своя, и без
        // него список действий разошёлся бы с тем, что разрешает сервер.
        actions: availableTransitions(order.status, roles, order.orderType).filter(
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
        <>
          {activeAssigned.length > 0 && (
            <View style={styles.assigned}>
              <SectionHeader title={m('work.filterTasks')} />
              {activeAssigned.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </View>
          )}
          {tasks.length > 0 && (
            <Text style={styles.heading}>{m('taskList.heading', { n: tasks.length })}</Text>
          )}
        </>
      }
      ListEmptyComponent={
        // Есть поручения — пустого состояния нет: «Задач нет» под ними было бы неправдой.
        activeAssigned.length > 0 ? null : orders.isLoading ? (
          <Skeleton />
        ) : orders.isError ? (
          <ErrorState />
        ) : (
          <Empty
            message={m('taskList.empty')}
            hint={m('taskList.emptyHint')}
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
            <Pill
              text={t(ORDER_STATUS_LABELS, item.order.status)}
              tone={statusTone(item.order.status, item.order.deadline)}
            />
          </View>

          <Text style={styles.client} numberOfLines={1}>
            {item.order.clientName}
          </Text>

          <View style={styles.actions}>
            {item.actions.map((action) => (
              // Подпись — на языке приложения: `label` в таблице переходов русский,
              // и по-узбекски список действий шёл кириллицей.
              <Text key={action.to} style={styles.action}>
                {`• ${transitionLabel(action, locale)}`}
              </Text>
            ))}
          </View>
        </Pressable>
      )}
    />
  );
}

/**
 * Статусы, в которых заказ стоит и ждёт чьего-то решения, — янтарём.
 *
 * То же правило, что у чипа статуса в `OrderCard`: прежде здесь каждый
 * статус был синим («В пошиве» и «Ждёт проверки админа» одним цветом), и
 * экран выпадал из цветового языка остальных списков.
 */
const WAITING_STATUSES: ReadonlySet<OrderStatusName> = new Set<OrderStatusName>([
  OrderStatus.NEW,
  OrderStatus.PENDING_ADMIN_REVIEW,
  OrderStatus.REJECTED_TO_CEO,
  OrderStatus.PENDING_SEWING_ASSIGNMENT,
  OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
]);

/** Брак и просрочка — терракота, ожидание — янтарь, работа в движении — зелёный. */
function statusTone(
  status: OrderStatusName,
  deadline: string | null,
): 'neutral' | 'positive' | 'warning' | 'danger' {
  const overdue = deadline !== null && isActiveStatus(status) && isOverdueDate(deadline);
  if (overdue || status === OrderStatus.QC_FAILED) return 'danger';
  if (!isActiveStatus(status)) return 'neutral';
  if (WAITING_STATUSES.has(status)) return 'warning';
  return 'positive';
}

const styles = StyleSheet.create({
  assigned: {
    marginBottom: spacing.sm,
  },
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  pressed: {
    opacity: opacity.pressed,
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

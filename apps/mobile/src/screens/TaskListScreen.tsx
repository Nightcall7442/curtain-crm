import {
  availableTransitions,
  isTaskActive,
  ORDER_STATUS_LABELS,
  transitionLabel,
  TransitionKind,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, SectionHeader, Skeleton } from '../components/Card';
import { OrderChip, orderStatusTone } from '../components/OrderCard';
import { ShiftRequiredBanner } from '../components/ShiftRequiredBanner';
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
          {/*
            Без смены сервер не даёт ни отметить поручение, ни сдвинуть заказ
            (412), и галочка в карточке поручения погашена. Баннер говорит
            почему и ведёт туда, где смену начинают.
          */}
          <ShiftRequiredBanner style={styles.banner} />
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
            {/*
              Статус — та же плашка, что в списке заказов: длинный
              («Ждёт назначения установщика») переносится, а не режется
              многоточием и не ломает номер заказа на «DH-» и «000507».
            */}
            <OrderChip
              text={t(ORDER_STATUS_LABELS, item.order.status)}
              tone={orderStatusTone(item.order.status, item.order.deadline)}
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

const styles = StyleSheet.create({
  banner: {
    marginBottom: spacing.md,
  },
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  number: {
    ...typography.value,
    color: colors.header,
    // Номер не ужимается: «DH-000507» читают целиком, ужимается статус.
    flexShrink: 0,
    // Высота строки = высоте плашки статуса (16 + 2 × 4): номер стоит по её центру.
    lineHeight: typography.footnote.lineHeight + spacing.xs * 2,
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

import {
  canSeeClientMoney,
  CORNICE_STATUS_LABELS,
  CorniceStatus,
  isAwaitingPayment,
  ORDER_INTAKE_ROLES,
  Role,
  TaskStatus,
} from '@curtain-crm/shared';

import { useNavigation } from '@react-navigation/native';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Skeleton } from '../components/Card';
import { Icon } from '../components/Icon';
import { PersonalWorkCard } from '../components/PersonalWorkCard';
import { TerminalCheckCard } from '../components/TerminalCheckCard';
import { OrderCard } from '../components/OrderCard';
import { TaskCard } from '../components/TaskCard';
import { ExecutorFilterSheet } from '../components/work/ExecutorFilterSheet';
import { OrderSearchBar } from '../components/work/OrderSearchBar';
import { statusFilterInput, statusFilterLabel, type StatusFilter } from '../components/work/orderFilter';
import { StatusFilterSheet } from '../components/work/StatusFilterSheet';
import { useAuth, useCanDispatchOrders, useIsManagement } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n/messages';

/**
 * Работа сотрудника: его заказы И доп работы от руководства.
 *
 * Заказы — этапы конвейера, где сотрудник исполнитель; доп работы —
 * дополнительная работа мимо конвейера («съезди за тканью»), которую выдаёт
 * директор или админ. Оба списка живут в одной вкладке: у сотрудника одно
 * место, где лежит вся его работа.
 *
 * Сервер отдаёт только те заказы, в которых сотрудник участвует, — фильтры
 * на этом экране лишь сужают выдачу, а не расширяют её. Обойти ограничение,
 * подобрав параметры, невозможно.
 */

type Filter = 'active' | 'all' | 'overdue' | 'tasks' | 'personal' | 'cornice';

/** Заказов на страницу подгрузки: экран телефона — это 4–5 карточек. */
const ORDERS_PAGE_SIZE = 30;
/** Пауза после ввода, после которой поиск уходит на сервер. */
const SEARCH_DEBOUNCE_MS = 300;

const FILTERS: readonly { readonly key: Filter; readonly label: MessageKey }[] = [
  { key: 'active', label: 'work.filterActive' },
  { key: 'overdue', label: 'work.filterOverdue' },
  { key: 'all', label: 'work.filterAll' },
  { key: 'tasks', label: 'work.filterTasks' },
  { key: 'personal', label: 'work.filterPersonal' },
];

/*
  Карнизы — вкладка только для установщиков.

  Карниз идёт мимо цепочки статусов, поэтому в общем списке заказов его не
  найти: заказ на карнизе может быть в любом производственном статусе. Это
  свободная работа бригады, и её берут отсюда.
*/
const CORNICE_FILTER: { readonly key: Filter; readonly label: MessageKey } = {
  key: 'cornice',
  label: 'work.filterCornice',
};

export function WorkScreen(): ReactElement {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { m, t, locale } = useLocale();
  const [filter, setFilter] = useState<Filter>('active');

  /**
   * Кнопку создания видят только те, кому сервер это разрешает.
   *
   * Это удобство, а не защита: `orders.create` — процедура уровня приёмки,
   * и швея получит отказ, даже если доберётся до экрана в обход интерфейса.
   * Но показывать кнопку, которая заведомо откажет, незачем.
   */
  const canCreate = (user?.roles ?? []).some((role) => ORDER_INTAKE_ROLES.includes(role));
  const isManager = useIsManagement();
  /* Без открытой смены сервер не примет ни одного действия по работе —
     баннер говорит об этом до того, как кнопка ответит отказом. */
  const shift = trpc.shifts.current.useQuery(undefined, { enabled: !isManager });
  const isCorniceInstaller = (user?.roles ?? []).includes(Role.CORNICE_INSTALLER);
  const isSeller = (user?.roles ?? []).includes(Role.SELLER);
  const filters = isCorniceInstaller ? [...FILTERS, CORNICE_FILTER] : FILTERS;

  /*
    Поиск и фильтры. Строка поиска уходит на сервер с задержкой: запрос на
    каждую букву перегружал бы и сеть, и список. Фильтр по исполнителю — только
    тем, кто ведёт заказы; «С долгом» — тем, кто видит деньги клиента.
  */
  const canDispatch = useCanDispatchOrders();
  const seesMoney = canSeeClientMoney(user?.roles ?? []);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [executor, setExecutor] = useState<{ readonly id: number; readonly fullName: string } | null>(null);
  const [sheet, setSheet] = useState<'status' | 'executor' | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  /*
    Подгрузка страницами при прокрутке. Поиск и фильтры входят в ключ
    запроса: смена любого из них начинает выдачу с первой страницы, а не
    дописывает к старой. «Просрочены» отбирает сервер — по всем заказам, а не
    по первой странице.
  */
  const query = trpc.orders.list.useInfiniteQuery(
    {
      pageSize: ORDERS_PAGE_SIZE,
      includeArchived: filter === 'all',
      ...(filter === 'overdue' ? { overdue: true } : {}),
      ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
      ...statusFilterInput(statusFilter),
      ...(executor === null ? {} : { assigneeId: executor.id }),
    },
    {
      enabled: filter !== 'tasks' && filter !== 'personal' && filter !== 'cornice',
      getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    },
  );

  /*
    Очередь карнизов и уже сделанные — двумя запросами: сделанные нужны
    реже, но нужны, и мешать их со свободной работой в одном списке значило
    бы прятать саму работу под историей.
  */
  const corniceQueue = trpc.orders.corniceQueue.useQuery(
    { done: false },
    { enabled: filter === 'cornice' },
  );
  const corniceDone = trpc.orders.corniceQueue.useQuery(
    { done: true },
    { enabled: filter === 'cornice' },
  );

  /**
   * Доп работы запрашиваются всегда, а не только на своей вкладке: счётчик
   * на чипе — единственное место, откуда сотрудник узнаёт о новой доп. работе,
   * не заходя в уведомления.
   */
  const tasksQuery = trpc.tasks.my.useQuery();

  /*
    Личные работы — то, что сотрудник шьёт себе в цеху. Список свой у
    каждого: руководство видит сводку в панели, а здесь человек ведёт
    только собственные записи.
  */
  const personalQuery = trpc.personalWorks.my.useQuery({}, { enabled: filter === 'personal' });
  const openTasks = (tasksQuery.data ?? []).filter(
    (task) => task.status === TaskStatus.OPEN,
  );

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtersActive = debouncedSearch.length > 0 || statusFilter !== null || executor !== null;

  return (
    <View style={styles.container}>
      {!isManager && shift.data === null && (
        <Pressable
          onPress={() => {
            navigation.navigate('CheckInOut');
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.shiftBanner, pressed ? styles.createPressed : null]}
        >
          <Icon name="checkin" size={18} color={colors.warning} />
          <Text style={styles.shiftBannerText}>{m('work.noShift')}</Text>
        </Pressable>
      )}

      {/*
        Фильтры прокручиваются по горизонтали.

        Раньше это был обычный ряд: четыре чипа не влезали в ширину телефона,
        «Доп работы» обрезались краем экрана, и добраться до них было нечем —
        ряд выглядел застывшим. Ширина зависит и от длины подписи со
        счётчиком («Доп работы (12)»), и от системного размера шрифта, так
        что «подобрать отступы, чтобы влезло» — не решение: при следующей
        вкладке или крупном шрифте всё повторится.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Ряд занимает высоту по содержимому, иначе ScrollView растянется
        // на весь экран и заберёт прокрутку у списка заказов.
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {filters.map((entry) => {
          const isActive = entry.key === filter;
          const label =
            entry.key === 'tasks' && openTasks.length > 0
              ? `${m(entry.label)} (${openTasks.length.toString()})`
              : m(entry.label);
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
      </ScrollView>

      {filter === 'cornice' ? (
        <FlatList
          data={[...(corniceQueue.data ?? []), ...(corniceDone.data ?? [])]}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshing={corniceQueue.isFetching && !corniceQueue.isLoading}
          onRefresh={() => {
            void corniceQueue.refetch();
            void corniceDone.refetch();
          }}
          ListEmptyComponent={
            corniceQueue.isLoading ? (
              <Skeleton />
            ) : corniceQueue.isError ? (
              <ErrorState />
            ) : (
              <Empty
                message={m('work.noCornice')}
                hint={m('work.noCorniceHint')}
              />
            )
          }
          renderItem={({ item }) => (
            <View>
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
              <Text style={styles.corniceNote}>
                {item.corniceStatus === CorniceStatus.PENDING
                  ? t(CORNICE_STATUS_LABELS, CorniceStatus.PENDING)
                  : `${t(CORNICE_STATUS_LABELS, item.corniceStatus)} · ${
                      item.corniceInstallerName ?? m('work.corniceNoWorker')
                    }`}
              </Text>
            </View>
          )}
        />
      ) : filter === 'tasks' ? (
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
                message={m('work.noTasks')}
                hint={m('work.noTasksHint')}
              />
            )
          }
          renderItem={({ item }) => <TaskCard task={item} />}
        />
      ) : filter === 'personal' ? (
        <FlatList
          data={personalQuery.data ?? []}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshing={personalQuery.isFetching && !personalQuery.isLoading}
          onRefresh={() => {
            void personalQuery.refetch();
          }}
          /*
            Кнопка «Добавить» — заголовком списка, а не отдельной строкой
            над ним: тогда она уезжает вместе с прокруткой и не занимает
            экран, когда работ накопилось много.
          */
          ListHeaderComponent={
            <Pressable
              onPress={() => {
                navigation.navigate('PersonalWorkCreate');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.create,
                styles.personalCreate,
                pressed ? styles.createPressed : null,
              ]}
            >
              <Icon name="assigned" size={18} color={colors.onAccent} />
              <Text style={styles.createText}>{m('work.addPersonal')}</Text>
            </Pressable>
          }
          ListEmptyComponent={
            personalQuery.isLoading ? (
              <Skeleton />
            ) : personalQuery.isError ? (
              <ErrorState />
            ) : (
              <Empty
                message={m('work.noPersonal')}
                hint={m('work.noPersonalHint')}
              />
            )
          }
          renderItem={({ item }) => <PersonalWorkCard work={item} />}
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
            <Text style={styles.createText}>{m('work.newOrder')}</Text>
          </Pressable>

          {/*
            Одна кнопка на всё про готовые шторы. Раньше их было две —
            «Готовые шторы» (пошив для склада) и «Продать» (с полки), — с
            одним значком и одной интонацией: владелец увидел в них одно и то
            же. Теперь кнопка ведёт на склад, а там уже — продать или заказать
            цеху ещё.
          */}
          <Pressable
            onPress={() => {
              navigation.navigate('ReadyMadeStock');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.createSecondary,
              styles.createFlex,
              pressed ? styles.createPressed : null,
            ]}
          >
            <Icon name="orders" size={18} color={colors.accentStrong} />
            <Text style={styles.createSecondaryText}>{m('work.readyMade')}</Text>
          </Pressable>
        </View>
      )}

      {/*
        Касса и раздел руководителя — одной строкой, ниже приёма заказа.

        Рядом с «Новым заказом» их ставить нельзя: заказ и чек — события
        разного веса, и две одинаковые кнопки в ряд заставляют читать
        подписи вместо того, чтобы нажимать не глядя. А между собой они
        равны: обе уводят в соседний раздел, и каждой отдельная строка
        стоила слишком дорого — до заказов приходилось прокручивать треть
        экрана. Отдельной вкладки руководителю не дали намеренно: нижняя
        панель одна на всех, и пятая вкладка, видимая двоим из восемнадцати,
        сделала бы её разной у разных людей.
      */}
      {(canCreate || isManager) && (
        <View style={styles.createRow}>
          {canCreate && (
            <Pressable
              onPress={() => {
                navigation.navigate('CashDesk');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.createSecondary,
                styles.createFlex,
                pressed ? styles.createPressed : null,
              ]}
            >
              <Icon name="paid" size={18} color={colors.accentStrong} />
              <Text style={styles.createSecondaryText}>{m('work.cashDesk')}</Text>
            </Pressable>
          )}

          {isManager && (
            <Pressable
              onPress={() => {
                navigation.navigate('Management');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.createSecondary,
                styles.createFlex,
                pressed ? styles.createPressed : null,
              ]}
            >
              <Icon name="roles" size={18} color={colors.accentStrong} />
              <Text style={styles.createSecondaryText}>{m('work.management')}</Text>
            </Pressable>
          )}
        </View>
      )}

      <OrderSearchBar
        search={search}
        onSearch={setSearch}
        statusLabel={statusFilter === null ? null : statusFilterLabel(statusFilter, locale)}
        onStatusPress={() => {
          setSheet('status');
        }}
        onStatusClear={() => {
          setStatusFilter(null);
        }}
        executorLabel={executor?.fullName ?? null}
        onExecutorPress={() => {
          setSheet('executor');
        }}
        onExecutorClear={() => {
          setExecutor(null);
        }}
        showExecutor={canDispatch}
        onReset={() => {
          setSearch('');
          setDebouncedSearch('');
          setStatusFilter(null);
          setExecutor(null);
        }}
      />
      <StatusFilterSheet
        visible={sheet === 'status'}
        value={statusFilter}
        withDebt={seesMoney}
        onSelect={(next) => {
          setStatusFilter(next);
          setSheet(null);
        }}
        onClose={() => {
          setSheet(null);
        }}
      />
      {canDispatch && (
        <ExecutorFilterSheet
          visible={sheet === 'executor'}
          selectedId={executor?.id ?? null}
          onSelect={(person) => {
            setExecutor(person);
            setSheet(null);
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => {
          void query.refetch();
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator style={styles.more} color={colors.accent} /> : null
        }
        /*
          Терминальные чеки — задание продавцов на день, поэтому в «Работе»,
          над заказами: это обязанность, а не касса. Остальным ролям — нет.
        */
        ListHeaderComponent={filter === 'active' && isSeller ? <TerminalCheckCard /> : null}
        ListEmptyComponent={
          query.isLoading ? (
            <Skeleton />
          ) : query.isError ? (
            <ErrorState />
          ) : (
            <Empty
              message={
                filtersActive
                  ? m('work.noMatches')
                  : filter === 'overdue'
                    ? m('work.noOverdue')
                    : m('work.noOrders')
              }
              {...(filtersActive ? {} : { hint: m('work.noOrdersHint') })}
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
            remaining={item.remainingPayment}
            installationAt={item.installationAt}
            executor={item.currentExecutor === null ? null : { name: item.currentExecutor.fullName }}
            awaitingPayment={isAwaitingPayment(item)}
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
  // `flexGrow: 0` обязателен: без него ScrollView займёт всю оставшуюся
  // высоту экрана и список заказов окажется под ним.
  //
  // `flexShrink: 0` тоже обязателен. У ScrollView по умолчанию
  // `flexShrink: 1` — и в React Native, и в react-native-web, — и когда
  // кнопки и список не влезают в экран, ряд сжимался с 34 до 15 px и
  // обрезался: выглядело так, будто чипы ушли под шапку.
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
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
  shiftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  shiftBannerText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
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
  // Кнопка внутри списка: нижний отступ отделяет её от первой карточки.
  personalCreate: {
    marginBottom: spacing.md,
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
  corniceNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  more: {
    paddingVertical: spacing.lg,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    paddingBottom: tabBarSpace,
  },
});

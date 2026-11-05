import {
  formatIsoDateShort,
  formatTime,
  isImportantNotification,
  notificationTone,
  notificationDestination,
  type NotificationDestination,
  type NotificationTone,
  type NotificationType,
  PayrollRecordStatus,
  todayIso,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Empty, ErrorState } from '../components/Card';
import { Icon, NOTIFICATION_ICONS, type IconName } from '../components/Icon';
import { trpc } from '../lib/trpc';
import {
  cardShadow,
  colors,
  radius,
  sizes,
  spacing,
  tabBarSpace,
  typography,
  opacity,
  fonts,
} from '../theme';
import { useLocale } from '../hooks/useLocale';
import type { MessageKey } from '../i18n/messages';

/**
 * Уведомления.
 *
 * Лента всегда собственная: адресат берётся из контекста запроса на сервере,
 * поэтому чужие уведомления сюда не попадут даже при подмене параметров.
 *
 * Нажатие открывает то, о чём уведомление, — заказ, поручение, очередь
 * выходных, терминальные чеки (см. `notificationDestination`), — и
 * одновременно отмечает его прочитанным: отдельная кнопка «прочитано» на
 * маленьком экране только добавляет промахов пальцем.
 *
 * Фильтры считаются НА КЛИЕНТЕ по уже полученной странице, а не запросом на
 * сервер: лента сотрудника короткая, а переключение вкладки, которое ждёт
 * сеть, ощущается сломанным. Если лента вырастет, фильтр придётся унести в
 * процедуру вместе с пагинацией — сейчас это было бы преждевременно.
 */

const FILTERS = [
  { key: 'all', label: 'notif.filterAll' },
  { key: 'unread', label: 'notif.filterUnread' },
  { key: 'important', label: 'notif.filterImportant' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export function NotificationsScreen(): ReactElement {
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const { m } = useLocale();

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

  /*
    Подтверждение получения зарплаты.

    После успеха обновляется именно лента: состояние расчёта приходит
    вместе с уведомлением, и без перезапроса кнопка осталась бы на месте.
  */
  const confirmReceipt = trpc.payroll.confirmReceipt.useMutation({
    onSuccess: invalidate,
    onError(error) {
      Alert.alert(m('notif.confirmError'), error.message);
    },
  });

  /** Открывает экран, к которому относится уведомление. */
  const open = (destination: NotificationDestination): void => {
    switch (destination.kind) {
      case 'order':
        navigation.navigate('OrderDetail', { orderId: destination.orderId });
        return;
      case 'task':
        navigation.navigate('TaskDetail', { taskId: destination.taskId });
        return;
      case 'tasks':
        navigation.navigate('TaskList');
        return;
      case 'dayOffApprovals':
        navigation.navigate('DayOffApprovals');
        return;
      case 'dayOff':
        navigation.navigate('DayOff');
        return;
      case 'terminalChecks':
        navigation.navigate('TerminalChecks');
        return;
      case 'cashDesk':
        navigation.navigate('CashDesk');
        return;
      case 'attendance':
        navigation.navigate('CheckInOut');
        return;
      case 'rating':
        navigation.navigate('Rating');
        return;
      case 'profile':
        navigation.navigate('Profile');
        return;
    }
  };

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
                {m(entry.label)}
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
          <Text style={styles.markAllText}>{m('notif.markAll')}</Text>
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
            <NotificationSkeleton />
          ) : query.isError ? (
            <ErrorState />
          ) : (
            <Empty
              message={m(emptyMessage(filter))}
              hint={filter === 'all' ? m('notif.emptyHintAll') : m('notif.emptyHintFilter')}
            />
          )
        }
        renderItem={({ item }) => {
          // Отдельная константа, а не `item.relatedPayrollRecordId` по месту:
          // сужение типа у `const` доживает до колбэка кнопки, у свойства —
          // нет, и там пришлось бы приводить тип руками.
          const payrollRecordId = item.relatedPayrollRecordId;

          return (
            <Pressable
              onPress={() => {
                if (!item.isRead) markAsRead.mutate({ id: item.id });
                const destination = notificationDestination(item.type, {
                  orderId: item.relatedOrderId,
                  taskId: item.relatedTaskId,
                });
                if (destination !== null) open(destination);
              }}
              style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
              accessibilityRole="button"
            >
              <TypeTile type={item.type} />

              <View style={styles.body}>
                {/*
                  Заголовок переносится, а не обрезается.

                  В одну строку от «Заказ DH-000527: Ждёт назначения
                  установщика» оставалось «Заказ DH-000527: Ждёт назн…» —
                  новый статус, то есть сама новость, уходил в многоточие.
                  Карточка ленты растёт по содержимому, места под вторую и
                  третью строку у неё хватает.
                */}
                <View style={styles.titleRow}>
                  <Text style={styles.title}>
                    {keepOrderNumbers(item.title)}
                  </Text>
                  <Text style={styles.time}>
                    {shortTime(item.createdAt, m('common.yesterday'))}
                  </Text>
                </View>

                {/* Четыре строки вмещают причину целиком; длиннее бывает только комментарий — его читают в заказе. */}
                <Text style={styles.text} numberOfLines={4}>
                  {keepOrderNumbers(item.body)}
                </Text>

                {/*
                Подтверждение получения — прямо в уведомлении.

                Сотрудник узнаёт о выплате здесь же, и требовать от него
                пойти куда-то ещё ради одного нажатия значит получить
                неподтверждённые расчёты. Кнопка появляется только у
                выплаченного и ещё не подтверждённого расчёта.
              */}
                {payrollRecordId !== null &&
                  item.payrollStatus === PayrollRecordStatus.PAID &&
                  (item.payrollReceiptConfirmedAt === null ? (
                    <Pressable
                      onPress={() => {
                        confirmReceipt.mutate({ id: payrollRecordId });
                      }}
                      disabled={confirmReceipt.isPending}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.confirm,
                        pressed ? styles.confirmPressed : null,
                      ]}
                    >
                      {confirmReceipt.isPending ? (
                        <ActivityIndicator color={colors.onAccent} size="small" />
                      ) : (
                        <Text style={styles.confirmText}>{m('notif.moneyReceived')}</Text>
                      )}
                    </Pressable>
                  ) : (
                    <Text style={styles.confirmed}>
                      {m('notif.receiptConfirmed', {
                        time: shortTime(item.payrollReceiptConfirmedAt, m('common.yesterday')),
                      })}
                    </Text>
                  ))}
              </View>

              {/* Точка непрочитанного — справа, как в макете */}
              {!item.isRead && <View style={styles.dot} accessibilityLabel={m('notif.unread')} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Заглушка ленты на время первой загрузки — по форме карточки уведомления.
 *
 * Общий `Skeleton` — полосы «подпись — значение» прямо на фоне экрана:
 * светлые полосы на льне почти не видны (1,03:1), и экран выглядел пустым,
 * а потом вместо полос появлялись карточки совсем другой формы. Здесь те
 * же белые карточки с плиткой и двумя строками, что приедут с сервера.
 */
function NotificationSkeleton(): ReactElement {
  return (
    <View>
      {Array.from({ length: 4 }, (_unused, index) => (
        <View key={index} style={styles.card}>
          <View style={[styles.tile, styles.skeletonTile]} />
          <View style={styles.body}>
            <View style={[styles.skeletonBar, { width: index % 2 === 0 ? '62%' : '48%' }]} />
            <View style={[styles.skeletonBar, styles.skeletonBarLast, { width: index % 2 === 0 ? '86%' : '74%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Цветная плитка со значком типа события. */
function TypeTile({ type }: { readonly type: NotificationType }): ReactElement {
  // Тип может оказаться новее сборки приложения — тогда рядовой тон и колокольчик.
  const palette = TILE_PALETTE[notificationTone(type)];
  const icon = (NOTIFICATION_ICONS as Readonly<Partial<Record<string, IconName>>>)[type] ?? 'notifications';

  return (
    <View style={[styles.tile, { backgroundColor: palette.background }]}>
      <Icon name={icon} size={19} color={palette.foreground} />
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
function shortTime(value: string | Date, yesterdayLabel: string): string {
  const date = new Date(value);
  const now = new Date();

  const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

  if (sameDay(date, now)) {
    return formatTime(date);
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(date, yesterday)) return yesterdayLabel;

  return formatIsoDateShort(todayIso(date));
}

/**
 * Номер заказа — одним куском: «DH-000491», «TDH-000012».
 *
 * Обычный дефис — законное место переноса, и узкая лента рвала номер
 * посередине: «…шторы для DH-» в конце строки и «000491 и сдать…» в начале
 * следующей. Номер по частям не читается и не ищется глазами. Дефис после
 * префикса меняется на неразрывный (U+2011): выглядит так же, но строку на
 * нём не переносят ни браузер, ни Android. Глиф есть в Manrope, подмены
 * шрифта не будет.
 */
const ORDER_NUMBER_HYPHEN = /\b(T?DH)-(?=\d)/g;

function keepOrderNumbers(text: string): string {
  return text.replace(ORDER_NUMBER_HYPHEN, '$1\u2011');
}

function emptyMessage(filter: FilterKey): MessageKey {
  if (filter === 'unread') return 'notif.noUnread';
  if (filter === 'important') return 'notif.noImportant';

  return 'notif.none';
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
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.lg,
    // Подпись по центру высоты: при `minHeight` без центрирования строка
    // в 18 px садилась к верху — 9 px сверху, 17 снизу.
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  /* Вес — семейством: `fontWeight` поверх Medium в браузере дорисовывается грубым жирным. */
  chipTextActive: {
    fontFamily: fonts.semibold,
    color: colors.headerText,
  },
  /* Текстовая ссылка, а не ещё одна карточка: белая плашка с зелёной
     подписью читалась третьей кнопкой над списком. */
  markAll: {
    minHeight: sizes.touchTarget,
    marginHorizontal: spacing.lg,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  markAllText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.accent,
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
    ...typography.footnote,
    color: colors.textMuted,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  confirm: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPressed: {
    opacity: opacity.pressed,
  },
  confirmText: {
    ...typography.caption,
    fontFamily: fonts.bold,
    color: colors.onAccent,
  },
  confirmed: {
    ...typography.caption,
    color: colors.positive,
    marginTop: spacing.sm,
  },
  skeletonTile: {
    backgroundColor: colors.surfaceMuted,
  },
  skeletonBar: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonBarLast: {
    marginTop: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accentBright,
    marginLeft: spacing.sm,
  },
});

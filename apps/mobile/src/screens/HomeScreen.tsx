import {
  formatIsoDateShort,
  isActiveStatus,
  isOverdueDate,
  ORDER_STATUS_LABELS,
  RatingScope,
  yesterdayIso,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderCard } from '../components/OrderCard';
import { RatingBoard } from '../components/RatingBoard';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, tabBarSpace, typography, opacity } from '../theme';

/**
 * Главный экран: что нужно сотруднику в первые пять секунд после запуска.
 *
 * Открыта ли смена, где он в рейтинге, сколько заказов на нём и что горит по
 * срокам. Сводных показателей компании здесь нет — они в веб-панели у
 * руководства, рядовому сотруднику важны только его собственные задачи.
 *
 * Раскладка собрана по макету: тёмно-зелёная шапка с приветствием, поверх неё
 * приподнятая карточка смены, ниже плитки показателей 2×2. Плитки «Клиенты» и
 * «Продажи» из макета заменены на «Просрочено» и «Закрыто за месяц»:
 * клиентов как сущности в системе пока нет, а показывать выдуманное число
 * на первом экране хуже, чем показать другое, но настоящее.
 */
export function HomeScreen(): ReactElement {
  const { t } = useLocale();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const utils = trpc.useUtils();
  const shift = trpc.shifts.current.useQuery();
  const orders = trpc.orders.list.useQuery({ page: 1, pageSize: 50 });
  const unread = trpc.notifications.unreadCount.useQuery();
  const rating = trpc.rating.me.useQuery({ scope: RatingScope.MONTH });

  /**
   * Счётчик просроченных — отдельным запросом, а не подсчётом по списку.
   *
   * Список выше берёт первую страницу из 50 записей, и всё, что считалось по
   * нему, врало при большем числе заказов: у продавца с 66 заказами плитка
   * показывала не «сколько есть», а «сколько попало на первую страницу».
   * Здесь запрашивается одна запись ради поля `total`, а отбор делает сервер.
   * `deadlineTo` сравнивает включительно, поэтому граница вчерашняя: срок
   * «сегодня» просрочкой не считается.
   */
  const overdueCount = trpc.orders.list.useQuery({
    page: 1,
    pageSize: 1,
    deadlineTo: yesterdayIso(),
  });

  const active = useMemo(
    () => (orders.data?.items ?? []).filter((order) => isActiveStatus(order.status)),
    [orders.data],
  );

  /**
   * Просроченные для СПИСКА ниже — по загруженной странице.
   *
   * Здесь этого достаточно: показываются пять карточек, а не число. Плитка
   * же берёт `overdueCount`, потому что цифра обязана быть верной.
   */
  const overdue = useMemo(
    () => active.filter((order) => isOverdueDate(order.deadline)),
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
      utils.rating.me.invalidate(),
    ]);
  };

  const isOnShift = shift.data !== null && shift.data !== undefined;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      {/*
        Приветствие на хвойной подложке — как в макете. Оно ЗАМЕНЯЕТ системную
        шапку (она скрыта в `TabNavigator`), поэтому верхний отступ берётся из
        безопасной зоны: без него текст уезжает под вырез и часы.
      */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.heroGreeting}>{greeting()}</Text>
        <Text style={styles.heroName} numberOfLines={1}>
          {`${firstName(user?.fullName ?? '')}! 👋`}
        </Text>
        <Text style={styles.heroHint}>Хорошего рабочего дня!</Text>
      </View>

      {/* Карточка смены заезжает на подложку */}
      <View style={styles.overlap}>
        <Card>
          <CardTitle title="Текущая смена" />

          {/*
            Общая плашка, а не своя.
            Здесь стояла самодельная: прямоугольная вместо таблетки и с другим
            весом шрифта. Состояние смены то же самое, что на экране отметки и
            в карточке профиля, где оно показано через `Pill`, — и выглядеть
            оно обязано одинаково во всех трёх местах.
          */}
          <Pill
            text={isOnShift ? 'Смена открыта' : 'Смена не открыта'}
            tone={isOnShift ? 'positive' : 'warning'}
          />

          {shift.data !== null && shift.data !== undefined ? (
            <View style={styles.shiftDetails}>
              <Row label="Филиал" value={shift.data.branchName} />
              <Row label="Начало смены" value={timeOf(shift.data.startedAt)} />
            </View>
          ) : (
            <Text style={styles.shiftHint}>
              Отметьтесь на вкладке Check In/Out, когда будете на месте
            </Text>
          )}
        </Card>
      </View>

      {/*
        Табло рейтинга.

        Занимает слот, где в макете была полоса «5 / 6 выполнено». Сущности
        «задача» в системе нет, а соревнование — есть, и оно живёт прямо на
        главной: за ссылкой его никто не открывает.
      */}
      <View style={styles.section}>
        <RatingBoard
          data={rating.data}
          isLoading={rating.isLoading}
          isError={rating.isError}
          onPressAll={() => {
            navigation.navigate('Rating');
          }}
        />
      </View>

      {/*
        Плитки показателей 2×2.

        Числа берутся из `total`, который считает сервер по всей выборке,
        а не по загруженной странице. Пока данных нет — прочерк, а не ноль:
        ноль это утверждение «ничего не назначено», и при обрыве связи он
        читался бы как факт.
      */}
      <View style={styles.tiles}>
        <StatTile label="Заказы в работе" value={count(orders.data?.total, orders.isError)} />
        <StatTile
          label="Просрочено"
          value={count(overdueCount.data?.total, overdueCount.isError)}
          tone={(overdueCount.data?.total ?? 0) > 0 ? 'danger' : 'neutral'}
        />
        <StatTile
          label="Уведомления"
          value={count(unread.data, unread.isError)}
          tone={(unread.data ?? 0) > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Закрыто за месяц"
          value={count(rating.data?.me?.ordersCount, rating.isError)}
          tone="accent"
        />
      </View>

      <View style={styles.section}>
        <Card>
          <CardTitle
            title="Ближайшие сроки"
            icon="deadline"
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
                  <Text style={[styles.taskLink, pressed ? styles.pressed : null]}>
                    Мои задачи
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
                    {t(ORDER_STATUS_LABELS, order.status)}
                  </Text>
                  <Text style={styles.upcomingDeadline}>
                    {formatIsoDateShort(order.deadline)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>

      {overdue.length > 0 && (
        <View style={styles.section}>
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

/* -------------------------------------------------------------------------- */

/**
 * Приветствие по времени суток.
 *
 * Час берётся локальный, а не UTC: «Доброе утро» в восемь вечера — мелочь,
 * которая сразу читается как неработающее приложение.
 */
function greeting(): string {
  const hour = new Date().getHours();

  if (hour < 6) return 'Доброй ночи,';
  if (hour < 12) return 'Доброе утро,';
  if (hour < 18) return 'Добрый день,';

  return 'Добрый вечер,';
}

/**
 * Имя из ФИО.
 *
 * Берётся ПЕРВОЕ слово. В базе имя идёт первым — поле в карточке сотрудника
 * так и подписано, «Имя и фамилия», и демо-данные это подтверждают
 * («Малика Юсупова»). Прежняя версия брала второе слово в расчёте на порядок
 * «Фамилия Имя Отчество», и приветствие обращалось к человеку по фамилии:
 * «Доброй ночи, Юсупова!».
 */
function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((part) => part.length > 0);

  // Пустое ФИО в базе технически возможно, а приветствие «Доброе утро, !»
  // выглядит как сбой. Нейтральное обращение честнее пустоты.
  return parts[0] ?? 'коллега';
}

/**
 * Число для плитки.
 *
 * Пока данных нет и при ошибке — прочерк. Ноль здесь был бы утверждением
 * («заказов в работе нет»), которое при обрыве связи оказывается ложью:
 * четыре нуля на первом экране читаются как «мне ничего не назначили».
 */
function count(value: number | undefined, isError: boolean): string {
  if (isError || value === undefined) return '—';

  return value.toString();
}

/** Время в формате `08:00`. */
function timeOf(value: string | Date): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  content: {
    paddingBottom: tabBarSpace,
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: colors.header,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    // Нижний отступ большой намеренно: на подложку заезжает карточка смены.
    paddingBottom: spacing.xl + spacing.lg,
    borderBottomLeftRadius: radius.lg + spacing.sm,
    borderBottomRightRadius: radius.lg + spacing.sm,
  },
  heroGreeting: {
    ...typography.body,
    color: colors.headerText,
    opacity: opacity.pressed,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.headerText,
    marginTop: 2,
  },
  heroHint: {
    ...typography.caption,
    color: colors.headerText,
    opacity: opacity.pressed,
    marginTop: spacing.xs,
  },
  overlap: {
    paddingHorizontal: spacing.lg,
    // Ровно столько, чтобы карточка легла на хвойную подложку.
    marginTop: -(spacing.xl + spacing.sm),
    marginBottom: -spacing.sm,
  },
  shiftDetails: {
    marginTop: spacing.sm,
  },
  shiftHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  section: {
    paddingHorizontal: spacing.lg,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    /**
     * Две в ряд.
     *
     * Базовая ширина заведомо МЕНЬШЕ половины, а добор до края делает
     * `flexGrow`. Было `48%`: вместе с промежутком в 12 px это 96 % ширины
     * плюс 12 px, то есть больше строки — на экране 320 px плитки
     * переставали помещаться по две и вставали в столбик.
     *
     * Проценты и фиксированный промежуток в одной строке складывать нельзя:
     * они меряются в разных единицах, и равенство держится только на той
     * ширине, на которой смотрели.
     */
    flexBasis: '40%',
    flexGrow: 1,
    paddingVertical: spacing.lg,
  },
  tileValue: {
    ...typography.largeTitle,
    marginTop: spacing.xs,
    /**
     * Табличные цифры.
     *
     * Четыре плитки стоят сеткой 2×2, и числа в них читаются как колонка.
     * В пропорциональном начертании единица уже остальных цифр, поэтому
     * «11» и «14» получают разную ширину, и вторая строка съезжает
     * относительно первой на глаз заметно.
     */
    fontVariant: ['tabular-nums'],
  },
  tileLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  taskLink: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
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
    color: colors.accent,
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

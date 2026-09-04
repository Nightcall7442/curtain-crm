import { useNavigation } from '@react-navigation/native';
import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
/**
 * Куда ведут пункты раздела.
 *
 * Union из четырёх имён, а не `keyof RootStackParamList`: навигация
 * типизирована по каждому маршруту отдельно, и общий ключ она не примет —
 * у части маршрутов есть обязательные параметры.
 */
type ManagementRoute =
  | 'DayOffApprovals'
  | 'PayrollApprovals'
  | 'TaskAssign'
  | 'RetailStock'
  | 'PurchasePrices';

/**
 * Раздел руководителя.
 *
 * До него директор в приложении мог ровно то же, что швея: смотреть свои
 * заказы, отмечать смену и получать зарплату. Всё управление жило только
 * в веб-панели, хотя решения — отпустить человека, утвердить расчёт,
 * назначить исполнителя — принимаются на ходу, в цеху, с телефона.
 *
 * Раздел собран списком, а не вкладками: пунктов немного, и у каждого
 * есть счётчик, ради которого сюда и заходят — «сколько ждёт меня».
 * Вкладки этот счётчик спрятали бы за переключением.
 *
 * Счётчики грузятся здесь, а не на каждом экране отдельно: одна и та же
 * цифра нужна и в списке, и на главной, а запрашивать её дважды значит
 * дважды платить за связь в цеху.
 */

interface Entry {
  readonly route: ManagementRoute;
  readonly icon: IconName;
  readonly title: string;
  readonly hint: string;
  /** Сколько ждёт решения. `null` — счётчик ещё не загружен. */
  readonly badge: number | null;
}

export function ManagementScreen(): ReactElement {
  const navigation = useNavigation();
  const now = new Date();

  const pendingDayOff = trpc.dayOff.list.useQuery({ status: 'pending' });
  const payroll = trpc.payroll.list.useQuery({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const tasks = trpc.tasks.list.useQuery({ status: 'open' });
  const items = trpc.retail.items.list.useQuery({ includeInactive: true });

  /*
    Расчёты, требующие внимания, — черновики и утверждённые.

    Черновик ждёт утверждения, утверждённый — выплаты. Выплаченный не ждёт
    ничего, и складывать его в счётчик значило бы звать директора туда,
    где делать нечего.
  */
  const payrollWaiting =
    payroll.data === undefined
      ? null
      : payroll.data.items.filter((row) => row.status !== 'paid').length;

  const entries: readonly Entry[] = [
    {
      route: 'DayOffApprovals',
      icon: 'calendar',
      title: 'Отгулы',
      hint: 'Одобрить или отклонить заявку',
      badge: pendingDayOff.data?.total ?? null,
    },
    {
      route: 'PayrollApprovals',
      icon: 'paid',
      title: 'Зарплата',
      hint: 'Утвердить расчёт и отметить выплату',
      badge: payrollWaiting,
    },
    {
      route: 'TaskAssign',
      icon: 'assigned',
      title: 'Поручения',
      hint: 'Выдать задачу сотруднику',
      badge: tasks.data?.total ?? null,
    },
    {
      route: 'RetailStock',
      icon: 'orders',
      title: 'Витрина',
      hint: 'Прайс, остатки и чужие чеки',
      badge: items.data?.length ?? null,
    },
    {
      route: 'PurchasePrices',
      icon: 'payroll',
      title: 'Закупочные цены',
      hint: 'Почём мы покупаем — влияет на маржу',
      badge: null,
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        {entries.map((entry, index) => (
          <Pressable
            key={entry.route}
            onPress={() => {
              navigation.navigate(entry.route);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              entry.badge === null || entry.badge === 0
                ? entry.title
                : `${entry.title}, ждёт: ${entry.badge.toString()}`
            }
            style={({ pressed }) => [
              styles.row,
              index === entries.length - 1 ? styles.rowLast : null,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <View style={styles.iconCircle}>
              <Icon name={entry.icon} size={18} color={colors.accent} />
            </View>

            <View style={styles.text}>
              <Text style={styles.title}>{entry.title}</Text>
              <Text style={styles.hint}>{entry.hint}</Text>
            </View>

            {/*
              Счётчик показывается только когда есть что показать. Ноль в
              кружке читается как «одна штука» боковым зрением, а пустое
              место читается правильно — как «ничего не ждёт».
            */}
            {entry.badge !== null && entry.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{entry.badge.toString()}</Text>
              </View>
            )}

            <Icon name="chevron" size={16} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    opacity: opacity.pressed,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.caption,
    color: colors.onAccent,
    fontWeight: '700',
  },
});

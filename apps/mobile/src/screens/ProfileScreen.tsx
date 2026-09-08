import {
  formatMonthPeriod,
  isActiveStatus,
  LOCALE_INFO,
  LOCALES,
  ORDER_STATUS_LABELS,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useMemo, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ListCard, ListRow, SectionHeader } from '../components/Card';
import { Icon } from '../components/Icon';
import { KpiCard } from '../components/KpiCard';
import { ProfileCard } from '../components/ProfileCard';
import { ShiftInfoCard } from '../components/ShiftInfoCard';
import { WeekAttendance, type WeekDay } from '../components/WeekAttendance';
import { useAuth, useIsCeo } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Мой профиль.
 *
 * Экран собирает всё, что сотрудник спрашивает про себя: кто он в системе,
 * как отработал неделю, сколько начислено и что со сменой прямо сейчас.
 *
 * Раздела «плановые задачи» здесь нет: задач как сущности в системе не
 * существует, есть только заказы. Вместо выдуманного «5 из 6 выполнено»
 * показывается число заказов в работе со ссылкой на вкладку «Работа».
 */
export function ProfileScreen(): ReactElement {
  const { locale, setLocale, t } = useLocale();
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const isCeo = useIsCeo();

  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const profile = trpc.users.byId.useQuery(
    { id: user?.id ?? 0 },
    { enabled: user !== null },
  );
  const shift = trpc.shifts.current.useQuery();
  const payroll = trpc.payroll.my.useQuery({ year: period.year });
  const myOrders = trpc.orders.list.useQuery({ page: 1, pageSize: 50 });

  const utils = trpc.useUtils();
  const telegram = trpc.notifications.telegram.useQuery();
  const unlinkTelegram = trpc.notifications.unlinkTelegram.useMutation({
    async onSuccess() {
      await utils.notifications.telegram.invalidate();
    },
  });

  /*
    Фото профиля отсюда не меняется.

    Владелец закрыл это право за директором: карточка в системе — рабочий
    документ компании, а не профиль в мессенджере, и снимок в ней должен
    оставаться тем, который поставила компания. Меняет и убирает фото
    директор в разделе «Сотрудники», каждая замена — с записью в журнале.
  */


  // Без `useMemo`: вычисление — несколько арифметических операций, а `now`
  // создаётся заново на каждый рендер, поэтому мемоизация всё равно
  // пересчитывала бы значение и лишь добавляла бы ложную зависимость.
  const weekBounds = weekBoundsOf(now);

  const shiftsThisWeek = trpc.shifts.my.useQuery({
    page: 1,
    pageSize: 20,
    from: weekBounds.monday,
    to: weekBounds.nextMonday,
  });

  const weekDays = useMemo<WeekDay[]>(() => {
    const withShift = new Set(
      (shiftsThisWeek.data?.items ?? []).map((item) =>
        new Date(item.startedAt).toISOString().slice(0, 10),
      ),
    );

    return Array.from({ length: 7 }, (_unused, index) => {
      const date = new Date(weekBounds.monday.getTime() + index * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return { date, hasShift: withShift.has(date) };
    });
  }, [shiftsThisWeek.data, weekBounds.monday]);

  const currentPayroll = useMemo(
    () =>
      (payroll.data ?? []).find(
        (record) => record.periodYear === period.year && record.periodMonth === period.month,
      ) ?? null,
    [payroll.data, period.year, period.month],
  );

  const activeOrders = useMemo(
    () =>
      (myOrders.data?.items ?? []).filter((order) => isActiveStatus(order.status)),
    [myOrders.data],
  );

  if (user === null || profile.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (profile.data === undefined) {
    return (
      <View style={styles.loading}>
        <Empty message="Не удалось загрузить профиль" hint="Проверьте связь и потяните вниз" />
      </View>
    );
  }

  const data = profile.data;

  /**
   * Целевая зарплата — из снимка схемы в расчёте: оклад плюс максимальная
   * премия. Для схем без оклада (процент, почасовая) цели нет.
   */
  const targetAmount = ((): string | null => {
    const snapshot = currentPayroll?.schemeSnapshot;
    if (snapshot === undefined) return null;
    if (snapshot.baseAmount === null) return null;

    const base = Number.parseFloat(snapshot.baseAmount);
    const bonus = snapshot.rate === null ? 0 : Number.parseFloat(snapshot.rate);
    return (base + bonus).toFixed(2);
  })();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ProfileCard
        fullName={data.fullName}
        jobTitle={data.jobTitle}
        employeeCode={data.employeeCode}
        department={data.department}
        hiredAt={data.hiredAt}
        avatarUrl={data.avatarUrl}
      />

      {/*
        Карточки «Мои роли» здесь нет по решению владельца: роль — понятие
        системное (набор прав), а сотруднику про себя понятнее должность,
        которая уже стоит в карточке выше. Две почти одинаковые строки
        подряд («Продавец» и «Менеджер по продажам») только сбивали с толку.
      */}

      <WeekAttendance days={weekDays} today={now.toISOString().slice(0, 10)} />

      <View style={styles.pair}>
        <KpiCard
          periodLabel={formatMonthPeriod(period.year, period.month)}
          targetAmount={targetAmount}
          calculatedAmount={currentPayroll?.calculatedAmount ?? null}
          kpiPercent={currentPayroll?.kpiPercent ?? null}
          isLoading={payroll.isLoading}
        />

        <ShiftInfoCard
          branchName={shift.data?.branchName ?? null}
          startedAt={shift.data === null || shift.data === undefined
            ? null
            : new Date(shift.data.startedAt)}
          distanceMeters={shift.data?.startDistanceMeters ?? null}
          ordersInProgress={activeOrders.length}
        />
      </View>

      <Card>
        <CardTitle title="Мои заказы в работе" icon="orders" />
        {activeOrders.length === 0 ? (
          <Empty message="Активных заказов нет" />
        ) : (
          <View>
            {activeOrders.slice(0, 3).map((order) => (
              <Pressable
                key={order.id}
                onPress={() => {
                  navigation.navigate('OrderDetail', { orderId: order.id });
                }}
                style={({ pressed }) => [styles.orderRow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.orderNumber}>
                  {order.orderNumber ?? `#${order.id.toString()}`}
                </Text>
                <Text style={styles.orderStatus} numberOfLines={1}>
                  {t(ORDER_STATUS_LABELS, order.status)}
                </Text>
                <Icon name="chevron" size={18} color={colors.textMuted} />
              </Pressable>
            ))}

            {activeOrders.length > 3 && (
              <Text style={styles.more}>
                {`и ещё ${(activeOrders.length - 3).toString()} — на вкладке «Работа»`}
              </Text>
            )}
          </View>
        )}
      </Card>

      {/*
        Секция переходов.

        Заголовок стоит НАД карточкой, как в системных настройках, а сама
        карточка остаётся чистой и начинается сразу со списка.

        Здесь только пункты, за которыми стоит существующий экран. «Документы»
        и «Настройки» из макета не выведены: строка, открывающая пустоту,
        раздражает сильнее, чем её отсутствие, — они появятся вместе со
        своими разделами.
      */}
      {/*
        Уведомления в Telegram — подключает их сам сотрудник.

        Привязка идёт через бота, а не через ввод номера в панели: чтобы
        писать человеку в мессенджер, нужно, чтобы он сам начал разговор с
        ботом. Кнопка открывает бота с одноразовым кодом в ссылке — сотрудник
        нажимает «Start», и на этом всё.

        Карточка не показывается вовсе, если Telegram к системе не подключён:
        предлагать подключение, которое ничем не кончится, незачем.
      */}
      {telegram.data?.enabled === true && (
        <>
          <SectionHeader title="Уведомления" />
          <Card>
            <CardTitle title="Telegram" icon="notifications" />

            {telegram.data.linked ? (
              <>
                <Text style={styles.telegramHint}>
                  Уведомления приходят и в приложение, и в Telegram.
                </Text>
                <Pressable
                  disabled={unlinkTelegram.isPending}
                  onPress={() => {
                    unlinkTelegram.mutate();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.telegramAction,
                    styles.telegramActionOff,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.telegramActionOffText}>Отключить</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.telegramHint}>
                  Подключите — и всё, что приходит сюда, будет дублироваться в Telegram.
                </Text>
                <Pressable
                  disabled={telegram.data.linkUrl === null}
                  onPress={() => {
                    const url = telegram.data?.linkUrl;
                    if (url != null) void Linking.openURL(url);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.telegramAction,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.telegramActionText}>Подключить Telegram</Text>
                </Pressable>
              </>
            )}
          </Card>
        </>
      )}

      {/*
        Язык — отдельной карточкой, а не строкой в списке «Ещё»: варианты
        видны сразу, без перехода на ещё один экран. Их всего два, и прятать
        их за строкой значит заставить человека, который не читает по-русски,
        сначала найти по-русски подписанный пункт меню.

        Названия языков написаны на самих языках по той же причине.
      */}
      <SectionHeader title="Til / Язык" />
      <Card>
        <View style={styles.localeRow}>
          {LOCALES.map((value) => {
            const active = value === locale;

            return (
              <Pressable
                key={value}
                onPress={() => {
                  setLocale(value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.localeOption,
                  active ? styles.localeOptionActive : null,
                  pressed ? { opacity: opacity.pressed } : null,
                ]}
              >
                <Text style={[styles.localeText, active ? styles.localeTextActive : null]}>
                  {LOCALE_INFO[value].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Ещё" />
      <ListCard>
        <ListRow
          icon="rating"
          label="Мой рейтинг и KPI"
          onPress={() => {
            navigation.navigate('Rating');
          }}
        />
        <ListRow
          icon="orders"
          label="Мои задачи"
          onPress={() => {
            navigation.navigate('TaskList');
          }}
        />
        <ListRow
          icon="calendar"
          label="Запрос на выходные"
          onPress={() => {
            navigation.navigate('DayOff');
          }}
        />
        {/*
          Кадры — последним пунктом перед выходом и только директору.

          Не «Руководство»: там сменные дела — отгулы, зарплата, поручения,
          — а приём и увольнение человек делает редко и обдуманно. Место
          перед выходом и подходит редкому действию: до него надо долистать.

          Именно директору, а не всему руководству: `users.create`,
          `setActive` и выдача ролей закрыты `ceoProcedure`, и админу этот
          пункт обещал бы право, которого у него нет.
        */}
        {isCeo && (
          <ListRow
            icon="people"
            label="Сотрудники"
            onPress={() => {
              navigation.navigate('Employees');
            }}
          />
        )}

        <ListRow
          icon="logout"
          label="Выйти из аккаунта"
          tone="danger"
          isLast
          onPress={() => {
            void signOut();
          }}
        />
      </ListCard>

      <Text style={styles.version}>{`Версия приложения ${appVersion()}`}</Text>
    </ScrollView>
  );
}

/**
 * Границы текущей недели в UTC, от понедельника.
 *
 * `getUTCDay()` считает воскресенье нулём, поэтому смещение приводится
 * к «понедельник = 0» выражением `(day + 6) % 7`.
 */
function weekBoundsOf(now: Date): { readonly monday: Date; readonly nextMonday: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const offset = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);

  return { monday, nextMonday: new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

/**
 * Версия приложения.
 *
 * Берётся из `app.json` через `expoConfig`, а не из константы в коде: две
 * версии, которые надо помнить обновлять вместе, рано или поздно разъезжаются,
 * и на экране оказывается не то, что в сборке. Прочерк вместо выдуманного
 * номера, если конфиг недоступен.
 */
function appVersion(): string {
  return Constants.expoConfig?.version ?? '—';
}

const styles = StyleSheet.create({
  telegramHint: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  telegramAction: {
    minHeight: 46,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telegramActionText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  telegramActionOff: {
    backgroundColor: colors.surfaceMuted,
  },
  telegramActionOffText: {
    ...typography.headline,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  /**
   * Зарплата и смена — В СТОЛБИК, а не в ряд.
   *
   * В ряду каждой карточке доставалось около 133 px под содержимое, а туда
   * кладут заголовок с плашкой состояния и сумму вида «2 790 000 сум».
   * Заголовок разваливался по словам, плашка вылезала за край, а сумма
   * переносилась посередине числа — в  все пробелы
   * неразрывные, поэтому строка рвалась по произвольному знаку.
   */
  /**
   * Зарплата и смена — В СТОЛБИК, а не в ряд.
   *
   * В ряду каждой карточке доставалось около 133 px под содержимое, а туда
   * кладут заголовок с плашкой состояния и сумму вида «2 790 000 сум».
   * Заголовок разваливался по словам, плашка вылезала за белый край, а сумма
   * переносилась посередине числа: в денежном формате все пробелы
   * неразрывные, поэтому строка рвалась по произвольному знаку.
   */
  pair: {
    gap: spacing.lg,
  },
  orderRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  orderNumber: {
    ...typography.value,
    color: colors.header,
    marginRight: spacing.md,
  },
  orderStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  more: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  localeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  localeOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  /* Выбранный — тёмная хвоя, как у фильтров: акцент означает действие. */
  localeOptionActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  localeText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  localeTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  version: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

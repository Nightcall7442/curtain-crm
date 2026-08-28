import { isActiveStatus, ORDER_STATUS_LABELS_RU, ROLE_LABELS_RU } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, Pill } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { ProfileCard } from '../components/ProfileCard';
import { ShiftInfoCard } from '../components/ShiftInfoCard';
import { WeekAttendance, type WeekDay } from '../components/WeekAttendance';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

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
  const navigation = useNavigation();
  const { user, signOut } = useAuth();

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

  const onAvatarChanged = async (): Promise<void> => {
    await utils.users.byId.invalidate({ id: user?.id ?? 0 });
  };

  const uploadAvatar = trpc.users.uploadAvatar.useMutation({
    onSuccess: onAvatarChanged,
    onError(error) {
      Alert.alert('Не удалось загрузить фото', error.message);
    },
  });

  const removeAvatar = trpc.users.removeAvatar.useMutation({
    onSuccess: onAvatarChanged,
    onError(error) {
      Alert.alert('Не удалось убрать фото', error.message);
    },
  });

  /**
   * Снимок сжимается и обрезается в квадрат прямо в пикере: аватар
   * показывается плашкой 1:1, и растить трафик ради невидимых пикселей незачем.
   */
  const pickAvatar = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Нет доступа',
        fromCamera
          ? 'Разрешите доступ к камере в настройках телефона.'
          : 'Разрешите доступ к галерее в настройках телефона.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
      exif: false,
    };

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert('Не удалось прочитать снимок', 'Попробуйте ещё раз.');
      return;
    }

    uploadAvatar.mutate({
      file: {
        fileName: asset.fileName ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        content: asset.base64,
      },
    });
  };

  const chooseAvatarAction = (): void => {
    const options = [
      { text: 'Снять камерой', onPress: () => void pickAvatar(true) },
      { text: 'Выбрать из галереи', onPress: () => void pickAvatar(false) },
    ];

    Alert.alert('Фото профиля', 'Как добавить фото?', [
      ...options,
      ...(profile.data?.avatarUrl == null
        ? []
        : [
            {
              text: 'Убрать фото',
              style: 'destructive' as const,
              onPress: () => {
                removeAvatar.mutate();
              },
            },
          ]),
      { text: 'Отмена', style: 'cancel' as const },
    ]);
  };

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
        onPressPhoto={chooseAvatarAction}
        isPhotoBusy={uploadAvatar.isPending || removeAvatar.isPending}
      />

      <Card>
        <CardTitle title="Мои роли" icon="🎖" />
        <View style={styles.roles}>
          {data.roles.map((role) => (
            <Pill key={role} text={ROLE_LABELS_RU[role]} tone="info" />
          ))}
        </View>
      </Card>

      <WeekAttendance days={weekDays} today={now.toISOString().slice(0, 10)} />

      <View style={styles.pair}>
        <KpiCard
          periodLabel={`${MONTH_NAMES[period.month - 1] ?? ''} ${period.year.toString()}`}
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
        <CardTitle title="Мои заказы в работе" icon="📋" />
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
                  {ORDER_STATUS_LABELS_RU[order.status]}
                </Text>
                <Text style={styles.chevron}>›</Text>
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

      <Pressable
        onPress={() => {
          void signOut();
        }}
        style={({ pressed }) => [styles.signOut, pressed ? styles.pressed : null]}
        accessibilityRole="button"
      >
        <Text style={styles.signOutText}>Выйти из аккаунта</Text>
      </Pressable>
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

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
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
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
  more: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  signOut: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  signOutText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '500',
  },
});

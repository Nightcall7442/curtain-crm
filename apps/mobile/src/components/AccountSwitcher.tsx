import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth, useIsCeo } from '../hooks/useAuth';
import { notifyError, notifySuccess } from '../lib/haptics';
import { accountStorage, tokenStorage, type SavedAccount } from '../lib/storage';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

import { Avatar } from './Avatar';

/**
 * Переключение между сотрудниками — столбик кругов над вкладкой «Профиль».
 *
 * Всплывает по долгому нажатию на эту вкладку и растёт вверх от неё, оттуда
 * же, где палец. Шторки, заголовка и подписей здесь нет намеренно: людей
 * узнают по лицу, а всё остальное закрывало бы экран ради списка, который
 * смотрят две секунды. Нажатие мимо кругов закрывает столбик.
 *
 * Два разных списка за одним жестом:
 *  - ДИРЕКТОРУ показываются ВСЕ работающие сотрудники, независимо от того,
 *    входил ли кто-то с этого телефона. Сессию выдаёт сервер
 *    (`auth.impersonate`), пароли сотрудников для этого не нужны, и каждый
 *    такой вход попадает в журнал;
 *  - ОСТАЛЬНЫМ — только аккаунты, которыми уже входили паролем с этого
 *    телефона и согласились сохранить. Чужую учётную запись рядовой
 *    сотрудник открыть не может, и скрытие тут ни при чём: `impersonate`
 *    откажет любому, кроме директора.
 */
export function AccountSwitcher({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): ReactElement | null {
  const { user, switchAccount, addAccount, impersonate } = useAuth();
  const isCeo = useIsCeo();
  const insets = useSafeAreaInsets();

  const [accounts, setAccounts] = useState<readonly SavedAccount[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  /* Список сотрудников нужен только директору и только пока столбик открыт:
     держать его загруженным ради жеста, который делают раз в день, незачем. */
  const staff = trpc.users.list.useQuery(
    { page: 1, pageSize: 100, isActive: true },
    { enabled: visible && isCeo },
  );

  /** Своё фото: в списке сотрудников директор есть, остальных там нет. */
  const me = trpc.users.byId.useQuery(
    { id: user?.id ?? 0 },
    { enabled: visible && !isCeo && user !== null },
  );

  const appear = useRef(new Animated.Value(0)).current;

  const reload = useCallback(async (): Promise<void> => {
    setAccounts(await accountStorage.list());
  }, []);

  useEffect(() => {
    if (!visible) {
      appear.setValue(0);
      return;
    }

    void reload();
    Animated.spring(appear, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
      speed: 18,
    }).start();
  }, [visible, reload, appear]);

  const staffRows = staff.data?.items ?? [];
  const myAvatarUrl =
    (isCeo ? staffRows.find((row) => row.id === user?.id)?.avatarUrl : me.data?.avatarUrl) ?? null;

  /**
   * Сохраняет ТЕКУЩИЙ вход, чтобы к нему можно было вернуться без пароля.
   *
   * Директору вызывается молча перед входом под сотрудником: спрашивать
   * согласие на сохранение своей же сессии на своём телефоне — лишний шаг
   * ровно там, где человек уже нажал на круг сотрудника. Без этой записи
   * он вернулся бы к себе только паролем.
   */
  const saveCurrent = useCallback(async (): Promise<boolean> => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (user === null || refreshToken === null) return false;

    // Помечаем сессию своей: иначе `tokenStorage.save()` не будет обновлять
    // эту запись при ротации токена, и вход протух бы за сутки.
    await tokenStorage.setCurrentUserId(user.id);
    await accountStorage.remember({
      userId: user.id,
      fullName: user.fullName,
      phone: user.phone,
      refreshToken,
      avatarUrl: myAvatarUrl,
    });
    await reload();
    return true;
  }, [user, myAvatarUrl, reload]);

  /** Общий хвост для обоих способов входа: отклик, закрытие, разбор отказа. */
  const run = (userId: number, action: Promise<void>, onFail: () => void): void => {
    setBusyId(userId);

    action
      .then(() => {
        notifySuccess();
        onClose();
      })
      .catch((error: unknown) => {
        notifyError();
        Alert.alert(
          'Не удалось войти',
          error instanceof Error ? error.message : 'Попробуйте ещё раз',
        );
        onFail();
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  /*
    «Добавить» уводит на экран входа, НЕ гася текущую сессию на сервере.

    Обычный выход её гасит и убирает из списка — поэтому раньше набрать
    второй аккаунт было нечем: каждый вход стирал предыдущий. Условие тут
    одно: текущий вход должен быть уже сохранён, иначе человек уйдёт на
    экран входа и вернётся к себе только паролем.
  */
  const handleAdd = (): void => {
    const isCurrentSaved = accounts.some((account) => account.userId === user?.id);

    if (!isCurrentSaved) {
      Alert.alert(
        'Сначала сохраните этот вход',
        `Иначе вернуться к ${user?.fullName ?? 'себе'} можно будет только паролем.`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Сохранить',
            onPress: () => {
              void saveCurrent();
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Добавить аккаунт',
      `Откроется экран входа. Вернуться к ${user?.fullName ?? 'себе'} можно будет одним нажатием, без пароля.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Добавить',
          onPress: () => {
            onClose();
            void addAccount();
          },
        },
      ],
    );
  };

  /* Один вид строки для обоих списков. Себя в столбик не кладём: под собой
     не переключаются, а лишний круг занимает место остальных. */
  const rows: readonly Row[] = isCeo
    ? staffRows
        .filter((row) => row.id !== user?.id)
        .map((row) => ({
          userId: row.id,
          fullName: row.fullName,
          avatarUrl: row.avatarUrl,
          onPress: () => {
            run(
              row.id,
              // Свою запись сохраняем ДО обращения к серверу: после
              // переключения refresh-токен директора уже не достать.
              saveCurrent().then(() => impersonate(row.id)),
              () => undefined,
            );
          },
        }))
    : accounts
        .filter((account) => account.userId !== user?.id)
        .map((account) => ({
          userId: account.userId,
          fullName: account.fullName,
          avatarUrl: account.avatarUrl ?? null,
          onPress: () => {
            run(account.userId, switchAccount(account.userId), () => {
              // Запись мог убрать `switchAccount`: перечитываем, чтобы не
              // показывать круг, который заведомо не сработает.
              void reload();
            });
          },
        }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Прозрачный перехватчик: нажатие мимо кругов закрывает столбик. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
      />

      <Animated.View
        style={[
          styles.column,
          {
            // Столбик начинается над панелью вкладок, а не под ней: панель
            // плавает с отступом от края, и её высоту нужно прибавить.
            bottom: Math.max(insets.bottom, 10) + TAB_BAR_HEIGHT + spacing.sm,
            opacity: appear,
            transform: [
              {
                translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
              },
            ],
          },
        ]}
      >
        {staff.isLoading ? (
          <View style={styles.circleShell}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {/* Столбик растёт вверх, поэтому при переполнении прокрутка
            прижимает список к низу — к тем, кто ближе к пальцу. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => (
            <Pressable
              key={row.userId}
              onPress={row.onPress}
              disabled={busyId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Войти как ${row.fullName}`}
              style={styles.circleShell}
            >
              {busyId === row.userId ? (
                <View style={styles.busy}>
                  <ActivityIndicator color={colors.accent} size="small" />
                </View>
              ) : (
                <Avatar
                  uri={row.avatarUrl}
                  size={CIRCLE}
                  style={styles.circle}
                  fallback={<Text style={styles.initials}>{initials(row.fullName)}</Text>}
                />
              )}
            </Pressable>
          ))}

          {/* Директору «Добавить» не нужно: у него и так весь цех в столбике. */}
          {isCeo ? null : (
            <Pressable
              onPress={handleAdd}
              disabled={busyId !== null}
              accessibilityRole="button"
              accessibilityLabel="Добавить аккаунт"
              style={styles.circleShell}
            >
              <View style={[styles.circle, styles.circleAdd]}>
                <Text style={styles.plus}>+</Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

interface Row {
  readonly userId: number;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly onPress: () => void;
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

const CIRCLE = 56;

/** Высота плавающей панели вкладок — от неё столбик и отсчитывается. */
const TAB_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    // Над вкладкой «Профиль» — она крайняя справа.
    right: spacing.lg,
    alignItems: 'center',
  },
  /* Столбик не должен упираться в шапку: с большим цехом список
     прокручивается, а не уползает под приветствие. */
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    alignItems: 'center',
    gap: spacing.sm,
    // Список прижат к низу: при переполнении первыми видны ближние к пальцу.
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  circleShell: {
    // Радиус нужен и подложке, а не только фото: тень повторяет форму
    // элемента, и без него вокруг каждого лица лежал бы белый прямоугольник.
    borderRadius: radius.pill,
    // Тень поверх любого фона: круги лежат на содержимом экрана, и без неё
    // светлое фото на светлой карточке теряет край.
    shadowColor: '#0A1A13',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  circle: {
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    // Белый ободок отделяет круг от того, что под ним.
    borderWidth: 2,
    borderColor: colors.surface,
  },
  busy: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAdd: {
    width: CIRCLE,
    height: CIRCLE,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...typography.sectionTitle,
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
  },
  plus: {
    fontSize: 26,
    lineHeight: 30,
    color: colors.textSecondary,
  },
});

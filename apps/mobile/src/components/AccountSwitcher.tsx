import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth, useIsCeo } from '../hooks/useAuth';
import { notifyError, notifySuccess } from '../lib/haptics';
import { accountStorage, tokenStorage, type SavedAccount } from '../lib/storage';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';

/**
 * Переключение между сотрудниками — вертикальная лента кругов.
 *
 * Открывается долгим нажатием на вкладку «Профиль». Жест намеренно
 * непубличный: это инструмент директора, который встаёт за место продавца
 * или смотрит, что видит швея, — а не кнопка, которую рядовой сотрудник
 * найдёт случайно и начнёт гадать, чьи это имена.
 *
 * Два разных списка за одним жестом:
 *  - ДИРЕКТОРУ показываются ВСЕ работающие сотрудники, независимо от того,
 *    входил ли кто-то с этого телефона. Сессию выдаёт сервер по
 *    `auth.impersonate` — пароли сотрудников для этого не нужны и не
 *    спрашиваются. Каждый такой вход попадает в журнал;
 *  - ОСТАЛЬНЫМ — только те аккаунты, которыми уже входили паролем с этого
 *    телефона и согласились сохранить. Чужую учётную запись рядовой
 *    сотрудник открыть не может, и скрытие тут ни при чём: `impersonate`
 *    откажет любому, кроме директора.
 *
 * Лицо крупнее имени: узнают по фото, а имя читают только при сомнении.
 * Фото может не загрузиться (ссылка подписана и истекает) — тогда круг
 * показывает инициалы, и это не ошибка.
 */
export function AccountSwitcher({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { user, switchAccount, addAccount, impersonate } = useAuth();
  const isCeo = useIsCeo();

  const [accounts, setAccounts] = useState<readonly SavedAccount[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  /* Список сотрудников нужен только директору и только пока шторка открыта:
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

  const reload = useCallback(async (): Promise<void> => {
    setAccounts(await accountStorage.list());
  }, []);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, reload]);

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

  /** Общий хвост для обоих способов входа: звук, закрытие, разбор отказа. */
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

  /** Директор: вход под сотрудником по разрешению сервера. */
  const handleImpersonate = (userId: number): void => {
    run(
      userId,
      // Свою запись сохраняем ДО обращения к серверу: после переключения
      // refresh-токен директора из памяти уже не достать.
      saveCurrent().then(() => impersonate(userId)),
      () => undefined,
    );
  };

  /** Остальные: вход по сохранённому токену. */
  const handleSwitch = (account: SavedAccount): void => {
    run(account.userId, switchAccount(account.userId), () => {
      // Запись мог убрать `switchAccount`: перечитываем, чтобы список не
      // показывал круг, который заведомо не сработает.
      void reload();
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

  /* Единый вид строки для обоих списков: у директора — все сотрудники,
     у остальных — сохранённые входы. Текущий человек в списке не
     дублируется: он уже стоит сверху, кругом с кольцом. */
  const rows: readonly Row[] = isCeo
    ? staffRows
        .filter((row) => row.id !== user?.id)
        .map((row) => ({
          userId: row.id,
          fullName: row.fullName,
          avatarUrl: row.avatarUrl,
          jobTitle: row.jobTitle,
          onPress: () => {
            handleImpersonate(row.id);
          },
        }))
    : accounts
        .filter((account) => account.userId !== user?.id)
        .map((account) => ({
          userId: account.userId,
          fullName: account.fullName,
          avatarUrl: account.avatarUrl ?? null,
          jobTitle: null,
          onPress: () => {
            handleSwitch(account);
          },
        }));

  return (
    <BottomSheet visible={visible} title="Аккаунты" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.column} style={styles.scroll}>
        {user !== null ? (
          <View style={styles.item}>
            <Face fullName={user.fullName} avatarUrl={myAvatarUrl} isCurrent />
            <Text style={styles.name} numberOfLines={1}>
              {user.fullName}
            </Text>
            <Text style={styles.caption}>вы</Text>
          </View>
        ) : null}

        {isCeo && staff.isLoading ? <ActivityIndicator color={colors.accent} /> : null}

        {rows.map((row) => (
          <Pressable
            key={row.userId}
            onPress={row.onPress}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Войти как ${row.fullName}`}
            style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
          >
            {busyId === row.userId ? (
              <View style={styles.circle}>
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            ) : (
              <Face fullName={row.fullName} avatarUrl={row.avatarUrl} isCurrent={false} />
            )}

            <Text style={styles.name} numberOfLines={1}>
              {row.fullName}
            </Text>
            {row.jobTitle === null ? null : (
              <Text style={styles.caption} numberOfLines={1}>
                {row.jobTitle}
              </Text>
            )}
          </Pressable>
        ))}

        {/* Директору «Добавить» не нужно: у него и так весь цех перед глазами. */}
        {isCeo ? null : (
          <Pressable
            onPress={handleAdd}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel="Добавить аккаунт"
            style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
          >
            <View style={[styles.circle, styles.circleAdd]}>
              <Text style={styles.plus}>+</Text>
            </View>
            <Text style={styles.name}>Добавить</Text>
          </Pressable>
        )}
      </ScrollView>

      <Text style={styles.hint}>
        {isCeo
          ? 'Вход под сотрудником — без его пароля. Каждый такой вход записывается в журнал.'
          : 'Вход без пароля, с этого телефона. Выход из аккаунта убирает его отсюда.'}
      </Text>
    </BottomSheet>
  );
}

interface Row {
  readonly userId: number;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly jobTitle: string | null;
  readonly onPress: () => void;
}

/**
 * Круг с лицом.
 *
 * Ссылка на фото подписана и истекает, а сохранённая запись переживает
 * сутки — поэтому неудача загрузки это обычный случай, а не ошибка:
 * молча возвращаемся к инициалам.
 */
function Face({
  fullName,
  avatarUrl,
  isCurrent,
}: {
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly isCurrent: boolean;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const ring = isCurrent ? styles.circleCurrent : null;

  if (avatarUrl === null || failed) {
    return (
      <View style={[styles.circle, ring]}>
        <Text style={styles.initials}>{initials(fullName)}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: avatarUrl }}
      style={[styles.circle, ring]}
      onError={() => {
        setFailed(true);
      }}
      accessibilityIgnoresInvertColors
    />
  );
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

const CIRCLE = 68;

const styles = StyleSheet.create({
  /* Ограничение высоты: со всем цехом лента иначе вытеснила бы подсказку
     за край экрана. */
  scroll: {
    maxHeight: 420,
  },
  column: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Кольцо у текущего — тем же цветом, что и активная вкладка: «вы здесь». */
  circleCurrent: {
    borderWidth: 3,
    borderColor: colors.accentBright,
  },
  circleAdd: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  initials: {
    ...typography.sectionTitle,
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  plus: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.textSecondary,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

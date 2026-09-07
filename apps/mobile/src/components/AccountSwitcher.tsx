import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { notifyError, notifySuccess } from '../lib/haptics';
import { accountStorage, tokenStorage, type SavedAccount } from '../lib/storage';
import { colors, opacity, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';

/**
 * Быстрое переключение между аккаунтами этого телефона.
 *
 * Открывается долгим нажатием на вкладку «Профиль». Жест намеренно
 * непубличный: это инструмент директора, который встаёт за место продавца
 * или смотрит, что видит швея, — а не кнопка, которую рядовой сотрудник
 * найдёт случайно и начнёт гадать, чьи это имена.
 *
 * Вид — вертикальная лента кругов, как переключатель аккаунтов в соцсетях:
 * лицо (пока инициалы) крупнее имени, потому что узнают по нему, а читают
 * имя только при сомнении. Текущий аккаунт стоит первым, обведён кольцом и
 * не нажимается.
 *
 * Пароля не спрашивает: вход идёт по сохранённому токену. Список читается
 * при каждом открытии, а не хранится в состоянии: между открытиями человек
 * мог войти в новый аккаунт или выйти из старого.
 */
export function AccountSwitcher({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { user, switchAccount, addAccount } = useAuth();

  const [accounts, setAccounts] = useState<readonly SavedAccount[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setAccounts(await accountStorage.list());
  }, []);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, reload]);

  /** Есть ли у текущей сессии сохранённая запись — от этого зависит «+». */
  const isCurrentSaved = accounts.some((account) => account.userId === user?.id);
  const others = accounts.filter((account) => account.userId !== user?.id);

  /**
   * Сохраняет ТЕКУЩИЙ вход.
   *
   * Нужен потому, что согласие спрашивается один раз — при входе паролем, — и
   * тот, кто тогда отказался (или вошёл до появления этой возможности), иначе
   * не имеет способа передумать, не выходя из аккаунта.
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
    });
    await reload();
    return true;
  }, [user, reload]);

  const handleSwitch = (account: SavedAccount): void => {
    setBusyId(account.userId);

    switchAccount(account.userId)
      .then(() => {
        notifySuccess();
        onClose();
      })
      .catch((error: unknown) => {
        notifyError();
        Alert.alert(
          'Не удалось войти',
          error instanceof Error
            ? error.message
            : 'Сохранённый вход больше не действует — войдите паролем',
        );
        // Запись мог убрать `switchAccount`: перечитываем, чтобы список не
        // показывал круг, который заведомо не сработает.
        void reload();
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

  return (
    <BottomSheet visible={visible} title="Аккаунты" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.column} style={styles.scroll}>
        {user !== null ? (
          <View style={styles.item}>
            <View style={[styles.circle, styles.circleCurrent]}>
              <Text style={styles.initials}>{initials(user.fullName)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {user.fullName}
            </Text>
            <Text style={styles.caption}>{isCurrentSaved ? 'вы' : 'вход не сохранён'}</Text>
          </View>
        ) : null}

        {others.map((account) => (
          <Pressable
            key={account.userId}
            onPress={() => {
              handleSwitch(account);
            }}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Войти как ${account.fullName}`}
            style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
          >
            <View style={styles.circle}>
              {busyId === account.userId ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Text style={styles.initials}>{initials(account.fullName)}</Text>
              )}
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {account.fullName}
            </Text>
          </Pressable>
        ))}

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
      </ScrollView>

      <Text style={styles.hint}>
        Вход без пароля, с этого телефона. Выход из аккаунта убирает его отсюда.
      </Text>
    </BottomSheet>
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
  /* Ограничение высоты: с пятью аккаунтами лента иначе вытеснила бы
     подсказку и «Добавить» за край экрана. */
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
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

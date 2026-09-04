import { formatPhone } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { notifyError, notifySuccess } from '../lib/haptics';
import { accountStorage, type SavedAccount } from '../lib/storage';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

/**
 * Быстрое переключение между аккаунтами этого телефона.
 *
 * Открывается долгим нажатием на вкладку «Профиль». Жест намеренно
 * непубличный: это инструмент директора, который встаёт за место продавца
 * или смотрит, что видит швея, — а не кнопка, которую рядовой сотрудник
 * найдёт случайно и начнёт гадать, чьи это имена.
 *
 * Пароля не спрашивает: вход идёт по сохранённому токену. В список попадает
 * только тот, кто вошёл паролем с этого устройства И ответил «Сохранить» на
 * вопрос при входе. Выход из аккаунта убирает его оттуда.
 *
 * Список читается при каждом открытии, а не хранится в состоянии: между
 * открытиями человек мог войти в новый аккаунт или выйти из старого.
 */
export function AccountSwitcher({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { user, switchAccount } = useAuth();

  const [accounts, setAccounts] = useState<readonly SavedAccount[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    void accountStorage.list().then((saved) => {
      if (!cancelled) setAccounts(saved);
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const others = accounts.filter((account) => account.userId !== user?.id);

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
        // показывал кнопку, которая заведомо не сработает.
        void accountStorage.list().then(setAccounts);
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  return (
    <BottomSheet visible={visible} title="Сохранённые входы" onClose={onClose}>
      {others.length === 0 ? (
        <Text style={styles.empty}>
          Сохранённых входов нет. Войдите под нужным сотрудником паролем и
          ответьте «Сохранить» на вопрос при входе — тогда он появится здесь.
        </Text>
      ) : (
        others.map((account) => (
          <Pressable
            key={account.userId}
            onPress={() => {
              handleSwitch(account);
            }}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Войти как ${account.fullName}`}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          >
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials(account.fullName)}</Text>
            </View>

            <View style={styles.text}>
              <Text style={styles.name}>{account.fullName}</Text>
              <Text style={styles.phone}>{formatPhone(account.phone)}</Text>
            </View>

            {busyId === account.userId ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Icon name="forward" size={16} color={colors.textMuted} />
            )}
          </Pressable>
        ))
      )}

      <Text style={styles.hint}>
        Вход без пароля. Выход из аккаунта убирает его из этого списка.
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: opacity.pressed,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...typography.body,
    fontWeight: '700',
    color: colors.header,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  phone: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});

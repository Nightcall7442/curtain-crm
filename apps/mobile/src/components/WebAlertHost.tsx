import { useEffect, useState, type ReactElement } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type AlertButton } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { closeWebAlert, subscribeWebAlerts, type WebAlertRequest } from '../lib/webAlert';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Окно `Alert.alert` в браузере — по одному, в порядке вызова.
 *
 * Ведёт себя как системный диалог на телефоне: кнопки справа, «Отмена»
 * приглушённая, разрушительное действие — красным. Тап мимо окна закрывает
 * его, только если вызов разрешил (`cancelable`), — как на Android; Esc —
 * то же, а без разрешения нажимает «Отмену», если она есть.
 */
export function WebAlertHost(): ReactElement | null {
  const { m } = useLocale();
  const [queue, setQueue] = useState<readonly WebAlertRequest[]>([]);

  useEffect(() => subscribeWebAlerts(setQueue), []);

  if (Platform.OS !== 'web') return null;
  const request = queue[0];
  if (request === undefined) return null;

  const buttons: readonly AlertButton[] =
    request.buttons.length > 0 ? request.buttons : [{ text: m('common.ok') }];
  const press = (button: AlertButton): void => {
    closeWebAlert(request.id);
    button.onPress?.();
  };
  const dismiss = (): void => {
    if (request.options?.cancelable === true) {
      closeWebAlert(request.id);
      request.options.onDismiss?.();
      return;
    }
    const cancel = buttons.find((button) => button.style === 'cancel');
    if (cancel !== undefined) press(cancel);
  };
  const stacked = buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.host}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (request.options?.cancelable === true) dismiss();
          }}
          accessibilityLabel={m('common.close')}
        />
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <Text style={styles.title}>{request.title}</Text>
          {request.message !== undefined && request.message !== '' && (
            <Text style={styles.message}>{request.message}</Text>
          )}
          <View style={[styles.buttons, stacked ? styles.buttonsStacked : null]}>
            {buttons.map((button, index) => (
              <Pressable
                key={`${index.toString()}-${button.text ?? ''}`}
                onPress={() => {
                  press(button);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' ? styles.buttonCancel : null,
                    button.style === 'destructive' ? styles.buttonDestructive : null,
                  ]}
                >
                  {button.text ?? m('common.ok')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 17, 13, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginRight: -spacing.md,
  },
  buttonsStacked: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  buttonPressed: {
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    ...typography.headline,
    color: colors.accent,
  },
  buttonCancel: {
    color: colors.textSecondary,
  },
  buttonDestructive: {
    color: colors.danger,
  },
});

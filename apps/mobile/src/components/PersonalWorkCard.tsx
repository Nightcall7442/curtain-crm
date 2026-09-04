import {
  formatIsoDateShort,
  PERSONAL_WORK_STATUS_LABELS,
  PersonalWorkStatus,
  type PersonalWorkStatus as PersonalWorkStatusName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Pill } from './Card';
import { Icon } from './Icon';

/**
 * Личная работа в списке «Работа → Личные».
 *
 * Устроена как карточка доп. работы и по той же причине: весь смысл записи
 * помещается в карточку, и отдельный экран только отдалял бы «дошил» от
 * «отметил».
 *
 * Отмена спрашивает причину, а выполнение — нет. Это не забывчивость:
 * готовая вещь не нуждается в объяснении, а брошенная посреди цеха —
 * нуждается, иначе через месяц не разобрать, почему станок стоял занятым.
 */
export function PersonalWorkCard({
  work,
}: {
  readonly work: {
    readonly id: number;
    readonly title: string;
    readonly details: string | null;
    readonly status: PersonalWorkStatusName;
    readonly cancellationReason: string | null;
    readonly createdAt: Date;
  };
}): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  /*
    Причина отмены спрашивается полем прямо в карточке.

    Системный `Alert.prompt` подошёл бы лучше по виду, но он существует
    только на iOS: на Android вызов молча ничего не делает, и половина цеха
    просто не смогла бы отменить работу. Своё поле работает одинаково везде.
  */
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    await utils.personalWorks.my.invalidate();
  };

  const complete = trpc.personalWorks.complete.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      Alert.alert('Не удалось отметить готовой', error.message);
    },
  });

  const cancel = trpc.personalWorks.cancel.useMutation({
    async onSuccess() {
      await refresh();
    },
    onError(error) {
      Alert.alert('Не удалось отменить', error.message);
    },
  });

  const isOpen = work.status === PersonalWorkStatus.IN_PROGRESS;

  return (
    <Pressable
      onPress={() => {
        if (work.details !== null || work.cancellationReason !== null) {
          setExpanded((current) => !current);
        }
      }}
      accessibilityRole={work.details === null ? undefined : 'button'}
      style={[styles.card, !isOpen && styles.cardClosed]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, !isOpen && styles.titleClosed]}>{work.title}</Text>

        {isOpen ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setCancelReason((current) => (current === null ? '' : null));
              }}
              disabled={cancel.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Отменить: ${work.title}`}
              style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
            >
              <Icon name="cancelled" size={18} color={colors.danger} />
            </Pressable>

            <Pressable
              onPress={() => {
                complete.mutate({ id: work.id });
              }}
              disabled={complete.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Отметить готовой: ${work.title}`}
              style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
            >
              {complete.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Icon name="completed" size={20} color={colors.onAccent} />
              )}
            </Pressable>
          </View>
        ) : (
          <Pill
            text={t(PERSONAL_WORK_STATUS_LABELS, work.status)}
            tone={work.status === PersonalWorkStatus.DONE ? 'positive' : 'neutral'}
          />
        )}
      </View>

      {cancelReason !== null && (
        <View style={styles.cancelBox}>
          <TextInput
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Почему бросили работу?"
            placeholderTextColor={colors.textMuted}
            style={styles.cancelInput}
            multiline
          />
          <Pressable
            onPress={() => {
              cancel.mutate({ id: work.id, reason: cancelReason.trim() });
            }}
            // Порог тот же, что у сервера (`reasonSchema`): кнопка не должна
            // предлагать отправить то, что заведомо вернётся ошибкой.
            disabled={cancelReason.trim().length < 3 || cancel.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancelConfirm,
              cancelReason.trim().length < 3 ? styles.cancelConfirmOff : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {cancel.isPending ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.cancelConfirmText}>Отменить работу</Text>
            )}
          </Pressable>
        </View>
      )}

      {work.details !== null && (
        <Text style={styles.details} numberOfLines={expanded ? undefined : 2}>
          {work.details}
        </Text>
      )}

      {work.cancellationReason !== null && (
        <Text style={styles.reason} numberOfLines={expanded ? undefined : 1}>
          {`Причина отмены: ${work.cancellationReason}`}
        </Text>
      )}

      <Text style={styles.started}>{`начата ${formatIsoDateShort(work.createdAt.toISOString())}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cardClosed: {
    opacity: 0.65,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  titleClosed: {
    textDecorationLine: 'line-through',
  },
  doneButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  cancelBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cancelInput: {
    ...typography.caption,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  cancelConfirm: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmOff: {
    opacity: 0.4,
  },
  cancelConfirmText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.onAccent,
  },
  details: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  reason: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  started: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});

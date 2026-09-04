import {
  formatIsoDateShort,
  isOverdueDate,
  TASK_STATUS_LABELS,
  TaskStatus,
  type TaskStatus as TaskStatusName,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import type { ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Pill } from './Card';
import { Icon } from './Icon';

/**
 * Доп. работа в списке «Работа → Доп работы».
 *
 * Открытое поручение закрывается одной кнопкой-галочкой прямо из списка:
 * лишний переход отдалял бы «сделал» от «отметил», а это самое частое
 * действие.
 *
 * Нажатие на саму карточку открывает поручение целиком. Раньше оно только
 * разворачивало описание, и на этом всё заканчивалось: приложить фото или
 * спросить «что именно не так» было негде. Теперь описание и переписка
 * живут на отдельном экране, а карточка осталась быстрым способом закрыть
 * задачу, не открывая её.
 */
export function TaskCard({
  task,
}: {
  readonly task: {
    readonly id: number;
    readonly title: string;
    readonly details: string | null;
    readonly dueDate: string | null;
    readonly status: TaskStatusName;
    readonly creatorName: string;
  };
}): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const navigation = useNavigation();

  const complete = trpc.tasks.complete.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.tasks.my.invalidate();
    },
    onError(error) {
      Alert.alert('Не удалось отметить выполнение', error.message);
    },
  });

  const isOpen = task.status === TaskStatus.OPEN;
  const overdue = isOpen && task.dueDate !== null && isOverdueDate(task.dueDate);

  return (
    <Pressable
      onPress={() => {
        navigation.navigate('TaskDetail', { taskId: task.id });
      }}
      accessibilityRole="button"
      accessibilityLabel={`Открыть поручение «${task.title}»`}
      style={[styles.card, !isOpen && styles.cardClosed]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, !isOpen && styles.titleClosed]}>{task.title}</Text>

        {isOpen ? (
          <Pressable
            onPress={() => {
              complete.mutate({ id: task.id });
            }}
            disabled={complete.isPending}
            accessibilityRole="button"
            accessibilityLabel={`Отметить выполненным: ${task.title}`}
            style={({ pressed }) => [styles.doneButton, pressed ? styles.doneButtonPressed : null]}
          >
            {complete.isPending ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Icon name="completed" size={20} color={colors.onAccent} />
            )}
          </Pressable>
        ) : (
          <Pill
            text={t(TASK_STATUS_LABELS, task.status)}
            tone={task.status === TaskStatus.DONE ? 'positive' : 'neutral'}
          />
        )}
      </View>

      {/*
        Две строки, без разворота: полное описание теперь на своём экране,
        и карточка обещает ровно то, что делает по нажатию, — открыть его.
      */}
      {task.details !== null && (
        <Text style={styles.details} numberOfLines={2}>
          {task.details}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.creator} numberOfLines={1}>
          {`от: ${task.creatorName}`}
        </Text>
        {task.dueDate !== null && (
          <Text style={[styles.due, overdue ? styles.dueOverdue : null]}>
            {overdue
              ? `просрочено · ${formatIsoDateShort(task.dueDate)}`
              : `до ${formatIsoDateShort(task.dueDate)}`}
          </Text>
        )}
      </View>
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
  title: {
    ...typography.headline,
    color: colors.textPrimary,
    flex: 1,
  },
  titleClosed: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  doneButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonPressed: {
    backgroundColor: colors.accent,
  },
  details: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  creator: {
    ...typography.footnote,
    color: colors.textMuted,
    flexShrink: 1,
  },
  due: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.textMuted,
  },
  dueOverdue: {
    color: colors.danger,
    fontWeight: '700',
  },
});

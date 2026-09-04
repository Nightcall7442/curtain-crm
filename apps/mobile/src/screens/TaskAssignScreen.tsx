import { formatIsoDate, TASK_STATUS_LABELS, type TaskStatus } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Поручения: выдать задачу и посмотреть, что уже выдано.
 *
 * Поручение рождается на ходу — «Малика, перешей ламбрекен на третьем» —
 * и до этого экрана директору приходилось запоминать его до возвращения
 * к компьютеру. Половина таких поручений так и оставалась устной.
 *
 * Исполнитель выбирается из списка сотрудников, а не вводится текстом:
 * поручение адресное, и «Малика» без идентификатора сервер не примет.
 */
export function TaskAssignScreen(): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const navigation = useNavigation();

  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');

  /** Поручение, которому пишут причину отмены. `null` — никакое. */
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const people = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true });
  const tasks = trpc.tasks.list.useQuery({});

  const create = trpc.tasks.create.useMutation({
    async onSuccess() {
      notifySuccess();
      setTitle('');
      setDetails('');
      setAssigneeId(null);
      await Promise.all([utils.tasks.list.invalidate(), utils.tasks.my.invalidate()]);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось выдать поручение', error.message);
    },
  });

  const cancel = trpc.tasks.cancel.useMutation({
    async onSuccess() {
      notifySuccess();
      setCancelling(null);
      setCancelReason('');
      await Promise.all([utils.tasks.list.invalidate(), utils.tasks.my.invalidate()]);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отменить', error.message);
    },
  });

  const canSubmit = assigneeId !== null && title.trim().length > 0 && !create.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle title="Новое поручение" icon="assigned" />

          <Field label="Кому">
            {people.isLoading ? (
              <Skeleton rows={1} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.people}
              >
                {(people.data?.items ?? []).map((person) => (
                  <Pressable
                    key={person.id}
                    onPress={() => {
                      setAssigneeId(person.id === assigneeId ? null : person.id);
                    }}
                    accessibilityRole="button"
                    style={[styles.chip, person.id === assigneeId ? styles.chipActive : null]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        person.id === assigneeId ? styles.chipTextActive : null,
                      ]}
                    >
                      {person.fullName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Field>

          <Field label="Что сделать">
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="Перешить ламбрекен на третьем заказе"
            />
          </Field>

          <Field label="Подробности">
            <Input
              value={details}
              onChangeText={setDetails}
              placeholder="Что важно знать исполнителю"
              multiline
            />
          </Field>

          <Pressable
            onPress={() => {
              if (assigneeId === null) return;
              create.mutate({
                assigneeId,
                title: title.trim(),
                ...(details.trim() === '' ? {} : { details: details.trim() }),
              });
            }}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submit,
              canSubmit ? null : styles.submitOff,
              pressed ? styles.pressed : null,
            ]}
          >
            {create.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Icon name="assigned" size={18} color={colors.onAccent} />
                <Text style={styles.submitText}>Выдать поручение</Text>
              </>
            )}
          </Pressable>
        </Card>

        <Card>
          <CardTitle title="Выданные" icon="orders" />

          {tasks.isError ? (
            <ErrorState message={tasks.error.message} />
          ) : tasks.data === undefined ? (
            <Skeleton />
          ) : tasks.data.items.length === 0 ? (
            <Empty message="Поручений нет" hint="Выданные задачи появятся здесь" />
          ) : (
            tasks.data.items.map((task) => (
              <View key={task.id}>
                <View style={styles.taskRow}>
                  {/*
                    Строка открывает поручение: руководителю нужно видеть, что
                    ответил исполнитель и что он приложил. Без этого выданная
                    задача была для автора такой же немой, как для адресата.
                  */}
                  <Pressable
                    onPress={() => {
                      navigation.navigate('TaskDetail', { taskId: task.id });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Открыть поручение «${task.title}»`}
                    style={({ pressed }) => [styles.taskText, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskMeta}>
                      {`${task.assignee.fullName}${
                        task.dueDate === null ? '' : ` · до ${formatIsoDate(task.dueDate)}`
                      }`}
                    </Text>
                  </Pressable>

                  <Pill text={t(TASK_STATUS_LABELS, task.status)} tone={toneOf(task.status)} />

                  {task.status === 'open' && cancelling !== task.id && (
                    <Pressable
                      onPress={() => {
                        setCancelling(task.id);
                        setCancelReason('');
                      }}
                      disabled={cancel.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Отменить поручение «${task.title}»`}
                      style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
                    >
                      <Icon name="remove" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>

                {/*
                  Причина отмены обязательна на сервере, и это правильно:
                  поручение уже видел исполнитель, и молча исчезнувшая
                  задача выглядит как сбой, а не как решение руководителя.
                */}
                {cancelling === task.id && (
                  <View style={styles.cancelBox}>
                    <Field label="Почему отменяем">
                      <Input
                        value={cancelReason}
                        onChangeText={setCancelReason}
                        placeholder="Исполнитель должен понять причину"
                        autoFocus
                      />
                    </Field>

                    <View style={styles.cancelActions}>
                      <Pressable
                        onPress={() => {
                          setCancelling(null);
                          setCancelReason('');
                        }}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.cancelButton,
                          styles.cancelGhost,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.cancelGhostText}>Оставить</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          cancel.mutate({ id: task.id, reason: cancelReason.trim() });
                        }}
                        disabled={cancelReason.trim().length === 0 || cancel.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.cancelButton,
                          styles.cancelDanger,
                          cancelReason.trim().length === 0 ? styles.submitOff : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.submitText}>Отменить</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toneOf(status: TaskStatus): 'positive' | 'danger' | 'neutral' {
  if (status === 'done') return 'positive';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  people: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.sm,
  },
  submitOff: {
    opacity: 0.4,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  taskText: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  taskMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cancelBox: {
    paddingBottom: spacing.md,
  },
  cancelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelDanger: {
    backgroundColor: colors.danger,
  },
  cancelGhostText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cancel: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

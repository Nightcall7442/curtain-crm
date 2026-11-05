import {
  formatIsoDate,
  isTaskActive,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@curtain-crm/shared';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

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
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
      Alert.alert(m('assign.error'), error.message);
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
      Alert.alert(m('assign.cancelError'), error.message);
    },
  });

  const canSubmit = assigneeId !== null && title.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Экран открыт поверх вкладок: снизу — обычный отступ и безопасная
          зона, а не место под панель, которой здесь нет. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <CardTitle title={m('assign.new')} icon="assigned" />

          <Field label={m('assign.to')}>
            {people.isLoading ? (
              <Skeleton rows={1} />
            ) : (
              /*
                Лента сотрудников доходит до краёв карточки, а не обрывается
                на её внутреннем отступе: имя, срезанное посреди белого поля,
                выглядело ошибкой вёрстки, а не приглашением листать. Первый
                чип при этом стоит на одной линии с подписью «Кому».
              */
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.peopleRail}
                contentContainerStyle={styles.people}
              >
                {(people.data?.items ?? []).map((person) => (
                  <Pressable
                    key={person.id}
                    onPress={() => {
                      setAssigneeId(person.id === assigneeId ? null : person.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: person.id === assigneeId }}
                    style={({ pressed }) => [
                      styles.chip,
                      person.id === assigneeId ? styles.chipActive : null,
                      pressed ? styles.pressed : null,
                    ]}
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

          <Field label={m('assign.what')}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={m('assign.whatPlaceholder')}
            />
          </Field>

          <Field label={m('assign.details')}>
            <Input
              value={details}
              onChangeText={setDetails}
              placeholder={m('assign.detailsPlaceholder')}
              multiline
            />
          </Field>

          {/*
            Общая кнопка формы: высота 48, таблетка, тот же оттенок
            «недоступно». Была своя — 50, скругление 14, бледнее на 10 %, и
            со значком «+», который повторял значок заголовка карточки.
          */}
          <SubmitButton
            label={m('assign.submit')}
            onPress={() => {
              if (assigneeId === null) return;
              create.mutate({
                assigneeId,
                title: title.trim(),
                ...(details.trim() === '' ? {} : { details: details.trim() }),
              });
            }}
            disabled={!canSubmit}
            pending={create.isPending}
          />
        </Card>

        <Card>
          <CardTitle title={m('assign.issued')} icon="orders" />

          {/* Без текста сервера: служебный ответ бывает по-английски. */}
          {tasks.isError ? (
            <ErrorState />
          ) : tasks.data === undefined ? (
            <Skeleton />
          ) : tasks.data.items.length === 0 ? (
            <Empty message={m('assign.none')} hint={m('assign.noneHint')} />
          ) : (
            /*
              Строка поручения — столбиком: название во всю ширину, под ним
              плашка статуса, исполнитель и срок; кнопка отмены — справа по
              центру строки. В один ряд с плашкой названию оставалось 86
              точек: «Убрать рабочее место» ложилось по слову на строку, а
              плашка стояла сверху, когда корзина — посередине.
            */
            tasks.data.items.map((task, index, all) => {
              const isCancelling = cancelling === task.id;
              const isLast = index === all.length - 1;
              /* Срок не отрывается от «до»: пробелы внутри — неразрывные,
                 перенос возможен только перед ним. */
              const due =
                task.dueDate === null
                  ? ''
                  : ` ${m('assign.until', { date: formatIsoDate(task.dueDate) }).trimStart().replace(/ /g, '\u00A0')}`;

              return (
                <View key={task.id}>
                  <View
                    style={[
                      styles.taskRow,
                      // Линия — между поручениями. Под открытой формой отмены
                      // её рисует сама форма, под последним — никто.
                      isCancelling || isLast ? styles.taskRowPlain : null,
                    ]}
                  >
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
                      accessibilityLabel={m('assign.open', { title: task.title })}
                      style={({ pressed }) => [styles.taskText, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <View style={styles.taskMetaRow}>
                        {/* Обёртка — чтобы плашка встала по центру строки, а
                            не к её верху (`Pill` прижат к началу). */}
                        <View>
                          <Pill text={t(TASK_STATUS_LABELS, task.status)} tone={toneOf(task.status)} />
                        </View>
                        <Text style={styles.taskMeta}>{`${task.assignee.fullName}${due}`}</Text>
                      </View>
                    </Pressable>

                    {isTaskActive(task.status) &&
                      (isCancelling ? (
                        /* Место кнопки держится, пока открыта форма: иначе
                           строка расползалась вправо и плашка прыгала. */
                        <View style={styles.cancel} />
                      ) : (
                        <Pressable
                          onPress={() => {
                            setCancelling(task.id);
                            setCancelReason('');
                          }}
                          disabled={cancel.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={m('assign.cancelA11y', { title: task.title })}
                          style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
                        >
                          <Icon name="remove" size={18} color={colors.textMuted} />
                        </Pressable>
                      ))}
                  </View>

                  {/*
                    Причина отмены обязательна на сервере, и это правильно:
                    поручение уже видел исполнитель, и молча исчезнувшая
                    задача выглядит как сбой, а не как решение руководителя.
                  */}
                  {isCancelling && (
                    <View style={[styles.cancelBox, isLast ? styles.taskRowPlain : null]}>
                      <Field label={m('assign.why')}>
                        <Input
                          value={cancelReason}
                          onChangeText={setCancelReason}
                          placeholder={m('assign.whyPlaceholder')}
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
                          <Text style={styles.cancelGhostText}>{m('assign.keep')}</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            cancel.mutate({ id: task.id, reason: cancelReason.trim() });
                          }}
                          disabled={cancelReason.trim().length === 0 || cancel.isPending}
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: cancelReason.trim().length === 0 || cancel.isPending,
                            busy: cancel.isPending,
                          }}
                          style={({ pressed }) => [
                            styles.cancelButton,
                            styles.cancelDanger,
                            cancelReason.trim().length === 0 ? styles.off : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          {cancel.isPending ? (
                            <ActivityIndicator color={colors.onAccent} />
                          ) : (
                            <Text style={styles.cancelDangerText}>{m('assign.cancel')}</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toneOf(status: TaskStatus): 'positive' | 'danger' | 'neutral' | 'info' {
  if (status === 'done') return 'positive';
  if (status === 'cancelled') return 'danger';
  // Сдано и ждёт решения руководителя — строка открывает поручение с кнопками.
  if (status === 'pending_review') return 'info';
  return 'neutral';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  /* Лента выходит за внутренний отступ карточки до её краёв (`Card` — 16). */
  peopleRail: {
    marginHorizontal: -spacing.lg,
  },
  people: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  /*
    Чип — как в общем выборе (`ChipSelect`): высота поля под ним, волосяная
    рамка, вес подписи меняет только начертание. Было 40 — ниже и поля, и
    порога пальца, — и рамка в целую точку, грубее соседних полей.
  */
  chip: {
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: hairline,
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
    // Насыщенность — семейством: вес поверх Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.headerText,
  },
  // Одна прозрачность «недоступно» на всё приложение — как у `SubmitButton`.
  off: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  taskRowPlain: {
    borderBottomWidth: 0,
  },
  taskText: {
    flex: 1,
    minWidth: 0,
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
    marginTop: spacing.xs,
  },
  taskTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  taskMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  /* Форма отмены продолжает свою строку и сама отчёркивает её от
     следующей; сверху — воздух, чтобы подпись не липла к строке. */
  cancelBox: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  cancelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /*
    Пара «Оставить / Отменить поручение» — той же системы, что кнопка
    формы выше: высота кнопки действия, таблетка, жирная подпись. Было 44 и
    скругление 14 — на одном экране с кнопкой «Выдать» две разные кнопки.
  */
  cancelButton: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
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
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cancelDangerText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  cancel: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

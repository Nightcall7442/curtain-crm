import {
  formatIsoDate,
  TASK_STATUS_LABELS,
  TaskStatus,
  type TaskStatus as TaskStatusName,
} from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Row, Skeleton } from '../components/Card';
import { Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Поручение целиком: что поручено, кем, и переписка по нему.
 *
 * Раньше поручение жило одной строкой в списке: заголовок, срок, галочка
 * «выполнено». Спросить «а что именно не так» было нечем — уточнения шли
 * голосом и в системе не оставались, а руководителю приложить фото брака
 * было некуда.
 *
 * Ответ — одно поле на текст и файл сразу. Разводить «написать» и
 * «приложить» на две кнопки незачем: на телефоне это один жест, и чаще
 * всего фото идёт с подписью, а не отдельно.
 */
export function TaskDetailScreen({ route }: RootStackScreenProps<'TaskDetail'>): ReactElement {
  const { t } = useLocale();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { taskId } = route.params;

  const [body, setBody] = useState('');
  /** Выбранное фото, ещё не отправленное. */
  const [attachment, setAttachment] = useState<
    { readonly uri: string; readonly base64: string; readonly mimeType: string } | null
  >(null);

  const task = trpc.tasks.byId.useQuery({ id: taskId });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.tasks.byId.invalidate({ id: taskId }),
      utils.tasks.my.invalidate(),
      utils.tasks.list.invalidate(),
    ]);
  };

  const reply = trpc.tasks.reply.useMutation({
    async onSuccess() {
      notifySuccess();
      setBody('');
      setAttachment(null);
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отправить', error.message);
    },
  });

  const complete = trpc.tasks.complete.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить выполнение', error.message);
    },
  });

  const pickPhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках телефона.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    const asset = picked.assets?.[0];
    if (picked.canceled || asset?.base64 === undefined || asset.base64 === null) return;

    setAttachment({
      uri: asset.uri,
      base64: asset.base64,
      // Галерея не всегда сообщает тип; JPEG — верное предположение для
      // снимка с камеры, и сервер всё равно проверит по белому списку.
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  if (task.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={task.error.message} />
      </View>
    );
  }

  if (task.data === undefined) {
    return (
      <View style={styles.content}>
        <Card>
          <Skeleton />
        </Card>
      </View>
    );
  }

  const { data } = task;
  const isOpen = data.status === TaskStatus.OPEN;
  const canSend = (body.trim().length > 0 || attachment !== null) && !reply.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle
            title={data.title}
            icon="assigned"
            action={<Pill text={t(TASK_STATUS_LABELS, data.status)} tone={toneOf(data.status)} />}
          />

          {data.details !== null && <Text style={styles.details}>{data.details}</Text>}

          <Row label="Кому" value={data.assignee.fullName} />
          <Row label="Выдал" value={data.creator.fullName} />
          {data.dueDate !== null && <Row label="Срок" value={formatIsoDate(data.dueDate)} />}
          {data.cancelReason !== null && (
            <Row label="Причина отмены" value={data.cancelReason} />
          )}

          {/*
            Кнопка выполнения — здесь же, а не только в списке. Сотрудник
            приходит на этот экран, чтобы разобраться в задании, и логично
            закрыть его там же, где он только что дочитал условие.
          */}
          {isOpen && (
            <Pressable
              onPress={() => {
                complete.mutate({ id: taskId });
              }}
              disabled={complete.isPending}
              accessibilityRole="button"
              style={({ pressed }) => [styles.done, pressed ? styles.pressed : null]}
            >
              {complete.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <>
                  <Icon name="completed" size={18} color={colors.onAccent} />
                  <Text style={styles.doneText}>Выполнено</Text>
                </>
              )}
            </Pressable>
          )}
        </Card>

        <Card>
          <CardTitle title="Переписка" icon="comment" />

          {data.messages.length === 0 ? (
            <Empty
              message="Сообщений нет"
              hint="Приложите фото или напишите, если что-то непонятно"
            />
          ) : (
            data.messages.map((message) => {
              const isMine = message.authorId === user?.id;

              return (
                <View
                  key={message.id}
                  style={[styles.message, isMine ? styles.messageMine : null]}
                >
                  <Text style={styles.messageAuthor}>
                    {isMine ? 'Вы' : message.author.fullName}
                  </Text>

                  {message.body !== null && (
                    <Text style={styles.messageBody}>{message.body}</Text>
                  )}

                  {message.url !== null && isImage(message.mimeType) && (
                    <Image
                      source={{ uri: message.url }}
                      style={styles.messagePhoto}
                      resizeMode="cover"
                    />
                  )}

                  {/*
                    Не-картинку показать нечем — открываем во внешнем
                    приложении. Свой просмотрщик PDF на телефоне в цеху ничего
                    не добавит: накладную всё равно смотрят и пересылают
                    системными средствами.
                  */}
                  {message.url !== null && !isImage(message.mimeType) && (
                    <Pressable
                      onPress={() => {
                        void Linking.openURL(message.url ?? '');
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.file, pressed ? styles.pressed : null]}
                    >
                      <Icon name="order" size={16} color={colors.accentStrong} />
                      <Text style={styles.fileText} numberOfLines={1}>
                        {message.originalFileName ?? 'Открыть файл'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <CardTitle title="Ответить" icon="voice" />

          <Input
            value={body}
            onChangeText={setBody}
            placeholder="Что сделано или что непонятно"
            multiline
          />

          {attachment !== null && (
            <View style={styles.preview}>
              <Image source={{ uri: attachment.uri }} style={styles.previewPhoto} />
              <Pressable
                onPress={() => {
                  setAttachment(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Убрать фото"
                style={({ pressed }) => [styles.previewRemove, pressed ? styles.pressed : null]}
              >
                <Icon name="remove" size={16} color={colors.danger} />
              </Pressable>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                void pickPhoto();
              }}
              disabled={reply.isPending}
              accessibilityRole="button"
              style={({ pressed }) => [styles.attach, pressed ? styles.pressed : null]}
            >
              <Icon name="photo" size={18} color={colors.accentStrong} />
              <Text style={styles.attachText}>Фото</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                reply.mutate({
                  taskId,
                  ...(body.trim() === '' ? {} : { body: body.trim() }),
                  ...(attachment === null
                    ? {}
                    : {
                        file: {
                          fileName: 'photo.jpg',
                          mimeType: attachment.mimeType,
                          content: attachment.base64,
                        },
                      }),
                });
              }}
              disabled={!canSend}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.send,
                canSend ? null : styles.sendOff,
                pressed ? styles.pressed : null,
              ]}
            >
              {reply.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.sendText}>Отправить</Text>
              )}
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const isImage = (mimeType: string | null): boolean => mimeType?.startsWith('image/') === true;

function toneOf(status: TaskStatusName): 'positive' | 'danger' | 'neutral' {
  if (status === TaskStatus.DONE) return 'positive';
  if (status === TaskStatus.CANCELLED) return 'danger';
  return 'neutral';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  details: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.md,
  },
  doneText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
  message: {
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  messageMine: {
    // Своё сообщение помечено сдвигом, а не цветным пузырём: лента здесь
    // короткая и деловая, мессенджер из неё делать незачем.
    paddingLeft: spacing.lg,
  },
  messageAuthor: {
    ...typography.caption,
    color: colors.textMuted,
  },
  messageBody: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: 1,
  },
  messagePhoto: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  fileText: {
    ...typography.caption,
    color: colors.accentStrong,
    flexShrink: 1,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  previewPhoto: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  previewRemove: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  send: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: {
    opacity: 0.4,
  },
  sendText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

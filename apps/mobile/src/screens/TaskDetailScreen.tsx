import {
  formatIsoDate,
  isManagement,
  isTaskActive,
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
import { ShiftRequiredBanner } from '../components/ShiftRequiredBanner';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';
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
  const { t, m } = useLocale();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { taskId } = route.params;
  const insets = useSafeAreaInsets();

  const [body, setBody] = useState('');
  /** Руководитель пишет, что доделать, — поле открыто. */
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState('');
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
      Alert.alert(m('task.sendError'), error.message);
    },
  });

  const isBoss = isManagement(user?.roles ?? []);
  /*
    Без открытой смены сервер не примет от сотрудника ни ответа, ни отметки
    «выполнено» — и отвечает отказом уже после нажатия. Экран говорит об
    этом заранее, тем же баннером, что и «Работа», а кнопки выключает.
    Руководителю смена для поручений не нужна.
  */
  const shift = trpc.shifts.current.useQuery(undefined, { enabled: !isBoss });
  const needsShift = !isBoss && shift.data === null;

  const complete = trpc.tasks.complete.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert(isBoss ? m('task.approveError') : m('task.completeError'), error.message);
    },
  });

  const sendBack = trpc.tasks.sendBack.useMutation({
    async onSuccess() {
      notifySuccess();
      setReturning(false);
      setReturnReason('');
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('task.sendBackError'), error.message);
    },
  });

  const pickPhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(m('photo.noAccess'), m('photo.allowGallery'));
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

  const contentStyle = [styles.content, { paddingBottom: spacing.xl + insets.bottom }];

  /* Без текста сервера: служебный ответ бывает по-английски и ничего не объясняет. */
  if (task.isError) {
    return (
      <View style={styles.center}>
        <ErrorState />
      </View>
    );
  }

  if (task.data === undefined) {
    return (
      <View style={contentStyle}>
        <Card>
          <Skeleton />
        </Card>
      </View>
    );
  }

  const { data } = task;
  const isOpen = data.status === TaskStatus.OPEN;
  const isSubmitted = data.status === TaskStatus.PENDING_REVIEW;
  /*
    Кнопка закрытия: сотруднику — сдать открытое, руководителю — принять
    сданное или закрыть открытое за сотрудника.
  */
  const canComplete = isBoss ? isTaskActive(data.status) : isOpen;
  const canSend =
    (body.trim().length > 0 || attachment !== null) && !reply.isPending && !needsShift;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/*
        Снизу — безопасная зона и обычный отступ: это экран стека, панели
        вкладок под ним нет, и место под неё оставляло пустую полосу.
      */}
      <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
        <ShiftRequiredBanner />

        <Card>
          {/*
            Значок поручения — тот же, что у пункта «Поручения» в разделе
            руководителя. Был «+» назначения: заголовок самого поручения
            читался как кнопка «добавить».
          */}
          <CardTitle
            title={data.title}
            icon="task"
            action={<Pill text={t(TASK_STATUS_LABELS, data.status)} tone={toneOf(data.status)} />}
          />

          {data.details !== null && <Text style={styles.details}>{data.details}</Text>}

          <Row label={m('task.to')} value={data.assignee.fullName} />
          <Row label={m('task.from')} value={data.creator.fullName} />
          {data.dueDate !== null && <Row label={m('task.due')} value={formatIsoDate(data.dueDate)} />}
          {data.cancelReason !== null && (
            <Row label={m('task.cancelReason')} value={data.cancelReason} />
          )}

          {/*
            Кнопка выполнения — здесь же, а не только в списке. Сотрудник
            приходит на этот экран, чтобы разобраться в задании, и логично
            закрыть его там же, где он только что дочитал условие.
          */}
          {isSubmitted && !isBoss && <Text style={styles.waiting}>{m('task.waiting')}</Text>}

          {canComplete && (
            <Pressable
              onPress={() => {
                complete.mutate({ id: taskId });
              }}
              disabled={complete.isPending || needsShift}
              accessibilityRole="button"
              accessibilityState={{ disabled: complete.isPending || needsShift }}
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                styles.done,
                needsShift ? styles.off : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {complete.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <>
                  <Icon name="completed" size={18} color={colors.onAccent} />
                  <Text style={styles.buttonPrimaryText}>
                    {isBoss && isSubmitted ? m('task.approve') : m('task.done')}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/*
            Вернуть сданное — только руководителю и только с причиной: она
            ляжет в переписку ниже, и сотрудник увидит, что доделать.
          */}
          {isBoss && isSubmitted && !returning && (
            <Pressable
              onPress={() => {
                setReturning(true);
                setReturnReason('');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonOutline,
                styles.sendBack,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.buttonOutlineText}>{m('task.sendBack')}</Text>
            </Pressable>
          )}

          {isBoss && isSubmitted && returning && (
            <View style={styles.returnBox}>
              <Text style={styles.returnLabel}>{m('task.sendBackWhy')}</Text>
              <Input
                value={returnReason}
                onChangeText={setReturnReason}
                placeholder={m('task.sendBackPlaceholder')}
                multiline
                autoFocus
              />
              <View style={styles.returnActions}>
                <Pressable
                  onPress={() => {
                    setReturning(false);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonOutline,
                    styles.flexButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.buttonOutlineMutedText}>{m('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    sendBack.mutate({ id: taskId, reason: returnReason.trim() });
                  }}
                  disabled={returnReason.trim().length < 3 || sendBack.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonPrimary,
                    styles.flexButton,
                    returnReason.trim().length < 3 ? styles.off : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {sendBack.isPending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.buttonPrimaryText} numberOfLines={1}>
                      {m('task.sendBackConfirm')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </Card>

        <Card>
          <CardTitle title={m('task.chat')} icon="comment" />

          {data.messages.length === 0 ? (
            <Empty
              message={m('task.noMessages')}
              hint={m('task.noMessagesHint')}
            />
          ) : (
            <View style={styles.messages}>
              {data.messages.map((message) => {
                const isMine = message.authorId === user?.id;
                const hasPhoto = message.url !== null && isImage(message.mimeType);

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.message,
                      isMine ? styles.messageMine : styles.messageTheirs,
                      hasPhoto ? styles.messageWithPhoto : null,
                    ]}
                  >
                    <Text style={[styles.messageAuthor, isMine ? styles.messageAuthorMine : null]}>
                      {isMine ? m('task.you') : message.author.fullName}
                    </Text>

                    {message.body !== null && (
                      <Text style={styles.messageBody}>{message.body}</Text>
                    )}

                    {message.url !== null && hasPhoto && (
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
                          {message.originalFileName ?? m('task.openFile')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card>
          {/* «Отправить», а не микрофон: голосового ответа здесь нет, а
              пузырь «Переписки» уже занят карточкой выше. */}
          <CardTitle title={m('task.reply')} icon="send" />

          <Input
            value={body}
            onChangeText={setBody}
            placeholder={m('task.replyPlaceholder')}
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
                accessibilityLabel={m('task.removePhoto')}
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
              disabled={reply.isPending || needsShift}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonOutline,
                styles.attach,
                needsShift ? styles.off : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon name="photo" size={18} color={colors.accentStrong} />
              <Text style={styles.attachText}>{m('task.photo')}</Text>
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
              accessibilityState={{ disabled: !canSend }}
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                styles.flexButton,
                canSend ? null : styles.off,
                pressed ? styles.pressed : null,
              ]}
            >
              {reply.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.buttonPrimaryText}>{m('common.send')}</Text>
              )}
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const isImage = (mimeType: string | null): boolean => mimeType?.startsWith('image/') === true;

function toneOf(status: TaskStatusName): 'positive' | 'danger' | 'neutral' | 'info' {
  if (status === TaskStatus.DONE) return 'positive';
  if (status === TaskStatus.CANCELLED) return 'danger';
  if (status === TaskStatus.PENDING_REVIEW) return 'info';
  return 'neutral';
}

/*
  Кнопки экрана — одна система, и она же общая для приложения
  (`SubmitButton`): высота кнопки действия, таблетка, подпись основным
  кеглем жирным начертанием.

  Прежде у каждой кнопки были свои размеры: «Принять» 48, «Вернуть» под
  ней 44, «Фото» и «Отправить» 46; подписи 15/700, 15/600, 15/400 и 13/600
  в соседних кнопках, рамки то волосяные, то в точку. Потом экран собрался
  в свою систему со скруглением 14 — и стал выглядеть взятым из другого
  приложения рядом с таблетками карточки заказа и кассы.
*/
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
  },
  details: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonPrimaryText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    flexShrink: 1,
  },
  buttonOutlineText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  buttonOutlineMutedText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  /*
    Растёт от своей подписи, а не делит ряд поровну: при равных долях
    «Вернуть в работу» не помещалась рядом с «Отменой» и резалась
    многоточием, хотя места в ряду хватало.
  */
  flexButton: {
    flexGrow: 1,
    flexShrink: 1,
  },
  off: {
    opacity: opacity.disabled,
  },
  done: {
    marginTop: spacing.md,
  },
  waiting: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  sendBack: {
    marginTop: spacing.sm,
  },
  returnBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  returnLabel: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  returnActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /*
    Переписка — пузырями: своё справа на зелёной подложке, чужое слева на
    серой. Прежде своё сообщение отличал только сдвиг на 16 точек, и он
    читался как случайный отступ, а линия под последним сообщением висела
    у самого края карточки.
  */
  messages: {
    gap: spacing.sm,
  },
  message: {
    maxWidth: '85%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSoft,
  },
  messageTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
  },
  /** С фото пузырь во всю допустимую ширину: снимку нужна ширина, а не подпись. */
  messageWithPhoto: {
    width: '85%',
  },
  messageAuthor: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  messageAuthorMine: {
    color: colors.accentStrong,
  },
  messageBody: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: 2,
  },
  messagePhoto: {
    width: '100%',
    height: 200,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.touchTarget,
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
    width: sizes.touchTarget,
    height: sizes.touchTarget,
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
    gap: spacing.xs,
  },
  attachText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

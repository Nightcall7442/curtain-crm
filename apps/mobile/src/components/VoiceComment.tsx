import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
// Новый классовый API файловой системы (SDK 54). Устаревший вход `/legacy`
// не подошёл — он раздаёт исходники, и их проверял бы наш строгий tsc.
import { File } from 'expo-file-system';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography, opacity } from '../theme';

/**
 * Голосовые комментарии к заказу: запись и воспроизведение.
 *
 * Главный сценарий, ради которого голос вообще есть в системе: швея за машинкой
 * и установщик на объекте набирают текст плохо, а сказать могут за пять секунд.
 * Сервер (`orderComments.addVoice`) и плеер в веб-панели существовали с самого
 * начала — записывать было нечем ни здесь, ни там.
 *
 * `expo-audio` пишет в m4a на обоих платформах (пресет `HIGH_QUALITY`), а его
 * mime-тип `audio/mp4` входит в белый список сервера.
 *
 * Раньше здесь был `expo-av`. Его убрали из SDK 55, и переезд был не выбором,
 * а условием обновления. API изменился по сути, а не по названиям: вместо
 * объектов, которые создаются и выгружаются вручную, — хуки, живущие вместе
 * с компонентом. Поэтому запись и плеер ниже устроены иначе, чем раньше.
 */

/** Столько же, сколько разрешает сервер (`MAX_VOICE_DURATION_SECONDS`). */
const MAX_SECONDS = 300;

const formatSeconds = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString()}:${(seconds % 60).toString().padStart(2, '0')}`;
};

/* -------------------------------------------------------------------------- */
/*                                   Запись                                   */
/* -------------------------------------------------------------------------- */

export function VoiceRecorderButton({ orderId }: { readonly orderId: number }): ReactElement {
  const utils = trpc.useUtils();

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  /*
    Диктофон живёт вместе с компонентом, а не создаётся на каждую запись.

    Так устроен `expo-audio`: `useAudioRecorder` возвращает один объект на всё
    время жизни экрана, а начало и конец записи — это вызовы на нём. Прежний
    `expo-av` создавал объект записи заново и требовал выгружать его руками;
    здесь выгрузку делает сам хук.
  */
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const addVoice = trpc.orderComments.addVoice.useMutation({
    async onSuccess() {
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
    onError(error) {
      Alert.alert('Не удалось отправить запись', error.message);
    },
  });

  /**
   * Если экран закрыли во время записи — останавливаем.
   *
   * Сам диктофон выгружать не нужно: этим занимается хук. А вот таймер и
   * незавершённую запись он не знает — микрофон остался бы занятым.
   */
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      void recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  const stopTimer = (): void => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = async (): Promise<void> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к микрофону в настройках телефона.');
      return;
    }

    try {
      // На iOS без этого запись идёт в «тихом» режиме и получается пустой,
      // а динамик после воспроизведения остаётся приглушённым. В `expo-audio`
      // поля назвали без суффикса iOS, смысл прежний.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      // Подготовка и старт разделены: `record()` не ждёт готовности, и без
      // `prepareToRecordAsync` первые доли секунды речи теряются.
      await recorder.prepareToRecordAsync();
      recorder.record();

      elapsedRef.current = 0;
      setElapsed(0);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        // Сервер откажет в записи длиннее лимита — останавливаемся сами,
        // чтобы человек не потерял уже сказанное.
        if (elapsedRef.current >= MAX_SECONDS) void finish(true);
      }, 1000);
    } catch {
      setIsRecording(false);
      Alert.alert('Не удалось начать запись', 'Проверьте, не занят ли микрофон другим приложением.');
    }
  };

  const finish = async (shouldSend: boolean): Promise<void> => {
    stopTimer();
    setIsRecording(false);

    const seconds = elapsedRef.current;
    elapsedRef.current = 0;
    setElapsed(0);

    await recorder.stop().catch(() => undefined);
    // Возвращаем звуковой режим: иначе на iOS динамик остаётся приглушённым
    // и следующее голосовое сообщение слушают, недоумевая, почему тихо.
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);

    // Путь появляется только после остановки — до неё файла ещё нет.
    const uri = recorder.uri;
    const removeTemp = (target: string): void => {
      try {
        new File(target).delete();
      } catch {
        // Файл мог не существовать — для уборки это не ошибка.
      }
    };

    if (!shouldSend || uri === null) {
      if (uri !== null) removeTemp(uri);
      return;
    }

    let content: string | null;
    try {
      content = await new File(uri).base64();
    } catch {
      content = null;
    }

    // Временный файл больше не нужен ни при успехе, ни при отказе: он лежит
    // в кеше приложения и иначе копился бы там до переустановки.
    removeTemp(uri);

    if (content === null) {
      Alert.alert('Не удалось прочитать запись', 'Попробуйте ещё раз.');
      return;
    }

    addVoice.mutate({
      orderId,
      durationSeconds: Math.min(MAX_SECONDS, Math.max(1, seconds)),
      file: { fileName: 'voice.m4a', mimeType: 'audio/mp4', content },
    });
  };

  if (isRecording) {
    return (
      <View style={styles.recordingRow}>
        <View style={styles.recordingDot} />
        <Text style={styles.recordingText}>{`Идёт запись · ${formatSeconds(elapsed)}`}</Text>

        <Pressable
          onPress={() => void finish(false)}
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel="Отменить запись"
        >
          <Text style={styles.secondaryText}>Отмена</Text>
        </Pressable>

        <Pressable
          onPress={() => void finish(true)}
          style={styles.primaryButton}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Отправить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => void start()}
      disabled={addVoice.isPending}
      style={({ pressed }) => [styles.recordButton, pressed ? styles.pressed : null]}
      accessibilityRole="button"
    >
      {addVoice.isPending ? (
        <ActivityIndicator color={colors.accent} size="small" />
      ) : (
        <Text style={styles.recordText}>🎤 Записать голосом</Text>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Воспроизведение                               */
/* -------------------------------------------------------------------------- */

/**
 * Плеер одной записи.
 *
 * Звук выгружается при уходе с экрана — этим занимается сам `useAudioPlayer`.
 * Раньше выгрузку приходилось писать руками, иначе запись продолжала играть
 * поверх следующего экрана и удерживала аудиофокус на Android.
 *
 * Плеер создаётся сразу, а не по первому нажатию: в `expo-audio` он живёт
 * хуком, и «создать при клике» означало бы условный вызов хука. Загрузку это
 * не ускоряет и не замедляет — источник подтягивается лениво самим плеером.
 */
export function VoiceCommentPlayer({
  url,
  durationSeconds,
}: {
  readonly url: string | null;
  readonly durationSeconds: number | null;
}): ReactElement {
  const player = useAudioPlayer(url ?? undefined);
  const status = useAudioPlayerStatus(player);

  /*
    Дослушанную запись перематываем в начало.

    Без этого повторное нажатие ничего не играет: позиция стоит в конце, и
    плеер считает, что играть больше нечего.
  */
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  const toggle = (): void => {
    if (url === null) return;

    if (status.playing) {
      player.pause();
      return;
    }

    // Режим звука выставляем перед проигрыванием: на iOS в «тихом» положении
    // переключателя запись иначе не слышна вовсе.
    void setAudioModeAsync({ playsInSilentMode: true })
      .catch(() => undefined)
      .then(() => {
        player.play();
      });
  };

  if (url === null) {
    return <Text style={styles.unavailable}>🎤 Запись недоступна</Text>;
  }

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [styles.player, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Пауза' : 'Воспроизвести голосовое сообщение'}
    >
      {status.isBuffering ? (
        <ActivityIndicator color={colors.accent} size="small" />
      ) : (
        <Text style={styles.playerGlyph}>{status.playing ? '⏸' : '▶'}</Text>
      )}
      <Text style={styles.playerText}>
        {durationSeconds === null ? 'Голосовое сообщение' : formatSeconds(durationSeconds)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recordButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  recordText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  recordingText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  primaryText: {
    ...typography.caption,
    color: colors.onAccent,
    fontWeight: '600',
  },
  player: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  playerGlyph: {
    fontSize: 14,
    color: colors.accent,
  },
  playerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unavailable: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});

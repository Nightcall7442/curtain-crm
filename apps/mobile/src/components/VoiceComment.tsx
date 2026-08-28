import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Голосовые комментарии к заказу: запись и воспроизведение.
 *
 * Главный сценарий, ради которого голос вообще есть в системе: швея за машинкой
 * и установщик на объекте набирают текст плохо, а сказать могут за пять секунд.
 * Сервер (`orderComments.addVoice`) и плеер в веб-панели существовали с самого
 * начала — записывать было нечем ни здесь, ни там.
 *
 * `expo-av` пишет в m4a на обоих платформах (пресет `HIGH_QUALITY`), а его
 * mime-тип `audio/mp4` входит в белый список сервера.
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

  const recordingRef = useRef<Audio.Recording | null>(null);
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

  /** Если экран закрыли во время записи — освобождаем микрофон. */
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      void recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    },
    [],
  );

  const stopTimer = (): void => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = async (): Promise<void> => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к микрофону в настройках телефона.');
      return;
    }

    try {
      // На iOS без этого запись идёт в «тихом» режиме и получается пустой,
      // а динамик после воспроизведения остаётся приглушённым.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets['HIGH_QUALITY'],
      );
      recordingRef.current = recording;
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
    const recording = recordingRef.current;
    recordingRef.current = null;
    stopTimer();
    setIsRecording(false);

    const seconds = elapsedRef.current;
    elapsedRef.current = 0;
    setElapsed(0);

    if (recording === null) return;

    await recording.stopAndUnloadAsync().catch(() => undefined);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);

    const uri = recording.getURI();
    if (!shouldSend || uri === null) {
      if (uri !== null) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      return;
    }

    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    }).catch(() => null);

    // Временный файл больше не нужен ни при успехе, ни при отказе: он лежит
    // в кеше приложения и иначе копился бы там до переустановки.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);

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
 * Звук выгружается при уходе с экрана: без этого запись продолжает играть
 * поверх следующего экрана, а на Android ещё и удерживает аудиофокус.
 */
export function VoiceCommentPlayer({
  url,
  durationSeconds,
}: {
  readonly url: string | null;
  readonly durationSeconds: number | null;
}): ReactElement {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(
    () => () => {
      void soundRef.current?.unloadAsync().catch(() => undefined);
    },
    [],
  );

  const toggle = async (): Promise<void> => {
    if (url === null) return;

    const existing = soundRef.current;
    if (existing !== null) {
      if (isPlaying) await existing.pauseAsync().catch(() => undefined);
      else await existing.playAsync().catch(() => undefined);
      setIsPlaying(!isPlaying);
      return;
    }

    setIsLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          // Перематываем в начало: иначе повторное нажатие ничего не играет,
          // потому что позиция стоит в конце.
          void sound.setPositionAsync(0).catch(() => undefined);
        }
      });
    } catch {
      Alert.alert('Не удалось воспроизвести', 'Запись недоступна.');
    } finally {
      setIsLoading(false);
    }
  };

  const uri = url ?? '';

  if (url === null) {
    return <Text style={styles.unavailable}>🎤 Запись недоступна</Text>;
  }

  return (
    <Pressable
      onPress={() => void toggle()}
      style={({ pressed }) => [styles.player, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Пауза' : 'Воспроизвести голосовое сообщение'}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.accent} size="small" />
      ) : (
        <Text style={styles.playerGlyph}>{isPlaying ? '⏸' : '▶'}</Text>
      )}
      <Text style={styles.playerText}>
        {durationSeconds === null ? 'Голосовое сообщение' : formatSeconds(durationSeconds)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recordButton: {
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
    opacity: 0.6,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  primaryText: {
    ...typography.caption,
    color: colors.headerText,
    fontWeight: '600',
  },
  player: {
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

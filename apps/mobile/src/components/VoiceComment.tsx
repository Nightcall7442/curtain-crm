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
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography, opacity, fonts } from '../theme';
import { useLocale } from '../hooks/useLocale';

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

/** Расширение файла по MIME-типу записи браузера — для имени файла на сервере. */
const WEB_AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

interface RecordedFile {
  readonly content: string;
  readonly mimeType: string;
  readonly fileName: string;
}

/**
 * Готовая запись — в base64 для `orderComments.addVoice`.
 *
 * В браузере (PWA) путь другой, и это не косметика. `expo-file-system` в
 * вебе не реализован: `new File(uri).base64()` там бросал исключение, и
 * отправить голосовое из PWA было нельзя вовсе — каждая запись кончалась
 * «Не удалось прочитать запись». В браузере `expo-audio` пишет через
 * MediaRecorder и отдаёт `blob:`-ссылку, а формат у него свой — webm в
 * Chrome, mp4 в Safari. Поэтому MIME берётся из самой записи, а не
 * подставляется m4a: сервер принимает оба, но только если назвать их верно.
 */
async function readRecording(uri: string): Promise<RecordedFile> {
  if (Platform.OS !== 'web') {
    // На телефоне `expo-audio` пишет m4a (пресет `HIGH_QUALITY`).
    return { content: await new File(uri).base64(), mimeType: 'audio/mp4', fileName: 'voice.m4a' };
  }

  const blob = await (await fetch(uri)).blob();
  // `audio/webm;codecs=opus` → `audio/webm`: сервер сверяет тип без параметров.
  const mimeType = blob.type.split(';')[0]?.trim() || 'audio/webm';
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader'));
    };
    reader.readAsDataURL(blob);
  });

  return {
    content: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType,
    fileName: `voice.${WEB_AUDIO_EXTENSIONS[mimeType] ?? 'webm'}`,
  };
}

/** Убирает временную запись: файл в кеше на телефоне, `blob:`-ссылку в браузере. */
function removeRecording(uri: string): void {
  try {
    if (Platform.OS === 'web') {
      URL.revokeObjectURL(uri);
      return;
    }
    new File(uri).delete();
  } catch {
    // Файл мог не существовать — для уборки это не ошибка.
  }
}

export function VoiceRecorderButton({ orderId }: { readonly orderId: number }): ReactElement {
  const { m } = useLocale();
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
      Alert.alert(m('voice.sendError'), error.message);
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
      Alert.alert(m('photo.noAccess'), m('voice.allowMic'));
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
      Alert.alert(m('voice.startError'), m('voice.startErrorHint'));
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

    if (!shouldSend || uri === null) {
      if (uri !== null) removeRecording(uri);
      return;
    }

    let recorded: RecordedFile | null;
    try {
      recorded = await readRecording(uri);
    } catch {
      recorded = null;
    }

    // Временный файл больше не нужен ни при успехе, ни при отказе: он лежит
    // в кеше приложения и иначе копился бы там до переустановки.
    removeRecording(uri);

    if (recorded === null || recorded.content === '') {
      Alert.alert(m('voice.readError'), m('common.tryAgain'));
      return;
    }

    addVoice.mutate({
      orderId,
      durationSeconds: Math.min(MAX_SECONDS, Math.max(1, seconds)),
      file: { fileName: recorded.fileName, mimeType: recorded.mimeType, content: recorded.content },
    });
  };

  /*
    Запись идёт: сверху состояние, под ним два действия на всю ширину.

    В одну строку с кнопками подпись «Идёт запись · 0:02» получала около
    100 px и ломалась в две строки, а обрезать её нельзя — в хвосте таймер.
    Кнопки в ряд по половине ширины — та же пара, что «Снять камерой / Из
    галереи» в фотофиксации выше.
  */
  if (isRecording) {
    return (
      <View style={styles.recording}>
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText} numberOfLines={1}>
            {m('voice.recording', { t: formatSeconds(elapsed) })}
          </Text>
        </View>

        <View style={styles.recordingActions}>
          <Pressable
            onPress={() => void finish(false)}
            style={({ pressed }) => [styles.actionButton, styles.secondaryButton, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel={m('voice.cancel')}
          >
            <Text style={styles.secondaryText}>{m('common.cancel')}</Text>
          </Pressable>

          <Pressable
            onPress={() => void finish(true)}
            style={({ pressed }) => [styles.actionButton, styles.primaryButton, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{m('common.send')}</Text>
          </Pressable>
        </View>
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
        <Text style={styles.recordText}>{m('voice.record')}</Text>
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
  const { m } = useLocale();
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
    return <Text style={styles.unavailable}>{m('voice.unavailable')}</Text>;
  }

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [styles.player, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? m('voice.pause') : m('voice.play')}
    >
      {status.isBuffering ? (
        <ActivityIndicator color={colors.accent} size="small" />
      ) : (
        <Text style={styles.playerGlyph}>{status.playing ? '⏸' : '▶'}</Text>
      )}
      <Text style={styles.playerText}>
        {durationSeconds === null ? m('voice.message') : formatSeconds(durationSeconds)}
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
    // Тот же зазор до ленты комментариев, что и у панели записи: кнопка лежала прямо на черте.
    marginBottom: spacing.md,
  },
  recordText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  recording: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    // Отбивка от первого комментария: без неё кнопки ложились на его черту.
    marginBottom: spacing.md,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    fontVariant: ['tabular-nums'],
  },
  /* Подпись по центру кнопки: без `justifyContent` она садилась к верху на 9 px. */
  actionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  primaryText: {
    ...typography.body,
    // Вес — семейством: `fontWeight` поверх Medium в браузере дорисовывается грубым жирным.
    fontFamily: fonts.semibold,
    color: colors.onAccent,
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
    fontFamily: fonts.medium,
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

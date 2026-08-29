'use client';

import { Mic, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { trpc } from '@/lib/trpc';

/**
 * Запись голосового комментария к заказу.
 *
 * Голос быстрее текста там, где руки заняты тканью или инструментом, — ради
 * этого в схеме и в API он был предусмотрен с самого начала. Записывать его,
 * однако, было нечем: процедура `orderComments.addVoice` и плеер в карточке
 * существовали, а кнопки записи не было ни здесь, ни в мобильном приложении.
 *
 * Используется `MediaRecorder` браузера, без библиотек: запись со сжатием
 * в opus уже встроена, а любая обёртка добавила бы к бандлу больше, чем
 * весь этот файл.
 */

/**
 * Форматы в порядке предпочтения.
 *
 * Пересечение того, что умеет писать браузер, и того, что принимает сервер
 * (`ALLOWED_AUDIO_MIME_TYPES`). Первым идёт webm/opus — он же и единственный,
 * который пишет Chrome; Safari отдаёт mp4.
 */
const CANDIDATE_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const;

/** Столько же, сколько разрешает сервер (`MAX_VOICE_DURATION_SECONDS`). */
const MAX_SECONDS = 300;

const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString()}:${(seconds % 60).toString().padStart(2, '0')}`;
};

/**
 * Первый формат, который умеет писать этот браузер.
 * `null` означает, что записывать нечем — кнопка тогда не показывается.
 */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function VoiceRecorder({ orderId }: { readonly orderId: number }): ReactElement | null {
  const utils = trpc.useUtils();

  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Запись отменена пользователем — по остановке ничего не отправляем. */
  const discardedRef = useRef(false);
  /**
   * Длительность держим и в ref, и в состоянии: состояние нужно для отрисовки,
   * а обработчик `stop` замкнут на первое значение и увидел бы ноль.
   */
  const elapsedSecondsRef = useRef(0);

  const addVoice = trpc.orderComments.addVoice.useMutation({
    async onSuccess() {
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
    onError(mutationError) {
      setError(mutationError.message);
    },
  });

  /**
   * Поддержку проверяем в эффекте, а не при отрисовке: `MediaRecorder`
   * на сервере не существует, и обращение к нему во время рендера разошлось бы
   * с разметкой, пришедшей с сервера.
   */
  useEffect(() => {
    setIsSupported(pickMimeType() !== null && navigator.mediaDevices !== undefined);
  }, []);

  /** Освобождаем микрофон, если пользователь ушёл со страницы во время записи. */
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder !== null && recorder.state !== 'inactive') {
        discardedRef.current = true;
        recorder.stop();
      }
    },
    [],
  );

  const releaseStream = (recorder: MediaRecorder): void => {
    for (const track of recorder.stream.getTracks()) track.stop();
  };

  const start = async (): Promise<void> => {
    setError(null);

    const mimeType = pickMimeType();
    if (mimeType === null) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Отказ в доступе и отсутствие микрофона неотличимы по типу ошибки,
      // поэтому сообщение покрывает оба случая.
      setError('Нет доступа к микрофону. Разрешите запись в настройках браузера');
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardedRef.current = false;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      releaseStream(recorder);
      if (timerRef.current !== null) clearInterval(timerRef.current);
      timerRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);

      const seconds = elapsedSecondsRef.current;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      setElapsed(0);

      if (discardedRef.current || chunks.length === 0) return;
      void send(new Blob(chunks, { type: mimeType }), mimeType, seconds);
    });

    recorder.start();
    setIsRecording(true);
    setElapsed(0);
    elapsedSecondsRef.current = 0;

    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      setElapsed(elapsedSecondsRef.current);

      // Сервер откажет в записи длиннее лимита — останавливаемся сами,
      // чтобы человек не потерял то, что уже наговорил.
      if (elapsedSecondsRef.current >= MAX_SECONDS) stop();
    }, 1000);
  };

  const stop = (): void => {
    const recorder = recorderRef.current;
    if (recorder !== null && recorder.state !== 'inactive') recorder.stop();
  };

  const cancel = (): void => {
    discardedRef.current = true;
    stop();
  };

  const send = async (blob: Blob, mimeType: string, seconds: number): Promise<void> => {
    const content = await blobToBase64(blob);
    if (content === null) {
      setError('Не удалось прочитать запись. Попробуйте ещё раз');
      return;
    }

    addVoice.mutate({
      orderId,
      // Длительность округляем вверх: ноль секунд сервер не примет, а запись
      // «на полсекунды» — это всё-таки запись.
      durationSeconds: Math.min(MAX_SECONDS, Math.max(1, seconds)),
      file: {
        fileName: `voice.${mimeType === 'audio/mp4' ? 'm4a' : 'weba'}`,
        mimeType,
        content,
      },
    });
  };

  if (!isSupported) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {isRecording ? (
          <>
            <span className="flex items-center gap-1.5 text-footnote text-danger">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />
              {`Идёт запись · ${formatElapsed(elapsed)}`}
            </span>

            <button
              type="button"
              onClick={stop}
              className="ml-auto flex items-center gap-1.5 rounded border border-subtle px-2.5 py-1.5 text-footnote text-primary transition-colors hover:bg-raised"
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              Отправить запись
            </button>

            <button
              type="button"
              onClick={cancel}
              aria-label="Отменить запись"
              className="grid h-8 w-8 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={addVoice.isPending}
            onClick={() => {
              void start();
            }}
            className="flex items-center gap-1.5 rounded border border-subtle px-2.5 py-1.5 text-footnote text-secondary transition-colors hover:bg-raised hover:text-primary disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden />
            {addVoice.isPending ? 'Отправка…' : 'Записать голосом'}
          </button>
        )}
      </div>

      {error !== null && <p className="mt-1.5 text-footnote text-danger">{error}</p>}
    </div>
  );
}

/**
 * Blob в base64 без префикса `data:`.
 *
 * Через `FileReader`, а не `arrayBuffer` + ручную сборку: у записи в минуту
 * это сотни килобайт, и посимвольная склейка заметно подвесила бы вкладку.
 */
function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        resolve(null);
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma < 0 ? null : result.slice(comma + 1));
    });
    reader.addEventListener('error', () => {
      resolve(null);
    });
    reader.readAsDataURL(blob);
  });
}

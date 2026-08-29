'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Всплывающие сообщения о результате действия.
 *
 * До этого панель молчала: сотрудник нажимал «Утвердить», запрос уходил,
 * таблица бесшумно перерисовывалась — и понять, случилось ли что-нибудь,
 * можно было только по изменившейся строке. При ошибке не было и этого.
 * Молчание после действия — главная причина, по которой интерфейс
 * ощущается недоделанным, даже когда всё работает.
 *
 * Почему свой компонент, а не библиотека: нужны три состояния, стек и
 * автоскрытие — полсотни строк. Зависимость ради этого пришлось бы держать
 * в актуальном состоянии и объяснять её присутствие.
 *
 * Доступность: контейнер помечен `aria-live`, поэтому программа чтения
 * произносит сообщение, не уводя фокус с того места, где сотрудник работает.
 * Ошибки объявляются настойчиво (`assertive`), успех — мягко (`polite`):
 * прерывать чтение ради «сохранено» невежливо.
 */

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly description?: string;
}

interface ToastApi {
  readonly success: (message: string, description?: string) => void;
  readonly error: (message: string, description?: string) => void;
  readonly info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Сколько сообщение висит до автоскрытия. */
const LIFETIME_MS = { success: 3500, info: 4000, error: 6500 } as const;

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  // Счётчик в ref, а не в состоянии: он не влияет на отрисовку, и его
  // изменение не должно вызывать лишний проход рендера.
  const nextId = useRef(1);

  const dismiss = useCallback((id: number): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, description?: string): void => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [
        // Больше трёх на экране — это уже не сообщение, а лента: старые
        // вытесняются, иначе стек закрывает половину рабочей области.
        ...current.slice(-2),
        { id, tone, message, description },
      ]);

      setTimeout(() => {
        dismiss(id);
      }, LIFETIME_MS[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, description) => {
        push('success', message, description);
      },
      error: (message, description) => {
        push('error', message, description);
      },
      info: (message, description) => {
        push('info', message, description);
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        // Контейнер не перехватывает указатель: под ним остаётся рабочая
        // область. Клики принимают только сами карточки.
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={() => {
              dismiss(toast.id);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Readonly<
  Record<ToastTone, { readonly border: string; readonly icon: string; readonly live: 'polite' | 'assertive' }>
> = {
  success: { border: 'border-l-positive', icon: 'text-positive', live: 'polite' },
  error: { border: 'border-l-danger', icon: 'text-danger', live: 'assertive' },
  info: { border: 'border-l-info', icon: 'text-info', live: 'polite' },
};

const TONE_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;

function ToastCard({
  toast,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly onDismiss: () => void;
}): ReactElement {
  const style = TONE_STYLE[toast.tone];
  const Icon = TONE_ICON[toast.tone];

  return (
    <div
      role="status"
      aria-live={style.live}
      className={cn(
        'toast-enter pointer-events-auto flex items-start gap-2.5 rounded-panel border border-subtle',
        // Цветная полоса слева, а не заливка всей карточки: заливка кричит,
        // а сообщение должно сообщать.
        'border-l-[3px] bg-panel p-3 shadow-raised',
        style.border,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-caption font-medium text-primary">{toast.message}</p>
        {toast.description !== undefined && (
          <p className="mt-0.5 text-footnote text-secondary">{toast.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Закрыть сообщение"
        className="pressable -m-1 grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:bg-raised hover:text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Доступ к сообщениям.
 *
 * Бросает, а не возвращает заглушку: вызов вне провайдера — это ошибка
 * сборки экрана, и тихо проглоченное сообщение о неудачной операции хуже
 * падения на этапе разработки.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  if (api === null) {
    throw new Error('useToast вызван вне ToastProvider');
  }

  return api;
}

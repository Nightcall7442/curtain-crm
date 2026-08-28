'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

/**
 * Примитивы форм и модальных окон.
 *
 * Здесь только представление. Валидация живёт в Zod-схемах процедур: форма
 * показывает то, что вернул сервер (`zodError` по полям), а не проверяет
 * правила повторно — вторая копия правил обязательно разойдётся с первой.
 */

/* -------------------------------------------------------------------------- */
/*                                  Модалка                                   */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: 'md' | 'lg' | 'xl';
}): ReactElement | null {
  // Закрытие по Escape: без него модалку на весь экран нечем закрыть
  // с клавиатуры, а операторы вводят заказы почти не касаясь мыши.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const widthClass = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        // Закрываем только по клику именно на подложку: иначе выделение
        // текста мышью внутри формы «выезжает» на фон и роняет заполненное.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'my-8 w-full rounded-panel border border-strong bg-panel shadow-2xl',
          widthClass,
        )}
      >
        <header className="flex items-center gap-3 border-b border-subtle px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="ml-auto grid h-8 w-8 place-items-center rounded text-secondary transition-colors hover:bg-raised hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer !== undefined && (
          <footer className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Поля                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  error,
  hint,
  required = false,
  children,
  className,
}: {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[11.5px] text-secondary">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {error !== undefined && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
      {error === undefined && hint !== undefined && (
        <span className="mt-1 block text-[11px] text-muted">{hint}</span>
      )}
    </label>
  );
}

const CONTROL_CLASS =
  'w-full rounded border border-subtle bg-base px-2.5 py-2 text-[13px] text-primary ' +
  'placeholder:text-muted/70 focus:border-gold-dim focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { readonly invalid?: boolean },
): ReactElement {
  const { invalid, className, ...rest } = props;
  return (
    <input
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(CONTROL_CLASS, invalid === true && 'border-danger', className)}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { readonly invalid?: boolean },
): ReactElement {
  const { invalid, className, ...rest } = props;
  return (
    <textarea
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(CONTROL_CLASS, 'resize-y', invalid === true && 'border-danger', className)}
    />
  );
}

export function Select({
  options,
  placeholder,
  className,
  invalid,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly placeholder?: string;
  readonly invalid?: boolean;
}): ReactElement {
  return (
    <select
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(CONTROL_CLASS, invalid === true && 'border-danger', className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Множественный выбор чипами.
 *
 * Вместо `<select multiple>`, который на практике не умеет никто:
 * его нужно держать Ctrl и он не показывает выбранное списком.
 */
export function ChipSelect({
  options,
  value,
  onChange,
}: {
  readonly options: readonly string[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onChange(
                selected ? value.filter((item) => item !== option) : [...value, option],
              );
            }}
            className={cn(
              'rounded border px-2 py-1 text-[11.5px] transition-colors',
              selected
                ? 'border-gold/50 bg-gold/15 text-gold-soft'
                : 'border-subtle text-secondary hover:bg-raised hover:text-primary',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Кнопки                                    */
/* -------------------------------------------------------------------------- */

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  readonly loading?: boolean;
}): ReactElement {
  const variants = {
    primary: 'bg-gold text-base hover:opacity-90',
    secondary: 'border border-subtle text-secondary hover:bg-raised hover:text-primary',
    danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
    ghost: 'text-secondary hover:bg-raised hover:text-primary',
  };

  return (
    <button
      {...rest}
      disabled={rest.disabled === true || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[12.5px] font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Ошибка мутации                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ошибка, не привязанная к конкретному полю.
 *
 * Текст берётся с сервера как есть: он на русском и объясняет причину
 * («Из статуса … нельзя перейти в …», «У сотрудника нет роли …»).
 * Заменять его на «Ошибка сохранения» — значит выбросить единственное,
 * что помогает пользователю понять, что делать.
 */
export function FormError({ message }: { readonly message: string | null }): ReactElement | null {
  if (message === null) return null;

  return (
    <p
      role="alert"
      className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger"
    >
      {message}
    </p>
  );
}

/**
 * Достаёт ошибки по полям из ответа tRPC.
 *
 * Тип входа намеренно широкий: `TRPCClientErrorLike` объявляет `data` как
 * `Maybe<…>`, то есть допускает и `null`, и `undefined`, а конкретный
 * параметризованный тип у каждой процедуры свой. Сузить его до одного
 * означало бы писать эту функцию заново под каждую форму.
 */
export function fieldErrors(
  error:
    | {
        readonly data?: {
          readonly zodError?: Record<string, string[] | undefined> | null;
        } | null;
      }
    | null
    | undefined,
): Record<string, string | undefined> {
  const zod = error?.data?.zodError;
  if (zod === null || zod === undefined) return {};

  return Object.fromEntries(
    Object.entries(zod).map(([key, messages]) => [key, messages?.[0]]),
  );
}

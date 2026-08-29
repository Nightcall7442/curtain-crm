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
          <h2 className="text-body font-semibold text-primary">{title}</h2>
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
      <span className="mb-1 block text-footnote text-secondary">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {error !== undefined && <span className="mt-1 block text-overline text-danger">{error}</span>}
      {error === undefined && hint !== undefined && (
        <span className="mt-1 block text-overline text-muted">{hint}</span>
      )}
    </label>
  );
}

/**
 * Общая основа полей ввода.
 *
 * Скругление — `rounded-tile`, ТО ЖЕ, что у кнопок. Раньше здесь стоял
 * `rounded` (4 px) против 12 px у кнопки, и в строке фильтров, где поле
 * стоит вплотную к кнопке, разница читалась как небрежность. Скруглений в
 * системе три и у каждого своя роль: 16 px — карточка, 12 px — управляющий
 * элемент, круг — метка статуса. Четвёртого не нужно.
 *
 * Обводка фокуса заметная (кольцо, а не смена цвета рамки): рамка толщиной
 * в пиксель, поменявшая оттенок, на светлом фоне почти не видна, а поля
 * заполняют с клавиатуры.
 */
const CONTROL_BASE =
  'w-full rounded-tile border border-subtle bg-base text-primary transition-colors ' +
  'placeholder:text-muted/70 focus:border-accent-muted focus:outline-none ' +
  'focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Два размера.
 *
 * `md` — поля форм: их заполняют вдумчиво, и высота 38 px даёт спокойную
 * цель. `sm` — фильтры над таблицами: они стоят в ряд по три-четыре штуки,
 * и полная высота распирала бы шапку карточки. Обе высоты совпадают с
 * одноимёнными размерами кнопки, чтобы ряд «поле + поле + кнопка» стоял по
 * одной линии, а не ступенькой.
 */
const CONTROL_SIZES = {
  sm: 'h-8 px-2.5 text-footnote',
  md: 'min-h-[38px] px-2.5 py-2 text-caption',
} as const;

export type ControlSize = keyof typeof CONTROL_SIZES;

/**
 * Классы поля для случаев, где готовый компонент не подходит.
 *
 * Такой случай ровно один: `<select>` с `<optgroup>` — фильтр заказов делит
 * список на «Этапы производства» и «Статусы». Компонент `Select` принимает
 * плоский список, и городить в нём поддержку групп ради одного места значило
 * бы усложнить то, что используется на всех страницах, ради того, что нужно
 * на одной.
 *
 * Но классы такой `<select>` берёт ЗДЕСЬ, а не переписывает у себя: иначе
 * он неизбежно отстанет от остальных полей при первой же правке оформления.
 * Именно так и разъехались девять страниц до этого.
 */
export function controlClass(size: ControlSize = 'md', className?: string): string {
  return cn(CONTROL_BASE, CONTROL_SIZES[size], className);
}

export function Input({
  invalid,
  size = 'md',
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  readonly invalid?: boolean;
  readonly size?: ControlSize;
}): ReactElement {
  return (
    <input
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZES[size],
        invalid === true && 'border-danger',
        className,
      )}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly invalid?: boolean;
}): ReactElement {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZES.md,
        'resize-y',
        invalid === true && 'border-danger',
        className,
      )}
    />
  );
}

export function Select({
  options,
  placeholder,
  size = 'md',
  className,
  invalid,
  ...rest
  // `size` у `<select>` в HTML — это ЧИСЛО видимых строк списка. Своё
  // одноимённое свойство пришлось бы пересекать с ним, и тип схлопывался
  // бы в `never`. Родное исключаем: списком на несколько строк здесь
  // никто не пользуется, а размер элемента нужен на каждой странице.
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly placeholder?: string;
  readonly size?: ControlSize;
  readonly invalid?: boolean;
}): ReactElement {
  return (
    <select
      {...rest}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZES[size],
        // Свой отступ справа под системную стрелку: без него длинное
        // значение подъезжает под неё вплотную.
        'pr-8',
        invalid === true && 'border-danger',
        className,
      )}
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
 * Ряд фильтров над таблицей.
 *
 * Появился потому, что фильтры на девяти страницах были сверстаны девять раз
 * заново — с разными отступами, разными высотами полей и переписанными от
 * руки классами. Здесь у ряда один отступ и одно выравнивание, а поля внутри
 * приходят компактного размера.
 */
export function FilterBar({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
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
              'rounded border px-2 py-1 text-footnote transition-colors',
              selected
                ? 'border-accent/50 bg-accent/15 text-accent'
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
  size = 'md',
  loading = false,
  icon,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  readonly size?: 'sm' | 'md';
  readonly loading?: boolean;
  /** Иконка перед подписью. На время запроса подменяется вертушкой. */
  readonly icon?: ReactNode;
}): ReactElement {
  const variants = {
    /**
     * Подпись — ЧИСТО БЕЛАЯ, а не токеном `base`.
     *
     * `text-base` здесь означало цвет фона панели (#F0F4F3), и на зелёной
     * кнопке это 4,36:1 — ниже порога 4,5:1 для обычного текста. Белая даёт
     * 4,84:1. Разница на глаз незаметна, а порог она переводит.
     *
     * Отдельно: `text-base` в Tailwind — ещё и стандартный КЕГЛЬ, поэтому
     * запись была двусмысленной и зависела от порядка правил в собранном
     * CSS. Двусмысленности в основном классе кнопки быть не должно.
     */
    primary: 'bg-accent text-on-accent hover:bg-accent-strong shadow-panel',
    secondary: 'border border-subtle bg-panel text-secondary hover:bg-raised hover:text-primary',
    // Опасное действие контурное, а не залитое: сплошная красная кнопка
    // притягивает нажатие ровно там, где оно должно быть обдуманным.
    danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
    ghost: 'text-secondary hover:bg-raised hover:text-primary',
  };

  // Обе высоты выше порога попадания мышью; `sm` — для строк таблиц,
  // где кнопка не должна распирать строку.
  const sizes = {
    sm: 'h-8 gap-1.5 px-2.5 text-footnote',
    md: 'h-[38px] gap-2 px-3.5 text-caption',
  };

  return (
    <button
      {...rest}
      // Блокировка на время запроса — свойство кнопки, а не забота вызывающего:
      // забыть про неё легко, а последствие — двойная отправка формы.
      disabled={rest.disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'pressable inline-flex shrink-0 items-center justify-center rounded-tile font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/**
 * Кнопка-иконка без подписи.
 *
 * Квадратная: у кнопки с текстом ширина растёт от содержимого, а здесь она
 * обязана совпасть с высотой, иначе иконка стоит не по центру. Подпись
 * обязательна — иконка без неё для программы чтения экрана просто «кнопка».
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  readonly icon: ReactNode;
  readonly label: string;
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  readonly size?: 'sm' | 'md';
  readonly loading?: boolean;
}): ReactElement {
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      loading={loading}
      aria-label={label}
      title={label}
      className={cn(size === 'sm' ? 'w-8 px-0' : 'w-[38px] px-0', className)}
    >
      {loading ? null : icon}
    </Button>
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
      className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-footnote text-danger"
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

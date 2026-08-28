import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Базовые примитивы интерфейса.
 *
 * Здесь только представление — ни одного обращения к API и ни одной проверки
 * прав: бизнес-логика живёт на бэкенде, компоненты лишь рисуют то, что им
 * передали.
 */

export function Card({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <section
      className={cn(
        'rounded-panel border border-subtle bg-panel shadow-panel',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  icon,
  action,
  className,
}: {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('flex items-center gap-2 border-b border-subtle px-4 py-3', className)}>
      {icon !== undefined && <span className="text-accent-muted">{icon}</span>}
      <h2 className="section-title">{title}</h2>
      {action !== undefined && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return <div className={cn('p-4', className)}>{children}</div>;
}

/**
 * Состояние «нет данных».
 *
 * Отдельный компонент, потому что пустая карточка без объяснения читается как
 * сбой загрузки. Формулировка всегда говорит, ПОЧЕМУ пусто.
 */
export function EmptyState({
  message,
  hint,
}: {
  readonly message: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <p className="text-[13px] text-secondary">{message}</p>
      {hint !== undefined && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/** Скелет загрузки — держит высоту, чтобы страница не «прыгала». */
export function Skeleton({ className }: { readonly className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded bg-raised/70', className)} aria-hidden />;
}

/**
 * Ошибка загрузки блока.
 *
 * Показывает сообщение с сервера: оно на русском и объясняет причину
 * (нет прав, заказ не найден, некорректные данные), а «Что-то пошло не так»
 * не помогает ни пользователю, ни поддержке.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <p className="max-w-md text-[13px] text-danger">{message}</p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-subtle px-3 py-1.5 text-[12.5px] text-secondary transition-colors hover:bg-raised hover:text-primary"
        >
          Повторить
        </button>
      )}
    </div>
  );
}

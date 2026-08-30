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
        // Рамка почти невидима и держит форму там, где тень пропадает:
        // при печати, в режиме высокой контрастности и на белом фоне.
        'rounded-panel border border-subtle/70 bg-panel shadow-raised',
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
  level = 2,
  className,
}: {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  /**
   * Уровень заголовка в структуре страницы.
   *
   * По умолчанию карточка — заголовок второго уровня: на большинстве страниц
   * она и есть верхнее деление. Но там, где карточки собраны в озаглавленные
   * разделы (например, в «Настройках»), второй уровень забирает заголовок
   * раздела, и карточка обязана уйти на третий. Иначе программа чтения экрана
   * перечисляет раздел и его содержимое как равных соседей, и структура
   * страницы на слух пропадает.
   */
  readonly level?: 2 | 3;
  readonly className?: string;
}): ReactElement {
  const Heading = level === 3 ? 'h3' : 'h2';

  return (
    // `flex-wrap` обязателен: на телефоне ряд фильтров шире заголовка,
    // и без переноса вся шапка карточки уезжала за правый край экрана.
    <div className={cn('flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-3', className)}>
      {icon !== undefined && <span className="text-accent-muted">{icon}</span>}
      <Heading className="section-title">{title}</Heading>
      {action !== undefined && <div className="ml-auto min-w-0">{action}</div>}
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
      <p className="text-caption text-secondary">{message}</p>
      {hint !== undefined && <p className="text-footnote text-muted">{hint}</p>}
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
      <p className="max-w-md text-caption text-danger">{message}</p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-subtle px-3 py-1.5 text-caption text-secondary transition-colors hover:bg-raised hover:text-primary"
        >
          Повторить
        </button>
      )}
    </div>
  );
}

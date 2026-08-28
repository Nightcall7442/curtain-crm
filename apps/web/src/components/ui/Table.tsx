'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Таблица со сквозной разметкой и пагинацией.
 *
 * Обобщена по типу строки, поэтому ячейки типобезопасны: опечатка в имени
 * поля не доживёт до рантайма.
 */

export interface Column<TRow> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow, index: number) => ReactNode;
  readonly align?: 'left' | 'right' | 'center';
  readonly className?: string;
}

export function DataTable<TRow>({
  rows,
  columns,
  rowKey,
  emptyMessage = 'Нет данных',
  isLoading = false,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly Column<TRow>[];
  readonly rowKey: (row: TRow, index: number) => string | number;
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
}): ReactElement {
  return (
    // Горизонтальная прокрутка внутри контейнера: страница не должна
    // разъезжаться вбок из-за широкой таблицы.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-subtle">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted',
                  column.align === 'right'
                    ? 'text-right'
                    : column.align === 'center'
                      ? 'text-center'
                      : 'text-left',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading &&
            Array.from({ length: 5 }, (_unused, index) => (
              <tr key={`skeleton-${index.toString()}`} className="border-b border-subtle/60">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <span className="block h-3 animate-pulse rounded bg-raised/70" />
                  </td>
                ))}
              </tr>
            ))}

          {!isLoading && rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-[13px] text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading &&
            rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className="border-b border-subtle/60 transition-colors last:border-0 hover:bg-raised/40"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2.5 text-secondary',
                      column.align === 'right'
                        ? 'text-right'
                        : column.align === 'center'
                          ? 'text-center'
                          : 'text-left',
                      column.className,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** Постраничная навигация под таблицей. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly pageSize: number;
  readonly onChange: (page: number) => void;
}): ReactElement | null {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Показываем максимум пять номеров вокруг текущего: полный список
  // на пятидесяти страницах занял бы всю ширину.
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from(
    { length: Math.min(5, totalPages) },
    (_unused, index) => windowStart + index,
  ).filter((value) => value >= 1 && value <= totalPages);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-subtle px-3 py-2.5">
      <span className="text-[11.5px] text-muted">
        {`Показано ${from.toString()} – ${to.toString()} из ${total.toString()}`}
      </span>

      <nav className="ml-auto flex items-center gap-1" aria-label="Страницы">
        <PageButton
          disabled={page <= 1}
          onClick={() => {
            onChange(page - 1);
          }}
          label="Предыдущая страница"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </PageButton>

        {pages.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              onChange(value);
            }}
            aria-current={value === page ? 'page' : undefined}
            className={cn(
              'h-7 min-w-7 rounded px-2 text-[12px] transition-colors',
              value === page
                ? 'bg-gold/15 text-gold-soft'
                : 'text-secondary hover:bg-raised hover:text-primary',
            )}
          >
            {value}
          </button>
        ))}

        <PageButton
          disabled={page >= totalPages}
          onClick={() => {
            onChange(page + 1);
          }}
          label="Следующая страница"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly label: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded text-secondary transition-colors hover:bg-raised hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

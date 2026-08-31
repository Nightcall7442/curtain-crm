'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

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
  /**
   * Классы ячейки. Ложатся и на шапку, и на тело колонки: ширину нельзя
   * задать только телу — шапка растянет колонку обратно.
   *
   * Обычный приём — `w-full` на смысловой колонке: она забирает весь
   * свободный простор, остальные ужимаются по содержимому, и справа не
   * остаётся пустоты между последним столбцом и краем карточки.
   */
  readonly className?: string;
  /**
   * Значение для сортировки.
   *
   * Отдельно от `render`, потому что отрисовка возвращает разметку, а
   * сортировать надо по величине: колонка с суммой рисует «5 800 000 сум»,
   * а сравнивать нужно число. Колонка без этой функции остаётся
   * несортируемой — молча сортировать по тексту разметки хуже, чем не
   * сортировать вовсе.
   */
  readonly sortValue?: (row: TRow) => string | number;
}

type SortState = { readonly key: string; readonly direction: 'asc' | 'desc' } | null;

export type RowKey = string | number;

/**
 * Выделение строк для массовых действий.
 *
 * Состояние живёт СНАРУЖИ таблицы: выбранные строки нужны панели действий,
 * которая рисуется рядом с таблицей, а не внутри неё. Таблица здесь — только
 * галочки и заголовок «выбрать всё».
 */
export interface TableSelection {
  readonly selected: ReadonlySet<RowKey>;
  readonly onChange: (next: Set<RowKey>) => void;
  /** Подпись галочки строки для программы чтения экрана. */
  readonly rowLabel?: (key: RowKey) => string;
}

export function DataTable<TRow>({
  rows,
  columns,
  rowKey,
  emptyMessage = 'Нет данных',
  isLoading = false,
  onRowClick,
  rowHref,
  selection,
  activeRowKey,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly Column<TRow>[];
  readonly rowKey: (row: TRow, index: number) => RowKey;
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
  /**
   * Нажатие на строку.
   *
   * Строка становится доступной и с клавиатуры: получает `tabIndex`, роль
   * кнопки и реагирует на Enter и пробел. Кликабельная строка, до которой
   * нельзя добраться табуляцией, — это функция, которой нет у половины
   * пользователей.
   */
  readonly onRowClick?: (row: TRow) => void;
  /** Подпись строки для программы чтения экрана. */
  readonly rowHref?: (row: TRow) => string;
  /** Галочки выбора строк. Без этого поля колонка галочек не рисуется. */
  readonly selection?: TableSelection;
  /**
   * Строка «под курсором клавиатуры».
   *
   * Подсвечивается рамкой. Саму навигацию таблица не ведёт: какие клавиши
   * что делают, знает страница — у списка заказов на цифрах висят действия
   * по заказу, и таблице про них знать незачем.
   */
  readonly activeRowKey?: RowKey | null;
}): ReactElement {
  const [sort, setSort] = useState<SortState>(null);

  const sortedRows = useMemo(() => {
    if (sort === null) return rows;

    const column = columns.find((entry) => entry.key === sort.key);
    if (column?.sortValue === undefined) return rows;

    const { sortValue } = column;
    const factor = sort.direction === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);

      // Строки сравниваем по-русски: `localeCompare` иначе ставит «Ё» после
      // латиницы, и алфавитный порядок фамилий выглядит случайным.
      if (typeof left === 'string' && typeof right === 'string') {
        return left.localeCompare(right, 'ru') * factor;
      }

      return (Number(left) - Number(right)) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string): void => {
    setSort((current) => {
      if (current === null || current.key !== key) return { key, direction: 'asc' };
      // Третье нажатие снимает сортировку и возвращает порядок сервера —
      // он осмысленный (свежие сверху), и вернуться к нему надо уметь.
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  /*
    «Выбрать всё» — это всё на ЭТОЙ странице, а не во всей выборке.

    Галочка не может обещать больше, чем видно: отметить полторы тысячи
    заказов, из которых на экране двадцать, и выполнить по ним массовое
    действие — не помощь, а способ испортить рабочий день всему цеху.
  */
  const pageKeys = sortedRows.map((row, index) => rowKey(row, index));
  const selectedOnPage = pageKeys.filter((key) => selection?.selected.has(key) === true);
  const allSelected = pageKeys.length > 0 && selectedOnPage.length === pageKeys.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  const toggleAll = (): void => {
    if (selection === undefined) return;

    const next = new Set(selection.selected);
    if (allSelected) {
      for (const key of pageKeys) next.delete(key);
    } else {
      for (const key of pageKeys) next.add(key);
    }
    selection.onChange(next);
  };

  const toggleOne = (key: RowKey): void => {
    if (selection === undefined) return;

    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };

  return (
    // Горизонтальная прокрутка внутри контейнера: страница не должна
    // разъезжаться вбок из-за широкой таблицы.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-caption">
        {/*
          Шапка закреплена: в таблице на полсотни строк, прокрученной вниз,
          колонки перестают быть подписанными, и «3 642 347» уже не отличить
          от «111 457 653» по смыслу.
        */}
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-subtle bg-raised/95 backdrop-blur">
            {selection !== undefined && (
              <th scope="col" className="w-10 px-3.5 py-2.5">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  label={allSelected ? 'Снять выделение на странице' : 'Выбрать всё на странице'}
                />
              </th>
            )}

            {columns.map((column) => {
              const isSortable = column.sortValue !== undefined;
              const active = sort?.key === column.key ? sort.direction : null;

              const alignClass =
                column.align === 'right'
                  ? 'text-right'
                  : column.align === 'center'
                    ? 'text-center'
                    : 'text-left';

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active === null ? undefined : active === 'asc' ? 'ascending' : 'descending'
                  }
                  className={cn(
                    'whitespace-nowrap px-3.5 py-2.5 text-overline font-semibold uppercase text-muted',
                    alignClass,
                    column.className,
                  )}
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleSort(column.key);
                      }}
                      className={cn(
                        'pressable inline-flex items-center gap-1 rounded px-1 -mx-1 uppercase',
                        'hover:text-primary',
                        active === null ? null : 'text-primary',
                        column.align === 'right' ? 'flex-row-reverse' : null,
                      )}
                    >
                      {column.header}
                      <SortGlyph direction={active} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {isLoading &&
            Array.from({ length: 5 }, (_unused, index) => (
              <tr key={`skeleton-${index.toString()}`} className="border-b border-subtle/60">
                {selection !== undefined && <td className="px-3.5 py-2" />}
                {columns.map((column) => (
                  <td key={column.key} className="px-3.5 py-2">
                    <span className="block h-3 animate-pulse rounded bg-raised/70" />
                  </td>
                ))}
              </tr>
            ))}

          {!isLoading && rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selection === undefined ? 0 : 1)}
                className="px-3 py-10 text-center text-caption text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading &&
            sortedRows.map((row, index) => {
              const key = rowKey(row, index);
              const isSelected = selection?.selected.has(key) === true;
              const isActive = activeRowKey !== undefined && activeRowKey === key;

              return (
                <tr
                  key={key}
                  data-row-key={key}
                  {...(onRowClick === undefined
                    ? {}
                    : {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': rowHref?.(row),
                        onClick: (event: MouseEvent<HTMLTableRowElement>) => {
                          /*
                            Нажатие на кнопку ВНУТРИ строки не должно заодно
                            открывать заказ. Кнопка действия живёт в последней
                            ячейке, и без этой проверки один клик и выполнял
                            переход, и уводил со страницы — а смысл действия
                            в строке ровно в том, чтобы никуда не уходить.
                          */
                          if (
                            event.target instanceof HTMLElement &&
                            event.target.closest('button, a, input, label, [role="menu"]') !== null
                          ) {
                            return;
                          }
                          onRowClick(row);
                        },
                        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                          // Пробел прокручивает страницу по умолчанию — для
                          // строки, ведущей себя как кнопка, это неверно.
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          if (event.target !== event.currentTarget) return;
                          event.preventDefault();
                          onRowClick(row);
                        },
                      })}
                  className={cn(
                    'border-b border-subtle/55 transition-colors last:border-0',
                    isSelected ? 'bg-accent-soft/60' : 'hover:bg-raised/50',
                    /*
                      Активная строка обведена вставленной рамкой, а не залита:
                      заливка уже занята выделением галочкой, и два разных
                      смысла одним приёмом различить нельзя.
                    */
                    isActive ? 'outline outline-2 -outline-offset-2 outline-accent-muted' : null,
                    onRowClick === undefined
                      ? null
                      : 'cursor-pointer focus-visible:bg-raised/70 focus-visible:outline-none',
                  )}
                >
                  {selection !== undefined && (
                    <td className="px-3.5 py-2">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => {
                          toggleOne(key);
                        }}
                        label={selection.rowLabel?.(key) ?? `Выбрать строку ${String(key)}`}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        /*
                          py-2, а не py-3 — плотность по ревизии «Диспетчерская»:
                          таблицы панели читают списками, и лишние 8 px на строку
                          крадут четверть экрана на каждых двадцати строках.
                        */
                        'px-3.5 py-2 text-secondary',
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
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Галочка выбора.
 *
 * Родной `<input type="checkbox">` под своей отрисовкой: он приносит
 * доступность, состояние «частично» и работу с клавиатуры даром, а
 * нарисованный с нуля `<div>` пришлось бы всему этому учить заново.
 *
 * Состояние «частично» ставится только через DOM: у HTML нет атрибута
 * `indeterminate`, он существует лишь как свойство элемента.
 */
function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly onChange: () => void;
  readonly label: string;
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      title={label}
      className="h-4 w-4 cursor-pointer accent-accent"
    />
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
      <span className="text-footnote text-muted">
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
              'h-7 min-w-7 rounded px-2 text-footnote transition-colors',
              value === page
                ? 'bg-accent/15 text-accent'
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

/**
 * Стрелка направления сортировки.
 *
 * У неактивной колонки она бледная и двусторонняя — это подсказка «сюда
 * можно нажать». Совсем скрывать её нельзя: пользователь не догадается, что
 * колонка сортируется, пока случайно не попадёт по заголовку.
 */
function SortGlyph({ direction }: { readonly direction: 'asc' | 'desc' | null }): ReactElement {
  if (direction === null) {
    return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />;
  }

  return direction === 'asc' ? (
    <ChevronUp className="h-3 w-3 text-accent" aria-hidden />
  ) : (
    <ChevronDown className="h-3 w-3 text-accent" aria-hidden />
  );
}

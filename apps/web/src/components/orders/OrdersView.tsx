'use client';

import {
  formatMoney,
  isOrderStatus,
  isOverdueDate,
  isProductionStageKey,
  isTerminalStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
  parseMoney,
  PRIORITIES,
  type Priority,
  PRIORITY_LABELS,
  pluralize,
  PRODUCTION_STAGE_LABELS,
  PRODUCTION_STAGES,
  type ProductionStageKey,
  Role,
  statusesOfProductionStage,
  TransitionKind,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { useLocale } from '@/components/providers/LocaleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { OrderStatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, controlClass, FilterBar, Input, Select } from '@/components/ui/Form';
import { DataTable, Pagination, type RowKey } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

import {
  actionNeedsDialog,
  OrderActionDialog,
  type OrderAction,
  type OrderActionOrder,
  type OrderActionTarget,
} from './OrderActionDialog';
import { OrderCreateDialog } from './OrderCreateDialog';
import { orderRowActions, OrderRowActions } from './OrderRowActions';

/**
 * Список заказов с фильтрами.
 *
 * Переиспользуется разделами «Заказы», «Производство», «Швейный цех»,
 * «Установка» и «Качество»: все они — один и тот же список с предустановленным
 * набором статусов. Дублировать таблицу пять раз означало бы пять мест,
 * где нужно чинить одну и ту же ошибку.
 *
 * Видимость заказов ограничивает СЕРВЕР: рядовой сотрудник получит только те
 * заказы, где он участвует, независимо от того, какие фильтры выставит.
 */

/**
 * Выбранный фильтр: либо один статус, либо этап конвейера (набор статусов).
 *
 * Два вида фильтра держатся в одном значении, потому что в интерфейсе это
 * один выпадающий список: показывать рядом «Статус» и «Этап», которые молча
 * сужают друг друга, — верный способ получить пустую таблицу и недоумение.
 */
type Selection =
  | { readonly kind: 'all' }
  | { readonly kind: 'status'; readonly status: OrderStatus }
  | { readonly kind: 'stage'; readonly stage: ProductionStageKey };

const SELECT_ALL = '';
const encodeSelection = (selection: Selection): string => {
  if (selection.kind === 'status') return `status:${selection.status}`;
  if (selection.kind === 'stage') return `stage:${selection.stage}`;
  return SELECT_ALL;
};

export function OrdersView({
  title,
  lockedStatuses,
  initialStatus,
  initialStage,
  emptyMessage = 'Заказов не найдено',
}: {
  readonly title: string;
  /** Статусы раздела. Если заданы, выбор статуса пользователю не предлагается. */
  readonly lockedStatuses?: readonly OrderStatus[];
  /** Начальный фильтр по статусу — приходит из адреса (`/orders?status=…`). */
  readonly initialStatus?: OrderStatus;
  /** Начальный фильтр по этапу конвейера — из адреса (`/orders?stage=…`). */
  readonly initialStage?: ProductionStageKey;
  readonly emptyMessage?: string;
}): ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();
  const toast = useToast();
  const { hasRole, user } = useAuth();
  const { locale, t } = useLocale();
  const roles = user?.roles ?? [];

  /**
   * Подпись последнего действия, выполненного без окна.
   *
   * В ref, а не в состоянии: она нужна только внутри `onSuccess`, чтобы
   * написать в всплывающем сообщении, ЧТО именно произошло. Держать её в
   * состоянии значило бы перерисовывать всю таблицу ради текста тоста.
   */
  const lastQuickLabel = useRef<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection>(() => {
    // Статус имеет приоритет: он точнее этапа, и оба сразу в ссылках не приходят.
    if (initialStatus !== undefined) return { kind: 'status', status: initialStatus };
    if (initialStage !== undefined) return { kind: 'stage', stage: initialStage };
    return { kind: 'all' };
  });
  const [priority, setPriority] = useState<Priority | ''>('');
  const [createOpen, setCreateOpen] = useState(false);

  /** Отмеченные галочками заказы — для массового действия. */
  const [checked, setChecked] = useState<ReadonlySet<RowKey>>(new Set());
  /** Строка «под курсором клавиатуры». */
  const [activeId, setActiveId] = useState<number | null>(null);
  /** Действие, ожидающее подтверждения. `null` — окно закрыто. */
  const [pending, setPending] = useState<OrderActionTarget | null>(null);

  /**
   * Кнопку создания видят те же роли, которым разрешает процедура
   * `orders.create`. Это только удобство: сервер всё равно проверит сам.
   */
  const canCreate = hasRole(Role.SELLER, Role.ADMIN, Role.CEO);

  const selectedStatuses: readonly OrderStatus[] | undefined =
    selection.kind === 'status'
      ? [selection.status]
      : selection.kind === 'stage'
        ? statusesOfProductionStage(selection.stage)
        : undefined;

  const statusFilter = lockedStatuses ?? selectedStatuses;

  const query = trpc.orders.list.useQuery({
    page,
    pageSize: 20,
    ...(search.length > 0 ? { search } : {}),
    ...(statusFilter === undefined ? {} : { status: [...statusFilter] }),
    ...(priority === '' ? {} : { priority }),
  });

  const rows = query.data?.items ?? [];

  const refresh = (): void => {
    void utils.orders.list.invalidate();
  };

  /** Выполнение без вопросов — для одиночного действия, которому нечего спросить. */
  const quick = trpc.orders.changeStatusBatch.useMutation({
    onSuccess(result) {
      const failure = result.results.find((entry) => !entry.ok);
      if (failure === undefined) toast.success(lastQuickLabel.current ?? 'Готово');
      else toast.error(failure.message ?? 'Не удалось изменить статус');
      refresh();
    },
    onError(error) {
      toast.error(error.message);
    },
  });

  /*
    Заказ, к которому применяется действие, описывается для окна отдельно:
    ему нужны номер для отчёта и текущие исполнители, чтобы понять, кого
    не хватает. Всё это уже пришло со списком.
  */
  const toActionOrder = (row: (typeof rows)[number]): OrderActionOrder => ({
    id: row.id,
    label: row.orderNumber ?? `#${row.id.toString()}`,
    // Контролёра здесь нет намеренно: ни один статус его не требует —
    // он назначается сам, когда контролёр берёт заказ из общего пула.
    assigned: {
      master: row.masterId,
      sewer: row.sewerId,
      installer: row.installerId,
    },
  });

  const runAction = (target: OrderActionTarget): void => {
    if (actionNeedsDialog(target)) {
      setPending(target);
      return;
    }

    lastQuickLabel.current = target.action.label;
    quick.mutate({
      ids: target.orders.map((order) => order.id),
      toStatus: target.action.toStatus,
    });
  };

  /* --- Массовое действие ------------------------------------------------ */

  const checkedRows = rows.filter((row) => checked.has(row.id));

  /**
   * Массовое действие предлагается, только когда все выбранные заказы стоят
   * в ОДНОМ статусе.
   *
   * Иначе одна и та же кнопка означала бы для разных заказов разное: переход
   * в «Назначен замер» из «Ждёт проверки админа» — это движение вперёд, а из
   * «Брак» — откат с обязательной причиной. Скрыть эту разницу за общей
   * кнопкой значит дать человеку нажать не то, что он думает.
   */
  const bulkStatus =
    checkedRows.length > 0 &&
    checkedRows.every((row) => row.status === checkedRows[0]?.status)
      ? (checkedRows[0]?.status ?? null)
      : null;

  const bulkActions = bulkStatus === null ? [] : orderRowActions(bulkStatus, roles, locale);

  const clearChecked = (): void => {
    setChecked(new Set());
  };

  /* --- Клавиатура -------------------------------------------------------- */

  const activeIndex = rows.findIndex((row) => row.id === activeId);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      // Модификаторы отдаём браузеру: Ctrl+F и Cmd+K — не наши сочетания.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      /*
        Пока человек печатает в поиске, буквы принадлежат полю, а не списку.
        Без этой проверки «j» в слове «Жанна» перепрыгивала бы строку, а «1»
        в номере телефона выполняла действие по заказу.
      */
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
      ) {
        return;
      }

      // Открытое окно забирает клавиатуру себе целиком.
      if (pending !== null || createOpen) return;
      if (rows.length === 0) return;

      const move = (delta: number): void => {
        event.preventDefault();
        const next = activeIndex < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, activeIndex + delta));
        setActiveId(rows[next]?.id ?? null);
      };

      if (event.key === 'j' || event.key === 'ArrowDown') return move(1);
      if (event.key === 'k' || event.key === 'ArrowUp') return move(-1);

      if (event.key === 'Escape') {
        setActiveId(null);
        clearChecked();
        return;
      }

      const active = activeIndex < 0 ? undefined : rows[activeIndex];
      if (active === undefined) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        router.push(`/orders/${active.id.toString()}`);
        return;
      }

      if (event.key === 'x') {
        event.preventDefault();
        setChecked((current) => {
          const next = new Set(current);
          if (next.has(active.id)) next.delete(active.id);
          else next.add(active.id);
          return next;
        });
        return;
      }

      // Цифры запускают действия активной строки в том же порядке, в каком
      // они нарисованы: 1 — кнопка, дальше пункты меню сверху вниз.
      if (event.key >= '1' && event.key <= '9') {
        const actions = orderRowActions(active.status, roles, locale);
        const action = actions[Number.parseInt(event.key, 10) - 1];
        if (action === undefined) return;

        event.preventDefault();
        runAction({ orders: [toActionOrder(active)], action });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  if (query.isError) {
    return (
      <Card>
        <ErrorState
          message={query.error.message}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <FilterBar>
            <Input
              type="search"
              size="sm"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Номер, клиент или телефон"
              aria-label="Поиск заказа"
              className="w-56"
            />

            {lockedStatuses === undefined && (
              // Собственный `<select>` из-за `<optgroup>`; классы — общие.
              <select
                value={encodeSelection(selection)}
                onChange={(event) => {
                  setSelection(decodeSelection(event.target.value));
                  setPage(1);
                }}
                aria-label="Статус или этап заказа"
                className={controlClass('sm', 'w-auto pr-8')}
              >
                <option value={SELECT_ALL}>Все статусы</option>

                {/* Этапы идут первыми: с дашборда приходят именно они, и найти
                    выбранный пункт в списке из двадцати пяти строк проще, когда
                    он в начале. */}
                <optgroup label="Этапы производства">
                  {PRODUCTION_STAGES.map((stage) => (
                    <option key={stage.key} value={`stage:${stage.key}`}>
                      {t(PRODUCTION_STAGE_LABELS, stage.key)}
                    </option>
                  ))}
                </optgroup>

                <optgroup label="Статусы">
                  {ORDER_STATUSES.map((value) => (
                    <option key={value} value={`status:${value}`}>
                      {t(ORDER_STATUS_LABELS, value)}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}

            <Select
              size="sm"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value as Priority | '');
                setPage(1);
              }}
              aria-label="Приоритет"
              className="w-auto"
              placeholder="Любой приоритет"
              options={PRIORITIES.map((value) => ({
                value,
                label: t(PRIORITY_LABELS, value),
              }))}
            />

            {canCreate && (
              <Button
                icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                Новый заказ
              </Button>
            )}
          </FilterBar>
        }
      />

      <OrderCreateDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={(orderId) => {
          setCreateOpen(false);
          router.push(`/orders/${orderId.toString()}`);
        }}
      />

      <OrderActionDialog
        target={pending}
        onClose={() => {
          setPending(null);
        }}
        onDone={() => {
          refresh();
          clearChecked();
        }}
      />

      <BulkBar
        count={checked.size}
        actions={bulkActions}
        mixedStatuses={checked.size > 0 && bulkStatus === null}
        onPick={(action) => {
          runAction({ orders: checkedRows.map(toActionOrder), action });
        }}
        onClear={clearChecked}
      />

      <DataTable
        isLoading={query.isLoading}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage={emptyMessage}
        activeRowKey={activeId}
        selection={{
          selected: checked,
          onChange: setChecked,
          rowLabel: (key) => `Выбрать заказ ${String(key)}`,
        }}
        /*
          Кликабельна ВСЯ строка, а не только номер.
          Ссылка на номере остаётся: она даёт открыть заказ в новой вкладке
          средней кнопкой и видна как ссылка. Но целиться в неё мышью каждый
          раз — лишняя точность там, где строка и так про один заказ.
        */
        onRowClick={(row) => {
          router.push(`/orders/${row.id.toString()}`);
        }}
        rowHref={(row) => `Открыть заказ ${row.orderNumber ?? `#${row.id.toString()}`}`}
        columns={[
          {
            key: 'number',
            header: 'Номер',
            sortValue: (row) => row.id,
            render: (row) => (
              <Link
                href={`/orders/${row.id.toString()}`}
                className="font-mono font-medium text-accent hover:underline"
              >
                {row.orderNumber ?? `#${row.id.toString()}`}
              </Link>
            ),
          },
          {
            key: 'client',
            header: 'Клиент',
            sortValue: (row) => row.clientName,
            render: (row) => (
              <span className="block">
                <span className="block text-primary">{row.clientName}</span>
                <span className="block font-mono text-overline text-muted">{row.clientPhone}</span>
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => <OrderStatusBadge status={row.status} />,
          },
          {
            key: 'priority',
            header: 'Приоритет',
            render: (row) => <PriorityBadge priority={row.priority} />,
          },
          {
            key: 'deadline',
            header: 'Срок',
            sortValue: (row) => row.deadline ?? '9999-12-31',
            render: (row) => {
              if (row.deadline === null) return <span className="text-muted">—</span>;

              // Календарная дата, а не момент времени: `new Date('2026-08-29')`
              // это полночь UTC, то есть 05:00 в Ташкенте, и заказ со сроком
              // СЕГОДНЯ краснел с пяти утра. Та же ошибка была в приложении.
              const overdue = isOverdueDate(row.deadline) && !isTerminalStatus(row.status);

              return (
                <span className={overdue ? 'text-danger' : undefined}>
                  {formatDate(row.deadline)}
                </span>
              );
            },
          },
          {
            key: 'price',
            header: 'Сумма',
            align: 'right',
            sortValue: (row) => parseMoney(row.workPrice),
            render: (row) => (
              <span className="font-mono text-primary">{formatMoney(parseMoney(row.workPrice))}</span>
            ),
          },
          {
            key: 'remaining',
            header: 'Остаток',
            align: 'right',
            render: (row) =>
              row.remainingPayment === null
                ? '—'
                : formatMoney(parseMoney(row.remainingPayment)),
          },
          {
            key: 'created',
            header: 'Создан',
            sortValue: (row) => new Date(row.createdAt).getTime(),
            render: (row) => formatDate(row.createdAt),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            className: 'whitespace-nowrap',
            render: (row) => (
              <OrderRowActions
                status={row.status}
                roles={roles}
                locale={locale}
                onPick={(action) => {
                  runAction({ orders: [toActionOrder(row)], action });
                }}
              />
            ),
          },
        ]}
      />

      {query.data !== undefined && (
        <Pagination
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          pageSize={query.data.pageSize}
          onChange={setPage}
        />
      )}

      <p className="border-t border-subtle px-4 py-2 text-overline text-muted">
        Клавиши: <Key>J</Key> / <Key>K</Key> — по строкам, <Key>Enter</Key> — открыть,{' '}
        <Key>X</Key> — отметить, <Key>1</Key>…<Key>9</Key> — действие активной строки
      </p>
    </Card>
  );
}

/** Клавиша в подсказке — набирается как клавиша, а не как обычный текст. */
function Key({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <kbd className="rounded border border-subtle bg-base px-1 py-px font-mono text-[10px] text-secondary">
      {children}
    </kbd>
  );
}

/**
 * Панель массового действия — появляется, когда отмечена хотя бы одна строка.
 *
 * Стоит НАД таблицей, а не поверх неё: всплывающая панель у нижнего края
 * закрывает последние строки списка — ровно те, которые человек в этот момент
 * и отмечает.
 */
function BulkBar({
  count,
  actions,
  mixedStatuses,
  onPick,
  onClear,
}: {
  readonly count: number;
  readonly actions: readonly OrderAction[];
  readonly mixedStatuses: boolean;
  readonly onPick: (action: OrderAction) => void;
  readonly onClear: () => void;
}): ReactElement | null {
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-accent-soft/70 px-4 py-2.5">
      <span className="text-caption font-medium text-primary">
        {`Выбрано ${pluralize(count, ['заказ', 'заказа', 'заказов'])}`}
      </span>

      {mixedStatuses ? (
        <span className="text-footnote text-secondary">
          Заказы в разных статусах — общее действие для них неоднозначно.
          Оставьте выбранными заказы одного статуса.
        </span>
      ) : actions.length === 0 ? (
        // Архив: заказы закрыты, переходов из них нет вовсе.
        <span className="text-footnote text-secondary">
          Для этих заказов действий нет — они закрыты.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.map((action) => (
            <Button
              key={action.toStatus}
              size="sm"
              variant={
                action.kind === TransitionKind.CANCEL || action.kind === TransitionKind.REJECT
                  ? 'danger'
                  : action.kind === TransitionKind.ROLLBACK
                    ? 'secondary'
                    : 'primary'
              }
              onClick={() => {
                onPick(action);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        Снять выделение
      </Button>
    </div>
  );
}

/**
 * Разбирает значение выпадающего списка обратно в фильтр.
 *
 * Незнакомое значение трактуется как «все»: в разметке взяться ему неоткуда,
 * но упасть из-за постороннего значения список заказов не должен.
 */
function decodeSelection(value: string): Selection {
  const separator = value.indexOf(':');
  if (separator < 0) return { kind: 'all' };

  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);

  if (kind === 'status' && isOrderStatus(rest)) return { kind: 'status', status: rest };
  if (kind === 'stage' && isProductionStageKey(rest)) return { kind: 'stage', stage: rest };
  return { kind: 'all' };
}

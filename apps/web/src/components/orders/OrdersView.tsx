'use client';

import {
  formatMoney,
  isOrderStatus,
  isProductionStageKey,
  isTerminalStatus,
  ORDER_STATUS_LABELS_RU,
  ORDER_STATUSES,
  type OrderStatus,
  parseMoney,
  PRIORITIES,
  type Priority,
  PRIORITY_LABELS_RU,
  PRODUCTION_STAGES,
  type ProductionStageKey,
  Role,
  statusesOfProductionStage,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { OrderStatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

import { OrderCreateDialog } from './OrderCreateDialog';

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
  const { hasRole } = useAuth();

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
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Номер, клиент или телефон"
              className="w-56 rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-primary placeholder:text-muted/70 focus:border-accent-muted focus:outline-none"
            />

            {lockedStatuses === undefined && (
              <select
                value={encodeSelection(selection)}
                onChange={(event) => {
                  setSelection(decodeSelection(event.target.value));
                  setPage(1);
                }}
                aria-label="Статус или этап заказа"
                className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-accent-muted focus:outline-none"
              >
                <option value={SELECT_ALL}>Все статусы</option>

                {/* Этапы идут первыми: с дашборда приходят именно они, и найти
                    выбранный пункт в списке из двадцати пяти строк проще, когда
                    он в начале. */}
                <optgroup label="Этапы производства">
                  {PRODUCTION_STAGES.map((stage) => (
                    <option key={stage.key} value={`stage:${stage.key}`}>
                      {stage.label}
                    </option>
                  ))}
                </optgroup>

                <optgroup label="Статусы">
                  {ORDER_STATUSES.map((value) => (
                    <option key={value} value={`status:${value}`}>
                      {ORDER_STATUS_LABELS_RU[value]}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}

            <select
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value as Priority | '');
                setPage(1);
              }}
              aria-label="Приоритет"
              className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-accent-muted focus:outline-none"
            >
              <option value="">Любой приоритет</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS_RU[value]}
                </option>
              ))}
            </select>

            {canCreate && (
              <Button
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Новый заказ
              </Button>
            )}
          </div>
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

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage={emptyMessage}
        columns={[
          {
            key: 'number',
            header: 'Номер',
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
            render: (row) => (
              <span className="block">
                <span className="block text-primary">{row.clientName}</span>
                <span className="block font-mono text-[11px] text-muted">{row.clientPhone}</span>
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
            render: (row) => {
              if (row.deadline === null) return <span className="text-muted">—</span>;

              const overdue = new Date(row.deadline) < new Date() && !isTerminalStatus(row.status);

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
            render: (row) => formatDate(row.createdAt),
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
    </Card>
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

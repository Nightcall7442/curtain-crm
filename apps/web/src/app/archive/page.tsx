'use client';

import {
  formatMoney,
  OrderStatus,
  parseMoney,
  type TerminalOrderStatus,
} from '@curtain-crm/shared';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';

import { OrderStatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

/**
 * Архив: выполненные и отменённые заказы.
 *
 * Отдельной таблицы для архива в базе нет — это фильтр по статусу. Заказы
 * остаются в `orders` со всеми связями: закупки, фотографии и зарплатные
 * расчёты продолжают на них ссылаться.
 */
export default function ArchivePage(): ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | TerminalOrderStatus>('');

  const query = trpc.archive.list.useQuery({
    page,
    pageSize: 20,
    ...(search.length > 0 ? { search } : {}),
    ...(status === '' ? {} : { status }),
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
        title="Архив заказов"
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
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | TerminalOrderStatus);
                setPage(1);
              }}
              aria-label="Статус"
              className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-accent-muted focus:outline-none"
            >
              <option value="">Выполненные и отменённые</option>
              <option value={OrderStatus.COMPLETED}>Только выполненные</option>
              <option value={OrderStatus.CANCELLED}>Только отменённые</option>
            </select>
          </div>
        }
      />

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage="В архиве пока пусто"
        columns={[
          {
            key: 'number',
            header: 'Номер',
            render: (row) => (
              <Link
                href={`/orders/${row.id.toString()}`}
                className="font-medium text-accent hover:underline"
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
                <span className="block text-[11px] text-muted">{row.clientPhone}</span>
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => <OrderStatusBadge status={row.status} />,
          },
          {
            key: 'closed',
            header: 'Закрыт',
            render: (row) => formatDate(row.completedAt ?? row.cancelledAt),
          },
          {
            key: 'reason',
            header: 'Причина отмены',
            render: (row) =>
              row.cancellationReason === null ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="text-secondary">{row.cancellationReason}</span>
              ),
          },
          {
            key: 'price',
            header: 'Сумма',
            align: 'right',
            render: (row) => formatMoney(parseMoney(row.workPrice)),
          },
          { key: 'author', header: 'Создал', render: (row) => row.createdByName },
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

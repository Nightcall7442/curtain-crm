'use client';

import { BellOff, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Уведомления сотрудника.
 *
 * Лента всегда собственная: `user_id` берётся из контекста запроса, а не из
 * параметров, поэтому чужие уведомления сюда попасть не могут даже случайно.
 */
export default function NotificationsPage(): ReactElement {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const utils = trpc.useUtils();
  const query = trpc.notifications.list.useQuery({ page, pageSize: 20, unreadOnly });

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      utils.notifications.list.invalidate(),
      utils.notifications.unreadCount.invalidate(),
    ]);
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: invalidate });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: invalidate });

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
        title="Уведомления"
        action={
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-secondary">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                  setUnreadOnly(event.target.checked);
                  setPage(1);
                }}
                className="accent-[rgb(var(--accent))]"
              />
              Только непрочитанные
            </label>

            <button
              type="button"
              disabled={markAllAsRead.isPending}
              onClick={() => {
                markAllAsRead.mutate();
              }}
              className="flex items-center gap-1.5 rounded border border-subtle px-2.5 py-1.5 text-[12px] text-secondary transition-colors hover:bg-raised hover:text-primary disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Прочитать все
            </button>
          </div>
        }
      />

      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-40" />
        ) : query.data === undefined || query.data.items.length === 0 ? (
          <EmptyState
            message={unreadOnly ? 'Непрочитанных уведомлений нет' : 'Уведомлений пока нет'}
            hint="Здесь появляются события по вашим заказам и сменам"
          />
        ) : (
          <ul className="space-y-2">
            {query.data.items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'rounded border p-3 transition-colors',
                  item.isRead
                    ? 'border-subtle bg-base/30'
                    : 'border-accent-muted/40 bg-accent/5',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-primary">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-secondary">{item.body}</p>
                    <p className="mt-1 text-[10.5px] text-muted">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.relatedOrderId !== null && (
                      <Link
                        href={`/orders/${item.relatedOrderId.toString()}`}
                        className="text-[11.5px] text-accent hover:underline"
                      >
                        К заказу
                      </Link>
                    )}
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => {
                          markAsRead.mutate({ id: item.id });
                        }}
                        className="flex items-center gap-1 text-[11.5px] text-muted hover:text-primary"
                      >
                        <BellOff className="h-3 w-3" aria-hidden />
                        Прочитано
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

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

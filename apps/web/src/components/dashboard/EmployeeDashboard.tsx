'use client';

import { ROLE_LABELS_RU } from '@curtain-crm/shared';
import { Bell, ClipboardList, Clock, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { OrderStatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate, formatDateTime, formatDuration } from '@/lib/utils';

/**
 * Главная панель рядового сотрудника: швеи, мастера, контролёра, установщика,
 * продавца, SMM.
 *
 * Показатели компании (выручка, рейтинг продавцов, конвейер целиком) сюда не
 * попадают: их отдают `managementProcedure`, и швея получила бы пять отказов
 * вместо главной страницы. Здесь только то, что сотрудник вправе видеть о
 * себе, и всё — по процедурам, ограниченным его собственными данными:
 * `shifts.*` берут `user_id` из контекста, `orders.list` фильтрует по участию.
 *
 * Экран отвечает на два вопроса, с которыми сотрудник открывает панель:
 * «что мне делать сегодня» и «сколько я отработал».
 */
export function EmployeeDashboard(): ReactElement {
  const { user } = useAuth();

  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const shift = trpc.shifts.current.useQuery();
  const summary = trpc.shifts.mySummary.useQuery(period);
  const orders = trpc.orders.list.useQuery({ page: 1, pageSize: 10 });
  const unread = trpc.notifications.unreadCount.useQuery();
  const feed = trpc.notifications.list.useQuery({ page: 1, pageSize: 5, unreadOnly: false });

  if (orders.isError) {
    return (
      <Card>
        <ErrorState
          message={orders.error.message}
          onRetry={() => {
            void orders.refetch();
          }}
        />
      </Card>
    );
  }

  const openShift = shift.data ?? null;
  const roles = (user?.roles ?? []).map((role) => ROLE_LABELS_RU[role]).join(', ');

  return (
    <div className="space-y-3">
      {/* --- Показатели --------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {shift.isLoading ? (
          <Skeleton className="h-[104px]" />
        ) : (
          <StatCard
            label="Смена"
            value={openShift === null ? 'Закрыта' : 'Открыта'}
            caption={
              openShift === null
                ? 'Открывается в мобильном приложении'
                : `${openShift.branchName}, с ${formatDateTime(openShift.startedAt)}`
            }
            icon={openShift === null ? Clock : MapPin}
          />
        )}

        {summary.isLoading ? (
          <Skeleton className="h-[104px]" />
        ) : (
          <StatCard
            label="Отработано за месяц"
            value={formatDuration(summary.data?.workedHours ?? 0)}
            caption={`${period.month.toString().padStart(2, '0')}.${period.year.toString()}`}
            icon={Clock}
          />
        )}

        {orders.isLoading ? (
          <Skeleton className="h-[104px]" />
        ) : (
          <StatCard
            label="Мои заказы в работе"
            value={(orders.data?.total ?? 0).toString()}
            caption="Закрытые и отменённые — в «Архиве»"
            icon={ClipboardList}
          />
        )}

        {unread.isLoading ? (
          <Skeleton className="h-[104px]" />
        ) : (
          <StatCard
            label="Непрочитанные уведомления"
            value={(unread.data ?? 0).toString()}
            caption={roles.length > 0 ? `Ваши роли: ${roles}` : undefined}
            icon={Bell}
          />
        )}
      </section>

      {/* --- Мои заказы ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Мои заказы в работе"
          action={
            <Link href="/orders" className="text-[12px] text-accent hover:underline">
              Все заказы
            </Link>
          }
        />
        <DataTable
          isLoading={orders.isLoading}
          rows={orders.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="За вами сейчас не закреплён ни один заказ"
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
              render: (row) => <span className="text-primary">{row.clientName}</span>,
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
              render: (row) => formatDate(row.deadline),
            },
          ]}
        />
      </Card>

      {/* --- Уведомления --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Последние уведомления"
          icon={<Bell className="h-4 w-4" />}
          action={
            <Link href="/notifications" className="text-[12px] text-accent hover:underline">
              Все уведомления
            </Link>
          }
        />
        <CardBody>
          {feed.isLoading ? (
            <Skeleton className="h-28" />
          ) : feed.data === undefined || feed.data.items.length === 0 ? (
            <EmptyState
              message="Уведомлений пока нет"
              hint="Здесь появятся назначения заказов и смены статусов"
            />
          ) : (
            <ul className="space-y-2.5">
              {feed.data.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 text-[12.5px]">
                  <span
                    aria-hidden
                    className={
                      item.isRead
                        ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-raised'
                        : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info'
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-primary">{item.title}</span>
                    <span className="block text-[11.5px] text-secondary">{item.body}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatDateTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

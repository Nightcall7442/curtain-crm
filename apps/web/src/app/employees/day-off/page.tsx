'use client';

import { DAY_OFF_STATUS_LABELS_RU, DayOffStatus, DAY_OFF_STATUSES, type DayOffStatus as DayOffStatusName } from '@curtain-crm/shared';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, controlClass, FilterBar, FormError, Modal, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

/**
 * Запросы на выходные.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену
 * (со своего телефона — экран «Профиль → Запрос на выходные»), руководитель
 * одобряет или отклоняет здесь. Решение ни на что не влияет автоматически —
 * это заметка для руководства, а не команда расписанию.
 */
export default function DayOffRequestsPage(): ReactElement {
  const toast = useToast();

  const [status, setStatus] = useState<DayOffStatusName | ''>(DayOffStatus.PENDING);
  /** Запрос, ожидающий причину отказа. `null` — окно закрыто. */
  const [rejecting, setRejecting] = useState<{ id: number; period: string } | null>(null);
  const [reason, setReason] = useState('');

  const utils = trpc.useUtils();
  const query = trpc.dayOff.list.useQuery(status === '' ? {} : { status });

  const refresh = (): void => {
    void utils.dayOff.list.invalidate();
  };

  const approve = trpc.dayOff.approve.useMutation({
    onSuccess() {
      toast.success('Запрос одобрен');
      refresh();
    },
    onError(error) {
      toast.error('Не удалось одобрить', error.message);
    },
  });

  const reject = trpc.dayOff.reject.useMutation({
    onSuccess() {
      setRejecting(null);
      setReason('');
      toast.success('Запрос отклонён', 'Сотрудник получит уведомление');
      refresh();
    },
    onError(error) {
      toast.error('Не удалось отклонить', error.message);
    },
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
        title="Запросы на выходные"
        action={
          <FilterBar>
            <Select
              size="sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as DayOffStatusName | '');
              }}
              aria-label="Статус запроса"
              className="w-auto"
              placeholder="Все статусы"
              options={DAY_OFF_STATUSES.map((value) => ({
                value,
                label: DAY_OFF_STATUS_LABELS_RU[value],
              }))}
            />
          </FilterBar>
        }
      />

      <Modal
        open={rejecting !== null}
        title={rejecting === null ? '' : `Отклонить запрос на ${rejecting.period}`}
        onClose={() => {
          setRejecting(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRejecting(null);
              }}
            >
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={reject.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (rejecting !== null) {
                  reject.mutate({ id: rejecting.id, reason: reason.trim() });
                }
              }}
            >
              Отклонить запрос
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={reject.error?.message ?? null} />
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            rows={2}
            placeholder="Причина — её увидит сотрудник в уведомлении"
            className={controlClass('md')}
          />
        </div>
      </Modal>

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage={
          status === DayOffStatus.PENDING
            ? 'Нерассмотренных запросов нет'
            : 'Запросов с таким статусом нет'
        }
        columns={[
          {
            key: 'employee',
            header: 'Сотрудник',
            sortValue: (row) => row.requester.fullName,
            render: (row) => (
              <span className="block max-w-[16rem]">
                <span className="block text-primary">{row.requester.fullName}</span>
                {row.reason !== null && (
                  <span className="block truncate text-footnote text-muted" title={row.reason}>
                    {row.reason}
                  </span>
                )}
                {row.rejectionReason !== null && (
                  <span className="block text-footnote text-danger">
                    {`Причина отказа: ${row.rejectionReason}`}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'period',
            header: 'Период',
            sortValue: (row) => row.startDate,
            render: (row) => (
              <span className="whitespace-nowrap">
                {row.startDate === row.endDate
                  ? formatDate(row.startDate)
                  : `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => (
              <Badge
                tone={
                  row.status === DayOffStatus.APPROVED
                    ? 'positive'
                    : row.status === DayOffStatus.REJECTED
                      ? 'danger'
                      : row.status === DayOffStatus.CANCELLED
                        ? 'neutral'
                        : 'warning'
                }
              >
                {DAY_OFF_STATUS_LABELS_RU[row.status]}
              </Badge>
            ),
          },
          {
            key: 'reviewer',
            header: 'Решил',
            render: (row) => row.reviewer?.fullName ?? <span className="text-muted">—</span>,
          },
          {
            key: 'created',
            header: 'Создано',
            sortValue: (row) => new Date(row.createdAt).getTime(),
            render: (row) => formatDate(row.createdAt),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            className: 'whitespace-nowrap',
            render: (row) =>
              row.status === DayOffStatus.PENDING ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={approve.isPending}
                    onClick={() => {
                      approve.mutate({ id: row.id });
                    }}
                    className="inline-flex items-center gap-1 rounded border border-positive/40 px-2 py-1 text-footnote text-positive hover:bg-positive/10 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReason('');
                      setRejecting({
                        id: row.id,
                        period:
                          row.startDate === row.endDate
                            ? formatDate(row.startDate)
                            : `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`,
                      });
                    }}
                    className="rounded border border-danger/40 px-2 py-1 text-footnote text-danger hover:bg-danger/10"
                  >
                    Отклонить
                  </button>
                </span>
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

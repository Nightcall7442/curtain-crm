'use client';

import {
  formatIsoDateShort,
  isOverdueDate,
  TASK_STATUS_LABELS_RU,
  TASK_STATUSES,
  TaskStatus,
  type TaskStatus as TaskStatusName,
} from '@curtain-crm/shared';
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
 * Поручения — дополнительная работа мимо конвейера заказов.
 *
 * Руководитель видит здесь все поручения мастерской: кто, что и к какому
 * сроку. Выдаются поручения из списка сотрудников (кнопка в строке —
 * «Дать поручение»): поручение начинается с человека, а не с текста.
 * Отмена — только с причиной; адресат получает уведомление.
 */
export default function EmployeeTasksPage(): ReactElement {
  const toast = useToast();

  const [status, setStatus] = useState<TaskStatusName | ''>(TaskStatus.OPEN);
  /** Поручение, ожидающее причину отмены. `null` — окно закрыто. */
  const [cancelling, setCancelling] = useState<{ id: number; title: string } | null>(null);
  const [reason, setReason] = useState('');

  const utils = trpc.useUtils();
  const query = trpc.tasks.list.useQuery(status === '' ? {} : { status });

  const refresh = (): void => {
    void utils.tasks.list.invalidate();
  };

  const complete = trpc.tasks.complete.useMutation({
    onSuccess() {
      toast.success('Поручение закрыто');
      refresh();
    },
    onError(error) {
      toast.error('Не удалось закрыть', error.message);
    },
  });

  const cancel = trpc.tasks.cancel.useMutation({
    onSuccess() {
      setCancelling(null);
      setReason('');
      toast.success('Поручение отменено', 'Сотрудник получит уведомление');
      refresh();
    },
    onError(error) {
      toast.error('Не удалось отменить', error.message);
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
        title="Поручения"
        action={
          <FilterBar>
            <Select
              size="sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as TaskStatusName | '');
              }}
              aria-label="Статус поручения"
              className="w-auto"
              placeholder="Все статусы"
              options={TASK_STATUSES.map((value) => ({
                value,
                label: TASK_STATUS_LABELS_RU[value],
              }))}
            />
            <span className="text-footnote text-muted">
              Выдать новое — из списка сотрудников, кнопкой в строке
            </span>
          </FilterBar>
        }
      />

      <Modal
        open={cancelling !== null}
        title={cancelling === null ? '' : `Отменить: «${cancelling.title}»`}
        onClose={() => {
          setCancelling(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCancelling(null);
              }}
            >
              Не отменять
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (cancelling !== null) {
                  cancel.mutate({ id: cancelling.id, reason: reason.trim() });
                }
              }}
            >
              Отменить поручение
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={cancel.error?.message ?? null} />
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
          status === TaskStatus.OPEN
            ? 'Открытых поручений нет'
            : 'Поручений с таким статусом нет'
        }
        columns={[
          {
            key: 'title',
            header: 'Поручение',
            render: (row) => (
              <span className="block max-w-[26rem]">
                <span className="block text-primary">{row.title}</span>
                {row.details !== null && (
                  <span className="block truncate text-footnote text-muted" title={row.details}>
                    {row.details}
                  </span>
                )}
                {row.cancelReason !== null && (
                  <span className="block text-footnote text-danger">
                    {`Причина отмены: ${row.cancelReason}`}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'assignee',
            header: 'Кому',
            sortValue: (row) => row.assignee.fullName,
            render: (row) => <span className="text-primary">{row.assignee.fullName}</span>,
          },
          {
            key: 'creator',
            header: 'От кого',
            render: (row) => row.creator.fullName,
          },
          {
            key: 'due',
            header: 'Срок',
            sortValue: (row) => row.dueDate ?? '9999-12-31',
            render: (row) => {
              if (row.dueDate === null) return <span className="text-muted">—</span>;
              const overdue = row.status === TaskStatus.OPEN && isOverdueDate(row.dueDate);
              return (
                <span
                  className={overdue ? 'whitespace-nowrap font-semibold text-danger' : 'whitespace-nowrap'}
                  title={formatDate(row.dueDate)}
                >
                  {overdue
                    ? `просрочено · ${formatIsoDateShort(row.dueDate)}`
                    : `до ${formatIsoDateShort(row.dueDate)}`}
                </span>
              );
            },
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => (
              <Badge
                tone={
                  row.status === TaskStatus.DONE
                    ? 'positive'
                    : row.status === TaskStatus.CANCELLED
                      ? 'neutral'
                      : 'warning'
                }
              >
                {TASK_STATUS_LABELS_RU[row.status]}
              </Badge>
            ),
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
              row.status === TaskStatus.OPEN ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={complete.isPending}
                    onClick={() => {
                      complete.mutate({ id: row.id });
                    }}
                    className="inline-flex items-center gap-1 rounded border border-positive/40 px-2 py-1 text-footnote text-positive hover:bg-positive/10 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Выполнено
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReason('');
                      setCancelling({ id: row.id, title: row.title });
                    }}
                    className="rounded border border-danger/40 px-2 py-1 text-footnote text-danger hover:bg-danger/10"
                  >
                    Отменить
                  </button>
                </span>
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

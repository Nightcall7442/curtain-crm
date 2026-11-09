'use client';

import {
  DAY_OFF_STATUS_LABELS_RU,
  DayOffStatus,
  DAY_OFF_STATUSES,
  MAX_DAY_OFF_REJECTION_REASON_LENGTH,
  type DayOffStatus as DayOffStatusName,
} from '@curtain-crm/shared';
import { CalendarPlus, Check } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { AssignDayOffDialog } from '@/components/employees/AssignDayOffDialog';
import { LateRequestsPanel } from '@/components/employees/LateRequestsPanel';
import { RejectRequestDialog } from '@/components/employees/RejectRequestDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { DayOffStatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, FilterBar, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn, formatDate } from '@/lib/utils';

/**
 * Выходные и опоздания.
 *
 * Обе просьбы сотрудник отправляет с одного экрана приложения, и решает их
 * руководитель в одном месте — здесь, двумя вкладками. Опоздание не
 * подмешано в список выходных: это рабочий день с другим временем начала,
 * а не отсутствие, и у него своё поле — «приду к».
 *
 * Счётчик на вкладке — запросы, ждущие решения. Без него руководитель,
 * открывший «Выходные», не узнал бы, что на соседней вкладке человек
 * просит опоздать на сегодня.
 *
 * Вкладка адресуется якорем (`#late`), как разделы настроек: на неё ведёт
 * уведомление о новом запросе на опоздание.
 */
const TABS = [
  { key: 'day-off', label: 'Выходные' },
  { key: 'late', label: 'Опоздания' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function DayOffRequestsPage(): ReactElement {
  const [tab, setTab] = useState<Tab>('day-off');

  // Якорь читается после монтирования: при отрисовке на сервере `window`
  // нет, и вкладка из адреса в `useState` разошлась бы с разметкой сервера.
  // `hashchange` — для перехода на `#late`, когда страница уже открыта:
  // браузер тогда не перезагружает её, и одно чтение при монтировании
  // оставило бы руководителя на выходных.
  useEffect(() => {
    const applyHash = (): void => {
      setTab(window.location.hash === '#late' ? 'late' : 'day-off');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => {
      window.removeEventListener('hashchange', applyHash);
    };
  }, []);

  // Тот же запрос, что у списка выходных по умолчанию, — второго обращения
  // к серверу счётчик не делает.
  const pendingDayOff = trpc.dayOff.list.useQuery({ status: DayOffStatus.PENDING });
  const pendingLate = trpc.lateRequests.list.useQuery({ status: DayOffStatus.PENDING });
  const pending: Readonly<Record<Tab, number>> = {
    'day-off': pendingDayOff.data?.total ?? 0,
    late: pendingLate.data?.total ?? 0,
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Вид запросов"
        className="inline-flex overflow-hidden rounded-xl border border-ink/10"
      >
        {TABS.map((entry) => {
          const isActive = entry.key === tab;
          const count = pending[entry.key];
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              id={`requests-tab-${entry.key}`}
              aria-selected={isActive}
              aria-controls="requests-panel"
              onClick={() => {
                setTab(entry.key);
                window.history.replaceState(
                  null,
                  '',
                  entry.key === 'late'
                    ? '#late'
                    : `${window.location.pathname}${window.location.search}`,
                );
              }}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-caption font-medium transition-colors',
                isActive
                  ? 'bg-accent/12 text-accent'
                  : 'text-secondary hover:bg-ink/[0.08] hover:text-primary',
              )}
            >
              {entry.label}
              {count > 0 && (
                <span
                  className="min-w-[1.25rem] rounded-full bg-warning/20 px-1.5 text-center text-footnote font-semibold tabular-nums text-warning"
                  aria-label={`ждут решения: ${count.toString()}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="requests-panel" aria-labelledby={`requests-tab-${tab}`}>
        {tab === 'late' ? <LateRequestsPanel /> : <DayOffPanel />}
      </div>
    </div>
  );
}

/**
 * Выходные.
 *
 * Два пути в один список. Сотрудник просит дни со своего телефона, и
 * руководитель одобряет или отклоняет их здесь. Он же может назначить
 * выходной сам — график цеха составляет он, и раньше поставить человека на
 * отдых можно было только дождавшись, пока тот попросит.
 *
 * Назначенный выходной согласован сразу и не ждёт рассмотрения. Сотрудник
 * видит его в своём графике в приложении, а руководство — буквой «В» в
 * табеле.
 */
function DayOffPanel(): ReactElement {
  const toast = useToast();

  const [status, setStatus] = useState<DayOffStatusName | ''>(DayOffStatus.PENDING);
  /** Запрос, ожидающий причину отказа. `null` — окно закрыто. */
  const [rejecting, setRejecting] = useState<{ id: number; period: string } | null>(null);
  const [assigning, setAssigning] = useState(false);

  const utils = trpc.useUtils();
  const query = trpc.dayOff.list.useQuery(status === '' ? {} : { status });

  const refresh = (): void => {
    void utils.dayOff.list.invalidate();
  };

  const withdraw = trpc.dayOff.withdraw.useMutation({
    onSuccess() {
      toast.success('Выходной снят');
      refresh();
    },
    onError(error) {
      toast.error('Не удалось снять', error.message);
    },
  });

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
      <AssignDayOffDialog
        open={assigning}
        onClose={() => {
          setAssigning(false);
        }}
      />

      <CardHeader
        title="Выходные"
        action={
          <FilterBar>
            <Button
              size="sm"
              variant="secondary"
              icon={<CalendarPlus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setAssigning(true);
              }}
            >
              Назначить
            </Button>

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

      {rejecting !== null && (
        <RejectRequestDialog
          title={`Отклонить запрос на ${rejecting.period}`}
          maxLength={MAX_DAY_OFF_REJECTION_REASON_LENGTH}
          isPending={reject.isPending}
          error={reject.error?.message ?? null}
          onClose={() => {
            setRejecting(null);
          }}
          onSubmit={(reason) => {
            reject.mutate({ id: rejecting.id, reason });
          }}
        />
      )}

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
            render: (row) => <DayOffStatusBadge status={row.status} />,
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
              /*
                Согласованный выходной снимается: назначили не тому или не на
                тот день — иначе исправлять пришлось бы через базу.
              */
              row.status === DayOffStatus.APPROVED ? (
                <button
                  type="button"
                  disabled={withdraw.isPending}
                  onClick={() => {
                    withdraw.mutate({ id: row.id });
                  }}
                  className="rounded-xl border border-ink/10 px-2 py-1 text-footnote text-secondary hover:bg-ink/[0.08] disabled:opacity-50"
                >
                  Снять
                </button>
              ) : row.status === DayOffStatus.PENDING ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={approve.isPending}
                    onClick={() => {
                      approve.mutate({ id: row.id });
                    }}
                    className="inline-flex items-center gap-1 pressable rounded-full border border-positive/40 px-2 py-1 text-footnote font-medium text-positive hover:bg-positive/10 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Ошибка прошлой попытки к новому окну не относится.
                      reject.reset();
                      setRejecting({
                        id: row.id,
                        period:
                          row.startDate === row.endDate
                            ? formatDate(row.startDate)
                            : `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`,
                      });
                    }}
                    className="pressable rounded-full border border-danger/40 px-2 py-1 text-footnote font-medium text-danger hover:bg-danger/10"
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

'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { AttendanceHeatmap } from '@/components/charts/Bars';
import {
  ShiftAdjustDialog,
  type ShiftDraft,
} from '@/components/employees/ShiftAdjustDialog';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatDuration } from '@/lib/utils';

/**
 * Табель: отработанные часы и журнал смен.
 *
 * Смена — один непрерывный блок без перерывов (требование заказчика), поэтому
 * «часы» здесь равны разнице между чек-ином и чек-аутом. Смены, пересекающие
 * границу месяца, обрезаются периодом — расчёт делает сервер.
 */
export default function TimesheetPage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [page, setPage] = useState(1);

  /** `undefined` — диалог закрыт, `null` — заведение смены, объект — правка. */
  const [adjusting, setAdjusting] = useState<ShiftDraft | null | undefined>(undefined);

  const period = { year, month };

  const summary = trpc.shifts.summary.useQuery(period);
  const attendance = trpc.users.attendance.useQuery(period);
  const shifts = trpc.shifts.list.useQuery({
    page,
    pageSize: 20,
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  });

  if (summary.isError) {
    return (
      <Card>
        <ErrorState
          message={summary.error.message}
          onRetry={() => {
            void summary.refetch();
          }}
        />
      </Card>
    );
  }

  const periodPicker = (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(event) => {
          setMonth(Number.parseInt(event.target.value, 10));
          setPage(1);
        }}
        aria-label="Месяц"
        className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-accent-muted focus:outline-none"
      >
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>

      <select
        value={year}
        onChange={(event) => {
          setYear(Number.parseInt(event.target.value, 10));
          setPage(1);
        }}
        aria-label="Год"
        className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-accent-muted focus:outline-none"
      >
        {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <ShiftAdjustDialog
        open={adjusting !== undefined}
        shift={adjusting ?? null}
        onClose={() => {
          setAdjusting(undefined);
        }}
      />

      <Card>
        <CardHeader title="Посещаемость" action={periodPicker} />
        <CardBody>
          {attendance.isLoading || attendance.data === undefined ? (
            <Skeleton className="h-40" />
          ) : (
            <AttendanceHeatmap
              cells={attendance.data.days.map((day) => ({ date: day.date, rate: day.rate }))}
              year={attendance.data.period.year}
              month={attendance.data.period.month}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Отработанные часы за месяц" />
        <DataTable
          isLoading={summary.isLoading}
          rows={summary.data ?? []}
          rowKey={(row) => row.userId}
          emptyMessage="Смен за выбранный период нет"
          columns={[
            {
              key: 'name',
              header: 'Сотрудник',
              render: (row) => <span className="text-primary">{row.userFullName}</span>,
            },
            { key: 'shifts', header: 'Смен', align: 'right', render: (row) => row.shiftsCount },
            {
              key: 'hours',
              header: 'Часов',
              align: 'right',
              render: (row) => (
                <span className="text-primary">
                  {formatDuration(Number.parseFloat(row.workedHours))}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="Журнал смен"
          action={
            <Button
              onClick={() => {
                setAdjusting(null);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Завести смену
            </Button>
          }
        />
        <DataTable
          isLoading={shifts.isLoading}
          rows={shifts.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Смен за выбранный период нет"
          columns={[
            {
              key: 'name',
              header: 'Сотрудник',
              render: (row) => <span className="text-primary">{row.userFullName}</span>,
            },
            { key: 'branch', header: 'Филиал', render: (row) => row.branchName },
            {
              key: 'start',
              header: 'Начало',
              render: (row) => formatDateTime(row.startedAt),
            },
            {
              key: 'end',
              header: 'Окончание',
              render: (row) =>
                row.endedAt === null ? (
                  <Badge tone="positive">Смена открыта</Badge>
                ) : (
                  formatDateTime(row.endedAt)
                ),
            },
            {
              key: 'distance',
              header: 'До филиала',
              align: 'right',
              render: (row) =>
                row.startDistanceMeters === null
                  ? '—'
                  : `${row.startDistanceMeters.toString()} м`,
            },
            {
              key: 'adjusted',
              header: 'Корректировка',
              render: (row) =>
                row.isManuallyAdjusted ? (
                  <span className="block">
                    <Badge tone="warning">Изменена вручную</Badge>
                    {row.adjustmentReason !== null && (
                      <span className="mt-1 block text-[11px] text-muted">
                        {row.adjustmentReason}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <button
                  type="button"
                  aria-label="Скорректировать смену"
                  onClick={() => {
                    setAdjusting({
                      id: row.id,
                      userId: row.userId,
                      branchId: row.branchId,
                      startedAt: row.startedAt,
                      endedAt: row.endedAt,
                    });
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ),
            },
          ]}
        />

        {shifts.data !== undefined && (
          <Pagination
            page={shifts.data.page}
            totalPages={shifts.data.totalPages}
            total={shifts.data.total}
            pageSize={shifts.data.pageSize}
            onChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

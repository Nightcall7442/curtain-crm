'use client';

import { DEPARTMENTS, MONTH_NAMES_RU, PresenceStatus } from '@curtain-crm/shared';
import { CalendarPlus, Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { AttendanceHeatmap } from '@/components/charts/Bars';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { AssignDayOffDialog } from '@/components/employees/AssignDayOffDialog';
import { departmentColor, departmentLabel } from '@/components/employees/palette';
import { ShiftAdjustDialog, type ShiftDraft } from '@/components/employees/ShiftAdjustDialog';
import { TimesheetGrid } from '@/components/employees/TimesheetGrid';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { Button, controlClass } from '@/components/ui/Form';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatPercent } from '@/lib/utils';

/**
 * Табель: кто работал, когда и сколько.
 *
 * Сюда же сведена бывшая «Ведомость» — структура штата и присутствие по
 * подразделениям. Оба раздела отвечали на один вопрос — «кто и сколько
 * работает», — и ходить за ответом приходилось в оба.
 *
 * Порядок карточек — от общего к частному: сколько людей и где они, затем
 * месяц по дням, затем журнал смен. Часы везде одни и те же — те, что уйдут
 * в зарплату: за вычетом выездов и личных отлучек, расчёт делает сервер.
 */
export default function TimesheetPage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [page, setPage] = useState(1);

  /** `undefined` — диалог закрыт, `null` — заведение смены, объект — правка. */
  const [adjusting, setAdjusting] = useState<ShiftDraft | null | undefined>(undefined);

  const [assigningDayOff, setAssigningDayOff] = useState(false);

  const period = { year, month };

  const timesheet = trpc.shifts.timesheet.useQuery(period);
  const attendance = trpc.users.attendance.useQuery(period);

  /* --- Бывшая «Ведомость»: штат по подразделениям ----------------------- */
  const stats = trpc.users.stats.useQuery();
  const presence = trpc.users.presenceToday.useQuery();
  // Список берём целиком: штат мастерской заведомо помещается на одну
  // страницу такого размера.
  const staff = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true });

  const departments = useMemo(() => {
    const distributions = stats.data?.distributions;
    if (distributions === undefined) return [];

    const presenceMap = presence.data ?? {};
    const employees = staff.data?.items ?? [];

    return DEPARTMENTS.map((department) => {
      const entry = distributions.byDepartment.find((item) => item.key === department);
      const inDepartment = employees.filter((employee) => employee.department === department);

      const atWork = inDepartment.filter(
        (employee) => presenceMap[employee.id.toString()] === PresenceStatus.AT_WORK,
      ).length;

      return {
        department,
        total: entry?.count ?? 0,
        percent: entry?.percent ?? 0,
        atWork,
        absent: Math.max(0, (entry?.count ?? 0) - atWork),
      };
    }).filter((row) => row.total > 0);
  }, [stats.data, presence.data, staff.data]);

  const shifts = trpc.shifts.list.useQuery({
    page,
    pageSize: 20,
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  });

  if (timesheet.isError) {
    return (
      <Card>
        <ErrorState
          message={timesheet.error.message}
          onRetry={() => {
            void timesheet.refetch();
          }}
        />
      </Card>
    );
  }

  const segments = departments.map((row) => ({
    key: row.department,
    label: departmentLabel(row.department),
    value: row.total,
    color: departmentColor(row.department),
  }));

  const headcount = stats.data?.distributions.total ?? 0;

  const periodPicker = (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(event) => {
          setMonth(Number.parseInt(event.target.value, 10));
          setPage(1);
        }}
        aria-label="Месяц"
        className={controlClass('sm', 'w-auto pr-8')}
      >
        {MONTH_NAMES_RU.map((name, index) => (
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
        className={controlClass('sm', 'w-auto pr-8')}
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
    <div className="space-y-6">
      <ShiftAdjustDialog
        open={adjusting !== undefined}
        shift={adjusting ?? null}
        onClose={() => {
          setAdjusting(undefined);
        }}
      />

      <AssignDayOffDialog
        open={assigningDayOff}
        onClose={() => {
          setAssigningDayOff(false);
        }}
      />

      {/* --- Штат: бывшая «Ведомость» ------------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Структура штата" />
          <CardBody>
            {stats.isLoading ? (
              <Skeleton className="h-56" />
            ) : (
              <>
                <Donut
                  segments={segments}
                  centerValue={headcount.toString()}
                  centerLabel="Всего"
                />
                <div className="mt-4">
                  <DonutLegend segments={segments} total={headcount} />
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Подразделения" />
          <DataTable
            isLoading={stats.isLoading || staff.isLoading}
            rows={departments}
            rowKey={(row) => row.department}
            emptyMessage="Активных сотрудников нет"
            columns={[
              {
                key: 'name',
                header: 'Подразделение',
                render: (row) => (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: departmentColor(row.department) }}
                    />
                    <span className="text-primary">{departmentLabel(row.department)}</span>
                  </span>
                ),
              },
              { key: 'total', header: 'Всего', align: 'right', render: (row) => row.total },
              {
                key: 'share',
                header: 'Доля',
                align: 'right',
                render: (row) => formatPercent(row.percent),
              },
              {
                key: 'atWork',
                header: 'На работе',
                align: 'right',
                render: (row) => <span className="text-positive">{row.atWork}</span>,
              },
              {
                key: 'absent',
                header: 'Отсутствуют',
                align: 'right',
                render: (row) => (
                  <span className={row.absent > 0 ? 'text-danger' : 'text-muted'}>
                    {row.absent}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      </section>

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
        <CardHeader
          title="Табель за месяц"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<CalendarPlus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setAssigningDayOff(true);
              }}
            >
              Назначить выходной
            </Button>
          }
        />
        <TimesheetGrid
          year={year}
          month={month}
          daysInMonth={timesheet.data?.daysInMonth ?? 31}
          rows={timesheet.data?.rows ?? []}
          isLoading={timesheet.isLoading}
        />
        <p className="px-4 pb-4 text-footnote text-muted">
          В клетке — часы за день: смена минус выезды и личные отлучки, ровно те, что уйдут в
          зарплату. «В» — согласованный выходной, точка — человек не выходил.
        </p>
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
                      <span className="mt-1 block text-overline text-muted">
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
                  className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-ink/[0.08] hover:text-primary"
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

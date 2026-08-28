'use client';

import {
  DEPARTMENTS,
  EMPLOYMENT_TYPE_LABELS_RU,
  EMPLOYMENT_TYPES,
  formatMoney,
  formatPhone,
  formatTenure,
  parseMoney,
  PresenceStatus,
  ROLES,
  ROLE_LABELS_RU,
  TENURE_BUCKETS,
  type Department,
  type EmploymentType,
  type PresenceStatus as PresenceStatusName,
  type Role,
} from '@curtain-crm/shared';
import { CalendarPlus, Cake, Plus, UserCheck, UserMinus, Users, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { AttendanceHeatmap, ColumnChart, ProgressBar } from '@/components/charts/Bars';
import { Donut, DonutLegend, Gauge } from '@/components/charts/Donut';
import { EmployeeActions } from '@/components/employees/EmployeeActions';
import { EmployeeDialog, type EmployeeDraft } from '@/components/employees/EmployeeDialog';
import {
  departmentColor,
  departmentLabel,
  employmentColor,
  employmentLabel,
  tenureColor,
} from '@/components/employees/palette';
import { Badge, PresenceBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate, initials } from '@/lib/utils';

/**
 * Ведомость рабочих.
 *
 * Разделы, для которых в системе нет источника данных, на экран не выведены:
 * «качество работы» и «своевременность» не измеряются ничем, кроме брака ОТК,
 * а конверсия продавца требует учёта обращений, которого нет. Вместо сводного
 * показателя «эффективность 87 %» показана дисциплина — она считается
 * из фактических смен.
 */
export default function EmployeesPage(): ReactElement {
  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [role, setRole] = useState<Role | ''>('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');

  /** `undefined` — диалог закрыт, `null` — создание, объект — правка. */
  const [editing, setEditing] = useState<EmployeeDraft | null | undefined>(undefined);

  const stats = trpc.users.stats.useQuery();
  const presence = trpc.users.presenceToday.useQuery();
  const attendance = trpc.users.attendance.useQuery(period);
  const birthdays = trpc.users.birthdays.useQuery({ withinDays: 30 });
  const payroll = trpc.payroll.list.useQuery(period);
  const performance = trpc.users.performance.useQuery(period);

  // Все фильтры уходят на сервер: фильтрация уже загруженной страницы
  // разошлась бы со счётчиком «Показано 1–10 из 48».
  const list = trpc.users.list.useQuery({
    page,
    pageSize: 10,
    ...(search.length > 0 ? { search } : {}),
    ...(department === '' ? {} : { department }),
    ...(role === '' ? {} : { role }),
    ...(employmentType === '' ? {} : { employmentType }),
  });

  const rows = list.data?.items ?? [];

  const performanceByUser = useMemo(
    () => new Map((performance.data ?? []).map((entry) => [entry.userId, entry])),
    [performance.data],
  );

  const presenceOf = (userId: number): PresenceStatusName =>
    (presence.data?.[userId.toString()]) ??
    PresenceStatus.ABSENT;

  if (stats.isError) {
    return (
      <Card>
        <ErrorState
          message={stats.error.message}
          onRetry={() => {
            void stats.refetch();
          }}
        />
      </Card>
    );
  }

  const summary = stats.data?.summary;
  const distributions = stats.data?.distributions;

  const payrollFund = payroll.data === undefined ? 0 : parseMoney(payroll.data.totalCalculated);
  const payrollPaid = payroll.data === undefined ? 0 : parseMoney(payroll.data.totalPaid);
  const averageSalary =
    summary === undefined || summary.active === 0 ? 0 : Math.round(payrollFund / summary.active);

  /** Средняя посещаемость за месяц — то, что в макете названо «дисциплиной». */
  const attendanceRate =
    attendance.data === undefined || attendance.data.days.length === 0
      ? null
      : attendance.data.days.reduce((sum, day) => sum + day.rate, 0) /
        attendance.data.days.length;

  return (
    <div className="space-y-3">
      <EmployeeDialog
        open={editing !== undefined}
        employee={editing ?? null}
        onClose={() => {
          setEditing(undefined);
        }}
      />

      {/* --- Показатели ---------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.isLoading || summary === undefined
          ? Array.from({ length: 6 }, (_unused, index) => (
              <Skeleton key={index} className="h-[104px]" />
            ))
          : (
              <>
                <StatCard
                  label="Всего сотрудников"
                  value={summary.total.toString()}
                  caption={`Активных: ${summary.active.toString()} · Неактивных: ${summary.inactive.toString()}`}
                  icon={Users}
                />
                <StatCard
                  label="На работе сегодня"
                  value={summary.atWorkToday.toString()}
                  caption={`Из ${summary.active.toString()} активных`}
                  icon={UserCheck}
                />
                <StatCard
                  label="Отсутствуют сегодня"
                  value={summary.absentToday.toString()}
                  caption="Смена не открыта"
                  icon={UserMinus}
                />
                <StatCard
                  label="Приняты в этом месяце"
                  value={summary.hiredThisMonth.toString()}
                  caption={`Уволены: ${summary.firedThisMonth.toString()}`}
                  icon={CalendarPlus}
                />
                <StatCard
                  label="Фонд зарплаты (месяц)"
                  value={formatMoney(payrollFund)}
                  caption={`Выплачено: ${formatMoney(payrollPaid)}`}
                  icon={Wallet}
                />
                <StatCard
                  label="Средняя З/П (месяц)"
                  value={formatMoney(averageSalary)}
                  caption="На активного сотрудника"
                  icon={Wallet}
                />
              </>
            )}
      </section>

      {/* --- Разрезы штата -------------------------------------------------- */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Сотрудники по подразделениям" />
          <CardBody>
            {distributions === undefined ? (
              <Skeleton className="h-40" />
            ) : (
              <>
                <Donut
                  segments={distributions.byDepartment
                    .filter((entry) => entry.count > 0)
                    .map((entry) => ({
                      key: entry.key,
                      label: departmentLabel(entry.key),
                      value: entry.count,
                      color: departmentColor(entry.key),
                    }))}
                  centerValue={distributions.total.toString()}
                  centerLabel="Всего"
                />
                <div className="mt-3">
                  <DonutLegend
                    segments={distributions.byDepartment
                      .filter((entry) => entry.count > 0)
                      .map((entry) => ({
                        key: entry.key,
                        label: departmentLabel(entry.key),
                        value: entry.count,
                        color: departmentColor(entry.key),
                      }))}
                    total={distributions.total}
                  />
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Сотрудники по статусу" />
          <CardBody>
            {distributions === undefined ? (
              <Skeleton className="h-40" />
            ) : (
              <ul className="space-y-3">
                {distributions.byEmploymentType.map((entry) => (
                  <li key={entry.key}>
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="text-secondary">{employmentLabel(entry.key)}</span>
                      <span className="text-primary">
                        {entry.count}
                        <span className="ml-1.5 text-muted">{`${entry.percent.toFixed(1)}%`}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${entry.percent.toFixed(1)}%`,
                          backgroundColor: employmentColor(entry.key),
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Возрастная структура" />
          <CardBody className="h-[212px]">
            {distributions === undefined ? (
              <Skeleton className="h-full" />
            ) : distributions.byAge.every((entry) => entry.count === 0) ? (
              <EmptyState
                message="Даты рождения не заполнены"
                hint="Укажите их в карточках сотрудников"
              />
            ) : (
              <ColumnChart
                items={distributions.byAge.map((entry) => ({
                  key: entry.key,
                  label: entry.key,
                  value: entry.count,
                }))}
                className="h-full pb-1"
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Стаж работы" />
          <CardBody>
            {distributions === undefined ? (
              <Skeleton className="h-40" />
            ) : (
              <>
                <Donut
                  segments={distributions.byTenure.map((entry, index) => ({
                    key: entry.key,
                    label: TENURE_BUCKETS[index]?.label ?? entry.key,
                    value: entry.count,
                    color: tenureColor(index),
                  }))}
                  centerValue={distributions.total.toString()}
                  centerLabel="Всего"
                />
                <div className="mt-3">
                  <DonutLegend
                    segments={distributions.byTenure.map((entry, index) => ({
                      key: entry.key,
                      label: TENURE_BUCKETS[index]?.label ?? entry.key,
                      value: entry.count,
                      color: tenureColor(index),
                    }))}
                    total={distributions.total}
                  />
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </section>

      {/* --- Список сотрудников ---------------------------------------------- */}
      <Card>
        <CardHeader
          title="Список сотрудников"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Поиск по имени или телефону"
                className="w-56 rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-primary placeholder:text-muted/70 focus:border-gold-dim focus:outline-none"
              />

              <FilterSelect
                value={department}
                onChange={(value) => {
                  setDepartment(value as Department | '');
                  setPage(1);
                }}
                placeholder="Все подразделения"
                options={DEPARTMENTS.map((value) => ({
                  value,
                  label: departmentLabel(value),
                }))}
              />

              <FilterSelect
                value={role}
                onChange={(value) => {
                  setRole(value as Role | '');
                  setPage(1);
                }}
                placeholder="Все роли"
                options={ROLES.map((value) => ({ value, label: ROLE_LABELS_RU[value] }))}
              />

              <FilterSelect
                value={employmentType}
                onChange={(value) => {
                  setEmploymentType(value as EmploymentType | '');
                  setPage(1);
                }}
                placeholder="Все статусы"
                options={EMPLOYMENT_TYPES.map((value) => ({
                  value,
                  label: EMPLOYMENT_TYPE_LABELS_RU[value],
                }))}
              />

              <Button
                onClick={() => {
                  setEditing(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Новый сотрудник
              </Button>
            </div>
          }
        />

        <DataTable
          isLoading={list.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage="Сотрудники не найдены"
          columns={[
            {
              key: 'name',
              header: 'ФИО',
              render: (row) => (
                <span className="flex items-center gap-2.5">
                  {/* Фото сотрудник загружает сам в мобильном приложении;
                      пока его нет — инициалы, а не пустая рамка. */}
                  {row.avatarUrl === null ? (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-subtle bg-raised text-[11px] text-secondary">
                      {initials(row.fullName)}
                    </span>
                  ) : (
                    // Обычный <img>, а не next/image: адрес приходит из
                    // хранилища и меняется вместе с драйвером, а оптимизатору
                    // Next нужен заранее известный список источников.
                    <img
                      src={row.avatarUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full border border-subtle object-cover"
                    />
                  )}
                  <span className="block min-w-0">
                    <span className="block truncate text-primary">{row.fullName}</span>
                    <span className="block text-[11px] text-muted">
                      {row.employeeCode ?? '—'}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: 'job',
              header: 'Должность',
              render: (row) => row.jobTitle ?? '—',
            },
            {
              key: 'department',
              header: 'Подразделение',
              render: (row) => departmentLabel(row.department),
            },
            {
              key: 'employment',
              header: 'Статус',
              render: (row) => (
                <Badge tone={row.employmentType === 'permanent' ? 'positive' : 'warning'}>
                  {employmentLabel(row.employmentType)}
                </Badge>
              ),
            },
            {
              key: 'phone',
              header: 'Телефон',
              render: (row) => (
                <a href={`tel:${row.phone}`} className="hover:text-gold-soft">
                  {formatPhone(row.phone)}
                </a>
              ),
            },
            {
              key: 'hired',
              header: 'Дата приёма',
              render: (row) => formatDate(row.hiredAt),
            },
            {
              key: 'tenure',
              header: 'Стаж',
              render: (row) => formatTenure(row.hiredAt),
            },
            {
              key: 'plan',
              header: 'План / мес.',
              align: 'right',
              render: (row) => performanceByUser.get(row.id)?.plan ?? '—',
            },
            {
              key: 'fact',
              header: 'Выполнено',
              align: 'right',
              render: (row) => performanceByUser.get(row.id)?.completed ?? 0,
            },
            {
              key: 'percent',
              header: '% выполнения',
              align: 'right',
              render: (row) => {
                const percent = performanceByUser.get(row.id)?.percent;
                if (percent === undefined || percent === null) {
                  return <span className="text-muted">—</span>;
                }
                return (
                  <span className="inline-flex w-24 items-center gap-2">
                    <ProgressBar
                      percent={percent}
                      tone={percent >= 100 ? 'positive' : percent >= 70 ? 'gold' : 'danger'}
                      className="flex-1"
                    />
                    <span
                      className={
                        percent >= 100
                          ? 'text-positive'
                          : percent >= 70
                            ? 'text-primary'
                            : 'text-danger'
                      }
                    >
                      {`${percent.toFixed(0)}%`}
                    </span>
                  </span>
                );
              },
            },
            {
              key: 'salary',
              header: 'З/П (месяц)',
              align: 'right',
              render: (row) => {
                const amount = performanceByUser.get(row.id)?.payrollAmount;
                return amount === undefined ? '—' : formatMoney(parseMoney(amount));
              },
            },
            {
              key: 'presence',
              header: 'Сегодня',
              align: 'center',
              render: (row) => <PresenceBadge status={presenceOf(row.id)} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <EmployeeActions
                  employee={{
                    id: row.id,
                    fullName: row.fullName,
                    isActive: row.isActive,
                    roles: row.roles,
                  }}
                  onEdit={() => {
                    setEditing({
                      id: row.id,
                      fullName: row.fullName,
                      phone: row.phone,
                      jobTitle: row.jobTitle,
                      department: row.department,
                      employmentType: row.employmentType,
                      birthDate: row.birthDate,
                      hiredAt: row.hiredAt,
                      roles: row.roles,
                      branchIds: row.branchIds,
                      primaryBranchId: row.primaryBranchId,
                    });
                  }}
                />
              ),
            },
          ]}
        />

        {list.data !== undefined && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            pageSize={list.data.pageSize}
            onChange={setPage}
          />
        )}
      </Card>

      {/* --- Нижний ряд ------------------------------------------------------ */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Посещаемость (текущий месяц)" />
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
          <CardHeader title="Дисциплина (месяц)" />
          <CardBody className="flex flex-col items-center">
            {attendanceRate === null ? (
              <EmptyState message="Смен за этот месяц ещё не было" />
            ) : (
              <>
                <Gauge percent={attendanceRate} label="Средняя посещаемость" />
                <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted">
                  Считается по фактическим сменам. Показатели качества и
                  своевременности не выводятся: система их не измеряет.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Дни рождения (30 дней)" icon={<Cake className="h-4 w-4" />} />
        <CardBody>
          {birthdays.isLoading ? (
            <Skeleton className="h-20" />
          ) : birthdays.data === undefined || birthdays.data.length === 0 ? (
            <EmptyState
              message="Ближайших дней рождения нет"
              hint="Либо даты рождения ещё не заполнены в карточках сотрудников"
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {birthdays.data.map((entry) => (
                <li
                  key={entry.userId}
                  className="flex items-center gap-3 rounded border border-subtle bg-base/40 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-primary">
                      {entry.fullName}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {entry.jobTitle ?? '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] text-gold-soft">
                      {formatDate(entry.birthDate)}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {entry.daysUntil === 0
                        ? 'сегодня'
                        : `через ${entry.daysUntil.toString()} дн.`}
                    </span>
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

/** Выпадающий фильтр с пустым значением «все». */
function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}): ReactElement {
  return (
    <select
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      aria-label={placeholder}
      className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-gold-dim focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

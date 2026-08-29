'use client';

import { useState, type ReactElement } from 'react';

import { MONTH_NAMES_RU } from '@curtain-crm/shared';

import { LineSeries } from '@/components/charts/LineSeries';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { controlClass } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDuration, formatPercent } from '@/lib/utils';

/**
 * Отчёты: финансовый итог месяца, фонд зарплаты по году и выработка сотрудников.
 *
 * Всё считается на сервере агрегатами SQL. Выгрузка в Excel не реализована —
 * это отдельная задача (формирование файла и его доставка), и рисовать кнопку,
 * которая ничего не делает, здесь не стали.
 */
export default function ReportsPage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const period = { year, month };

  const finance = trpc.reports.finance.useQuery(period);
  const performance = trpc.reports.employeePerformance.useQuery(period);
  const payrollFund = trpc.reports.payrollFund.useQuery({ year });

  if (finance.isError) {
    return (
      <Card>
        <ErrorState
          message={finance.error.message}
          onRetry={() => {
            void finance.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Период отчёта"
          action={
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={(event) => {
                  setMonth(Number.parseInt(event.target.value, 10));
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
                }}
                aria-label="Год"
                className={controlClass('sm', 'w-auto pr-8')}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          }
        />
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {finance.isLoading || finance.data === undefined ? (
          Array.from({ length: 5 }, (_unused, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))
        ) : (
          <>
            <StatCard
              label="Закрыто заказов"
              value={finance.data.ordersCompleted.toString()}
              caption="За период"
            />
            <StatCard
              label="Выручка"
              value={finance.data.revenueFormatted}
              caption="Сумма работ по закрытым заказам"
            />
            <StatCard
              label="Закупки"
              value={finance.data.costFormatted}
              caption="Себестоимость материалов"
            />
            <StatCard
              label="Маржа"
              value={finance.data.marginFormatted}
              caption="Выручка минус закупки"
            />
            <StatCard
              label="Рентабельность"
              value={
                finance.data.marginPercent === null
                  ? '—'
                  : formatPercent(finance.data.marginPercent)
              }
              caption="Маржа к выручке"
            />
          </>
        )}
      </section>

      <Card>
        <CardHeader title={`Фонд заработной платы, ${year.toString()}`} />
        <CardBody>
          {payrollFund.isLoading || payrollFund.data === undefined ? (
            <Skeleton className="h-44" />
          ) : (
            <LineSeries
              current={payrollFund.data.map((entry) => ({
                x: entry.month,
                y: Math.round(entry.calculatedMinor / 100 / 1_000_000),
              }))}
              previous={payrollFund.data.map((entry) => ({
                x: entry.month,
                y: Math.round(entry.paidMinor / 100 / 1_000_000),
              }))}
              currentLabel="Начислено"
              previousLabel="Выплачено"
              formatValue={(value) => `${value.toString()} млн`}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Выработка сотрудников за месяц" />
        <DataTable
          isLoading={performance.isLoading}
          rows={performance.data ?? []}
          rowKey={(row) => row.userId}
          emptyMessage="За этот период закрытых заказов нет"
          columns={[
            {
              key: 'name',
              header: 'Сотрудник',
              render: (row) => <span className="text-primary">{row.fullName}</span>,
            },
            {
              key: 'seller',
              header: 'Как продавец',
              align: 'right',
              render: (row) => row.completedAsSeller,
            },
            {
              key: 'master',
              header: 'Как замерщик',
              align: 'right',
              render: (row) => row.completedAsMaster,
            },
            {
              key: 'sewer',
              header: 'Как швея',
              align: 'right',
              render: (row) => row.completedAsSewer,
            },
            { key: 'qc', header: 'Как ОТК', align: 'right', render: (row) => row.completedAsQc },
            {
              key: 'installer',
              header: 'Как установщик',
              align: 'right',
              render: (row) => row.completedAsInstaller,
            },
            {
              key: 'hours',
              header: 'Часов',
              align: 'right',
              render: (row) => (
                <span className="text-primary">{formatDuration(row.workedHours)}</span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}


'use client';

import { DEPARTMENTS, PresenceStatus } from '@curtain-crm/shared';
import { useMemo, type ReactElement } from 'react';

import { Donut, DonutLegend } from '@/components/charts/Donut';
import { departmentColor, departmentLabel } from '@/components/employees/palette';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatPercent } from '@/lib/utils';

/**
 * Ведомость по подразделениям.
 *
 * Сводка штата в разрезе подразделений: сколько числится, сколько вышло
 * сегодня и какая доля от всей компании. Все цифры — из тех же процедур,
 * что и на общем экране «Сотрудники», без отдельных вычислений на клиенте.
 */
export default function DepartmentPage(): ReactElement {
  const stats = trpc.users.stats.useQuery();
  const presence = trpc.users.presenceToday.useQuery();

  // Список берём целиком (штат мастерской заведомо помещается на одну
  // страницу такого размера), чтобы посчитать присутствие по подразделениям.
  const list = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true });

  const rows = useMemo(() => {
    const distributions = stats.data?.distributions;
    if (distributions === undefined) return [];

    const presenceMap = presence.data ?? {};
    const employees = list.data?.items ?? [];

    return DEPARTMENTS.map((department) => {
      const entry = distributions.byDepartment.find((item) => item.key === department);
      const inDepartment = employees.filter((employee) => employee.department === department);

      const atWork = inDepartment.filter(
        (employee) =>
          (presenceMap[employee.id.toString()]) ===
          PresenceStatus.AT_WORK,
      ).length;

      return {
        department,
        total: entry?.count ?? 0,
        percent: entry?.percent ?? 0,
        atWork,
        absent: Math.max(0, (entry?.count ?? 0) - atWork),
      };
    }).filter((row) => row.total > 0);
  }, [stats.data, presence.data, list.data]);

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

  const segments = rows.map((row) => ({
    key: row.department,
    label: departmentLabel(row.department),
    value: row.total,
    color: departmentColor(row.department),
  }));

  const total = stats.data?.distributions.total ?? 0;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <CardHeader title="Структура штата" />
        <CardBody>
          {stats.isLoading ? (
            <Skeleton className="h-56" />
          ) : (
            <>
              <Donut segments={segments} centerValue={total.toString()} centerLabel="Всего" />
              <div className="mt-4">
                <DonutLegend segments={segments} total={total} />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Подразделения" />
        <DataTable
          isLoading={stats.isLoading || list.isLoading}
          rows={rows}
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
                  <span className="text-primary">
                    {departmentLabel(row.department)}
                  </span>
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
                <span className={row.absent > 0 ? 'text-danger' : 'text-muted'}>{row.absent}</span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

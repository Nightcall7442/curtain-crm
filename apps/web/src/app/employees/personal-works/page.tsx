'use client';

import {
  PERSONAL_WORK_STATUS_LABELS_RU,
  PERSONAL_WORK_STATUSES,
  PersonalWorkStatus,
  type PersonalWorkStatus as PersonalWorkStatusName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { FilterBar, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

/**
 * Личные работы — что сотрудники шьют себе на оборудовании мастерской.
 *
 * Раздел только для чтения, и это не упущение: запись заводит сам сотрудник
 * со своего телефона, он же её закрывает. Руководству нужна не власть над
 * этими записями, а ответ на вопрос «почему машинка занята» — поэтому здесь
 * список и фильтр, но ни кнопки «создать», ни кнопки «закрыть за него».
 *
 * Учёт открытый намеренно: запрет не работает — люди всё равно шьют себе,
 * просто молча, и тогда занятый станок выглядит поломкой, а израсходованная
 * ткань — недостачей.
 */
export default function PersonalWorksPage(): ReactElement {
  const [status, setStatus] = useState<PersonalWorkStatusName | ''>(
    PersonalWorkStatus.IN_PROGRESS,
  );

  const query = trpc.personalWorks.list.useQuery({
    page: 1,
    pageSize: 100,
    ...(status === '' ? {} : { status }),
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
        title="Личные работы"
        action={
          <FilterBar>
            <Select
              size="sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PersonalWorkStatusName | '');
              }}
              aria-label="Статус работы"
              className="w-auto"
              placeholder="Все статусы"
              options={PERSONAL_WORK_STATUSES.map((value) => ({
                value,
                label: PERSONAL_WORK_STATUS_LABELS_RU[value],
              }))}
            />
          </FilterBar>
        }
      />

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage={
          status === PersonalWorkStatus.IN_PROGRESS
            ? 'Сейчас цех личными работами не занят'
            : 'Работ с таким статусом нет'
        }
        columns={[
          {
            key: 'employee',
            header: 'Сотрудник',
            sortValue: (row) => row.userFullName,
            render: (row) => <span className="text-primary">{row.userFullName}</span>,
          },
          {
            key: 'title',
            header: 'Что делает',
            sortValue: (row) => row.title,
            render: (row) => (
              <span className="block max-w-[24rem]">
                <span className="block text-primary">{row.title}</span>
                {row.details !== null && (
                  <span className="block truncate text-footnote text-muted" title={row.details}>
                    {row.details}
                  </span>
                )}
                {row.cancellationReason !== null && (
                  <span className="block text-footnote text-danger">
                    {`Причина отмены: ${row.cancellationReason}`}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => (
              <Badge
                tone={
                  row.status === PersonalWorkStatus.DONE
                    ? 'positive'
                    : row.status === PersonalWorkStatus.CANCELLED
                      ? 'neutral'
                      : 'warning'
                }
              >
                {PERSONAL_WORK_STATUS_LABELS_RU[row.status]}
              </Badge>
            ),
          },
          {
            key: 'started',
            header: 'Начата',
            sortValue: (row) => row.createdAt.getTime(),
            render: (row) => (
              <span className="whitespace-nowrap text-secondary">
                {formatDateTime(row.createdAt)}
              </span>
            ),
          },
          {
            key: 'closed',
            header: 'Закрыта',
            sortValue: (row) => row.closedAt?.getTime() ?? 0,
            render: (row) => (
              <span className="whitespace-nowrap text-secondary">
                {row.closedAt === null ? '—' : formatDateTime(row.closedAt)}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

'use client';

import { formatMoney, parseMoney, todayIso } from '@curtain-crm/shared';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, FilterBar, Input } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

/**
 * Архив терминальных чеков.
 *
 * «Касса» показывает чеки одного дня; здесь — любой период одной таблицей
 * и выгрузка в Excel: владелец сверяет терминал с банком и налоговой не по
 * дням, а за месяц. В файл идут те же колонки, что на экране, плюс ссылка
 * на фото — по ней чек открывается и из таблицы.
 */
const HEADERS = ['Дата и время', 'Сотрудник', 'Сумма', 'Комментарий', 'Фото'] as const;

function monthStart(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

export default function TerminalArchivePage(): ReactElement {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);

  const query = trpc.terminalChecks.list.useQuery({ from, to }, { enabled: to >= from });
  const rows = query.data ?? [];
  const total = rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);

  const exportRows = (): void => {
    void exportToXlsx({
      fileName: `terminal-${from}_${to}.xlsx`,
      sheetName: 'Терминальные чеки',
      headers: HEADERS,
      rows: rows.map((row) => [
        formatDateTime(row.createdAt),
        row.fullName,
        parseMoney(row.amount).toString(),
        row.comment ?? '',
        row.photoUrl,
      ]),
    })
      .then(() => {
        toast.success('Файл сохранён', `Чеков: ${rows.length.toString()}`);
      })
      .catch((error: unknown) => {
        toast.error('Не удалось выгрузить', error instanceof Error ? error.message : String(error));
      });
  };

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
        title="Терминальные чеки — архив"
        action={
          <FilterBar>
            <Input
              type="date"
              size="sm"
              value={from}
              max={to}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
              aria-label="С"
              className="w-auto"
            />
            <Input
              type="date"
              size="sm"
              value={to}
              min={from}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              aria-label="По"
              className="w-auto"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="h-3.5 w-3.5" aria-hidden />}
              disabled={rows.length === 0}
              onClick={exportRows}
            >
              Excel
            </Button>
          </FilterBar>
        }
      />
      <DataTable
        isLoading={query.isLoading}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="За этот период чеков нет"
        columns={[
          {
            key: 'when',
            header: 'Дата и время',
            sortValue: (row) => new Date(row.createdAt).getTime(),
            render: (row) => formatDateTime(row.createdAt),
          },
          {
            key: 'who',
            header: 'Сотрудник',
            sortValue: (row) => row.fullName,
            render: (row) => <span className="text-primary">{row.fullName}</span>,
          },
          {
            key: 'amount',
            header: 'Сумма',
            align: 'right',
            sortValue: (row) => parseMoney(row.amount),
            render: (row) => (
              <span className="tabular-nums font-semibold">{formatMoney(parseMoney(row.amount))}</span>
            ),
          },
          {
            key: 'comment',
            header: 'Комментарий',
            render: (row) => row.comment ?? <span className="text-muted">—</span>,
          },
          {
            key: 'photo',
            header: 'Фото',
            render: (row) => (
              <a
                href={row.photoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                Открыть
              </a>
            ),
          },
        ]}
      />
      {rows.length > 0 && (
        <p className="px-5 pb-4 text-caption text-secondary">
          {`Чеков: ${rows.length.toString()} · Итого: `}
          <strong className="tabular-nums">{formatMoney(total)}</strong>
        </p>
      )}
    </Card>
  );
}

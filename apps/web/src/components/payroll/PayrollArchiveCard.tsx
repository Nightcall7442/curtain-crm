'use client';

import {
  formatMoney,
  MONTH_NAMES_RU,
  parseMoney,
  PAYROLL_RECORD_STATUS_LABELS_RU,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, controlClass } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

const HEADERS = [
  'Период',
  'Сотрудник',
  'Роль',
  'Начислено',
  'Выплачено',
  'Статус',
  'Утверждено',
  'Выплачено, дата',
  'Получение подтверждено',
  'Комментарий',
] as const;

/** Годы для фильтра: текущий и два назад — архив глубже пока некуда. */
function years(): readonly number[] {
  const now = new Date().getFullYear();
  return [now, now - 1, now - 2];
}

/**
 * Архив ведомостей: все месяцы в одной таблице, с выгрузкой в Excel.
 *
 * Владелец сверяет выплаты с бухгалтерией на своей стороне и просил архив
 * зарплат с выгрузкой: открывать страницу месяц за месяцем ради этого
 * незачем. Фильтр по году — чтобы таблица не росла бесконечно.
 */
export function PayrollArchiveCard(): ReactElement {
  const toast = useToast();
  const [year, setYear] = useState<number | 'all'>(new Date().getFullYear());

  const archive = trpc.payroll.archive.useQuery(year === 'all' ? {} : { year });
  const rows = archive.data ?? [];
  const calculated = rows.reduce((sum, row) => sum + parseMoney(row.calculatedAmount), 0);
  const paid = rows.reduce((sum, row) => sum + parseMoney(row.paidAmount), 0);

  const period = (row: (typeof rows)[number]): string =>
    `${MONTH_NAMES_RU[row.periodMonth - 1] ?? ''} ${row.periodYear.toString()}`;

  const exportRows = (): void => {
    void exportToXlsx({
      fileName: `payroll-archive-${year === 'all' ? 'all' : year.toString()}.xlsx`,
      sheetName: 'Ведомости',
      headers: HEADERS,
      rows: rows.map((row) => [
        period(row),
        row.userFullName,
        ROLE_LABELS_RU[row.role],
        parseMoney(row.calculatedAmount).toString(),
        parseMoney(row.paidAmount).toString(),
        PAYROLL_RECORD_STATUS_LABELS_RU[row.status],
        row.approvedAt === null ? '' : formatDate(row.approvedAt),
        row.paidAt === null ? '' : formatDate(row.paidAt),
        row.receiptConfirmedAt === null ? '' : formatDate(row.receiptConfirmedAt),
        row.comment ?? '',
      ]),
    })
      .then(() => {
        toast.success('Файл сохранён', `Строк: ${rows.length.toString()}`);
      })
      .catch((error: unknown) => {
        toast.error('Не удалось выгрузить', error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <Card>
      <CardHeader
        title="Архив ведомостей"
        action={
          <div className="flex items-center gap-2">
            <select
              value={year === 'all' ? 'all' : year.toString()}
              onChange={(event) => {
                setYear(event.target.value === 'all' ? 'all' : Number.parseInt(event.target.value, 10));
              }}
              className={controlClass('sm')}
            >
              {years().map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value="all">Все годы</option>
            </select>
            <Button variant="secondary" size="sm" onClick={exportRows} disabled={rows.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Excel
            </Button>
          </div>
        }
      />
      {rows.length > 0 && (
        <CardBody>
          <p className="text-caption text-primary">
            {`Начислено ${formatMoney(calculated)} · выплачено ${formatMoney(paid)} · ведомостей ${rows.length.toString()}`}
          </p>
        </CardBody>
      )}
      <DataTable
        isLoading={archive.isLoading}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="Ведомостей за этот период нет"
        columns={[
          { key: 'period', header: 'Период', render: (row) => <span className="text-primary">{period(row)}</span> },
          { key: 'name', header: 'Сотрудник', render: (row) => row.userFullName },
          { key: 'role', header: 'Роль', render: (row) => ROLE_LABELS_RU[row.role] },
          {
            key: 'calculated',
            header: 'Начислено',
            align: 'right',
            render: (row) => formatMoney(parseMoney(row.calculatedAmount)),
          },
          {
            key: 'paid',
            header: 'Выплачено',
            align: 'right',
            render: (row) => <span className="text-primary">{formatMoney(parseMoney(row.paidAmount))}</span>,
          },
          { key: 'status', header: 'Статус', render: (row) => PAYROLL_RECORD_STATUS_LABELS_RU[row.status] },
          {
            key: 'paidAt',
            header: 'Выплачено, дата',
            render: (row) => (row.paidAt === null ? '—' : formatDate(row.paidAt)),
          },
          {
            key: 'receipt',
            header: 'Получение',
            render: (row) => (row.receiptConfirmedAt === null ? '—' : formatDate(row.receiptConfirmedAt)),
          },
        ]}
      />
    </Card>
  );
}

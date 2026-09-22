'use client';

import { formatMoney, ORDER_STATUS_LABELS_RU, type OrderStatus } from '@curtain-crm/shared';
import { Download } from 'lucide-react';
import type { ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

const HEADERS = ['Дата', 'Документ', 'Клиент', 'Продавец', 'Цена до скидки', 'Скидка', 'Причина', 'Статус'] as const;

/** Статус строки: у заказа — его статус, у чека витрины статусов нет. */
const statusOf = (row: { readonly kind: 'order' | 'retail'; readonly status: OrderStatus | null }): string =>
  row.status === null ? 'Продажа с витрины' : ORDER_STATUS_LABELS_RU[row.status];

/** Первый и последний день месяца — границы отчёта, `YYYY-MM-DD`. */
function monthRange(year: number, month: number): { readonly from: string; readonly to: string } {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year.toString()}-${pad(month)}-01`, to: `${year.toString()}-${pad(month)}-${pad(lastDay)}` };
}

/**
 * Скидки за месяц: кто, кому, сколько и за что.
 *
 * Контроль продавцов: скидка — деньги, которых касса не увидит, и владелец
 * хочет видеть их списком, а не догадываться по марже. В одной таблице и
 * заказы, и чеки витрины: уступку за метром тюля он ищет там же, где
 * скидку на заказ. Сверху — итог и разбивка по продавцам.
 */
export function DiscountsReportCard({ year, month }: { readonly year: number; readonly month: number }): ReactElement {
  const toast = useToast();
  const range = monthRange(year, month);
  const report = trpc.reports.discounts.useQuery(range);
  const rows = report.data?.rows ?? [];

  const exportRows = (): void => {
    void exportToXlsx({
      fileName: `discounts-${range.from}_${range.to}.xlsx`,
      sheetName: 'Скидки',
      headers: HEADERS,
      rows: rows.map((row) => [
        formatDateTime(row.createdAt),
        row.number ?? '',
        row.clientName,
        row.sellerName,
        (row.priceBefore / 100).toString(),
        (row.discountMinor / 100).toString(),
        row.discountReason ?? '',
        statusOf(row),
      ]),
    })
      .then(() => {
        toast.success('Файл сохранён', `Скидок: ${rows.length.toString()}`);
      })
      .catch((error: unknown) => {
        toast.error('Не удалось выгрузить', error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <Card>
      <CardHeader
        title="Скидки за месяц"
        action={
          <Button variant="secondary" size="sm" onClick={exportRows} disabled={rows.length === 0}>
            <Download className="h-4 w-4" aria-hidden />
            Excel
          </Button>
        }
      />
      {report.data !== undefined && report.data.rows.length > 0 && (
        <CardBody>
          <p className="text-caption text-primary">
            {`Всего скидок: ${formatMoney(report.data.totalMinor)} по ${report.data.rows.length.toString()} заказам`}
          </p>
          <p className="mt-1 text-footnote text-secondary">
            {report.data.bySeller
              .map((entry) => `${entry.sellerName} — ${formatMoney(entry.totalMinor)} (${entry.count.toString()})`)
              .join(' · ')}
          </p>
        </CardBody>
      )}
      <DataTable
        isLoading={report.isLoading}
        rows={rows}
        rowKey={(row) => `${row.kind}-${row.id.toString()}`}
        emptyMessage="За этот месяц скидок не давали"
        columns={[
          { key: 'date', header: 'Дата', render: (row) => formatDateTime(row.createdAt) },
          { key: 'order', header: 'Документ', render: (row) => <span className="text-primary">{row.number}</span> },
          { key: 'client', header: 'Клиент', render: (row) => (row.clientName === '' ? '—' : row.clientName) },
          { key: 'seller', header: 'Продавец', render: (row) => row.sellerName },
          { key: 'price', header: 'Цена до скидки', align: 'right', render: (row) => formatMoney(row.priceBefore) },
          {
            key: 'discount',
            header: 'Скидка',
            align: 'right',
            render: (row) => <span className="text-primary">{`−${formatMoney(row.discountMinor)}`}</span>,
          },
          { key: 'reason', header: 'Причина', render: (row) => row.discountReason ?? '—' },
          { key: 'status', header: 'Статус', render: (row) => statusOf(row) },
        ]}
      />
    </Card>
  );
}

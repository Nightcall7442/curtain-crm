'use client';

import { formatMoney, ORDER_STATUS_LABELS_RU, parseMoney } from '@curtain-crm/shared';
import { Download } from 'lucide-react';
import type { ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

const HEADERS = ['Дата', 'Заказ', 'Клиент', 'Продавец', 'Цена до скидки', 'Скидка', 'Причина', 'Статус'] as const;

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
 * хочет видеть их списком, а не догадываться по марже. Сверху — итог и
 * разбивка по продавцам, ниже — каждый заказ; всё выгружается в Excel.
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
        row.orderNumber ?? '',
        row.clientName,
        row.sellerName,
        (parseMoney(row.workPrice) + parseMoney(row.discountAmount)).toString(),
        parseMoney(row.discountAmount).toString(),
        row.discountReason ?? '',
        ORDER_STATUS_LABELS_RU[row.status],
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
        rowKey={(row) => row.id}
        emptyMessage="За этот месяц скидок не давали"
        columns={[
          { key: 'date', header: 'Дата', render: (row) => formatDateTime(row.createdAt) },
          { key: 'order', header: 'Заказ', render: (row) => <span className="text-primary">{row.orderNumber}</span> },
          { key: 'client', header: 'Клиент', render: (row) => row.clientName },
          { key: 'seller', header: 'Продавец', render: (row) => row.sellerName },
          {
            key: 'price',
            header: 'Цена до скидки',
            align: 'right',
            render: (row) => formatMoney(parseMoney(row.workPrice) + parseMoney(row.discountAmount)),
          },
          {
            key: 'discount',
            header: 'Скидка',
            align: 'right',
            render: (row) => <span className="text-primary">{`−${formatMoney(parseMoney(row.discountAmount))}`}</span>,
          },
          { key: 'reason', header: 'Причина', render: (row) => row.discountReason ?? '—' },
          { key: 'status', header: 'Статус', render: (row) => ORDER_STATUS_LABELS_RU[row.status] },
        ]}
      />
    </Card>
  );
}

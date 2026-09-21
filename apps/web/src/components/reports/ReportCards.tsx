'use client';

import {
  formatDisciplinePoints,
  formatMoney,
  MONTH_NAMES_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  ROLE_LABELS_RU,
  SEWER_CATEGORY_LABELS_RU,
} from '@curtain-crm/shared';
import { Download } from 'lucide-react';
import type { ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { formatDate, formatDuration, formatPercent } from '@/lib/utils';

/**
 * Четыре отчёта «более детально», которые попросил владелец. Каждый — одна
 * карточка на странице отчётов за выбранный месяц, с выгрузкой в Excel.
 * Цифры считает сервер (`reports.service`), здесь только таблицы.
 */

interface Period {
  readonly year: number;
  readonly month: number;
}

/** Первый и последний день месяца, `YYYY-MM-DD`. */
function monthRange({ year, month }: Period): { readonly from: string; readonly to: string } {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year.toString()}-${pad(month)}-01`, to: `${year.toString()}-${pad(month)}-${pad(lastDay)}` };
}

const sum = (minor: number): string => (minor / 100).toString();

/** Кнопка выгрузки: одна на все карточки, с тостом об итоге. */
function ExportButton({
  fileName,
  sheetName,
  headers,
  rows,
}: {
  readonly fileName: string;
  readonly sheetName: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}): ReactElement {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={rows.length === 0}
      onClick={() => {
        exportToXlsx({ fileName, sheetName, headers, rows })
          .then(() => {
            toast.success('Файл сохранён', `Строк: ${rows.length.toString()}`);
          })
          .catch((error: unknown) => {
            toast.error('Не удалось выгрузить', error instanceof Error ? error.message : String(error));
          });
      }}
    >
      <Download className="h-4 w-4" aria-hidden />
      Excel
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Касса по дням                                                             */
/* -------------------------------------------------------------------------- */

export function CashByDayCard({ period }: { readonly period: Period }): ReactElement {
  const range = monthRange(period);
  const report = trpc.reports.cashByDay.useQuery(range);
  const days = report.data?.days ?? [];
  const sellers = report.data?.bySeller ?? [];
  const methodHeaders = PAYMENT_METHODS.map((method) => PAYMENT_METHOD_LABELS_RU[method]);

  return (
    <Card>
      <CardHeader
        title="Касса по дням и способам оплаты"
        action={
          <ExportButton
            fileName={`cash-${range.from}_${range.to}.xlsx`}
            sheetName="Касса по дням"
            headers={['День', ...methodHeaders, 'Итого', 'Возвраты']}
            rows={[
              ...days.map((row) => [
                formatDate(row.day),
                ...PAYMENT_METHODS.map((method) => sum(row.byMethod[method])),
                sum(row.total),
                sum(row.refunds),
              ]),
              ...sellers.map((row) => [
                `Продавец: ${row.fullName}`,
                ...PAYMENT_METHODS.map((method) => sum(row.byMethod[method])),
                sum(row.total),
                '',
              ]),
            ]}
          />
        }
      />
      {report.data !== undefined && (
        <CardBody>
          <p className="text-caption text-primary">
            {`За месяц: ${formatMoney(report.data.totals.total)}`}
            {report.data.totals.refunds > 0 && ` · возвраты ${formatMoney(report.data.totals.refunds)}`}
          </p>
          <p className="mt-1 text-footnote text-secondary">
            {PAYMENT_METHODS.map((method) => `${PAYMENT_METHOD_LABELS_RU[method]} ${formatMoney(report.data?.totals.byMethod[method] ?? 0)}`).join(' · ')}
          </p>
        </CardBody>
      )}
      <DataTable
        isLoading={report.isLoading}
        rows={days}
        rowKey={(row) => row.day}
        emptyMessage="За этот месяц приходов нет"
        columns={[
          { key: 'day', header: 'День', render: (row) => <span className="text-primary">{formatDate(row.day)}</span> },
          ...PAYMENT_METHODS.map((method) => ({
            key: method,
            header: PAYMENT_METHOD_LABELS_RU[method],
            align: 'right' as const,
            render: (row: (typeof days)[number]) => (row.byMethod[method] === 0 ? '—' : formatMoney(row.byMethod[method])),
          })),
          { key: 'total', header: 'Итого', align: 'right', render: (row) => <span className="text-primary">{formatMoney(row.total)}</span> },
          { key: 'refunds', header: 'Возвраты', align: 'right', render: (row) => (row.refunds === 0 ? '—' : `−${formatMoney(row.refunds)}`) },
        ]}
      />
      {sellers.length > 0 && (
        <>
          <CardHeader title="По продавцам" />
          <DataTable
            rows={sellers}
            rowKey={(row) => row.userId}
            emptyMessage=""
            columns={[
              { key: 'name', header: 'Кто принял', render: (row) => <span className="text-primary">{row.fullName}</span> },
              ...PAYMENT_METHODS.map((method) => ({
                key: method,
                header: PAYMENT_METHOD_LABELS_RU[method],
                align: 'right' as const,
                render: (row: (typeof sellers)[number]) => (row.byMethod[method] === 0 ? '—' : formatMoney(row.byMethod[method])),
              })),
              { key: 'total', header: 'Итого', align: 'right', render: (row) => <span className="text-primary">{formatMoney(row.total)}</span> },
            ]}
          />
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Зарплата: из чего сложилась                                               */
/* -------------------------------------------------------------------------- */

export function PayrollBreakdownCard({ period }: { readonly period: Period }): ReactElement {
  const report = trpc.reports.payrollBreakdown.useQuery(period);
  // В таблице — только те, кому есть что считать; у кого условий нет — строкой ниже, а не 15 пустых строк.
  const rows = (report.data ?? []).filter((row) => row.schemeType !== null);
  const unpaid = (report.data ?? []).filter((row) => row.schemeType === null);
  const total = rows.reduce((acc, row) => acc + row.amount, 0);

  return (
    <Card>
      <CardHeader
        title="Зарплата: из чего сложилась"
        action={
          <ExportButton
            fileName={`payroll-${period.year.toString()}-${period.month.toString().padStart(2, '0')}.xlsx`}
            sheetName="Зарплата"
            headers={['Сотрудник', 'Роль', 'Схема', 'Часов', 'Заказов', 'Сдельные', 'Дисциплина', 'Категория', 'Итого', 'Расшифровка']}
            rows={rows.map((row) => [
              row.fullName,
              ROLE_LABELS_RU[row.role],
              row.schemeType === null ? (row.problem ?? '—') : PAYROLL_SCHEME_TYPE_LABELS_RU[row.schemeType],
              row.workedHours.toFixed(1),
              row.completedOrders.toString(),
              sum(row.stageFeesAmount),
              formatDisciplinePoints(row.disciplinePoints),
              row.sewerCategory === null ? '' : SEWER_CATEGORY_LABELS_RU[row.sewerCategory],
              sum(row.amount),
              row.lines.map((line) => `${line.label}: ${sum(line.amount)}`).join('; '),
            ])}
          />
        }
      />
      {report.data !== undefined && (
        <CardBody>
          <p className="text-caption text-primary">{`Фонд за месяц: ${formatMoney(total)} · ${rows.length.toString()} начислений`}</p>
          {unpaid.length > 0 && (
            <p className="mt-1 text-footnote text-muted">
              {`Без условий оплаты (${unpaid.length.toString()}): ${unpaid
                .map((row) => `${row.fullName} — ${ROLE_LABELS_RU[row.role]}`)
                .join(', ')}`}
            </p>
          )}
        </CardBody>
      )}
      <DataTable
        isLoading={report.isLoading}
        rows={rows}
        rowKey={(row) => `${row.userId.toString()}-${row.role}`}
        emptyMessage="Условия оплаты никому не назначены"
        columns={[
          {
            key: 'name',
            header: 'Сотрудник',
            render: (row) => (
              <span className="block">
                <span className="block text-primary">{row.fullName}</span>
                <span className="block text-overline text-muted">
                  {ROLE_LABELS_RU[row.role]}
                  {row.sewerCategory !== null && ` · ${SEWER_CATEGORY_LABELS_RU[row.sewerCategory]}`}
                </span>
              </span>
            ),
          },
          { key: 'scheme', header: 'Схема', render: (row) => (row.schemeType === null ? '—' : PAYROLL_SCHEME_TYPE_LABELS_RU[row.schemeType]) },
          { key: 'hours', header: 'Часов', align: 'right', render: (row) => (row.workedHours === 0 ? '—' : formatDuration(row.workedHours)) },
          { key: 'orders', header: 'Заказов', align: 'right', render: (row) => row.completedOrders },
          {
            key: 'discipline',
            header: 'Дисциплина',
            align: 'right',
            render: (row) =>
              row.disciplinePoints === 0 ? '—' : (
                <span className={row.disciplinePoints < 0 ? 'text-danger' : 'text-positive'}>{formatDisciplinePoints(row.disciplinePoints)}</span>
              ),
          },
          {
            key: 'lines',
            header: 'Из чего',
            render: (row) => (
              <span className="block text-footnote text-secondary">
                {row.lines.map((line) => (
                  <span key={line.label} className="block">{`${line.label}: ${formatMoney(line.amount)}`}</span>
                ))}
              </span>
            ),
          },
          { key: 'amount', header: 'Итого', align: 'right', render: (row) => <span className="text-primary">{formatMoney(row.amount)}</span> },
        ]}
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Сроки и переделки                                                          */
/* -------------------------------------------------------------------------- */

export function DeadlinesCard({ period }: { readonly period: Period }): ReactElement {
  const report = trpc.reports.deadlines.useQuery(period);
  const data = report.data;
  const late = data?.lateOrders ?? [];

  return (
    <Card>
      <CardHeader
        title="Заказы: сроки и переделки"
        action={
          <ExportButton
            fileName={`deadlines-${period.year.toString()}-${period.month.toString().padStart(2, '0')}.xlsx`}
            sheetName="Просрочки"
            headers={['Заказ', 'Клиент', 'Срок', 'Закрыт', 'Дней просрочки', 'Швея', 'Установщик']}
            rows={late.map((row) => [
              row.orderNumber ?? '',
              row.clientName,
              formatDate(row.deadline),
              formatDate(row.completedAt),
              row.lateDays.toString(),
              row.sewerName ?? '',
              row.installerName ?? '',
            ])}
          />
        }
      />
      {data !== undefined && (
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Закрыто" value={data.completed.toString()} caption="За месяц" />
            <StatCard label="В срок" value={data.onTime.toString()} caption="Из тех, у кого срок задан" />
            <StatCard label="С опозданием" value={data.late.toString()} caption={data.avgLateDays === null ? 'Просрочек нет' : `В среднем ${data.avgLateDays.toString()} дн.`} />
            <StatCard label="Без срока" value={data.withoutDeadline.toString()} caption="Срок не был задан" />
            <StatCard label="Переделок" value={data.reworks.toString()} caption="Возвратов с контроля" />
            <StatCard
              label="Точность"
              value={data.onTime + data.late === 0 ? '—' : formatPercent((data.onTime / (data.onTime + data.late)) * 100)}
              caption="Доля закрытых в срок"
            />
          </div>
        </CardBody>
      )}
      <DataTable
        isLoading={report.isLoading}
        rows={late}
        rowKey={(row) => row.id}
        emptyMessage="Просроченных заказов за месяц нет"
        columns={[
          { key: 'order', header: 'Заказ', render: (row) => <span className="text-primary">{row.orderNumber}</span> },
          { key: 'client', header: 'Клиент', render: (row) => row.clientName },
          { key: 'deadline', header: 'Срок', render: (row) => formatDate(row.deadline) },
          { key: 'completed', header: 'Закрыт', render: (row) => formatDate(row.completedAt) },
          { key: 'late', header: 'Просрочка', align: 'right', render: (row) => <span className="text-danger">{`${row.lateDays.toString()} дн.`}</span> },
          { key: 'sewer', header: 'Швея', render: (row) => row.sewerName ?? '—' },
          { key: 'installer', header: 'Установщик', render: (row) => row.installerName ?? '—' },
        ]}
      />
      {data !== undefined && data.bySewer.length > 0 && (
        <>
          <CardHeader title="По швеям" />
          <DataTable
            rows={data.bySewer}
            rowKey={(row) => row.userId}
            emptyMessage=""
            columns={[
              { key: 'name', header: 'Швея', render: (row) => <span className="text-primary">{row.fullName}</span> },
              { key: 'sewn', header: 'Сшито', align: 'right', render: (row) => row.sewn },
              { key: 'reworks', header: 'Переделок', align: 'right', render: (row) => (row.reworks === 0 ? '—' : <span className="text-danger">{row.reworks}</span>) },
              { key: 'late', header: 'С опозданием', align: 'right', render: (row) => (row.late === 0 ? '—' : <span className="text-danger">{row.late}</span>) },
            ]}
          />
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Швеи: выработка и категория                                                */
/* -------------------------------------------------------------------------- */

export function SewerOutputCard({ period }: { readonly period: Period }): ReactElement {
  const report = trpc.reports.sewerOutput.useQuery(period);
  const rows = report.data?.rows ?? [];
  const history = report.data?.history ?? [];
  const monthLabel = (entry: Period): string => `${MONTH_NAMES_RU[entry.month - 1]?.slice(0, 3) ?? ''} ${entry.year.toString().slice(2)}`;

  return (
    <Card>
      <CardHeader
        title="Швеи: выработка и категория"
        action={
          <ExportButton
            fileName={`sewers-${period.year.toString()}-${period.month.toString().padStart(2, '0')}.xlsx`}
            sheetName="Швеи"
            headers={['Швея', 'Категория', 'Сшито', 'м²', 'Качество, %', 'Сроки, %', 'Балл', 'Дисциплина', ...history.map((entry) => `${monthLabel(entry.period)}, заказов`)]}
            rows={rows.map((row) => [
              row.fullName,
              row.category === null ? '' : SEWER_CATEGORY_LABELS_RU[row.category],
              row.ordersCount.toString(),
              row.areaM2.toString(),
              row.qualityPercent === null ? '' : row.qualityPercent.toString(),
              row.punctualityPercent === null ? '' : row.punctualityPercent.toString(),
              row.score === null ? '' : row.score.toString(),
              formatDisciplinePoints(row.disciplinePoints),
              ...history.map((entry) => (entry.rows.find((cell) => cell.userId === row.userId)?.ordersCount ?? 0).toString()),
            ])}
          />
        }
      />
      <DataTable
        isLoading={report.isLoading}
        rows={rows}
        rowKey={(row) => row.userId}
        emptyMessage="Швей в штате нет"
        columns={[
          {
            key: 'name',
            header: 'Швея',
            render: (row) => (
              <span className="block">
                <span className="block text-primary">{row.fullName}</span>
                <span className="block text-overline text-muted">{row.category === null ? '—' : SEWER_CATEGORY_LABELS_RU[row.category]}</span>
              </span>
            ),
          },
          { key: 'orders', header: 'Сшито', align: 'right', render: (row) => row.ordersCount },
          { key: 'area', header: 'м²', align: 'right', render: (row) => (row.areaM2 === 0 ? '—' : row.areaM2) },
          { key: 'quality', header: 'Качество', align: 'right', render: (row) => (row.qualityPercent === null ? '—' : formatPercent(row.qualityPercent)) },
          { key: 'punctuality', header: 'Сроки', align: 'right', render: (row) => (row.punctualityPercent === null ? '—' : formatPercent(row.punctualityPercent)) },
          {
            key: 'discipline',
            header: 'Дисциплина',
            align: 'right',
            render: (row) =>
              row.disciplinePoints === 0 ? '—' : (
                <span className={row.disciplinePoints < 0 ? 'text-danger' : 'text-positive'}>{formatDisciplinePoints(row.disciplinePoints)}</span>
              ),
          },
          { key: 'score', header: 'Балл', align: 'right', render: (row) => <span className="text-primary">{row.score ?? '—'}</span> },
          ...history.slice(1).map((entry) => ({
            key: `${entry.period.year.toString()}-${entry.period.month.toString()}`,
            header: monthLabel(entry.period),
            align: 'right' as const,
            render: (row: (typeof rows)[number]) => {
              const cell = entry.rows.find((item) => item.userId === row.userId);
              return cell === undefined || cell.ordersCount === 0 ? '—' : `${cell.ordersCount.toString()} · ${cell.areaM2.toString()} м²`;
            },
          })),
        ]}
      />
    </Card>
  );
}

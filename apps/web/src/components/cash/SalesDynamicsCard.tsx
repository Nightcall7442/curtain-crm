'use client';

import { formatMoney, PAYMENT_METHOD_LABELS_RU, PAYMENT_METHODS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { LineSeries } from '@/components/charts/LineSeries';
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { trpc } from '@/lib/trpc';
import { formatPercent } from '@/lib/utils';

/** Границы месяца, которому принадлежит день, и того же по счёту прошлого. */
function months(day: string): {
  readonly current: { from: string; to: string };
  readonly previous: { from: string; to: string };
  readonly daysInMonth: number;
} {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const date = new Date(`${day}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const range = (y: number, m: number): { from: string; to: string } => ({
    from: `${y.toString()}-${pad(m)}-01`,
    to: `${y.toString()}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`,
  });
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return {
    current: range(year, month),
    previous: range(prev.y, prev.m),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

const millions = (minor: number): number => Math.round(minor / 100 / 1_000) / 1_000;

/**
 * Динамика продаж и метрики месяца — на странице кассы.
 *
 * Владелец считает кассу здесь же и просил видеть, как идут продажи: линия
 * по дням против того же месяца год назад — нет, против прошлого месяца:
 * сезон в шторах короткий, и сравнивать сентябрь с августом полезнее, чем
 * с сентябрём. Метрики — те, что отвечают на «сколько и чем платят».
 */
export function SalesDynamicsCard({ day }: { readonly day: string }): ReactElement {
  const { current, previous, daysInMonth } = months(day);
  const now = trpc.reports.cashByDay.useQuery(current);
  const past = trpc.reports.cashByDay.useQuery(previous);

  const dayNumber = (row: { day: string }): number => Number.parseInt(row.day.slice(8), 10);
  const series = (rows: readonly { day: string; total: number }[]): { x: number; y: number }[] =>
    rows.map((row) => ({ x: dayNumber(row), y: millions(row.total) }));

  const total = now.data?.totals.total ?? 0;
  const count = now.data?.totals.count ?? 0;
  const previousTotal = past.data?.totals.total ?? 0;
  const workedDays = now.data?.days.length ?? 0;
  const best = (now.data?.days ?? []).reduce<{ day: string; total: number } | null>(
    (top, row) => (top === null || row.total > top.total ? { day: row.day, total: row.total } : top),
    null,
  );
  const cashless = PAYMENT_METHODS.filter((method) => method !== 'cash').reduce(
    (sum, method) => sum + (now.data?.totals.byMethod[method] ?? 0),
    0,
  );
  const growth = previousTotal === 0 ? null : Math.round(((total - previousTotal) / previousTotal) * 1000) / 10;

  return (
    <Card>
      <CardHeader
        title="Динамика продаж"
        action={
          <span className="text-footnote text-muted">
            {`${current.from.slice(0, 7)} против ${previous.from.slice(0, 7)}`}
          </span>
        }
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="За месяц"
            value={formatMoney(total)}
            caption={growth === null ? 'Прошлый месяц пуст' : `Прошлый: ${formatMoney(previousTotal)}`}
            {...(growth === null ? {} : { deltaPercent: growth })}
          />
          <StatCard
            label="Средний день"
            value={formatMoney(workedDays === 0 ? 0 : Math.round(total / workedDays))}
            caption={`Дней с продажами: ${workedDays.toString()} из ${daysInMonth.toString()}`}
          />
          <StatCard
            label="Средний чек"
            value={formatMoney(count === 0 ? 0 : Math.round(total / count))}
            caption={`Операций: ${count.toString()}`}
          />
          <StatCard
            label="Лучший день"
            value={best === null ? '—' : formatMoney(best.total)}
            caption={best === null ? 'Продаж пока нет' : best.day.split('-').reverse().join('.')}
          />
          <StatCard
            label="Безнал"
            value={total === 0 ? '—' : formatPercent((cashless / total) * 100)}
            caption={`${formatMoney(cashless)} картой, QR и Click`}
          />
        </div>

        <div className="mt-4">
          {now.isLoading || past.isLoading ? (
            <Skeleton className="h-44" />
          ) : (
            <LineSeries
              current={series(now.data?.days ?? [])}
              previous={series(past.data?.days ?? [])}
              currentLabel="Этот месяц"
              previousLabel="Прошлый месяц"
              formatValue={(value) => `${value.toString()} млн`}
              formatX={(value) => value.toString()}
              ticks={Array.from({ length: daysInMonth }, (_, index) => index + 1).filter(
                (value) => value === 1 || value % 5 === 0,
              )}
            />
          )}
        </div>

        <p className="mt-2 text-footnote text-secondary">
          {PAYMENT_METHODS.map(
            (method) => `${PAYMENT_METHOD_LABELS_RU[method]} ${formatMoney(now.data?.totals.byMethod[method] ?? 0)}`,
          ).join(' · ')}
        </p>
      </CardBody>
    </Card>
  );
}

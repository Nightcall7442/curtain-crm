'use client';

import {
  formatMoney,
  parseMoney,
  PAYMENT_KIND_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';

/**
 * Касса дня.
 *
 * Матрица «откуда × чем»: предоплаты новых заказов, остатки по заказам,
 * готовые шторы и прочие продажи — по каждому способу оплаты (наличные,
 * карта, QR, Click) и итого. Ниже — что дошло до ящика: наличные сначала
 * лежат на руках у продавца или установщика и попадают в кассу только
 * инкассацией; безнал в кассе нет вовсе — он на счёте.
 *
 * Отчёт за один календарный день: касса сверяется вечером, и вопрос
 * директора — «сколько сегодня», а не «сколько за квартал». За месяц — в
 * «Финансах».
 */
export default function CashPage(): ReactElement {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));

  const summary = trpc.payments.summary.useQuery({ day });
  const list = trpc.payments.list.useQuery({ day });
  const collections = trpc.payments.collections.useQuery({ day });
  const onHands = trpc.payments.onHands.useQuery();

  if (summary.isError) return <ErrorState message={summary.error.message} />;

  const data = summary.data;
  const onHandsTotal = (onHands.data?.byUser ?? []).reduce(
    (sum, row) => sum + parseMoney(row.onHands),
    0,
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3">
        <Field label="День">
          <Input
            type="date"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
        </Field>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Принято за день" value={formatMoney(data?.total ?? 0)} caption="Все способы" />
        <StatCard
          label="В кассе"
          value={formatMoney(data?.inKassa ?? 0)}
          caption="Наличные: сдано и принято руководством, минус выдано"
        />
        <StatCard
          label="На руках"
          value={formatMoney(onHandsTotal)}
          caption={`У ${String(onHands.data?.byUser.length ?? 0)} сотрудников, сейчас`}
        />
      </section>

      <Card>
        <CardHeader title="Приход по источникам и способам" />
        <DataTable
          isLoading={summary.isLoading}
          rows={data?.rows ?? []}
          rowKey={(row) => row.kind}
          emptyMessage="За этот день приходов нет"
          columns={[
            { key: 'kind', header: '', render: (row) => PAYMENT_KIND_LABELS_RU[row.kind] },
            ...PAYMENT_METHODS.map((method) => ({
              key: method,
              header: PAYMENT_METHOD_LABELS_RU[method],
              align: 'right' as const,
              render: (row: NonNullable<typeof data>['rows'][number]) => (
                <Money value={row.byMethod[method]} />
              ),
            })),
            {
              key: 'total',
              header: 'Итого',
              align: 'right',
              render: (row) => <Money value={row.total} strong />,
            },
          ]}
        />
        {data !== undefined && data.rows.length > 0 && (
          <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-5">
            {PAYMENT_METHODS.map((method) => (
              <div key={method} className="flex justify-between sm:block">
                <span className="text-muted">{PAYMENT_METHOD_LABELS_RU[method]} итого</span>
                <div className="font-figure tabular-nums">{formatMoney(data.byMethod[method])}</div>
              </div>
            ))}
            <div className="flex justify-between sm:block">
              <span className="text-muted">Total</span>
              <div className="font-figure text-lg tabular-nums">{formatMoney(data.total)}</div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Инкассация за день" />
          <DataTable
            isLoading={collections.isLoading}
            rows={collections.data?.rows ?? []}
            rowKey={(row) => row.id}
            emptyMessage="Сегодня никто не сдавал"
            columns={[
              { key: 'who', header: 'Кто', render: (row) => row.fullName },
              {
                key: 'when',
                header: 'Когда',
                render: (row) =>
                  new Date(row.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
              },
              {
                key: 'amount',
                header: 'Сумма',
                align: 'right',
                render: (row) => <Money value={parseMoney(row.amount)} strong />,
              },
            ]}
          />
          {collections.data !== undefined && (
            <p className="mt-3 text-sm text-secondary">
              Сдано: <strong className="font-figure">{formatMoney(parseMoney(collections.data.total))}</strong>
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Наличные на руках" />
          <DataTable
            isLoading={onHands.isLoading}
            rows={onHands.data?.byUser ?? []}
            rowKey={(row) => row.userId}
            emptyMessage="Все наличные сданы"
            columns={[
              { key: 'who', header: 'Кто', render: (row) => row.fullName },
              {
                key: 'amount',
                header: 'На руках',
                align: 'right',
                render: (row) => <Money value={parseMoney(row.onHands)} strong />,
              },
            ]}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Все приходы за день" />
        <DataTable
          isLoading={list.isLoading}
          rows={list.data ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Приходов нет"
          columns={[
            {
              key: 'time',
              header: 'Время',
              render: (row) =>
                new Date(row.receivedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            },
            { key: 'kind', header: 'Источник', render: (row) => PAYMENT_KIND_LABELS_RU[row.kind] },
            { key: 'method', header: 'Способ', render: (row) => PAYMENT_METHOD_LABELS_RU[row.method] },
            {
              key: 'order',
              header: 'Заказ',
              render: (row) =>
                row.orderNumber === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  `${row.orderNumber} · ${row.clientName ?? ''}`
                ),
            },
            { key: 'who', header: 'Принял', render: (row) => row.receivedByName },
            {
              key: 'amount',
              header: 'Сумма',
              align: 'right',
              render: (row) => <Money value={parseMoney(row.amount)} strong />,
            },
          ]}
        />
      </Card>
    </div>
  );
}

function Money({ value, strong = false }: { readonly value: number; readonly strong?: boolean }): ReactElement {
  if (value === 0) return <span className="text-muted">—</span>;
  return <span className={strong ? 'font-figure tabular-nums' : 'tabular-nums'}>{formatMoney(value)}</span>;
}

'use client';

import {
  formatIsoDateShort,
  formatMoney,
  formatTime,
  parseMoney,
  PAYMENT_KIND_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PaymentKind,
  type PaymentKind as PaymentKindName,
  todayIso,
} from '@curtain-crm/shared';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';

import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

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
  // Местный день, не UTC: до пяти утра по Ташкенту касса иначе показывала бы вчера.
  const [day, setDay] = useState(() => todayIso());

  const summary = trpc.payments.summary.useQuery({ day });
  const list = trpc.payments.list.useQuery({ day });
  const collections = trpc.payments.collections.useQuery({ day });
  const onHands = trpc.payments.onHands.useQuery();
  const checks = trpc.terminalChecks.byDay.useQuery({ day });

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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Принято за день"
          value={formatMoney(data?.total ?? 0)}
          caption={
            data === undefined || data.out.payroll + data.out.purchases + data.out.refunds === 0
              ? 'Все способы'
              : `ушло: зарплата ${formatMoney(data.out.payroll)} · закупки ${formatMoney(data.out.purchases)} · возвраты ${formatMoney(data.out.refunds)}`
          }
        />
        <StatCard
          label="В кассе"
          value={formatMoney(data?.balance.cash.total ?? 0)}
          caption={
            data === undefined
              ? 'Наличные: сдано и принято руководством, минус выдано'
              : data.balance.since === null
                ? 'Движений через книгу ещё не было'
                : `с ${formatIsoDateShort(data.balance.since)}: сдано ${formatMoney(data.balance.cash.collected)} + руководство ${formatMoney(data.balance.cash.byManagement)} − зарплата ${formatMoney(data.balance.cash.payroll)} − закупки ${formatMoney(data.balance.cash.purchases)} − возвраты ${formatMoney(data.balance.cash.refunds)}`
          }
        />
        <StatCard
          label="На счёте"
          value={formatMoney(data?.balance.cashless.total ?? 0)}
          caption={
            data === undefined
              ? 'Карта, QR, Click — минус безналичные возвраты'
              : `карта ${formatMoney(data.balance.cashless.card)} · QR ${formatMoney(data.balance.cashless.qr)} · Click ${formatMoney(data.balance.cashless.click)}`
          }
        />
        <StatCard
          label="На руках"
          value={formatMoney(onHandsTotal)}
          caption={`У ${String(onHands.data?.byUser.length ?? 0)} сотрудников, сейчас`}
        />
        <StatCard
          label="Скидки"
          value={formatMoney(data?.discounts.total ?? 0)}
          caption={
            data === undefined || data.discounts.count === 0
              ? 'По заказам и чекам за день'
              : `По ${String(data.discounts.count)} заказам и чекам за день`
          }
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
            {
              key: 'kind',
              header: '',
              render: (row) => PAYMENT_KIND_LABELS_RU[row.kind],
            },
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
          <div className="grid gap-2 border-t border-subtle px-5 py-4 text-caption sm:grid-cols-5">
            {PAYMENT_METHODS.map((method) => (
              <div key={method} className="flex justify-between sm:block">
                <span className="text-muted">{PAYMENT_METHOD_LABELS_RU[method]} итого</span>
                <div className="tabular-nums">{formatMoney(data.byMethod[method])}</div>
              </div>
            ))}
            <div className="flex justify-between sm:block">
              <span className="text-muted">Total</span>
              <div className="text-subhead font-semibold tabular-nums">
                {formatMoney(data.total)}
              </div>
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
                render: (row) => formatTime(row.createdAt),
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
            <p className="px-5 pb-4 text-caption text-secondary">
              Сдано:{' '}
              <strong className="tabular-nums">
                {formatMoney(parseMoney(collections.data.total))}
              </strong>
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

      {/*
        Терминальные чеки — рядом с кассой, но не её часть: владелец задал их
        отдельной обязанностью продавцов (три в день на всех, с фото), и к
        приходам они не привязаны. Здесь — контроль: сколько пробили и фото.
      */}
      <Card>
        <CardHeader
          title="Терминальные чеки"
          action={
            <span className="flex items-center gap-3">
              {checks.data !== undefined && (
                <span
                  className={
                    checks.data.count >= checks.data.target
                      ? 'text-caption font-semibold text-positive'
                      : 'text-caption font-semibold text-warning'
                  }
                >
                  {`${checks.data.count.toString()} из ${checks.data.target.toString()}`}
                </span>
              )}
              <Link href="/cash/terminal" className="text-caption text-accent hover:underline">
                Архив
              </Link>
            </span>
          }
        />
        <DataTable
          isLoading={checks.isLoading}
          rows={checks.data?.rows ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Чеков за этот день нет"
          columns={[
            { key: 'who', header: 'Кто', render: (row) => row.fullName },
            {
              key: 'when',
              header: 'Когда',
              render: (row) => formatTime(row.createdAt),
            },
            {
              key: 'amount',
              header: 'Сумма',
              align: 'right',
              render: (row) => <Money value={parseMoney(row.amount)} strong />,
            },
            {
              key: 'comment',
              header: 'Комментарий',
              render: (row) => row.comment ?? <span className="text-muted">—</span>,
            },
            {
              key: 'photo',
              header: 'Фото',
              render: (row) =>
                row.photoUrl === null ? (
                  <span className="text-muted">—</span>
                ) : (
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
      </Card>

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
              render: (row) => formatTime(row.receivedAt),
            },
            {
              key: 'kind',
              header: 'Движение',
              render: (row) => PAYMENT_KIND_LABELS_RU[row.kind],
            },
            {
              key: 'method',
              header: 'Способ',
              render: (row) => PAYMENT_METHOD_LABELS_RU[row.method],
            },
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
            {
              key: 'who',
              header: 'Чьи руки',
              render: (row) => row.receivedByName,
            },
            {
              key: 'amount',
              header: 'Сумма',
              align: 'right',
              // Книга — не только приход: выплаты и возвраты со знаком, инкассация — перекладывание.
              render: (row) => (
                <Money value={parseMoney(row.amount)} strong sign={signOf(row.kind)} />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

/** Знак движения в книге: приход +, выплата и возврат −, инкассация — ни то ни другое. */
function signOf(kind: PaymentKindName): 'in' | 'out' | 'move' {
  if (kind === PaymentKind.PAYROLL || kind === PaymentKind.REFUND) return 'out';
  if (kind === PaymentKind.COLLECTION) return 'move';
  return 'in';
}

function Money({
  value,
  strong = false,
  sign = 'in',
}: {
  readonly value: number;
  readonly strong?: boolean;
  readonly sign?: 'in' | 'out' | 'move';
}): ReactElement {
  if (value === 0) return <span className="text-muted">—</span>;
  return (
    <span
      className={cn(
        'tabular-nums',
        strong ? 'font-medium' : undefined,
        sign === 'out' ? 'text-danger' : sign === 'move' ? 'text-secondary' : undefined,
      )}
    >
      {sign === 'out' ? '−' : sign === 'move' ? '→ ' : ''}
      {formatMoney(value)}
    </span>
  );
}

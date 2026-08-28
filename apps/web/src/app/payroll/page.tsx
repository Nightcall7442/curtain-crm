'use client';

import {
  formatMoney,
  parseMoney,
  PAYROLL_RECORD_STATUS_LABELS_RU,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  type PayrollRecordStatus,
  Role,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';
import { Calculator, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { SchemeDialog } from '@/components/payroll/SchemeDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Form';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { useAuth } from '@/components/providers/AuthProvider';
import { trpc } from '@/lib/trpc';

/**
 * Зарплаты: расчёт, утверждение и выплата.
 *
 * Кнопки утверждения и выплаты видны только директору — но решает это, как
 * и везде, сервер: `payroll.approve` и `payroll.markPaid` — процедуры уровня
 * CEO, и админ получит `FORBIDDEN`, даже если доберётся до кнопки.
 */
export default function PayrollPage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schemeOpen, setSchemeOpen] = useState(false);

  const { hasRole } = useAuth();
  const isCeo = hasRole(Role.CEO);

  const utils = trpc.useUtils();
  const period = { year, month };

  const list = trpc.payroll.list.useQuery(period);
  const schemes = trpc.payroll.schemes.list.useQuery({});

  const invalidate = async (): Promise<void> => {
    await utils.payroll.list.invalidate();
  };

  const calculate = trpc.payroll.calculate.useMutation({ onSuccess: invalidate });
  const approve = trpc.payroll.approve.useMutation({ onSuccess: invalidate });
  const markPaid = trpc.payroll.markPaid.useMutation({ onSuccess: invalidate });

  if (list.isError) {
    return (
      <Card>
        <ErrorState
          message={list.error.message}
          onRetry={() => {
            void list.refetch();
          }}
        />
      </Card>
    );
  }

  const totalCalculated = list.data === undefined ? 0 : parseMoney(list.data.totalCalculated);
  const totalPaid = list.data === undefined ? 0 : parseMoney(list.data.totalPaid);

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Начислено за период"
          value={formatMoney(totalCalculated)}
          caption={`${(list.data?.items.length ?? 0).toString()} записей`}
        />
        <StatCard label="Выплачено" value={formatMoney(totalPaid)} caption="По этому периоду" />
        <StatCard
          label="К выплате"
          value={formatMoney(Math.max(0, totalCalculated - totalPaid))}
          caption="Начислено минус выплачено"
        />
      </section>

      <Card>
        <CardHeader
          title="Ведомость"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={month}
                onChange={(event) => {
                  setMonth(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Месяц"
                className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-gold-dim focus:outline-none"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={year}
                onChange={(event) => {
                  setYear(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Год"
                className="rounded border border-subtle bg-base px-2.5 py-1.5 text-[12px] text-secondary focus:border-gold-dim focus:outline-none"
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={calculate.isPending}
                onClick={() => {
                  calculate.mutate(period);
                }}
                className="flex items-center gap-1.5 rounded bg-gold px-3 py-1.5 text-[12px] font-medium text-base disabled:opacity-50"
              >
                <Calculator className="h-3.5 w-3.5" aria-hidden />
                Рассчитать
              </button>
            </div>
          }
        />

        {calculate.data !== undefined && (
          <div className="border-b border-subtle px-4 py-2.5 text-[12px] text-secondary">
            {`Рассчитано: ${calculate.data.calculated.toString()}. ` +
              `Пропущено утверждённых: ${calculate.data.skippedApproved.toString()}.` +
              (calculate.data.failures.length > 0
                ? ` Не удалось: ${calculate.data.failures.length.toString()} — проверьте схемы начисления.`
                : '')}
          </div>
        )}

        {calculate.error !== null && (
          <div role="alert" className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-[12px] text-danger">
            {calculate.error.message}
          </div>
        )}

        <DataTable
          isLoading={list.isLoading}
          rows={list.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="За этот период расчётов нет — нажмите «Рассчитать»"
          columns={[
            {
              key: 'name',
              header: 'Сотрудник',
              render: (row) => <span className="text-primary">{row.userFullName}</span>,
            },
            { key: 'role', header: 'Роль', render: (row) => ROLE_LABELS_RU[row.role] },
            {
              key: 'scheme',
              header: 'Схема',
              render: (row) => PAYROLL_SCHEME_TYPE_LABELS_RU[row.schemeSnapshot.type],
            },
            {
              key: 'kpi',
              header: 'KPI',
              align: 'right',
              render: (row) =>
                row.kpiPercent === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span
                    className={
                      Number.parseFloat(row.kpiPercent) >= 100 ? 'text-positive' : 'text-primary'
                    }
                  >
                    {`${Number.parseFloat(row.kpiPercent).toFixed(0)}%`}
                  </span>
                ),
            },
            {
              key: 'calculated',
              header: 'Начислено',
              align: 'right',
              render: (row) => (
                <span className="text-primary">{formatMoney(parseMoney(row.calculatedAmount))}</span>
              ),
            },
            {
              key: 'paid',
              header: 'Выплачено',
              align: 'right',
              render: (row) => formatMoney(parseMoney(row.paidAmount)),
            },
            {
              key: 'status',
              header: 'Статус',
              render: (row) => <PayrollStatusBadge status={row.status} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => {
                if (!isCeo) return null;

                if (row.status === 'draft') {
                  return (
                    <button
                      type="button"
                      disabled={approve.isPending}
                      onClick={() => {
                        approve.mutate({ id: row.id });
                      }}
                      className="rounded border border-positive/40 px-2 py-1 text-[11.5px] text-positive hover:bg-positive/10 disabled:opacity-50"
                    >
                      Утвердить
                    </button>
                  );
                }

                if (row.status === 'approved') {
                  return (
                    <button
                      type="button"
                      disabled={markPaid.isPending}
                      onClick={() => {
                        markPaid.mutate({ id: row.id });
                      }}
                      className="rounded border border-gold/40 px-2 py-1 text-[11.5px] text-gold-soft hover:bg-gold/10 disabled:opacity-50"
                    >
                      Выплачено
                    </button>
                  );
                }

                return null;
              },
            },
          ]}
        />
      </Card>

      <SchemeDialog
        open={schemeOpen}
        onClose={() => {
          setSchemeOpen(false);
        }}
      />

      <Card>
        <CardHeader
          title="Схемы начисления по ролям"
          action={
            isCeo && (
              <Button
                onClick={() => {
                  setSchemeOpen(true);
                }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                Настроить схему
              </Button>
            )
          }
        />
        <CardBody>
          {schemes.isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(schemes.data ?? []).map((scheme) => (
                <li key={scheme.id} className="rounded border border-subtle bg-base/40 p-3">
                  <p className="text-[12.5px] font-medium text-primary">
                    {ROLE_LABELS_RU[scheme.role]}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-gold-soft">
                    {PAYROLL_SCHEME_TYPE_LABELS_RU[scheme.type]}
                  </p>
                  <dl className="mt-2 space-y-0.5 text-[11.5px] text-secondary">
                    {scheme.baseAmount !== null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Оклад</dt>
                        <dd>{formatMoney(parseMoney(scheme.baseAmount))}</dd>
                      </div>
                    )}
                    {scheme.rate !== null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Ставка</dt>
                        <dd>{formatMoney(parseMoney(scheme.rate))}</dd>
                      </div>
                    )}
                    {scheme.kpiTarget !== null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">План KPI</dt>
                        <dd>{Number.parseFloat(scheme.kpiTarget).toFixed(0)}</dd>
                      </div>
                    )}
                    {scheme.commissionPercent !== null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Процент</dt>
                        <dd>{`${Number.parseFloat(scheme.commissionPercent).toFixed(2)}%`}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PayrollStatusBadge({ status }: { readonly status: PayrollRecordStatus }): ReactElement {
  const tone = status === 'paid' ? 'positive' : status === 'approved' ? 'gold' : 'neutral';
  return <Badge tone={tone}>{PAYROLL_RECORD_STATUS_LABELS_RU[status]}</Badge>;
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

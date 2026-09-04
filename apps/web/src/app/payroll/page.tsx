'use client';

import {
  formatMoney,
  parseMoney,
  PAYROLL_RECORD_STATUS_LABELS_RU,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  PayrollRecordStatus,
  Role,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';
import { Calculator, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { SchemeDialog } from '@/components/payroll/SchemeDialog';
import { Badge } from '@/components/ui/Badge';
import { Button, controlClass } from '@/components/ui/Form';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, type RowKey } from '@/components/ui/Table';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { trpc } from '@/lib/trpc';
import { formatDate, formatPercent } from '@/lib/utils';

/**
 * Зарплаты: расчёт, утверждение и выплата.
 *
 * Кнопки утверждения и выплаты видны только директору — но решает это, как
 * и везде, сервер: `payroll.approve` и `payroll.markPaid` — процедуры уровня
 * CEO, и админ получит `FORBIDDEN`, даже если доберётся до кнопки.
 */
export default function PayrollPage(): ReactElement {
  const toast = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [schemeOpen, setSchemeOpen] = useState(false);
  /** Отмеченные строки ведомости — для массового утверждения директором. */
  const [checked, setChecked] = useState<ReadonlySet<RowKey>>(new Set());

  const { hasRole } = useAuth();
  const isCeo = hasRole(Role.CEO);

  const utils = trpc.useUtils();
  const period = { year, month };

  const list = trpc.payroll.list.useQuery(period);
  const schemes = trpc.payroll.schemes.list.useQuery({});

  const invalidate = async (): Promise<void> => {
    await utils.payroll.list.invalidate();
  };

  /**
   * Каждое действие теперь отвечает.
   *
   * Раньше расчёт, утверждение и отметка о выплате проходили молча: строка
   * перерисовывалась, и по ней надо было догадаться, что произошло. При
   * ошибке не было и этого — сообщение сервера пропадало вовсе, хотя оно
   * на русском и объясняет причину («расчёт уже утверждён», «нет прав»).
   */
  const calculate = trpc.payroll.calculate.useMutation({
    onSuccess: () => {
      void invalidate();
      toast.success('Зарплата рассчитана', 'Проверьте суммы и утвердите расчёт');
    },
    onError: (error) => {
      toast.error('Не удалось рассчитать', error.message);
    },
  });

  const approve = trpc.payroll.approve.useMutation({
    onSuccess: () => {
      void invalidate();
      toast.success('Расчёт утверждён');
    },
    onError: (error) => {
      toast.error('Не удалось утвердить', error.message);
    },
  });

  const markPaid = trpc.payroll.markPaid.useMutation({
    onSuccess: () => {
      void invalidate();
      toast.success('Отмечено как выплаченное');
    },
    onError: (error) => {
      toast.error('Не удалось отметить выплату', error.message);
    },
  });

  const approveMany = trpc.payroll.approveMany.useMutation({
    onSuccess: (result) => {
      void invalidate();
      setChecked(new Set());
      const failed = result.results.filter((entry) => !entry.ok);
      if (failed.length === 0) {
        toast.success(`Утверждено расчётов: ${result.approved.toString()}`);
      } else {
        toast.error(
          `Утверждено ${result.approved.toString()}, не удалось ${failed.length.toString()}`,
          failed[0]?.message,
        );
      }
    },
    onError: (error) => {
      toast.error('Не удалось утвердить', error.message);
    },
  });

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

  /**
   * Что реально уйдёт на утверждение из отмеченного.
   *
   * Считаются только черновики: утверждённые и выплаченные строки галочка
   * не ломает — сервер их всё равно отклонит, но директор должен видеть
   * ДО подтверждения, какая сумма утверждается, одной цифрой.
   */
  const checkedDrafts = (list.data?.items ?? []).filter(
    (row) => checked.has(row.id) && row.status === PayrollRecordStatus.DRAFT,
  );
  const checkedSum = checkedDrafts.reduce(
    (sum, row) => sum + parseMoney(row.calculatedAmount),
    0,
  );

  return (
    <div className="space-y-6">
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
                className={controlClass('sm', 'w-auto pr-8')}
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
                className={controlClass('sm', 'w-auto pr-8')}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>

              <Button
                size="sm"
                loading={calculate.isPending}
                icon={<Calculator className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  calculate.mutate(period);
                }}
              >
                Рассчитать
              </Button>
            </div>
          }
        />

        {calculate.data !== undefined && (
          <div className="border-b border-subtle px-4 py-2.5 text-footnote text-secondary">
            {`Рассчитано: ${calculate.data.calculated.toString()}. ` +
              `Пропущено утверждённых: ${calculate.data.skippedApproved.toString()}.` +
              (calculate.data.failures.length > 0
                ? ` Не удалось: ${calculate.data.failures.length.toString()} — проверьте схемы начисления.`
                : '')}
          </div>
        )}

        {calculate.error !== null && (
          <div role="alert" className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-footnote text-danger">
            {calculate.error.message}
          </div>
        )}

        {/* Панель массового утверждения — конец месяца одним подтверждением. */}
        {isCeo && checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-subtle bg-accent-soft/70 px-4 py-2.5">
            <span className="text-caption font-medium text-primary">
              {checkedDrafts.length === 0
                ? 'Среди отмеченных нет черновиков — утверждать нечего'
                : `Черновиков к утверждению: ${checkedDrafts.length.toString()} на ${formatMoney(checkedSum)}`}
            </span>
            {checkedDrafts.length > 0 && (
              <Button
                size="sm"
                loading={approveMany.isPending}
                onClick={() => {
                  approveMany.mutate({ ids: checkedDrafts.map((row) => row.id) });
                }}
              >
                Утвердить выбранных
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                setChecked(new Set());
              }}
            >
              Снять выделение
            </Button>
          </div>
        )}

        <DataTable
          isLoading={list.isLoading}
          rows={list.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="За этот период расчётов нет — нажмите «Рассчитать»"
          {...(isCeo
            ? {
                selection: {
                  selected: checked,
                  onChange: setChecked,
                  rowLabel: (key: RowKey) => `Выбрать расчёт ${String(key)}`,
                },
              }
            : {})}
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
              /*
                Под статусом — подтвердил ли сотрудник получение денег.

                Это разные утверждения: «выплачено» говорит тот, кто платил,
                «получил» — тот, кому платили. Расхождение между ними и есть
                предмет спора, поэтому оно должно быть видно в одной строке,
                а не выясняться разговором.
              */
              render: (row) => (
                <span className="block">
                  <PayrollStatusBadge status={row.status} />
                  {row.status === PayrollRecordStatus.PAID && (
                    <span
                      className={`mt-1 block text-footnote ${
                        row.receiptConfirmedAt === null ? 'text-muted' : 'text-positive'
                      }`}
                    >
                      {row.receiptConfirmedAt === null
                        ? 'Получение не подтверждено'
                        : `Получил ${formatDate(row.receiptConfirmedAt)}`}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => {
                if (!isCeo) return null;

                if (row.status === PayrollRecordStatus.DRAFT) {
                  return (
                    <button
                      type="button"
                      disabled={approve.isPending}
                      onClick={() => {
                        approve.mutate({ id: row.id });
                      }}
                      className="rounded border border-positive/40 px-2 py-1 text-footnote text-positive hover:bg-positive/10 disabled:opacity-50"
                    >
                      Утвердить
                    </button>
                  );
                }

                if (row.status === PayrollRecordStatus.APPROVED) {
                  return (
                    <button
                      type="button"
                      disabled={markPaid.isPending}
                      onClick={() => {
                        markPaid.mutate({ id: row.id });
                      }}
                      className="rounded border border-accent/40 px-2 py-1 text-footnote text-accent hover:bg-accent/10 disabled:opacity-50"
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
          title="Условия оплаты сотрудников"
          action={
            <Button
              onClick={() => {
                setSchemeOpen(true);
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Настроить условия
            </Button>
          }
        />
        <CardBody>
          {schemes.isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(schemes.data ?? []).map((scheme) => (
                <li key={scheme.id} className="rounded border border-subtle bg-base/40 p-3">
                  <p className="truncate text-caption font-medium text-primary" title={scheme.userFullName}>
                    {scheme.userFullName}
                  </p>
                  <p className="text-footnote text-muted">{ROLE_LABELS_RU[scheme.role]}</p>
                  <p className="mt-0.5 text-footnote text-accent">
                    {PAYROLL_SCHEME_TYPE_LABELS_RU[scheme.type]}
                  </p>
                  <dl className="mt-2 space-y-0.5 text-footnote text-secondary">
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
                        <dd>{formatPercent(Number.parseFloat(scheme.commissionPercent), { fractionDigits: 2 })}</dd>
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
  const tone =
    status === PayrollRecordStatus.PAID
      ? 'positive'
      : status === PayrollRecordStatus.APPROVED
        ? 'accent'
        : 'neutral';
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

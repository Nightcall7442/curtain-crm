'use client';

import {
  formatIsoDate,
  formatMoney,
  parseMoney,
  PAYROLL_RECORD_STATUS_LABELS_RU,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  PayrollSchemeType,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { Button, Modal } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';

/**
 * Из чего сложилось начисление.
 *
 * Ведомость отвечает «сколько», а спорят обычно про «за что»: установщик
 * хочет видеть номера заказов, за которые ему посчитали сдельную, а
 * почасовик — сколько часов ему засчитали и по какой ставке. До сих пор
 * ответа не было ни у кого: в таблице стояла одна сумма, а её состав знал
 * только сервер в момент расчёта.
 *
 * Часы и состав заказов приезжают пересчитанными на сейчас. Если месяц ещё
 * не закрыт, они могут разойтись с суммой в ведомости — это не ошибка, а
 * ответ на вопрос «пора ли пересчитать».
 */
export function PayrollBreakdownDialog({
  recordId,
  onClose,
}: {
  /** `null` — окно закрыто. */
  readonly recordId: number | null;
  readonly onClose: () => void;
}): ReactElement {
  const breakdown = trpc.payroll.breakdown.useQuery(
    { id: recordId ?? 0 },
    { enabled: recordId !== null },
  );

  const data = breakdown.data ?? null;
  const snapshot = data?.record.schemeSnapshot ?? null;

  return (
    <Modal
      open={recordId !== null}
      title="Из чего сложилось начисление"
      width="xl"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      {breakdown.isLoading || data === null || snapshot === null ? (
        <p className="text-footnote text-muted">Загрузка…</p>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="section-title mb-2">Начисление</h3>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-1.5 text-footnote">
              <Detail label="Сотрудник" value={data.record.userFullName} />
              <Detail label="Роль" value={ROLE_LABELS_RU[data.record.role]} />
              <Detail
                label="Период"
                value={`${data.period.month.toString().padStart(2, '0')}.${data.period.year.toString()}`}
              />
              <Detail
                label="Статус"
                value={PAYROLL_RECORD_STATUS_LABELS_RU[data.record.status]}
              />
              <Detail
                label="Начислено"
                value={formatMoney(parseMoney(data.record.calculatedAmount))}
              />
              <Detail
                label="Выплачено"
                value={
                  data.record.paidAmount === null
                    ? '—'
                    : formatMoney(parseMoney(data.record.paidAmount))
                }
              />
            </dl>
          </section>

          <section>
            <h3 className="section-title mb-2">Условия оплаты на момент расчёта</h3>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-1.5 text-footnote">
              <Detail label="Схема" value={PAYROLL_SCHEME_TYPE_LABELS_RU[snapshot.type]} />
              {snapshot.baseAmount !== null && (
                <Detail
                  label={snapshot.type === PayrollSchemeType.FIXED ? 'Оклад' : 'Базовая часть'}
                  value={formatMoney(parseMoney(snapshot.baseAmount))}
                />
              )}
              {snapshot.rate !== null && (
                <Detail
                  label={
                    snapshot.type === PayrollSchemeType.HOURLY
                      ? 'Ставка за час'
                      : snapshot.type === PayrollSchemeType.PER_ORDER
                        ? 'За заказ'
                        : 'Премия'
                  }
                  value={formatMoney(parseMoney(snapshot.rate))}
                />
              )}
              {snapshot.kpiTarget !== null && (
                <Detail label="План KPI" value={`${snapshot.kpiTarget.toString()} заказов`} />
              )}
              {snapshot.commissionPercent !== null && (
                <Detail label="Процент" value={`${snapshot.commissionPercent.toString()}%`} />
              )}
              <Detail label="Действует с" value={formatIsoDate(snapshot.effectiveFrom)} />
            </dl>
          </section>

          <section>
            <h3 className="section-title mb-2">Что взято в расчёт</h3>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-1.5 text-footnote">
              <Detail
                label="Часы по сменам"
                value={`${snapshot.inputs.workedHours.toFixed(1)} ч`}
              />
              <Detail
                label="Часы сейчас"
                value={`${data.workedHours.toFixed(1)} ч`}
              />
              <Detail
                label="Закрытых заказов"
                value={snapshot.inputs.completedOrders.toString()}
              />
              <Detail
                label="Сумма заказов"
                value={formatMoney(parseMoney(snapshot.inputs.completedOrdersAmount))}
              />
              <Detail
                label="Сдельно за этапы"
                value={formatMoney(parseMoney(snapshot.inputs.stageFeesAmount ?? '0'))}
              />
            </dl>
          </section>

          <section>
            <h3 className="section-title mb-2">Заказы за период</h3>
            <DataTable
              rows={[...data.orders]}
              rowKey={(row) => row.id}
              emptyMessage="Закрытых заказов за период нет"
              columns={[
                {
                  key: 'number',
                  header: 'Заказ',
                  render: (row) => row.orderNumber ?? `#${row.id.toString()}`,
                },
                { key: 'client', header: 'Клиент', render: (row) => row.clientName },
                {
                  key: 'closed',
                  header: 'Закрыт',
                  render: (row) =>
                    row.completedAt === null
                      ? '—'
                      : new Date(row.completedAt).toLocaleDateString('ru-RU'),
                },
                {
                  key: 'price',
                  header: 'Сумма заказа',
                  align: 'right',
                  render: (row) => formatMoney(parseMoney(row.workPrice)),
                },
                {
                  key: 'fee',
                  header: 'Сдельно',
                  align: 'right',
                  render: (row) => (
                    <span
                      className={parseMoney(row.stageFee) > 0 ? 'text-primary' : 'text-muted'}
                    >
                      {formatMoney(parseMoney(row.stageFee))}
                    </span>
                  ),
                },
              ]}
            />
            <p className="mt-2 text-overline text-muted">
              Состав восстановлен по заказам, закрытым за период с участием сотрудника в этой
              роли. Заказ, переназначенный после расчёта, сюда не попадёт — сумма в ведомости от
              этого не меняется.
            </p>
          </section>
        </div>
      )}
    </Modal>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-primary">{value}</dd>
    </div>
  );
}

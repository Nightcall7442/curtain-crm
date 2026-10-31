'use client';

import {
  formatInstallSlot,
  formatIsoDate,
  formatMoney,
  parseMoney,
  PAYROLL_ORDER_PAY_STATUS_LABELS,
  PAYROLL_RECORD_STATUS_LABELS_RU,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  PayrollOrderPayStatus,
  PayrollSchemeType,
  pluralize,
  ROLE_LABELS_RU,
  scheduleMinutes,
  shiftPay,
  sumMoney,
  workedHoursOf,
} from '@curtain-crm/shared';
import { Minus, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button, Modal } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { formatDate, formatDuration } from '@/lib/utils';

type Breakdown = RouterOutputs['payroll']['breakdown'];

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
              <Detail label="Статус" value={PAYROLL_RECORD_STATUS_LABELS_RU[data.record.status]} />
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
              {snapshot.type === PayrollSchemeType.HOURLY && snapshot.rate !== null && (
                <ShiftRateDetail
                  rate={snapshot.rate}
                  shiftStart={snapshot.shiftStart ?? null}
                  shiftEnd={snapshot.shiftEnd ?? null}
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
              <Detail label="Часы сейчас" value={`${data.workedHours.toFixed(1)} ч`} />
              <Detail label="Закрытых заказов" value={snapshot.inputs.completedOrders.toString()} />
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

          {snapshot.type === PayrollSchemeType.HOURLY && <ShiftsSection shifts={data.shifts} />}

          {/* Ключ — запись: у другого сотрудника список снова свёрнут. */}
          <OrdersSection key={data.record.id} orders={data.orders} schemeType={snapshot.type} />
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

/**
 * «За смену по графику» — то, как заказчик называет ставку: 100 000 за
 * 09:00–18:00. Считается тем же `shiftPay`, что и каждая смена в таблице,
 * поэтому полная смена по графику в таблице даёт ровно это число.
 */
function ShiftRateDetail({
  rate,
  shiftStart,
  shiftEnd,
}: {
  readonly rate: string;
  readonly shiftStart: string | null;
  readonly shiftEnd: string | null;
}): ReactElement | null {
  const minutes = scheduleMinutes(shiftStart, shiftEnd);
  if (minutes === null || shiftStart === null || shiftEnd === null) return null;

  return (
    <Detail
      label={`За смену ${shiftStart}–${shiftEnd} (${formatHours(minutes / 60)} ч)`}
      value={formatMoney(shiftPay(parseMoney(rate), minutes * 60))}
    />
  );
}

/**
 * Смены почасовика — таблица из переписки с заказчиком: дата, пришёл,
 * ушёл, сколько часов и сколько за смену. «Перерыв» добавлен, чтобы было
 * видно, почему часов меньше, чем от прихода до ухода.
 */
function ShiftsSection({ shifts }: { readonly shifts: Breakdown['shifts'] }): ReactElement {
  const closed = shifts.filter((row) => row.workedSeconds !== null);
  const totalHours = workedHoursOf(closed.reduce((sum, row) => sum + (row.workedSeconds ?? 0), 0));
  const totalAmount = sumMoney(
    closed.map((row) => (row.amount === null ? 0 : parseMoney(row.amount))),
  );

  return (
    <section>
      <h3 className="section-title mb-2">Смены за период</h3>
      <DataTable
        rows={[...shifts]}
        rowKey={(row) => row.id}
        emptyMessage="Смен за период нет"
        columns={[
          {
            key: 'day',
            header: 'Дата',
            render: (row) => (
              <span className="inline-flex items-center gap-2">
                {formatIsoDate(row.day)}
                {row.isManuallyAdjusted && (
                  <span className="text-overline text-warning" title="Время смены исправлено вручную">
                    исправлено
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'start',
            header: 'Начал',
            render: (row) => formatInstallSlot(new Date(row.startedAt)).time,
          },
          {
            key: 'end',
            header: 'Закончил',
            render: (row) =>
              row.endedAt === null ? (
                <span className="text-warning">идёт</span>
              ) : (
                formatInstallSlot(new Date(row.endedAt)).time
              ),
          },
          {
            key: 'away',
            header: 'Перерыв',
            align: 'right',
            render: (row) =>
              row.awaySeconds > 0 ? (
                formatDuration(row.awaySeconds / 3600)
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'hours',
            header: 'Итого часов',
            align: 'right',
            render: (row) =>
              row.workedSeconds === null ? '—' : formatHours(workedHoursOf(row.workedSeconds)),
          },
          {
            key: 'amount',
            header: 'Итого за смену',
            align: 'right',
            render: (row) =>
              row.amount === null ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="font-semibold text-primary">
                  {formatMoney(parseMoney(row.amount))}
                </span>
              ),
          },
        ]}
      />
      {closed.length > 0 && (
        <p className="mt-2 flex flex-wrap justify-end gap-x-4 text-footnote text-secondary">
          <span>
            Итого: <span className="text-primary">{formatHours(totalHours)} ч</span>
          </span>
          <span>
            за смены: <span className="font-semibold text-primary">{formatMoney(totalAmount)}</span>
          </span>
        </p>
      )}
      <p className="mt-1 text-overline text-muted">
        Каждая смена — ставка за час × отработанные часы, до целого сума. Перерыв — личные
        отлучки и выезды: они не оплачиваются. Идущая смена войдёт в расчёт, когда закроется.
      </p>
    </section>
  );
}

/**
 * «Заказы за период» — свёрнуты, раскрываются по «+» (просьба заказчика:
 * список нужен, когда спорят «за что», а не каждый раз).
 *
 * В шапке — сколько заказов и сдельно на какую сумму, чтобы не раскрывать
 * ради итога. Продавцу (процент, за заказ) сдельной нет — ему важна сумма
 * заказа, она и стоит вместо «Сдельно».
 */
function OrdersSection({
  orders,
  schemeType,
}: {
  readonly orders: Breakdown['orders'];
  readonly schemeType: PayrollSchemeType;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const byOrderAmount =
    schemeType === PayrollSchemeType.COMMISSION || schemeType === PayrollSchemeType.PER_ORDER;
  const feeTotal = sumMoney(orders.map((row) => parseMoney(row.stageFee)));
  const panelId = 'payroll-breakdown-orders';

  return (
    <section>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-xl border border-ink/10 bg-raised px-3 py-2 text-left transition-colors hover:border-ink/20"
      >
        <span className="section-title flex-1">Заказы за период</span>
        <span className="text-footnote text-secondary">
          {pluralize(orders.length, ['заказ', 'заказа', 'заказов'])}
          {!byOrderAmount && feeTotal > 0 && ` · сдельно ${formatMoney(feeTotal)}`}
        </span>
        <span
          className="grid size-7 place-items-center rounded-full border border-ink/15 text-primary"
          aria-hidden
        >
          {open ? <Minus size={15} /> : <Plus size={15} />}
        </span>
        <span className="sr-only">{open ? 'Свернуть' : 'Раскрыть'}</span>
      </button>

      {open && (
        <div id={panelId} className="mt-2">
          <DataTable
            rows={[...orders]}
            rowKey={(row) => row.id}
            emptyMessage="Заказов за период нет"
            columns={[
              {
                key: 'number',
                header: '№ заказа',
                render: (row) => row.orderNumber ?? `#${row.id.toString()}`,
              },
              { key: 'client', header: 'Клиент', render: (row) => row.clientName },
              {
                key: 'done',
                header: 'Исполнен',
                render: (row) => (row.doneAt === null ? '—' : formatDate(row.doneAt)),
              },
              byOrderAmount
                ? {
                    key: 'price',
                    header: 'Сумма заказа',
                    align: 'right',
                    render: (row) => formatMoney(parseMoney(row.workPrice)),
                  }
                : {
                    key: 'fee',
                    header: 'Сдельно',
                    align: 'right',
                    render: (row) => (
                      <span className={parseMoney(row.stageFee) > 0 ? 'text-primary' : 'text-muted'}>
                        {formatMoney(parseMoney(row.stageFee))}
                      </span>
                    ),
                  },
              {
                key: 'status',
                header: 'Статус оплаты',
                render: (row) => (
                  <Badge
                    tone={row.paymentStatus === PayrollOrderPayStatus.PAID ? 'positive' : 'warning'}
                  >
                    {PAYROLL_ORDER_PAY_STATUS_LABELS.ru[row.paymentStatus]}
                  </Badge>
                ),
              },
            ]}
          />
          <p className="mt-2 text-overline text-muted">
            «Выплачен» — выдан день, когда сдан этап, или весь месяц. Состав восстановлен по
            заказам с участием сотрудника в этой роли: заказ, переназначенный после расчёта, сюда
            не попадёт — сумма в ведомости от этого не меняется.
          </p>
        </div>
      )}
    </section>
  );
}

/** Часы без лишних нулей: 9, 8,5, 7,33. */
function formatHours(hours: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(hours);
}

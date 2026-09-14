'use client';

import {
  formatMoney,
  groupDigits,
  parseMoney,
  todayIso,
  WEEKDAY_NAMES_RU,
  type IsoWeekday,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Skeleton } from '@/components/ui/Card';
import { Button, Field, Modal, MoneyInput } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/** Понедельник недели, в которую попадает день (`YYYY-MM-DD`). */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const dayLabel = (day: string): string => day.slice(8, 10) + '.' + day.slice(5, 7) + '.' + day.slice(0, 4);

/**
 * Выплата по дням недели.
 *
 * Директор рассчитывается с людьми каждый день, поэтому окно выплаты —
 * неделя: в колонке дня строки начисления (этапы по заказам, часы,
 * заказы) и итог, под ней галочка. Отмеченные дни складываются в «выплатить»,
 * выплаченные — зачёркнуты и второй раз не выбираются.
 *
 * Своя сумма остаётся запасным ходом на конец месяца: аванс, премия,
 * остаток одной суммой. Если она заполнена, дни не участвуют.
 */
export function PayoutWeekDialog({
  target,
  onClose,
  onPaid,
}: {
  readonly target: {
    readonly userId: number;
    readonly role: RoleName;
    readonly name: string;
    /** Месячный расчёт, из которого открыли окно, и его остаток. */
    readonly recordId: number;
    readonly remaining: number;
  } | null;
  readonly onClose: () => void;
  readonly onPaid: () => void;
}): ReactElement {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso()));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [manual, setManual] = useState('');

  const week = trpc.payroll.week.useQuery(
    { userId: target?.userId ?? 0, role: target?.role ?? 'sewer', weekStart },
    { enabled: target !== null },
  );

  const markPaid = trpc.payroll.markPaid.useMutation({
    onError: (error) => {
      toast.error('Не удалось выплатить', error.message);
    },
  });

  const days = week.data?.days ?? [];
  const earned = days.reduce((sum, day) => sum + parseMoney(day.total), 0);
  const received = days.reduce((sum, day) => sum + (day.paid === null ? 0 : parseMoney(day.paid)), 0);
  const chosen = days.filter((day) => selected.has(day.day));
  const toPay = chosen.reduce((sum, day) => sum + parseMoney(day.total), 0);
  const manualValue = Number.parseFloat(manual.replace(',', '.'));
  const manualOn = Number.isFinite(manualValue) && manualValue > 0;
  const rowsCount = Math.max(1, ...days.map((day) => day.lines.length));

  const close = (): void => {
    setSelected(new Set());
    setManual('');
    onClose();
  };

  const pay = async (): Promise<void> => {
    if (target === null) return;
    if (manualOn) {
      await markPaid.mutateAsync({ id: target.recordId, paidAmount: manualValue });
    } else {
      // Дни могут лежать в двух месяцах — у каждого свой расчёт.
      const byRecord = new Map<number, { day: string; amount: number }[]>();
      for (const day of chosen) {
        if (day.recordId === null) continue;
        byRecord.set(day.recordId, [
          ...(byRecord.get(day.recordId) ?? []),
          { day: day.day, amount: parseMoney(day.total) / 100 },
        ]);
      }
      for (const [recordId, entries] of byRecord) {
        await markPaid.mutateAsync({ id: recordId, days: entries });
      }
    }
    toast.success('Выплачено', formatMoney(manualOn ? Math.round(manualValue * 100) : toPay));
    setSelected(new Set());
    setManual('');
    await week.refetch();
    onPaid();
  };

  return (
    <Modal
      open={target !== null}
      title={target === null ? '' : `Выплата: ${target.name}`}
      onClose={close}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Отмена
          </Button>
          <Button
            loading={markPaid.isPending}
            disabled={target === null || (!manualOn && toPay <= 0)}
            onClick={() => {
              void pay();
            }}
          >
            Выплатить {formatMoney(manualOn ? Math.round(manualValue * 100) : toPay)}
          </Button>
        </>
      }
    >
      {target !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setWeekStart(addDays(weekStart, -7));
                setSelected(new Set());
              }}
            >
              ‹ Неделя
            </Button>
            <span className="text-caption text-secondary">
              {dayLabel(weekStart)} — {dayLabel(addDays(weekStart, 6))}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setWeekStart(addDays(weekStart, 7));
                setSelected(new Set());
              }}
            >
              Неделя ›
            </Button>
          </div>

          {week.isLoading ? (
            <Skeleton className="h-40" />
          ) : week.data === undefined ? null : !week.data.hasScheme ? (
            <p className="text-caption text-muted">Условий оплаты в этой роли нет — выплата только своей суммой.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-caption tabular-nums">
                <thead>
                  <tr>
                    {days.map((day, index) => (
                      <th key={day.day} className="px-2 pb-2 text-center font-medium text-secondary">
                        {WEEKDAY_NAMES_RU[(index + 1) as IsoWeekday]}
                        <div className="text-footnote font-normal text-muted">{dayLabel(day.day)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowsCount }, (_, row) => (
                    <tr key={row}>
                      {days.map((day) => {
                        const line = day.lines[row];
                        return (
                          <td
                            key={day.day}
                            title={line?.label}
                            className={cn(
                              'px-2 py-0.5 text-right',
                              day.paid !== null ? 'text-muted line-through' : 'text-primary',
                            )}
                          >
                            {line === undefined ? '' : formatMoney(parseMoney(line.amount), { withCurrency: false })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-subtle">
                    {days.map((day) => (
                      <td
                        key={day.day}
                        className={cn(
                          'px-2 pt-2 text-right font-semibold text-subhead tabular-nums',
                          day.paid !== null ? 'text-muted line-through' : 'text-primary',
                        )}
                      >
                        {formatMoney(parseMoney(day.total), { withCurrency: false })}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {days.map((day) => {
                      const payable = day.paid === null && day.recordId !== null && parseMoney(day.total) > 0;
                      return (
                        <td key={day.day} className="px-2 pt-2 text-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-accent disabled:opacity-40"
                            aria-label={`Выплатить за ${dayLabel(day.day)}`}
                            title={
                              day.paid !== null
                                ? `Выплачено ${formatMoney(parseMoney(day.paid))}`
                                : day.recordId === null
                                  ? 'Сначала рассчитайте этот месяц'
                                  : undefined
                            }
                            disabled={!payable || manualOn}
                            checked={day.paid !== null || selected.has(day.day)}
                            onChange={(event) => {
                              const next = new Set(selected);
                              if (event.target.checked) next.add(day.day);
                              else next.delete(day.day);
                              setSelected(next);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              {week.data.monthlyBase && (
                <p className="mt-2 text-footnote text-muted">
                  Оклад считается за месяц; по дням здесь только сдельные.
                </p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-3 gap-3 text-caption">
            <div>
              <dt className="text-muted">Итого заработано</dt>
              <dd className="font-semibold text-subhead tabular-nums text-primary">{formatMoney(earned)}</dd>
            </div>
            <div>
              <dt className="text-muted">Получено</dt>
              <dd className="font-semibold text-subhead tabular-nums text-primary">{formatMoney(received)}</dd>
            </div>
            <div>
              <dt className="text-muted">Выплатить</dt>
              <dd className="font-semibold text-subhead tabular-nums text-accent">
                {formatMoney(manualOn ? Math.round(manualValue * 100) : toPay)}
              </dd>
            </div>
          </dl>

          <Field
            label="Или своя сумма, сум"
            hint={`Остаток за месяц ${formatMoney(target.remaining)}. Заполнено — дни не участвуют`}
          >
            <MoneyInput
              value={manual}
              onChange={setManual}
              placeholder={groupDigits(String(Math.round(target.remaining / 100)))}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

'use client';

import {
  formatMoney,
  parseMoney,
  PAYMENT_KIND_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PaymentKind,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { Plus, Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Modal, MoneyInput, Select, Textarea } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Проводки по заказу: «Принять оплату» и «Возврат».
 *
 * Кто и чем заплатил и что вернули — из книги проводок; «оплачено» у
 * заказа — их сумма, и правится только через эти две кнопки. Принять
 * может продавец-автор, установщик заказа и руководство; вернуть — только
 * руководство: наличный возврат идёт из кассы.
 */
export function OrderPayments({
  orderId,
  paid,
  remaining,
  canAccept,
  canRefund,
}: {
  readonly orderId: number;
  readonly paid: string | null;
  readonly remaining: string | null;
  readonly canAccept: boolean;
  readonly canRefund: boolean;
}): ReactElement | null {
  const toast = useToast();
  const utils = trpc.useUtils();
  const history = trpc.payments.byOrder.useQuery({ orderId });

  const [mode, setMode] = useState<'accept' | 'refund' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
  const [comment, setComment] = useState('');

  const paidValue = paid === null ? 0 : parseMoney(paid);
  const remainingValue = remaining === null ? 0 : parseMoney(remaining);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.payments.byOrder.invalidate({ orderId }),
    ]);
  };
  const accept = trpc.payments.acceptForOrder.useMutation({
    async onSuccess() {
      setMode(null);
      toast.success('Оплата принята');
      await refresh();
    },
  });
  const refund = trpc.payments.refund.useMutation({
    async onSuccess() {
      setMode(null);
      toast.success('Возврат записан');
      await refresh();
    },
  });

  const rows = history.data ?? [];
  const showAccept = canAccept && remainingValue > 0;
  const showRefund = canRefund && paidValue > 0;
  if (rows.length === 0 && !showAccept && !showRefund) return null;

  const parsed = Number.parseFloat(amount.replace(',', '.')) || 0;
  const open = (next: 'accept' | 'refund'): void => {
    accept.reset();
    refund.reset();
    setAmount(String((next === 'accept' ? remainingValue : paidValue) / 100));
    setComment('');
    setMode(next);
  };
  const error = mode === 'accept' ? accept.error : refund.error;

  return (
    <Card>
      <CardHeader
        title="Оплаты"
        action={
          <span className="flex gap-2">
            {showRefund && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  open('refund');
                }}
              >
                Возврат
              </Button>
            )}
            {showAccept && (
              <Button
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  open('accept');
                }}
              >
                Принять оплату
              </Button>
            )}
          </span>
        }
      />
      <DataTable
        isLoading={history.isLoading}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="Проводок пока нет"
        columns={[
          { key: 'when', header: 'Когда', render: (row) => formatDateTime(row.receivedAt) },
          { key: 'kind', header: 'Что', render: (row) => PAYMENT_KIND_LABELS_RU[row.kind] },
          { key: 'method', header: 'Чем', render: (row) => PAYMENT_METHOD_LABELS_RU[row.method] },
          { key: 'who', header: 'Кто', render: (row) => row.receivedByName },
          {
            key: 'amount',
            header: 'Сумма',
            align: 'right',
            render: (row) => (
              <span className={cn('tabular-nums', row.kind === PaymentKind.REFUND ? 'text-danger' : undefined)}>
                {row.kind === PaymentKind.REFUND ? '−' : ''}
                {formatMoney(parseMoney(row.amount))}
              </span>
            ),
          },
        ]}
      />

      <Modal
        open={mode !== null}
        title={mode === 'refund' ? 'Возврат клиенту' : 'Принять оплату'}
        onClose={() => {
          setMode(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setMode(null);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={accept.isPending || refund.isPending}
              disabled={parsed <= 0}
              onClick={() => {
                const trimmed = comment.trim();
                if (mode === 'refund') {
                  refund.mutate({ orderId, amount: parsed, method, ...(trimmed === '' ? {} : { comment: trimmed }) });
                } else {
                  accept.mutate({ id: orderId, amount: parsed, method, ...(trimmed === '' ? {} : { comment: trimmed }) });
                }
              }}
            >
              {mode === 'refund' ? 'Вернул' : 'Принял'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error?.message ?? null} />
          <Field
            label="Сумма, сум"
            hint={
              mode === 'refund'
                ? `Оплачено по заказу: ${formatMoney(paidValue)} — больше не вернуть`
                : `Остаток по заказу: ${formatMoney(remainingValue)}`
            }
          >
            <MoneyInput value={amount} onChange={setAmount} placeholder="0" />
          </Field>
          <Field label={mode === 'refund' ? 'Чем вернули' : 'Способ оплаты'}>
            <Select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as PaymentMethodName);
              }}
              options={PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS_RU[value] }))}
            />
          </Field>
          {mode === 'refund' && (
            <Field label="Причина" hint="Останется в проводке и в журнале">
              <Textarea
                rows={2}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
              />
            </Field>
          )}
        </div>
      </Modal>
    </Card>
  );
}

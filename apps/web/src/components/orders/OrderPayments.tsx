'use client';

import {
  formatMoney,
  parseMoney,
  PAYMENT_KIND_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Modal, MoneyInput, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

/**
 * Платежи по заказу и «Принять оплату».
 *
 * Кто и чем заплатил — из `payments`; сумма по умолчанию — остаток, потому
 * что обычно берут всё. Кому можно принимать, решает сервер: продавец,
 * создавший заказ, его установщик и руководство.
 */
export function OrderPayments({
  orderId,
  remaining,
  canAccept,
}: {
  readonly orderId: number;
  readonly remaining: string | null;
  readonly canAccept: boolean;
}): ReactElement | null {
  const toast = useToast();
  const utils = trpc.useUtils();
  const history = trpc.payments.byOrder.useQuery({ orderId });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);

  const remainingValue = remaining === null ? 0 : parseMoney(remaining);

  const accept = trpc.payments.acceptForOrder.useMutation({
    async onSuccess() {
      setOpen(false);
      toast.success('Оплата принята');
      await Promise.all([
        utils.orders.byId.invalidate({ id: orderId }),
        utils.payments.byOrder.invalidate({ orderId }),
      ]);
    },
  });

  const rows = history.data ?? [];
  if (rows.length === 0 && !(canAccept && remainingValue > 0)) return null;

  const parsed = Number.parseFloat(amount.replace(',', '.')) || 0;

  return (
    <Card>
      <CardHeader
        title="Оплаты"
        action={
          canAccept && remainingValue > 0 ? (
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                accept.reset();
                setAmount(String(remainingValue / 100));
                setOpen(true);
              }}
            >
              Принять оплату
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <DataTable
          isLoading={history.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage="Платежей пока нет"
          columns={[
            { key: 'when', header: 'Когда', render: (row) => formatDateTime(row.receivedAt) },
            { key: 'kind', header: 'Что', render: (row) => PAYMENT_KIND_LABELS_RU[row.kind] },
            { key: 'method', header: 'Чем', render: (row) => PAYMENT_METHOD_LABELS_RU[row.method] },
            { key: 'who', header: 'Принял', render: (row) => row.receivedByName },
            {
              key: 'amount',
              header: 'Сумма',
              align: 'right',
              render: (row) => <span className="font-figure tabular-nums">{formatMoney(parseMoney(row.amount))}</span>,
            },
          ]}
        />
      </CardBody>

      <Modal
        open={open}
        title="Принять оплату"
        onClose={() => {
          setOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={accept.isPending}
              disabled={parsed <= 0}
              onClick={() => {
                accept.mutate({ id: orderId, amount: parsed, method });
              }}
            >
              Принял
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={accept.error?.message ?? null} />
          <Field label="Сумма, сум" hint={`Остаток по заказу: ${formatMoney(remainingValue)}`}>
            <MoneyInput value={amount} onChange={setAmount} placeholder="0" />
          </Field>
          <Field label="Способ оплаты">
            <Select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as PaymentMethodName);
              }}
              options={PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS_RU[value] }))}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

'use client';

import {
  formatMoney,
  parseMoney,
  PURCHASE_UNIT_LABELS_RU,
  Role,
} from '@curtain-crm/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

/**
 * Закупки по заказу и его себестоимость.
 *
 * Цена подставляется из каталога, но остаётся редактируемой: на рынке ткань
 * часто берут дороже или дешевле прайса, и заставлять править каталог ради
 * одной покупки — верный способ получить каталог с неверными ценами.
 * В строку закупки сохраняется СНИМОК цены, поэтому себестоимость заказа
 * не поедет при следующем изменении прайса.
 */
export function OrderPurchases({ orderId }: { readonly orderId: number }): ReactElement {
  const { hasRole } = useAuth();
  const canAdd = hasRole(Role.CEO, Role.ADMIN, Role.MASTER, Role.SEWER);
  const canRemove = hasRole(Role.CEO, Role.ADMIN);

  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [comment, setComment] = useState('');

  const list = trpc.purchases.listByOrder.useQuery({ orderId });
  const cost = trpc.purchases.orderCost.useQuery({ orderId });
  const catalog = trpc.purchases.items.list.useQuery({}, { enabled: open });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.purchases.listByOrder.invalidate({ orderId }),
      utils.purchases.orderCost.invalidate({ orderId }),
    ]);
  };

  const add = trpc.purchases.add.useMutation({
    async onSuccess() {
      setOpen(false);
      setItemId('');
      setQuantity('1');
      setUnitPrice('');
      setComment('');
      await refresh();
    },
  });

  const remove = trpc.purchases.remove.useMutation({ onSuccess: refresh });

  /** При выборе товара подставляем его текущую цену как значение по умолчанию. */
  const handleItemChange = (nextId: string): void => {
    setItemId(nextId);
    const chosen = (catalog.data ?? []).find((item) => item.id.toString() === nextId);
    setUnitPrice(chosen === undefined ? '' : chosen.price);
  };

  return (
    <Card>
      <CardHeader
        title="Закупки и себестоимость"
        action={
          canAdd && (
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Провести закупку
            </Button>
          )
        }
      />

      <CardBody className="pb-0">
        {cost.isLoading ? (
          <Skeleton className="h-12" />
        ) : cost.data === undefined ? null : (
          // Выручка, маржа и рентабельность приходят `null`, если сотрудник
          // не из руководства. Показывать «—» вместо них не стоит: пустой
          // прочерк читается как «данных нет», хотя они просто не положены.
          <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
            {cost.data.revenueFormatted !== null && (
              <Metric label="Выручка" value={cost.data.revenueFormatted} />
            )}
            <Metric label="Закупки" value={cost.data.costFormatted} />
            {cost.data.marginFormatted !== null && cost.data.marginMinor !== null && (
              <Metric
                label="Маржа"
                value={cost.data.marginFormatted}
                tone={cost.data.marginMinor >= 0 ? 'positive' : 'danger'}
              />
            )}
            {cost.data.marginPercent !== null && (
              <Metric
                label="Рентабельность"
                value={`${cost.data.marginPercent.toFixed(1)}%`}
              />
            )}
          </dl>
        )}
      </CardBody>

      <DataTable
        isLoading={list.isLoading}
        rows={list.data ?? []}
        rowKey={(row) => row.id}
        emptyMessage="Закупок по этому заказу пока нет"
        columns={[
          {
            key: 'item',
            header: 'Товар',
            render: (row) => <span className="text-primary">{row.itemName}</span>,
          },
          {
            key: 'qty',
            header: 'Количество',
            align: 'right',
            render: (row) =>
              `${Number.parseFloat(row.quantity).toString()} ${PURCHASE_UNIT_LABELS_RU[row.unit]}`,
          },
          {
            key: 'price',
            header: 'Цена',
            align: 'right',
            render: (row) => formatMoney(parseMoney(row.unitPrice)),
          },
          {
            key: 'total',
            header: 'Итого',
            align: 'right',
            render: (row) => (
              <span className="text-primary">
                {row.totalPrice === null ? '—' : formatMoney(parseMoney(row.totalPrice))}
              </span>
            ),
          },
          { key: 'author', header: 'Провёл', render: (row) => row.createdByName },
          { key: 'date', header: 'Дата', render: (row) => formatDate(row.createdAt) },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) =>
              canRemove ? (
                <button
                  type="button"
                  aria-label="Удалить закупку"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate({ id: row.id });
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null,
          },
        ]}
      />

      <Modal
        open={open}
        title="Новая закупка"
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
              loading={add.isPending}
              disabled={itemId === ''}
              onClick={() => {
                add.mutate({
                  orderId,
                  itemId: Number.parseInt(itemId, 10),
                  quantity: Number.parseFloat(quantity.replace(',', '.')) || 0,
                  ...(unitPrice.trim().length > 0
                    ? { unitPrice: Number.parseFloat(unitPrice.replace(',', '.')) || 0 }
                    : {}),
                  ...(comment.trim().length > 0 ? { comment: comment.trim() } : {}),
                });
              }}
            >
              Провести
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={add.error?.message ?? null} />

          <Field label="Товар" required>
            <Select
              value={itemId}
              onChange={(event) => {
                handleItemChange(event.target.value);
              }}
              placeholder="Выберите из каталога"
              options={(catalog.data ?? []).map((item) => ({
                value: item.id.toString(),
                label: `${item.name} — ${formatMoney(parseMoney(item.price))} / ${PURCHASE_UNIT_LABELS_RU[item.unit]}${item.isActive ? '' : ' (выведен)'}`,
              }))}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Количество" required>
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
              />
            </Field>

            <Field label="Цена за единицу, сум" hint="По умолчанию — из каталога">
              <Input
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => {
                  setUnitPrice(event.target.value);
                }}
              />
            </Field>
          </div>

          <Field label="Комментарий">
            <Input
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              placeholder="Например: взяли на Чорсу, дешевле прайса"
            />
          </Field>

          {itemId !== '' && (
            <p className="text-[12px] text-secondary">
              {`Сумма строки: ${formatMoney(
                Math.round(
                  parseMoney(Number.parseFloat(unitPrice.replace(',', '.')) || 0) *
                    (Number.parseFloat(quantity.replace(',', '.')) || 0),
                ),
              )}`}
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'positive' | 'danger';
}): ReactElement {
  const color =
    tone === 'positive' ? 'text-positive' : tone === 'danger' ? 'text-danger' : 'text-primary';

  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${color}`}>{value}</dd>
    </div>
  );
}


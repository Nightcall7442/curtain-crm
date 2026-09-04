'use client';

import {
  formatMoney,
  parseMoney,
  PURCHASE_CATEGORIES,
  PURCHASE_CATEGORY_LABELS_RU,
  PURCHASE_UNIT_LABELS_RU,
  PURCHASE_UNITS,
  type PurchaseCategory,
  type PurchaseUnit,
} from '@curtain-crm/shared';
import { Package, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';

/**
 * Касса: розничный прайс и остатки на витрине.
 *
 * Цену и приход товара ведёт руководство — продавец в приложении только
 * пробивает чеки. Закупочных цен здесь нет вовсе: они в разделе «Закупки»
 * и к витрине отношения не имеют.
 *
 * Приход прибавляется к остатку, а не заменяет его: «привезли ещё 20
 * метров» — то, что происходит на самом деле. Списание недостачи делается
 * тем же полем с минусом, и обе операции попадают в журнал действий.
 */
export default function RetailPage(): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [editing, setEditing] = useState<{ id?: number } | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<PurchaseUnit>('pcs');
  const [category, setCategory] = useState<PurchaseCategory>('other');
  const [price, setPrice] = useState('');

  /** Позиция, которой добавляют приход. `null` — окно закрыто. */
  const [stocking, setStocking] = useState<{ id: number; name: string } | null>(null);
  const [stockDelta, setStockDelta] = useState('');
  const [stockComment, setStockComment] = useState('');

  const items = trpc.retail.items.list.useQuery({ includeInactive: true });
  const sales = trpc.retail.sales.list.useQuery({ page: 1, pageSize: 10 });

  const refresh = (): void => {
    void utils.retail.items.list.invalidate();
  };

  const upsert = trpc.retail.items.upsert.useMutation({
    onSuccess() {
      setEditing(null);
      toast.success('Прайс обновлён');
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось сохранить', error.message);
    },
  });

  const setActive = trpc.retail.items.setActive.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      toast.error('Не удалось изменить', error.message);
    },
  });

  const addStock = trpc.retail.items.addStock.useMutation({
    onSuccess(item) {
      setStocking(null);
      setStockDelta('');
      setStockComment('');
      toast.success('Остаток обновлён', `${item.name}: ${item.stockQuantity}`);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось оприходовать', error.message);
    },
  });

  const openEditor = (item?: {
    id: number;
    name: string;
    unit: PurchaseUnit;
    category: PurchaseCategory;
    price: string;
  }): void => {
    setEditing(item === undefined ? {} : { id: item.id });
    setName(item?.name ?? '');
    setUnit(item?.unit ?? 'pcs');
    setCategory(item?.category ?? 'other');
    setPrice(item === undefined ? '' : Number.parseFloat(item.price).toString());
    upsert.reset();
  };

  if (items.isError) {
    return (
      <Card>
        <ErrorState
          message={items.error.message}
          onRetry={() => {
            void items.refetch();
          }}
        />
      </Card>
    );
  }

  const rows = items.data ?? [];
  const active = rows.filter((row) => row.isActive);
  const stockValue = active.reduce(
    (sum, row) => sum + parseMoney(row.price) * Number.parseFloat(row.stockQuantity),
    0,
  );
  const soldToday = (sales.data?.items ?? []).reduce(
    (sum, sale) => sum + parseMoney(sale.total),
    0,
  );

  const errors = fieldErrors(upsert.error);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Позиций на витрине"
          value={active.length.toString()}
          caption={`Всего в прайсе: ${rows.length.toString()}`}
        />
        <StatCard
          label="Товара на витрине"
          value={formatMoney(stockValue)}
          caption="По розничным ценам"
        />
        <StatCard
          label="Последние чеки"
          value={formatMoney(soldToday)}
          caption={`${(sales.data?.items.length ?? 0).toString()} чеков`}
        />
      </section>

      <Card>
        <CardHeader
          title="Прайс витрины"
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                openEditor();
              }}
            >
              Добавить товар
            </Button>
          }
        />

        <DataTable
          isLoading={items.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage="Прайс пуст — добавьте первый товар"
          columns={[
            {
              key: 'name',
              header: 'Товар',
              sortValue: (row) => row.name,
              render: (row) => (
                <span className="block">
                  <span className={row.isActive ? 'text-primary' : 'text-muted line-through'}>
                    {row.name}
                  </span>
                  <span className="block text-footnote text-muted">
                    {PURCHASE_CATEGORY_LABELS_RU[row.category]}
                  </span>
                </span>
              ),
            },
            {
              key: 'price',
              header: 'Цена',
              align: 'right',
              sortValue: (row) => parseMoney(row.price),
              render: (row) =>
                `${formatMoney(parseMoney(row.price))} / ${PURCHASE_UNIT_LABELS_RU[row.unit]}`,
            },
            {
              key: 'stock',
              header: 'Остаток',
              align: 'right',
              sortValue: (row) => Number.parseFloat(row.stockQuantity),
              render: (row) => {
                const stock = Number.parseFloat(row.stockQuantity);
                return (
                  <span className={stock <= 0 ? 'text-danger' : 'text-primary'}>
                    {`${stock.toString()} ${PURCHASE_UNIT_LABELS_RU[row.unit]}`}
                  </span>
                );
              },
            },
            {
              key: 'status',
              header: 'Статус',
              render: (row) => (
                <Badge tone={row.isActive ? 'positive' : 'neutral'}>
                  {row.isActive ? 'На витрине' : 'Снят'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Package className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => {
                      setStocking({ id: row.id, name: row.name });
                    }}
                  >
                    Приход
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      openEditor(row);
                    }}
                  >
                    Цена
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={setActive.isPending}
                    onClick={() => {
                      setActive.mutate({ id: row.id, isActive: !row.isActive });
                    }}
                  >
                    {row.isActive ? 'Снять' : 'Вернуть'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Последние чеки" />
        <DataTable
          isLoading={sales.isLoading}
          rows={sales.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Чеков пока нет"
          columns={[
            { key: 'seller', header: 'Продавец', render: (row) => row.sellerName },
            {
              key: 'client',
              header: 'Клиент',
              render: (row) => row.clientName ?? <span className="text-muted">—</span>,
            },
            { key: 'lines', header: 'Позиций', align: 'right', render: (row) => row.lines },
            {
              key: 'total',
              header: 'Итог',
              align: 'right',
              render: (row) => formatMoney(parseMoney(row.total)),
            },
          ]}
        />
      </Card>

      {/* --- Товар и цена ------------------------------------------------ */}
      <Modal
        open={editing !== null}
        title={editing?.id === undefined ? 'Новый товар' : 'Цена товара'}
        onClose={() => {
          setEditing(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={upsert.isPending}
              disabled={name.trim().length === 0 || price.trim().length === 0}
              onClick={() => {
                upsert.mutate({
                  ...(editing?.id === undefined ? {} : { id: editing.id }),
                  name: name.trim(),
                  unit,
                  category,
                  price: Number.parseFloat(price.replace(',', '.')) || 0,
                });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError
            message={Object.keys(errors).length === 0 ? (upsert.error?.message ?? null) : null}
          />

          <Field label="Название" required error={errors['name']}>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Тюль органза"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Единица">
              <Select
                value={unit}
                onChange={(event) => {
                  setUnit(event.target.value as PurchaseUnit);
                }}
                options={PURCHASE_UNITS.map((value) => ({
                  value,
                  label: PURCHASE_UNIT_LABELS_RU[value],
                }))}
              />
            </Field>

            <Field label="Категория">
              <Select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as PurchaseCategory);
                }}
                options={PURCHASE_CATEGORIES.map((value) => ({
                  value,
                  label: PURCHASE_CATEGORY_LABELS_RU[value],
                }))}
              />
            </Field>
          </div>

          <Field label="Цена для клиента, сум" required error={errors['price']}>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
              }}
              placeholder="45000"
            />
          </Field>

          <p className="text-overline text-muted">
            Это розничная цена. Закупочная живёт отдельно, в разделе «Закупки»,
            и продавцу не показывается.
          </p>
        </div>
      </Modal>

      {/* --- Приход товара ----------------------------------------------- */}
      <Modal
        open={stocking !== null}
        title={stocking === null ? '' : `Приход: ${stocking.name}`}
        onClose={() => {
          setStocking(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setStocking(null);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={addStock.isPending}
              disabled={(Number.parseFloat(stockDelta.replace(',', '.')) || 0) === 0}
              onClick={() => {
                if (stocking === null) return;
                addStock.mutate({
                  id: stocking.id,
                  quantity: Number.parseFloat(stockDelta.replace(',', '.')) || 0,
                  ...(stockComment.trim().length === 0 ? {} : { comment: stockComment.trim() }),
                });
              }}
            >
              Оприходовать
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={addStock.error?.message ?? null} />

          <Field
            label="Сколько поступило"
            required
            hint="Прибавится к текущему остатку. Со знаком минус — списание недостачи"
          >
            <Input
              inputMode="decimal"
              value={stockDelta}
              onChange={(event) => {
                setStockDelta(event.target.value);
              }}
              placeholder="20"
            />
          </Field>

          <Field label="Комментарий" hint="Откуда приход или почему списание">
            <Input
              value={stockComment}
              onChange={(event) => {
                setStockComment(event.target.value);
              }}
              placeholder="Поставка от 04.09"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

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
import { EyeOff, Eye, Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';

/**
 * Каталог закупочных товаров.
 *
 * Изменение цены здесь НЕ затрагивает уже проведённые закупки: в строке
 * закупки хранится снимок цены на момент проведения. Иначе повышение прайса
 * задним числом меняло бы маржу по закрытым заказам.
 */
export function PurchaseItemManager(): ReactElement {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<PurchaseUnit>('m');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<PurchaseCategory>('fabric');

  const utils = trpc.useUtils();
  const list = trpc.purchases.items.list.useQuery({ includeInactive: true });

  const refresh = async (): Promise<void> => {
    await utils.purchases.items.list.invalidate();
  };

  const close = (): void => {
    setOpen(false);
    setEditingId(null);
    setName('');
    setPrice('');
    create.reset();
    update.reset();
  };

  const create = trpc.purchases.items.create.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const update = trpc.purchases.items.update.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const setActive = trpc.purchases.items.setActive.useMutation({ onSuccess: refresh });

  return (
    <Card>
      <CardHeader
        title="Каталог закупочных товаров"
        action={
          <Button
            onClick={() => {
              setEditingId(null);
              setName('');
              setPrice('');
              setUnit('m');
              setCategory('fabric');
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Добавить товар
          </Button>
        }
      />

      <DataTable
        isLoading={list.isLoading}
        rows={list.data ?? []}
        rowKey={(row) => row.id}
        emptyMessage="Каталог пуст — добавьте первый товар"
        columns={[
          {
            key: 'name',
            header: 'Товар',
            render: (row) => <span className="text-primary">{row.name}</span>,
          },
          {
            key: 'category',
            header: 'Категория',
            render: (row) => PURCHASE_CATEGORY_LABELS_RU[row.category],
          },
          { key: 'unit', header: 'Ед.', render: (row) => PURCHASE_UNIT_LABELS_RU[row.unit] },
          {
            key: 'price',
            header: 'Цена',
            align: 'right',
            render: (row) => (
              <span className="text-primary">{formatMoney(parseMoney(row.price))}</span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => (
              <Badge tone={row.isActive ? 'positive' : 'neutral'}>
                {row.isActive ? 'В обращении' : 'Выведен'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <span className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  aria-label={`Изменить ${row.name}`}
                  onClick={() => {
                    setEditingId(row.id);
                    setName(row.name);
                    setUnit(row.unit);
                    setPrice(row.price);
                    setCategory(row.category);
                    setOpen(true);
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  aria-label={row.isActive ? `Вывести ${row.name}` : `Вернуть ${row.name}`}
                  disabled={setActive.isPending}
                  onClick={() => {
                    setActive.mutate({ id: row.id, isActive: !row.isActive });
                  }}
                  className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-primary disabled:opacity-40"
                >
                  {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </span>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title={editingId === null ? 'Новый товар' : 'Правка товара'}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Отмена
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              disabled={name.trim().length === 0}
              onClick={() => {
                const value = Number.parseFloat(price.replace(',', '.')) || 0;
                if (editingId === null) {
                  create.mutate({ name: name.trim(), unit, price: value, category });
                } else {
                  update.mutate({ id: editingId, name: name.trim(), unit, price: value, category });
                }
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={create.error?.message ?? update.error?.message ?? null} />

          <Field label="Название" required>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Ткань блэкаут"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
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

            <Field label="Цена, сум" required>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                }}
                placeholder="85000"
              />
            </Field>
          </div>

          {editingId !== null && (
            <p className="text-[11.5px] text-muted">
              Изменение цены не затронет уже проведённые закупки — в них
              сохранена цена на момент покупки.
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
}

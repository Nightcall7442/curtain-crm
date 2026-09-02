'use client';

import {
  formatMoney,
  parseMoney,
  PURCHASE_CATEGORIES,
  PURCHASE_CATEGORY_LABELS_RU,
  PURCHASE_UNIT_LABELS_RU,
  PURCHASE_UNITS,
  PurchaseCategory,
  type PurchaseCategory as PurchaseCategoryName,
  PurchaseUnit,
  type PurchaseUnit as PurchaseUnitName,
} from '@curtain-crm/shared';
import { EyeOff, Eye, Package, Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, IconButton, Input, Modal, Select } from '@/components/ui/Form';
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
  const [unit, setUnit] = useState<PurchaseUnitName>(PurchaseUnit.METER);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<PurchaseCategoryName>(PurchaseCategory.FABRIC);

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
    // `overflow-hidden` обрезает таблицу по скруглению карточки: без него
    // последняя строка выходит за угол прямым краем.
    <Card className="overflow-hidden">
      <CardHeader
        title="Каталог закупочных товаров"
        icon={<Package className="h-4 w-4" />}
        level={3}
        action={
          <Button
            icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              setEditingId(null);
              setName('');
              setPrice('');
              setUnit(PurchaseUnit.METER);
              setCategory(PurchaseCategory.FABRIC);
              setOpen(true);
            }}
          >
            Добавить товар
          </Button>
        }
      />

      <p className="border-b border-subtle px-4 py-2.5 text-footnote text-muted">
        Цена здесь — текущая, для новых закупок. Уже проведённые закупки хранят
        цену на момент покупки и от правок в каталоге не меняются.
      </p>

      <DataTable
        isLoading={list.isLoading}
        rows={list.data ?? []}
        rowKey={(row) => row.id}
        emptyMessage="Каталог пуст — добавьте первый товар"
        columns={[
          {
            key: 'name',
            header: 'Товар',
            /*
              Название забирает весь свободный простор, остальные колонки
              ужимаются по содержимому. Без этого таблица делила ширину
              поровну, и между «Статусом» и кнопками справа зияла пустота
              шириной в треть карточки.
            */
            className: 'w-full',
            sortValue: (row) => row.name,
            render: (row) => <span className="font-medium text-primary">{row.name}</span>,
          },
          {
            key: 'category',
            header: 'Категория',
            className: 'whitespace-nowrap',
            sortValue: (row) => PURCHASE_CATEGORY_LABELS_RU[row.category],
            render: (row) => PURCHASE_CATEGORY_LABELS_RU[row.category],
          },
          {
            key: 'unit',
            header: 'Ед.',
            className: 'whitespace-nowrap',
            render: (row) => PURCHASE_UNIT_LABELS_RU[row.unit],
          },
          {
            key: 'price',
            header: 'Цена',
            align: 'right',
            className: 'whitespace-nowrap',
            // Сортируем по числу, а не по «85 000 сум»: иначе 9 000 окажется
            // после 85 000, как это принято у строк.
            sortValue: (row) => parseMoney(row.price),
            render: (row) => (
              <span className="font-medium tabular-nums text-primary">
                {formatMoney(parseMoney(row.price))}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Статус',
            className: 'whitespace-nowrap',
            // Выведенные из обращения — наверх по убыванию: именно их ищут,
            // когда заходят в каталог разбираться.
            sortValue: (row) => (row.isActive ? 1 : 0),
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
            className: 'whitespace-nowrap',
            render: (row) => (
              <span className="flex items-center justify-end gap-1">
                <IconButton
                  size="sm"
                  label={`Изменить «${row.name}»`}
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEditingId(row.id);
                    setName(row.name);
                    setUnit(row.unit);
                    setPrice(row.price);
                    setCategory(row.category);
                    setOpen(true);
                  }}
                />

                <IconButton
                  size="sm"
                  label={
                    row.isActive
                      ? `Вывести «${row.name}» из обращения`
                      : `Вернуть «${row.name}» в обращение`
                  }
                  disabled={setActive.isPending}
                  icon={
                    row.isActive ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => {
                    setActive.mutate({ id: row.id, isActive: !row.isActive });
                  }}
                />
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
                  setCategory(event.target.value as PurchaseCategoryName);
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
                  setUnit(event.target.value as PurchaseUnitName);
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
            <p className="text-footnote text-muted">
              Изменение цены не затронет уже проведённые закупки — в них
              сохранена цена на момент покупки.
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
}

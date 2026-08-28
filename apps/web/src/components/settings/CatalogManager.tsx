'use client';

import {
  CATALOG_KIND_LABELS_RU,
  CATALOG_KINDS,
  type CatalogKind,
} from '@curtain-crm/shared';
import { EyeOff, Eye, Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Справочники характеристик заказа.
 *
 * Позиции не удаляются, а выводятся из обращения: заказы хранят выбранное
 * значение текстом, но исчезнувшая из справочника позиция ломает аналитику
 * по моделям и материалам.
 */
export function CatalogManager(): ReactElement {
  const [kind, setKind] = useState<CatalogKind>('curtain_model');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const utils = trpc.useUtils();
  const list = trpc.catalog.list.useQuery({ kind, includeInactive: true });

  const refresh = async (): Promise<void> => {
    await utils.catalog.list.invalidate();
  };

  const close = (): void => {
    setDialogOpen(false);
    setEditingId(null);
    setName('');
    setSortOrder('0');
    create.reset();
    update.reset();
  };

  const create = trpc.catalog.create.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const update = trpc.catalog.update.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const setActive = trpc.catalog.setActive.useMutation({ onSuccess: refresh });

  return (
    <Card>
      <CardHeader
        title="Справочники характеристик заказа"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CatalogKind);
              }}
              aria-label="Справочник"
              className="w-48"
              options={CATALOG_KINDS.map((value) => ({
                value,
                label: CATALOG_KIND_LABELS_RU[value],
              }))}
            />
            <Button
              onClick={() => {
                setEditingId(null);
                setName('');
                setSortOrder('0');
                setDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Добавить
            </Button>
          </div>
        }
      />

      <CardBody>
        <p className="mb-3 text-[11.5px] text-muted">
          Эти значения предлагаются в форме заказа. Выведенные из обращения
          позиции не показываются продавцу, но остаются в старых заказах.
        </p>

        {list.isLoading ? (
          <Skeleton className="h-20" />
        ) : list.data === undefined || list.data.length === 0 ? (
          <EmptyState message="В этом справочнике пока пусто" hint="Добавьте первую позицию" />
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {list.data.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1 text-[11.5px]',
                  item.isActive
                    ? 'border-gold/40 bg-gold/10 text-gold-soft'
                    : 'border-subtle text-muted line-through',
                )}
              >
                <span>{item.name}</span>

                <button
                  type="button"
                  aria-label={`Переименовать ${item.name}`}
                  onClick={() => {
                    setEditingId(item.id);
                    setName(item.name);
                    setSortOrder(item.sortOrder.toString());
                    setDialogOpen(true);
                  }}
                  className="ml-1 text-muted transition-colors hover:text-primary"
                >
                  <Pencil className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  aria-label={item.isActive ? `Вывести ${item.name}` : `Вернуть ${item.name}`}
                  disabled={setActive.isPending}
                  onClick={() => {
                    setActive.mutate({ id: item.id, isActive: !item.isActive });
                  }}
                  className="text-muted transition-colors hover:text-primary disabled:opacity-40"
                >
                  {item.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Modal
        open={dialogOpen}
        title={editingId === null ? 'Новая позиция справочника' : 'Правка позиции'}
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
                const order = Number.parseInt(sortOrder, 10) || 0;
                if (editingId === null) {
                  create.mutate({ kind, name: name.trim(), sortOrder: order });
                } else {
                  update.mutate({ id: editingId, name: name.trim(), sortOrder: order });
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

          <Field label="Справочник">
            <Input value={CATALOG_KIND_LABELS_RU[kind]} disabled readOnly />
          </Field>

          <Field label="Название" required>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Например: Римские"
            />
          </Field>

          <Field label="Порядок в списке" hint="Меньше — выше">
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value);
              }}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

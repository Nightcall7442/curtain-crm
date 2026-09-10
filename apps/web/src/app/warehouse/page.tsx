'use client';

import {
  materialKindLabel,
  STOCK_KIND_LABELS_RU,
  STOCK_KINDS,
  stockUnitLabel,
  type StockKind,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Склад: что лежит в цехе и сколько.
 *
 * Ткани, карнизы, пластик, трубы и аксессуары — одним списком: кладовщик
 * ходит вдоль одних и тех же полок, и делить их на два раздела значило бы
 * заставлять его помнить, в каком из них искать.
 *
 * Позиция — это код с бирки, мини-описание к нему и остаток. Прихода как
 * отдельного действия нет: пришла партия — остаток пересчитывают. Расход
 * система списывает сама, когда заказ уходит в пошив, то есть когда
 * материал раскроили.
 *
 * Отрицательный остаток разрешён и показан красным: то, что забыли завести,
 * всё равно раскроили, и минус — видимый долг учёта, а не ошибка.
 */

/** Количество строкой: «12,5» и «12.5» вводят одинаково часто. */
const toQuantity = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

const formatQuantity = (raw: string, kind: StockKind): string => {
  const value = Number.parseFloat(raw);
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${stockUnitLabel(kind)}`;
};

export default function WarehousePage(): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [formOpen, setFormOpen] = useState(false);
  /** Позиция, которую правят. `null` — заводится новая. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<StockKind>('portiere_code');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('0');

  /** Позиция, которой правят остаток пересчётом. `null` — окно закрыто. */
  const [counting, setCounting] = useState<{ id: number; code: string } | null>(null);
  const [countValue, setCountValue] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockKind | 'all'>('all');

  const rows = trpc.fabric.list.useQuery({});

  const refresh = (): void => {
    void utils.fabric.list.invalidate();
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    setCode('');
    setDescription('');
    setQuantity('0');
  };

  const create = trpc.fabric.create.useMutation({
    onSuccess(row) {
      closeForm();
      toast.success('Позиция заведена', row.code);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось завести позицию', error.message);
    },
  });

  const update = trpc.fabric.update.useMutation({
    onSuccess(row) {
      closeForm();
      toast.success('Сохранено', row.code);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось сохранить', error.message);
    },
  });

  const setQuantityMutation = trpc.fabric.setMeters.useMutation({
    onSuccess(row) {
      setCounting(null);
      setCountValue('');
      toast.success('Остаток обновлён', row.code);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось обновить остаток', error.message);
    },
  });

  if (rows.isError) {
    return (
      <Card>
        <ErrorState
          message={rows.error.message}
          onRetry={() => {
            void rows.refetch();
          }}
        />
      </Card>
    );
  }

  const all = rows.data ?? [];
  const needle = search.trim().toLowerCase();

  const visible = all.filter((row) => {
    const byKind = filter === 'all' || row.kind === filter;
    const byText =
      needle === '' ||
      [row.code, row.description ?? ''].some((field) => field.toLowerCase().includes(needle));
    return byKind && byText;
  });

  /*
    Метры и штуки складывать нельзя: «сто два» из шестидесяти метров ткани и
    сорока двух держателей — число ни о чём. Поэтому в шапке два счёта.
  */
  const fabricMeters = all
    .filter((row) => row.kind !== 'accessory_code')
    .reduce((sum, row) => sum + Number.parseFloat(row.meters), 0);
  const accessoryPieces = all
    .filter((row) => row.kind === 'accessory_code')
    .reduce((sum, row) => sum + Number.parseFloat(row.meters), 0);
  const debts = all.filter((row) => Number.parseFloat(row.meters) < 0);

  const errors = fieldErrors(editingId === null ? create.error : update.error);

  const openNew = (): void => {
    create.reset();
    update.reset();
    closeForm();
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Метров на складе"
          value={fabricMeters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
          caption="Ткань, карнизы, пластик и трубы"
        />
        <StatCard
          label="Аксессуаров, шт"
          value={accessoryPieces.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
          caption="Держатели, султанчики, бубоны"
        />
        <StatCard
          label="Позиций в минусе"
          value={debts.length.toString()}
          caption="Раскроили то, что не завели"
        />
      </section>

      <Card>
        <CardHeader
          title="Склад"
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={openNew}
            >
              Позиция
            </Button>
          }
        />

        <div className="space-y-3 px-4 pb-3">
          {/* Виды — рядом кнопок, как справочники в настройках. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид материала">
            {(['all', ...STOCK_KINDS] as const).map((value) => {
              const active = value === filter;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(value);
                  }}
                  className={cn(
                    'pressable h-8 rounded-tile border px-3 text-footnote font-medium',
                    active
                      ? 'border-nav bg-nav text-nav-text'
                      : 'border-subtle bg-panel text-secondary hover:bg-raised hover:text-primary',
                  )}
                >
                  {value === 'all' ? 'Все' : STOCK_KIND_LABELS_RU[value]}
                </button>
              );
            })}
          </div>

          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Поиск по коду или описанию"
          />
        </div>

        <DataTable
          isLoading={rows.isLoading}
          rows={visible}
          rowKey={(row) => row.id}
          emptyMessage={
            all.length === 0 ? 'Склад пуст — заведите первую позицию' : 'По этому запросу ничего нет'
          }
          emptyAction={
            all.length === 0 ? (
              <Button size="sm" onClick={openNew}>
                Завести позицию
              </Button>
            ) : undefined
          }
          columns={[
            {
              key: 'code',
              header: 'Код',
              sortValue: (row) => row.code,
              render: (row) => <span className="text-primary">{row.code}</span>,
            },
            {
              key: 'kind',
              header: 'Вид',
              sortValue: (row) => row.kind,
              render: (row) => materialKindLabel(row.kind),
            },
            {
              /*
                Вместо филиала — описание: филиал у кладовщика один и тот же
                весь день, а чем эта партия отличается от такой же — вопрос,
                который задают у полки.
              */
              key: 'description',
              header: 'Описание',
              sortValue: (row) => row.description ?? '',
              render: (row) =>
                row.description === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="text-secondary">{row.description}</span>
                ),
            },
            {
              key: 'quantity',
              header: 'Остаток',
              align: 'right',
              sortValue: (row) => Number.parseFloat(row.meters),
              render: (row) => (
                <span className={Number.parseFloat(row.meters) < 0 ? 'text-danger' : 'text-primary'}>
                  {formatQuantity(row.meters, row.kind as StockKind)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      create.reset();
                      update.reset();
                      setEditingId(row.id);
                      setKind(row.kind as StockKind);
                      setCode(row.code);
                      setDescription(row.description ?? '');
                      setFormOpen(true);
                    }}
                  >
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCounting({ id: row.id, code: row.code });
                      setCountValue(Number.parseFloat(row.meters).toString());
                      setQuantityMutation.reset();
                    }}
                  >
                    Пересчитать
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={formOpen}
        title={editingId === null ? 'Новая позиция склада' : 'Правка позиции'}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Отмена
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              disabled={code.trim() === ''}
              onClick={() => {
                const card = {
                  code: code.trim(),
                  description: description.trim() === '' ? null : description.trim(),
                };

                if (editingId === null) {
                  create.mutate({ ...card, kind, quantity: toQuantity(quantity) });
                } else {
                  update.mutate({ id: editingId, ...card });
                }
              }}
            >
              {editingId === null ? 'Завести' : 'Сохранить'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError
            message={
              editingId === null
                ? create.error !== null && Object.keys(errors).length === 0
                  ? create.error.message
                  : null
                : update.error !== null && Object.keys(errors).length === 0
                  ? update.error.message
                  : null
            }
          />

          {/* Вид у заведённой позиции не меняется: это другой остаток. */}
          {editingId === null && (
            <Field label="Что это" required>
              <Select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as StockKind);
                }}
                options={STOCK_KINDS.map((value) => ({
                  value,
                  label: STOCK_KIND_LABELS_RU[value],
                }))}
              />
            </Field>
          )}

          <Field label="Код с бирки" required error={errors['code']}>
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              placeholder="Например: П-31"
            />
          </Field>

          <Field label="Мини-описание" hint="Чем эта партия отличается: оттенок, плотность, размер">
            <Input
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              placeholder="Например: тёмная сторона, плотный блэкаут"
            />
          </Field>

          {editingId === null && (
            <Field label={`Остаток, ${stockUnitLabel(kind)}`} error={errors['quantity']}>
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
                placeholder="0"
              />
            </Field>
          )}
        </div>
      </Modal>

      <Modal
        open={counting !== null}
        title={`Пересчёт: ${counting?.code ?? ''}`}
        onClose={() => {
          setCounting(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCounting(null);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={setQuantityMutation.isPending}
              onClick={() => {
                if (counting === null) return;
                setQuantityMutation.mutate({
                  id: counting.id,
                  meters: toQuantity(countValue),
                });
              }}
            >
              Сохранить остаток
            </Button>
          </>
        }
      >
        <Field label="Сколько намерили" hint="Число «сколько стало», а не «сколько прибавить»">
          <Input
            inputMode="decimal"
            value={countValue}
            onChange={(event) => {
              setCountValue(event.target.value);
            }}
            placeholder="0"
          />
        </Field>
      </Modal>
    </div>
  );
}

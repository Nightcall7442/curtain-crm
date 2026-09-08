'use client';

import {
  MATERIAL_CODE_KINDS,
  MATERIAL_SLOT_LABELS_RU,
  MATERIAL_SLOTS,
  materialKindLabel,
  type MaterialSlot,
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
 * Склад тканей: сколько метров какого кода лежит в цехе.
 *
 * До него складского учёта не было вовсе — закупки давали себестоимость
 * заказа, а на вопрос «сколько метров П-31 осталось» отвечали, пересчитывая
 * рулоны глазами.
 *
 * Учёт идёт по коду с этикетки: тому же, который продавец вводит в заказе, а
 * руководитель заводит в справочнике. Приход заносится руками — привезли
 * рулон, записали; расход система списывает сама, когда заказ уходит в
 * пошив, то есть когда ткань раскроили.
 *
 * Отрицательный остаток разрешён и показан красным: ткань, которую забыли
 * оприходовать, всё равно раскроили, и минус — это видимый долг учёта, а не
 * ошибка. Обрезать его до нуля значило бы спрятать и метры, и ошибку.
 */

/** Метраж строкой: «12,5» и «12.5» вводят одинаково часто. */
const toMeters = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

const formatMeters = (raw: string): string => {
  const value = Number.parseFloat(raw);
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} м`;
};

export default function WarehousePage(): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [receiving, setReceiving] = useState(false);
  const [slot, setSlot] = useState<MaterialSlot>('portiere');
  const [branchId, setBranchId] = useState('');
  const [code, setCode] = useState('');
  const [meters, setMeters] = useState('');
  const [comment, setComment] = useState('');

  /** Позиция, которой правят остаток пересчётом. `null` — окно закрыто. */
  const [counting, setCounting] = useState<{ id: number; code: string } | null>(null);
  const [countValue, setCountValue] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MaterialSlot | 'all'>('all');

  const rows = trpc.fabric.list.useQuery({});
  const branches = trpc.branches.list.useQuery({});

  /*
    Коды подсказываются из справочника: приход заводят по той же бирке, что
    продавец вводит в заказе, и набранный на слух код разошёлся бы с ней.
  */
  const catalog = trpc.catalog.list.useQuery({ kind: MATERIAL_CODE_KINDS[slot] });

  const refresh = (): void => {
    void utils.fabric.list.invalidate();
  };

  const closeForm = (): void => {
    setReceiving(false);
    setCode('');
    setMeters('');
    setComment('');
    setBranchId('');
  };

  const receive = trpc.fabric.receive.useMutation({
    onSuccess(row) {
      closeForm();
      toast.success('Приход записан', `${row.code}: ${formatMeters(row.meters)}`);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось записать приход', error.message);
    },
  });

  const setMetersMutation = trpc.fabric.setMeters.useMutation({
    onSuccess(row) {
      setCounting(null);
      setCountValue('');
      toast.success('Остаток обновлён', `${row.code}: ${formatMeters(row.meters)}`);
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
    const bySlot = filter === 'all' || row.kind === MATERIAL_CODE_KINDS[filter];
    const byText =
      needle === '' ||
      [row.code, row.description ?? ''].some((field) => field.toLowerCase().includes(needle));
    return bySlot && byText;
  });

  const totalMeters = all.reduce((sum, row) => sum + Number.parseFloat(row.meters), 0);
  const debts = all.filter((row) => Number.parseFloat(row.meters) < 0);

  const errors = fieldErrors(receive.error);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Метров на складе"
          value={totalMeters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
          caption={`Кодов: ${all.length.toString()}`}
        />
        <StatCard
          label="Кодов в минусе"
          value={debts.length.toString()}
          caption="Раскроили то, что не оприходовали"
        />
        {/*
          Третьей карточки нет намеренно: «списывается при раскрое» — это
          правило, а не показатель, и место числа оно занимало зря.
        */}
      </section>

      <Card>
        <CardHeader
          title="Склад тканей"
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                receive.reset();
                closeForm();
                setReceiving(true);
              }}
            >
              Приход
            </Button>
          }
        />

        <div className="space-y-3 px-4 pb-3">
          {/* Виды — рядом кнопок, как справочники в настройках. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид материала">
            {(['all', ...MATERIAL_SLOTS] as const).map((value) => {
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
                  {value === 'all' ? 'Все' : MATERIAL_SLOT_LABELS_RU[value]}
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
            all.length === 0
              ? 'Склад пуст — запишите первый приход'
              : 'По этому запросу ничего нет'
          }
          columns={[
            {
              key: 'code',
              header: 'Код',
              sortValue: (row) => row.code,
              render: (row) => (
                <span className="block">
                  <span className="block text-primary">{row.code}</span>
                  {row.description !== null && (
                    <span className="block text-footnote text-muted">{row.description}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'kind',
              header: 'Вид',
              sortValue: (row) => row.kind,
              render: (row) => materialKindLabel(row.kind),
            },
            {
              key: 'branch',
              header: 'Филиал',
              sortValue: (row) => row.branchName,
              render: (row) => row.branchName,
            },
            {
              key: 'meters',
              header: 'Остаток',
              align: 'right',
              sortValue: (row) => Number.parseFloat(row.meters),
              render: (row) => (
                <span
                  className={
                    Number.parseFloat(row.meters) < 0 ? 'text-danger' : 'text-primary'
                  }
                >
                  {formatMeters(row.meters)}
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
                      setCounting({ id: row.id, code: row.code });
                      setCountValue(Number.parseFloat(row.meters).toString());
                      setMetersMutation.reset();
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
        open={receiving}
        title="Приход ткани"
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Отмена
            </Button>
            <Button
              loading={receive.isPending}
              disabled={code.trim() === '' || toMeters(meters) <= 0}
              onClick={() => {
                receive.mutate({
                  kind: MATERIAL_CODE_KINDS[slot],
                  code: code.trim(),
                  meters: toMeters(meters),
                  ...(branchId === '' ? {} : { branchId: Number.parseInt(branchId, 10) }),
                  ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
                });
              }}
            >
              Записать приход
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError
            message={
              receive.error !== null && Object.keys(errors).length === 0
                ? receive.error.message
                : null
            }
          />

          <Field label="Что привезли" required>
            <Select
              value={slot}
              onChange={(event) => {
                setSlot(event.target.value as MaterialSlot);
                setCode('');
              }}
              options={MATERIAL_SLOTS.map((value) => ({
                value,
                label: MATERIAL_SLOT_LABELS_RU[value],
              }))}
            />
          </Field>

          <Field
            label="Код с этикетки"
            required
            error={errors['code']}
            hint="Тот же, что продавец вводит в заказе"
          >
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              placeholder="Например: П-31"
              list="fabric-codes"
            />
            {/*
              Подсказка списком, а не выбором из справочника: код на рулоне
              бывает и такой, которого в справочнике ещё нет, — не принимать
              его значило бы не принять привезённую ткань.
            */}
            <datalist id="fabric-codes">
              {(catalog.data ?? []).map((entry) => (
                <option key={entry.id} value={entry.name}>
                  {entry.description ?? ''}
                </option>
              ))}
            </datalist>
          </Field>

          <Field label="Сколько метров" required error={errors['meters']}>
            <Input
              inputMode="decimal"
              value={meters}
              onChange={(event) => {
                setMeters(event.target.value);
              }}
              placeholder="63"
            />
          </Field>

          <Field label="Филиал" hint="По умолчанию — ваш основной">
            <Select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
              }}
              placeholder="Основной филиал"
              options={(branches.data ?? []).map((branch) => ({
                value: branch.id.toString(),
                label: branch.name,
              }))}
            />
          </Field>

          <Field label="Комментарий" hint="Например: поставщик и накладная">
            <Input
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              placeholder="Не обязательно"
            />
          </Field>
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
              loading={setMetersMutation.isPending}
              onClick={() => {
                if (counting === null) return;
                setMetersMutation.mutate({
                  id: counting.id,
                  meters: toMeters(countValue),
                });
              }}
            >
              Сохранить остаток
            </Button>
          </>
        }
      >
        <Field label="Сколько метров намерили" hint="Число «сколько стало», а не «сколько прибавить»">
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

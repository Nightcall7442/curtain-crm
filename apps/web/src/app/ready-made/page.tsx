'use client';

import { CatalogKind, formatMoney, parseMoney } from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal, MoneyInput, Select } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';

/**
 * Склад готовых штор: что сшито заранее и лежит на полке.
 *
 * Отдельно от «Кассы»: там прайс на тюль и фурнитуру, которые продаются
 * метрами и штуками и не отличаются друг от друга ничем, кроме названия.
 * Готовая штора — вещь: модель, размер, цвет, код ткани и снимок. Две шторы
 * одной модели разного размера — разные товары, и продать вместо одной
 * другую нельзя.
 *
 * Остаток вводится числом «сколько стало», а не «сколько прибавить»: полку
 * пересчитывают глазами, и вычитание в уме — лишний способ ошибиться.
 */
export default function ReadyMadePage(): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [adding, setAdding] = useState(false);
  const [model, setModel] = useState('');
  const [code, setCode] = useState('');
  const [comment, setComment] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  /** Штора, которой пересчитывают остаток. `null` — окно закрыто. */
  const [counting, setCounting] = useState<{ id: number; model: string } | null>(null);
  const [countValue, setCountValue] = useState('');

  const items = trpc.readyMade.list.useQuery({ includeEmpty: true, includeInactive: true });
  const catalog = trpc.catalog.list.useQuery({});

  const modelOptions = (catalog.data ?? [])
    .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
    .map((entry) => ({ value: entry.name, label: entry.name }));

  const refresh = (): void => {
    void utils.readyMade.list.invalidate();
  };

  const create = trpc.readyMade.create.useMutation({
    onSuccess(item) {
      setAdding(false);
      setModel('');
      setCode('');
      setComment('');
      setWidthCm('');
      setHeightCm('');
      setPrice('');
      setQuantity('1');
      toast.success('Добавлено', `${item.model}: ${item.quantity.toString()} шт`);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось добавить', error.message);
    },
  });

  const setQuantityMutation = trpc.readyMade.setQuantity.useMutation({
    onSuccess(item) {
      setCounting(null);
      setCountValue('');
      toast.success('Остаток обновлён', `${item.model}: ${item.quantity.toString()} шт`);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось изменить остаток', error.message);
    },
  });

  const setActive = trpc.readyMade.setActive.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      toast.error('Не удалось изменить', error.message);
    },
  });

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
  const inStock = rows.filter((row) => row.isActive && row.quantity > 0);
  const stockValue = inStock.reduce((sum, row) => sum + parseMoney(row.price) * row.quantity, 0);
  const pieces = inStock.reduce((sum, row) => sum + row.quantity, 0);

  const errors = fieldErrors(create.error);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Штор в наличии"
          value={pieces.toString()}
          caption={`Позиций: ${inStock.length.toString()}`}
        />
        <StatCard
          label="Товара на складе"
          value={formatMoney(stockValue)}
          caption="По розничным ценам"
        />
        <StatCard
          label="Всего записей"
          value={rows.length.toString()}
          caption="Включая снятые с продажи"
        />
      </section>

      <Card>
        <CardHeader
          title="Готовые шторы"
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                create.reset();
                setAdding(true);
              }}
            >
              Добавить готовые шторы
            </Button>
          }
        />

        <DataTable
          isLoading={items.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage="Готовых штор нет — добавьте первую"
          columns={[
            {
              key: 'model',
              header: 'Модель',
              sortValue: (row) => row.model,
              render: (row) => (
                <span className="flex items-center gap-2">
                  {row.photoUrl !== null && (
                    /* Обычный img, а не next/image: файлы отдаёт наш API по
                       подписанным ссылкам с ограниченным сроком жизни, и
                       оптимизатор Next не смог бы их закешировать. */
                    <img
                      src={row.photoUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="block">
                    <span className={row.isActive ? 'text-primary' : 'text-muted line-through'}>
                      {row.code === null ? row.model : `${row.model} · ${row.code}`}
                    </span>
                    {row.comment !== null && (
                      <span className="block text-footnote text-muted">{row.comment}</span>
                    )}
                  </span>
                </span>
              ),
            },
            {
              key: 'size',
              header: 'Размер',
              sortValue: (row) => Number.parseFloat(row.widthCm),
              render: (row) =>
                `${Number.parseFloat(row.widthCm).toString()}×${Number.parseFloat(
                  row.heightCm,
                ).toString()} см`,
            },
            {
              key: 'branch',
              header: 'Филиал',
              sortValue: (row) => row.branchName,
              render: (row) => row.branchName,
            },
            {
              key: 'price',
              header: 'Цена',
              align: 'right',
              sortValue: (row) => parseMoney(row.price),
              render: (row) => formatMoney(parseMoney(row.price)),
            },
            {
              key: 'quantity',
              header: 'Остаток',
              align: 'right',
              sortValue: (row) => row.quantity,
              render: (row) => (
                <span className={row.quantity <= 0 ? 'text-danger' : 'text-primary'}>
                  {`${row.quantity.toString()} шт`}
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
                      setCounting({ id: row.id, model: row.model });
                      setCountValue(row.quantity.toString());
                      setQuantityMutation.reset();
                    }}
                  >
                    Пересчитать
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActive.mutate({ id: row.id, isActive: !row.isActive });
                    }}
                  >
                    {row.isActive ? 'Снять' : 'Вернуть'}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={adding}
        title="Новая готовая штора"
        onClose={() => {
          setAdding(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={create.isPending}
              onClick={() => {
                create.mutate({
                  model: model.trim(),
                  ...(code.trim() === '' ? {} : { code: code.trim() }),
                  ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
                  widthCm: Number.parseFloat(widthCm.replace(',', '.')) || 0,
                  heightCm: Number.parseFloat(heightCm.replace(',', '.')) || 0,
                  price: Number.parseFloat(price.replace(',', '.')) || 0,
                  quantity: Math.max(0, Number.parseInt(quantity, 10) || 0),
                });
              }}
            >
              Поставить на склад
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError
            message={
              create.error !== null && Object.keys(errors).length === 0
                ? create.error.message
                : null
            }
          />

          <Field label="Модель" required error={errors['model']}>
            <Select
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
              }}
              placeholder="Выберите модель"
              options={modelOptions}
            />
          </Field>

          {/*
            Код — своя бирка мастерской, а не код ткани с рулона: две шторы
            одной модели и размера различают по нему, и по нему же продавец
            находит штору, когда клиент называет её по телефону. Описание
            рядом заполняется руками: справочнику здесь взяться неоткуда.
          */}
          <Field label="Код" hint="Бирка на шторе — по нему её найдут в продаже">
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              placeholder="Например: ГШ-014"
            />
          </Field>

          <Field label="Описание">
            <Input
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              placeholder="Чем эта штора отличается: ткань, оттенок, особенности"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ширина, см" required error={errors['widthCm']}>
              <Input
                value={widthCm}
                onChange={(event) => {
                  setWidthCm(event.target.value);
                }}
                placeholder="150"
              />
            </Field>
            <Field label="Высота, см" required error={errors['heightCm']}>
              <Input
                value={heightCm}
                onChange={(event) => {
                  setHeightCm(event.target.value);
                }}
                placeholder="200"
              />
            </Field>
            <Field label="Цена, сум" required error={errors['price']}>
              <MoneyInput
                value={price}
                onChange={setPrice}
                placeholder="450 000"
              />
            </Field>
            <Field label="Количество" error={errors['quantity']}>
              <Input
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
                placeholder="1"
              />
            </Field>
          </div>

          <p className="text-overline text-muted">
            Снимок добавляется из мобильного приложения — там штору фотографируют на месте.
          </p>
        </div>
      </Modal>

      <Modal
        open={counting !== null}
        title={`Остаток: ${counting?.model ?? ''}`}
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
                  quantity: Math.max(0, Number.parseInt(countValue, 10) || 0),
                });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <Field label="Сколько штук лежит сейчас" required>
          <Input
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

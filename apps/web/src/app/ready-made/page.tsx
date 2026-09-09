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
  /**
   * Правится существующая штора или заводится новая.
   *
   * `null` — новая. Форма одна на оба случая: поля те же, и вторая её копия
   * разошлась бы с первой на первой же правке. Филиал и остаток при правке
   * не показываются: филиал у лежащей на полке шторы не меняется, а остаток
   * ведётся пересчётом — это разные события и в журнале они разные.
   */
  const [editingId, setEditingId] = useState<number | null>(null);
  /** Снимок, который уже есть у правимой шторы. */
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  /** Строка поиска по списку — по модели, коду и описанию. */
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('');
  const [branchId, setBranchId] = useState('');
  const [code, setCode] = useState('');
  const [comment, setComment] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  /*
    Снимок — то, ради чего продавец вообще открывает склад: штору выбирают
    глазами. Раньше приложить его можно было только с телефона, а полку
    заводит и руководитель за компьютером — и заводил вслепую.

    Файл держим уже в base64: tRPC работает поверх JSON, и читать его при
    нажатии «Поставить на склад» значило бы ждать чтения после нажатия.
  */
  const [photo, setPhoto] = useState<
    { readonly name: string; readonly mimeType: string; readonly content: string; readonly preview: string } | null
  >(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  /** Штора, которой пересчитывают остаток. `null` — окно закрыто. */
  const [counting, setCounting] = useState<{ id: number; model: string } | null>(null);
  const [countValue, setCountValue] = useState('');

  const items = trpc.readyMade.list.useQuery({ includeEmpty: true, includeInactive: true });
  const branches = trpc.branches.list.useQuery({});
  const catalog = trpc.catalog.list.useQuery({});

  const modelOptions = (catalog.data ?? [])
    .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
    .map((entry) => ({ value: entry.name, label: entry.name }));

  const refresh = (): void => {
    void utils.readyMade.list.invalidate();
  };

  /** Закрывает форму и стирает черновик — общая для создания и правки. */
  const closeForm = (): void => {
    setAdding(false);
    setEditingId(null);
    setModel('');
    setBranchId('');
    setCode('');
    setComment('');
    setWidthCm('');
    setHeightCm('');
    setPrice('');
    setQuantity('1');
    setPhoto(null);
    setPhotoError(null);
    setCurrentPhotoUrl(null);
  };

  const create = trpc.readyMade.create.useMutation({
    onSuccess(item) {
      closeForm();
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

  const update = trpc.readyMade.update.useMutation({
    onSuccess(item) {
      closeForm();
      toast.success('Сохранено', item.model);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось сохранить', error.message);
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

  const all = items.data ?? [];

  /* Поиск по тому, что человек помнит: модель, бирка, описание. */
  const needle = search.trim().toLowerCase();
  const rows =
    needle === ''
      ? all
      : all.filter((row) =>
          [row.model, row.code ?? '', row.comment ?? ''].some((field) =>
            field.toLowerCase().includes(needle),
          ),
        );
  const inStock = all.filter((row) => row.isActive && row.quantity > 0);
  const stockValue = inStock.reduce((sum, row) => sum + parseMoney(row.price) * row.quantity, 0);
  const pieces = inStock.reduce((sum, row) => sum + row.quantity, 0);

  const errors = fieldErrors(editingId === null ? create.error : update.error);

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
          value={all.length.toString()}
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
                closeForm();
                create.reset();
                setAdding(true);
              }}
            >
              Добавить готовые шторы
            </Button>
          }
        />

        <div className="px-4 pb-3">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Поиск по модели, коду или описанию"
          />
        </div>

        <DataTable
          isLoading={items.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage={
            needle === ''
              ? 'Готовых штор нет — добавьте первую'
              : 'По этому запросу ничего нет'
          }
          /* Кнопка стоит там же, где сказано «добавьте»: искать её в шапке
             карточки человеку незачем. По результату поиска — нечего. */
          emptyAction={
            needle === '' ? (
              <Button
                size="sm"
                onClick={() => {
                  closeForm();
                  create.reset();
                  setAdding(true);
                }}
              >
                Добавить готовые шторы
              </Button>
            ) : undefined
          }
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
                      update.reset();
                      create.reset();
                      setEditingId(row.id);
                      setModel(row.model);
                      setCode(row.code ?? '');
                      setComment(row.comment ?? '');
                      setWidthCm(Number.parseFloat(row.widthCm).toString());
                      setHeightCm(Number.parseFloat(row.heightCm).toString());
                      /* Цена в форме — в сумах, как её и вводят: `parseMoney`
                         дал бы тийины, и 450 000 превратились бы в 45 000 000. */
                      setPrice(Number.parseFloat(row.price).toString());
                      setPhoto(null);
                      setPhotoError(null);
                      setCurrentPhotoUrl(row.photoUrl);
                      setAdding(true);
                    }}
                  >
                    Изменить
                  </Button>
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
        title={editingId === null ? 'Новая готовая штора' : 'Правка готовой шторы'}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Отмена
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              onClick={() => {
                /* Общие поля карточки — их спрашивают и при заведении, и при правке. */
                const card = {
                  model: model.trim(),
                  code: code.trim() === '' ? null : code.trim(),
                  comment: comment.trim() === '' ? null : comment.trim(),
                  widthCm: Number.parseFloat(widthCm.replace(',', '.')) || 0,
                  heightCm: Number.parseFloat(heightCm.replace(',', '.')) || 0,
                  price: Number.parseFloat(price.replace(',', '.')) || 0,
                  ...(photo === null
                    ? {}
                    : {
                        photo: {
                          fileName: photo.name,
                          mimeType: photo.mimeType,
                          content: photo.content,
                        },
                      }),
                };

                if (editingId === null) {
                  create.mutate({
                    ...card,
                    ...(branchId === '' ? {} : { branchId: Number.parseInt(branchId, 10) }),
                    quantity: Math.max(0, Number.parseInt(quantity, 10) || 0),
                  });
                } else {
                  update.mutate({ id: editingId, ...card });
                }
              }}
            >
              {editingId === null ? 'Поставить на склад' : 'Сохранить'}
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
          {/*
            Филиал и остаток спрашиваются только у новой шторы: лежащая на
            полке не переезжает между цехами, а остаток ведётся пересчётом —
            своей кнопкой и своей записью в журнале.
          */}
          {editingId === null && (
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
          )}

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

          {/*
            Снимок читается сразу при выборе файла: к нажатию «Поставить на
            склад» он уже готов, и продавец не ждёт чтения после нажатия.
          */}
          <Field label="Снимок" hint="Продавец показывает штору клиенту" error={photoError ?? undefined}>
            <div className="flex items-center gap-3">
              {photo === null && currentPhotoUrl !== null && (
                /* Снимок, который уже стоит у шторы: новый файл его заменит,
                   а если файл не выбирать — останется этот. */
                <img
                  src={currentPhotoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-tile object-cover"
                />
              )}
              {photo !== null && (
                /* Обычный img: это локальный data-URL, оптимизатору Next
                   его оптимизировать нечем и незачем. */
                <img
                  src={photo.preview}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-tile object-cover"
                />
              )}
              <input
                type="file"
                accept="image/*"
                className="text-footnote text-secondary file:mr-3 file:rounded-tile file:border file:border-subtle file:bg-panel file:px-3 file:py-1.5 file:text-footnote file:text-primary hover:file:bg-raised"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPhotoError(null);
                  if (file === undefined) {
                    setPhoto(null);
                    return;
                  }

                  const reader = new FileReader();
                  reader.onerror = () => {
                    setPhotoError('Не удалось прочитать файл');
                  };
                  reader.onload = () => {
                    const result = reader.result;
                    if (typeof result !== 'string') {
                      setPhotoError('Не удалось прочитать файл');
                      return;
                    }
                    setPhoto({
                      name: file.name,
                      mimeType: file.type,
                      // `readAsDataURL` даёт `data:image/jpeg;base64,…` —
                      // сервер такой префикс срезает сам, но отправлять
                      // лишние байты незачем.
                      content: result.slice(result.indexOf(',') + 1),
                      preview: result,
                    });
                  };
                  reader.readAsDataURL(file);
                }}
              />
              {photo !== null && (
                <button
                  type="button"
                  className="text-footnote text-muted underline-offset-2 hover:text-danger hover:underline"
                  onClick={() => {
                    setPhoto(null);
                  }}
                >
                  Убрать
                </button>
              )}
            </div>
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
            {editingId === null && (
              <Field label="Количество" error={errors['quantity']}>
                <Input
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                  }}
                  placeholder="1"
                />
              </Field>
            )}
          </div>


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

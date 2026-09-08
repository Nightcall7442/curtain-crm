'use client';

import {
  areaM2FromCm,
  CatalogKind,
  CORNICE_ROTATION_LABELS_RU,
  CORNICE_ROTATIONS,
  ORDER_ITEM_KIND_LABELS_RU,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  PRIORITIES,
  Priority,
  type CorniceRotation,
  type Priority as PriorityName,
  PRIORITY_LABELS_RU,
} from '@curtain-crm/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import {
  Button,
  ChipSelect,
  Field,
  fieldErrors,
  FormError,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { formatQuantity } from '@/lib/utils';


/**
 * Создание заказа.
 *
 * Заказ создаётся сразу со списком позиций: пустой заказ, который потом
 * «дозаполняют», в мастерской неизбежно теряется между этапами.
 *
 * Размеры вводятся одной строкой (`150x200`) и разбираются той же функцией
 * `parseDimensions()`, что и на сервере, — здесь только для показа площади
 * до отправки. Проверяет всё равно сервер: клиентский разбор — удобство,
 * а не валидация.
 */

/** Один аксессуар в списке позиции: держатель, султанчик, бубон, сачак и т.д. */
interface AccessoryDraft {
  readonly id: string;
  name: string;
  quantity: number;
  code: string;
}

const emptyAccessory = (): AccessoryDraft => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  quantity: 1,
  code: '',
});

/**
 * Материал позиции в форме: код с этикетки, метраж и описание.
 *
 * Всё строками — включая метраж: поле ввода отдаёт строку, и пустое поле
 * должно оставаться пустым, а не превращаться в ноль на первом же нажатии.
 * Числом оно становится один раз, при отправке.
 */
interface MaterialDraft {
  code: string;
  meters: string;
  description: string;
}

const emptyMaterial = (): MaterialDraft => ({ code: '', meters: '', description: '' });

/** Портьер на позицию бывает несколько — потому у них есть ключ списка. */
interface PortiereDraft extends MaterialDraft {
  readonly id: string;
}

const emptyPortiere = (): PortiereDraft => ({
  id: Math.random().toString(36).slice(2),
  ...emptyMaterial(),
});

/** Материал для отправки на сервер. `undefined` — код не заполнен. */
function toMaterial(
  draft: MaterialDraft,
): { code: string; meters: number | null; description: string | null } | undefined {
  const code = draft.code.trim();
  if (code.length === 0) return undefined;

  const meters = Number.parseFloat(draft.meters.replace(',', '.'));
  const description = draft.description.trim();

  return {
    code,
    meters: Number.isFinite(meters) && meters > 0 ? meters : null,
    description: description.length > 0 ? description : null,
  };
}

/** Три поля одного материала в ряд — одинаково для всех шести. */
function MaterialFields({
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: MaterialDraft;
  readonly onChange: (patch: Partial<MaterialDraft>) => void;
}): ReactElement {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <span className="mb-1.5 block text-footnote font-medium text-secondary">{label}</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_1.5fr]">
        <Input
          aria-label={`${label}: код`}
          value={value.code}
          onChange={(event) => {
            onChange({ code: event.target.value });
          }}
          placeholder={placeholder}
        />
        <Input
          aria-label={`${label}: метраж`}
          inputMode="decimal"
          value={value.meters}
          onChange={(event) => {
            onChange({ meters: event.target.value });
          }}
          placeholder="метр"
        />
        <Input
          aria-label={`${label}: описание`}
          value={value.description}
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
          placeholder="описание"
        />
      </div>
    </div>
  );
}

interface ItemDraft {
  readonly id: string;
  kind: OrderItemKind;
  model: string;
  materials: string[];
  materialOptions: string[];
  color: string;
  characteristics: string;
  widthCm: string;
  heightCm: string;
  /** Портьеры — коды тканей, которых на одну позицию бывает несколько. */
  portieres: PortiereDraft[];
  /** Остальные материалы — по одному на позицию, форма та же. */
  tulle: MaterialDraft;
  protection: MaterialDraft;
  cornice: MaterialDraft;
  plastic: MaterialDraft;
  pipe: MaterialDraft;
  corniceRotation: CorniceRotation | '';
  accessories: AccessoryDraft[];
  quantity: number;
  comment: string;
}

const emptyItem = (): ItemDraft => ({
  id: Math.random().toString(36).slice(2),
  kind: OrderItemKind.WINDOW,
  model: '',
  materials: [],
  materialOptions: [],
  color: '',
  characteristics: '',
  widthCm: '',
  heightCm: '',
  portieres: [emptyPortiere()],
  tulle: emptyMaterial(),
  protection: emptyMaterial(),
  cornice: emptyMaterial(),
  plastic: emptyMaterial(),
  pipe: emptyMaterial(),
  corniceRotation: '',
  accessories: [],
  quantity: 1,
  comment: '',
});

export function OrderCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (orderId: number) => void;
}): ReactElement {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientComment, setClientComment] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<PriorityName>(Priority.NORMAL);
  const [branchId, setBranchId] = useState('');
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  const utils = trpc.useUtils();
  const branches = trpc.branches.list.useQuery({}, { enabled: open });
  const catalog = trpc.catalog.list.useQuery({}, { enabled: open });

  const create = trpc.orders.create.useMutation({
    async onSuccess(order) {
      await Promise.all([utils.orders.list.invalidate(), utils.reports.dashboard.invalidate()]);
      reset();
      onCreated(order.id);
    },
  });

  const reset = (): void => {
    setClientName('');
    setClientPhone('');
    setClientComment('');
    setInstallAddress('');
    setDeadline('');
    setPriority(Priority.NORMAL);
    setWorkPrice('');
    setDeposit('');
    setItems([emptyItem()]);
    create.reset();
  };

  /** Справочники, сгруппированные по виду. */
  const byKind = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of catalog.data ?? []) {
      const bucket = map.get(entry.kind) ?? [];
      bucket.push(entry.name);
      map.set(entry.kind, bucket);
    }
    return map;
  }, [catalog.data]);

  const options = (kind: string): { value: string; label: string }[] =>
    (byKind.get(kind) ?? []).map((name) => ({ value: name, label: name }));

  /**
   * Список аксессуаров на выбор — из двух справочников сразу.
   *
   * «Сачак» больше не отдельное поле позиции: оно такой же аксессуар, как
   * держатель или бубон, просто из другого справочника. Объединяем оба
   * списка здесь, а не в справочнике, — сами справочники (и права на их
   * редактирование) трогать не пришлось.
   */
  const accessoryOptions = useMemo(() => {
    const names = new Set([
      ...(byKind.get(CatalogKind.ACCESSORY) ?? []),
      ...(byKind.get(CatalogKind.SACHAK) ?? []),
    ]);
    return Array.from(names).map((name) => ({ value: name, label: name }));
  }, [byKind]);

  const errors = fieldErrors(create.error);

  const patchItem = (id: string, patch: Partial<ItemDraft>): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const patchPortiere = (
    itemId: string,
    portiereId: string,
    patch: Partial<PortiereDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              portieres: item.portieres.map((portiere) =>
                portiere.id === portiereId ? { ...portiere, ...patch } : portiere,
              ),
            },
      ),
    );
  };

  const patchAccessory = (
    itemId: string,
    accessoryId: string,
    patch: Partial<AccessoryDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              accessories: item.accessories.map((accessory) =>
                accessory.id === accessoryId ? { ...accessory, ...patch } : accessory,
              ),
            },
      ),
    );
  };

  const handleSubmit = (): void => {
    create.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      ...(clientComment.trim().length > 0 ? { clientComment: clientComment.trim() } : {}),
      ...(installAddress.trim().length > 0 ? { installAddress: installAddress.trim() } : {}),
      ...(deadline.length > 0 ? { deadline } : {}),
      priority,
      ...(branchId.length > 0 ? { branchId: Number.parseInt(branchId, 10) } : {}),
      workPrice: Number.parseFloat(workPrice.replace(',', '.')) || 0,
      deposit: Number.parseFloat(deposit.replace(',', '.')) || 0,
      items: items.map((item) => {
        const tulle = toMaterial(item.tulle);
        const protection = toMaterial(item.protection);
        const cornice = toMaterial(item.cornice);
        const plastic = toMaterial(item.plastic);
        const pipe = toMaterial(item.pipe);

        return {
        kind: item.kind,
        ...(item.model.length > 0 ? { model: item.model } : {}),
        materials: item.materials,
        materialOptions: item.materialOptions,
        ...(item.color.length > 0 ? { color: item.color } : {}),
        ...(item.characteristics.trim().length > 0
          ? { characteristics: item.characteristics.trim() }
          : {}),
        ...(item.widthCm.trim().length > 0 && item.heightCm.trim().length > 0
          ? {
              widthCm: Number.parseFloat(item.widthCm.replace(',', '.')),
              heightCm: Number.parseFloat(item.heightCm.replace(',', '.')),
            }
          : {}),
        portieres: item.portieres
          .map((portiere) => toMaterial(portiere))
          .filter((portiere) => portiere !== undefined),
        ...(tulle === undefined ? {} : { tulle }),
        ...(protection === undefined ? {} : { protection }),
        ...(cornice === undefined ? {} : { cornice }),
        ...(plastic === undefined ? {} : { plastic }),
        ...(pipe === undefined ? {} : { pipe }),
        ...(item.corniceRotation === '' ? {} : { corniceRotation: item.corniceRotation }),
        accessories: item.accessories
          .filter((accessory) => accessory.name.trim().length > 0)
          .map((accessory) => ({
            name: accessory.name.trim(),
            quantity: Math.max(1, accessory.quantity),
            code: accessory.code.trim().length > 0 ? accessory.code.trim() : null,
          })),
        quantity: item.quantity,
        ...(item.comment.trim().length > 0 ? { comment: item.comment.trim() } : {}),
        };
      }),
    });
  };

  return (
    <Modal
      open={open}
      title="Новый заказ"
      width="xl"
      onClose={() => {
        onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={create.isPending}>
            Создать заказ
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError message={create.error !== null && Object.keys(errors).length === 0 ? create.error.message : null} />

        {/* --- Клиент --------------------------------------------------- */}
        <section>
          <h3 className="section-title mb-2">Клиент</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя клиента" required error={errors['clientName']}>
              <Input
                value={clientName}
                onChange={(event) => {
                  setClientName(event.target.value);
                }}
                placeholder="Ахмедов Тимур"
                invalid={errors['clientName'] !== undefined}
              />
            </Field>

            <Field
              label="Телефон"
              required
              error={errors['clientPhone']}
              hint="Можно с пробелами: +998 90 123 45 67"
            >
              <Input
                value={clientPhone}
                onChange={(event) => {
                  setClientPhone(event.target.value);
                }}
                placeholder="+998 90 123 45 67"
                inputMode="tel"
                invalid={errors['clientPhone'] !== undefined}
              />
            </Field>

            <Field label="Адрес установки" className="sm:col-span-2" error={errors['installAddress']}>
              <Input
                value={installAddress}
                onChange={(event) => {
                  setInstallAddress(event.target.value);
                }}
                placeholder="г. Ургенч, ул. …"
              />
            </Field>

            <Field label="Пожелания клиента" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={clientComment}
                onChange={(event) => {
                  setClientComment(event.target.value);
                }}
                placeholder="Например: не шуметь до 10 утра"
              />
            </Field>
          </div>
        </section>

        {/* --- Условия --------------------------------------------------- */}
        <section>
          <h3 className="section-title mb-2">Условия</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            <Field label="Срок" error={errors['deadline']}>
              <Input
                type="date"
                value={deadline}
                onChange={(event) => {
                  setDeadline(event.target.value);
                }}
              />
            </Field>

            <Field label="Приоритет">
              <Select
                value={priority}
                onChange={(event) => {
                  setPriority(event.target.value as PriorityName);
                }}
                options={PRIORITIES.map((value) => ({
                  value,
                  label: PRIORITY_LABELS_RU[value],
                }))}
              />
            </Field>

            <Field label="Стоимость работ, сум" error={errors['workPrice']}>
              <Input
                inputMode="decimal"
                value={workPrice}
                onChange={(event) => {
                  setWorkPrice(event.target.value);
                }}
                placeholder="5000000"
              />
            </Field>

            <Field label="Предоплата, сум" error={errors['deposit']}>
              <Input
                inputMode="decimal"
                value={deposit}
                onChange={(event) => {
                  setDeposit(event.target.value);
                }}
                placeholder="2000000"
              />
            </Field>
          </div>
        </section>

        {/* --- Позиции --------------------------------------------------- */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="section-title">Позиции заказа</h3>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                setItems((current) => [...current, emptyItem()]);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Добавить позицию
            </Button>
          </div>

          {errors['items'] !== undefined && (
            <p className="mb-2 text-overline text-danger">{errors['items']}</p>
          )}

          <div className="space-y-3">
            {items.map((item, index) => {
              const widthNum = Number.parseFloat(item.widthCm.replace(',', '.'));
              const heightNum = Number.parseFloat(item.heightCm.replace(',', '.'));
              const area =
                Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0
                  ? areaM2FromCm(widthNum, heightNum)
                  : null;

              return (
                <div key={item.id} className="rounded border border-subtle bg-base/40 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-footnote font-medium text-primary">
                      {`Позиция ${(index + 1).toString()}`}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        aria-label="Удалить позицию"
                        onClick={() => {
                          setItems((current) => current.filter((entry) => entry.id !== item.id));
                        }}
                        className="ml-auto grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Вид">
                      <Select
                        value={item.kind}
                        onChange={(event) => {
                          patchItem(item.id, {
                            kind: event.target.value as ItemDraft['kind'],
                          });
                        }}
                        // Список видов и подписи — из общего справочника:
                        // добавление вида не должно требовать правки формы.
                        options={ORDER_ITEM_KINDS.map((value) => ({
                          value,
                          label: ORDER_ITEM_KIND_LABELS_RU[value],
                        }))}
                      />
                    </Field>

                    <Field label="Модель">
                      <Select
                        value={item.model}
                        onChange={(event) => {
                          patchItem(item.id, { model: event.target.value });
                        }}
                        placeholder="Не выбрана"
                        options={options(CatalogKind.CURTAIN_MODEL)}
                      />
                    </Field>

                    <Field label="Цвет">
                      <Select
                        value={item.color}
                        onChange={(event) => {
                          patchItem(item.id, { color: event.target.value });
                        }}
                        placeholder="Не выбран"
                        options={options(CatalogKind.COLOR)}
                      />
                    </Field>

                    <Field label="Высота, см">
                      <Input
                        type="number"
                        min={1}
                        max={2000}
                        value={item.heightCm}
                        onChange={(event) => {
                          patchItem(item.id, { heightCm: event.target.value });
                        }}
                        placeholder="200"
                      />
                    </Field>

                    <Field
                      label="Ширина, см"
                      hint={area === null ? undefined : `Площадь: ${formatQuantity(area, 2)} м²`}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={2000}
                        value={item.widthCm}
                        onChange={(event) => {
                          patchItem(item.id, { widthCm: event.target.value });
                        }}
                        placeholder="150"
                      />
                    </Field>

                    <Field label="Количество">
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={item.quantity}
                        onChange={(event) => {
                          patchItem(item.id, {
                            quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                          });
                        }}
                      />
                    </Field>

                    {/*
                      Портьеры — списком, как аксессуары: на одну позицию
                      иногда идут две ткани сразу. Справочника у них нет,
                      только код с этикетки, метраж и описание.
                    */}
                    <div className="sm:col-span-2 lg:col-span-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-footnote font-medium text-secondary">Портьера</span>
                        <Button
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => {
                            patchItem(item.id, {
                              portieres: [...item.portieres, emptyPortiere()],
                            });
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          Портьера
                        </Button>
                      </div>

                      {item.portieres.length === 0 ? (
                        <p className="text-footnote text-muted">
                          Код ткани с этикетки, метраж и описание
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {item.portieres.map((portiere) => (
                            <div key={portiere.id} className="flex items-start gap-2">
                              <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_6rem_1.5fr]">
                                <Input
                                  aria-label="Портьера: код"
                                  value={portiere.code}
                                  onChange={(event) => {
                                    patchPortiere(item.id, portiere.id, { code: event.target.value });
                                  }}
                                  placeholder="Например: П-31"
                                />
                                <Input
                                  aria-label="Портьера: метраж"
                                  inputMode="decimal"
                                  value={portiere.meters}
                                  onChange={(event) => {
                                    patchPortiere(item.id, portiere.id, {
                                      meters: event.target.value,
                                    });
                                  }}
                                  placeholder="метр"
                                />
                                <Input
                                  aria-label="Портьера: описание"
                                  value={portiere.description}
                                  onChange={(event) => {
                                    patchPortiere(item.id, portiere.id, {
                                      description: event.target.value,
                                    });
                                  }}
                                  placeholder="описание"
                                />
                              </div>
                              <button
                                type="button"
                                aria-label="Удалить портьеру"
                                onClick={() => {
                                  patchItem(item.id, {
                                    portieres: item.portieres.filter(
                                      (entry) => entry.id !== portiere.id,
                                    ),
                                  });
                                }}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <MaterialFields
                      label="Тюль"
                      placeholder="Например: Т-22"
                      value={item.tulle}
                      onChange={(patch) => {
                        patchItem(item.id, { tulle: { ...item.tulle, ...patch } });
                      }}
                    />

                    {/*
                      Защита вместо прежней «антимоскитной сетки»: сетка была
                      не единственным защитным полотном, а какое именно нужно —
                      цех узнавал на словах. Теперь это такая же строка
                      материала, как тюль: заполнен код — защита есть.
                    */}
                    <MaterialFields
                      label="Защита"
                      placeholder="Например: З-07"
                      value={item.protection}
                      onChange={(patch) => {
                        patchItem(item.id, { protection: { ...item.protection, ...patch } });
                      }}
                    />

                    <MaterialFields
                      label="Карниз"
                      placeholder="Например: К-104"
                      value={item.cornice}
                      onChange={(patch) => {
                        patchItem(item.id, { cornice: { ...item.cornice, ...patch } });
                      }}
                    />

                    <MaterialFields
                      label="Пластик"
                      placeholder="Код пластика"
                      value={item.plastic}
                      onChange={(patch) => {
                        patchItem(item.id, { plastic: { ...item.plastic, ...patch } });
                      }}
                    />

                    <MaterialFields
                      label="Труба"
                      placeholder="Код трубы"
                      value={item.pipe}
                      onChange={(patch) => {
                        patchItem(item.id, { pipe: { ...item.pipe, ...patch } });
                      }}
                    />

                    <Field label="Поворот карниза">
                      <Select
                        value={item.corniceRotation}
                        onChange={(event) => {
                          patchItem(item.id, {
                            corniceRotation: event.target.value as CorniceRotation | '',
                          });
                        }}
                        placeholder="Не задан"
                        options={CORNICE_ROTATIONS.map((value) => ({
                          value,
                          label: CORNICE_ROTATION_LABELS_RU[value],
                        }))}
                      />
                    </Field>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-footnote font-medium text-secondary">Аксессуары</span>
                        <Button
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => {
                            patchItem(item.id, {
                              accessories: [...item.accessories, emptyAccessory()],
                            });
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          Добавить аксессуар
                        </Button>
                      </div>

                      {item.accessories.length === 0 ? (
                        <p className="text-footnote text-muted">
                          Держатели, султанчики, бубоны, обхваты, сачак — добавляются по одному, с
                          количеством и кодом
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {item.accessories.map((accessory) => (
                            <div key={accessory.id} className="flex items-center gap-2">
                              <Select
                                className="flex-1"
                                value={accessory.name}
                                onChange={(event) => {
                                  patchAccessory(item.id, accessory.id, {
                                    name: event.target.value,
                                  });
                                }}
                                placeholder="Выберите аксессуар"
                                options={accessoryOptions}
                              />
                              <Input
                                type="number"
                                min={1}
                                max={1000}
                                className="w-20 shrink-0"
                                value={accessory.quantity}
                                onChange={(event) => {
                                  patchAccessory(item.id, accessory.id, {
                                    quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                                  });
                                }}
                              />
                              <Input
                                className="w-28 shrink-0"
                                value={accessory.code}
                                onChange={(event) => {
                                  patchAccessory(item.id, accessory.id, { code: event.target.value });
                                }}
                                placeholder="Код"
                              />
                              <button
                                type="button"
                                aria-label="Удалить аксессуар"
                                onClick={() => {
                                  patchItem(item.id, {
                                    accessories: item.accessories.filter(
                                      (entry) => entry.id !== accessory.id,
                                    ),
                                  });
                                }}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Field label="Материалы" className="sm:col-span-2 lg:col-span-3">
                      <ChipSelect
                        options={byKind.get(CatalogKind.MATERIAL) ?? []}
                        value={item.materials}
                        onChange={(next) => {
                          patchItem(item.id, { materials: next });
                        }}
                      />
                    </Field>

                    <Field label="Опции материала" className="sm:col-span-2 lg:col-span-3">
                      <ChipSelect
                        options={byKind.get(CatalogKind.MATERIAL_OPTION) ?? []}
                        value={item.materialOptions}
                        onChange={(next) => {
                          patchItem(item.id, { materialOptions: next });
                        }}
                      />
                    </Field>

                    <Field
                      label="Характеристики"
                      className="sm:col-span-2 lg:col-span-3"
                      hint="Свободное описание: плотность, подкладка, способ крепления"
                    >
                      <Textarea
                        rows={2}
                        value={item.characteristics}
                        onChange={(event) => {
                          patchItem(item.id, { characteristics: event.target.value });
                        }}
                        placeholder="Например: двойная подкладка, лента 1:2,5"
                      />
                    </Field>

                    <Field label="Комментарий к позиции" className="sm:col-span-2 lg:col-span-3">
                      <Input
                        value={item.comment}
                        onChange={(event) => {
                          patchItem(item.id, { comment: event.target.value });
                        }}
                        placeholder="Например: левое окно, выход на балкон"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}

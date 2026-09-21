'use client';

import {
  CatalogKind,
  curtainMountKindOf,
  CurtainMountKind,
  MATERIAL_CODE_KINDS,
  PRIORITIES,
  Priority,
  type Priority as PriorityName,
  PRIORITY_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import {
  Button,
  Field,
  fieldErrors,
  FormError,
  Input,
  Modal,
  MoneyInput,
  Select,
  Textarea,
} from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

import { DiscountFields, discountError, discountPayload, emptyDiscount } from './DiscountFields';
import {
  emptyItem,
  OrderItemFields,
  toMaterial,
  type AccessoryDraft,
  type ItemDraft,
  type PortiereDraft,
} from './OrderItemFields';

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

export function OrderCreateDialog({
  open,
  onClose,
  onCreated,
  onSellReadyMade,
  mode = 'custom',
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (orderId: number) => void;
  /** Клиент пришёл за готовой шторой — переключиться на продажу с полки. */
  readonly onSellReadyMade?: () => void;
  /**
   * `stock` — пошив для склада: без клиента, установки и предоплаты, той же
   * формой позиций, что и обычный заказ. Кнопка «Готовые шторы» рядом с
   * «Новый заказ» открывает диалог именно в этом режиме — продажа с полки
   * переехала на страницу склада, а здесь теперь ставят цеху задачу сшить
   * ещё одну штору.
   */
  readonly mode?: 'custom' | 'stock';
}): ReactElement {
  const forStock = mode === 'stock';
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientComment, setClientComment] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<PriorityName>(Priority.NORMAL);
  const [branchId, setBranchId] = useState('');
  const [workPrice, setWorkPrice] = useState('');
  const [discount, setDiscount] = useState(emptyDiscount);
  const [submitted, setSubmitted] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
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

  const produceForStock = trpc.orders.produceForStock.useMutation({
    async onSuccess(order) {
      await Promise.all([utils.orders.list.invalidate(), utils.reports.dashboard.invalidate()]);
      reset();
      onCreated(order.id);
    },
  });

  // Одна из двух — та, что реально отправляла запрос: у обеих свой
  // `error`/`isPending`, и вторая, неиспользованная, всегда в покое.
  const submitting = forStock ? produceForStock : create;

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
    produceForStock.reset();
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
   * Мини-описания кодов и группа крепления моделей — из того же справочника.
   *
   * Ключ с приведённым регистром: продавец переписывает код с этикетки от
   * руки, и «п-31» должно найтись так же, как «П-31».
   */
  const codeDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog.data ?? []) {
      if (entry.description !== null && entry.description.length > 0) {
        map.set(`${entry.kind}:${entry.name.trim().toLowerCase()}`, entry.description);
      }
    }
    return map;
  }, [catalog.data]);

  const describeCode = (kind: string, code: string): string | null =>
    codeDescriptions.get(`${kind}:${code.trim().toLowerCase()}`) ?? null;

  const mountByModel = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of catalog.data ?? []) {
      if (entry.kind === CatalogKind.CURTAIN_MODEL) map.set(entry.name, entry.mountKind);
    }
    return map;
  }, [catalog.data]);

  /** Труба или пластик с карнизом — что спрашивать для выбранной модели. */
  const mountOf = (model: string): string => curtainMountKindOf(mountByModel.get(model));

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

  const errors = fieldErrors(submitting.error);

  const patchItem = (id: string, patch: Partial<ItemDraft>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
    setSubmitted(true);
    const orderItemsPayload = items.map((item) => {
      /*
          Строки материала, которых у этой модели не бывает, не уезжают на
          сервер, даже если продавец успел их заполнить до смены модели.
        */
      const onPipe = mountOf(item.model) === CurtainMountKind.PIPE;

      const tulle = toMaterial(
        item.tulle,
        describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code),
      );
      const protection = toMaterial(
        item.protection,
        describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code),
      );
      const cornice = onPipe
        ? undefined
        : toMaterial(item.cornice, describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code));
      const plastic = onPipe
        ? undefined
        : toMaterial(item.plastic, describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code));
      const pipe = onPipe
        ? toMaterial(item.pipe, describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code))
        : undefined;

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
          .map((portiere) =>
            toMaterial(portiere, describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code)),
          )
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
    });

    if (forStock) {
      produceForStock.mutate({
        ...(deadline.length > 0 ? { deadline } : {}),
        priority,
        ...(branchId.length > 0 ? { branchId: Number.parseInt(branchId, 10) } : {}),
        items: orderItemsPayload,
      });
      return;
    }

    if (discountError(workPrice, discount) !== undefined) return;

    create.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      ...(clientComment.trim().length > 0 ? { clientComment: clientComment.trim() } : {}),
      ...(installAddress.trim().length > 0 ? { installAddress: installAddress.trim() } : {}),
      ...(deadline.length > 0 ? { deadline } : {}),
      priority,
      ...(branchId.length > 0 ? { branchId: Number.parseInt(branchId, 10) } : {}),
      ...discountPayload(workPrice, discount),
      deposit: Number.parseFloat(deposit.replace(',', '.')) || 0,
      depositMethod,
      items: orderItemsPayload,
    });
  };

  return (
    <Modal
      open={open}
      title={forStock ? 'Пошив для склада' : 'Новый заказ'}
      width="xl"
      onClose={() => {
        onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={submitting.isPending}>
            {forStock ? 'Создать пошив' : 'Создать заказ'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError
          message={
            submitting.error !== null && Object.keys(errors).length === 0
              ? submitting.error.message
              : null
          }
        />

        {/*
          --- Клиент -------------------------------------------------------

          У пошива для склада её нет вовсе: заказ существует не для клиента,
          а чтобы штора появилась на витрине. Задавать имя и телефон здесь
          было бы вопросом без ответа.
        */}
        {!forStock && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="section-title">Клиент</h3>
              {onSellReadyMade !== undefined && (
                <button
                  type="button"
                  className="text-caption text-accent hover:underline"
                  onClick={onSellReadyMade}
                >
                  Готовые шторы →
                </button>
              )}
            </div>
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

              <Field
                label="Адрес установки"
                className="sm:col-span-2"
                error={errors['installAddress']}
              >
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
        )}

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

            {/* Платить здесь некому — заказ не для клиента. */}
            {!forStock && (
              <>
                <Field label="Стоимость работ, сум" error={errors['workPrice']}>
                  <MoneyInput
                    value={workPrice}
                    onChange={setWorkPrice}
                    placeholder={'5\u00A0000\u00A0000'}
                  />
                </Field>

                <DiscountFields
                  price={workPrice}
                  value={discount}
                  onChange={setDiscount}
                  error={errors['discountReason'] ?? (submitted ? discountError(workPrice, discount) : undefined)}
                />

                <Field label="Предоплата, сум" error={errors['deposit']}>
                  <MoneyInput
                    value={deposit}
                    onChange={setDeposit}
                    placeholder={'2\u00A0000\u00A0000'}
                  />
                </Field>

                <Field label="Способ оплаты">
                  <Select
                    value={depositMethod}
                    onChange={(event) => {
                      setDepositMethod(event.target.value as PaymentMethodName);
                    }}
                    options={PAYMENT_METHODS.map((value) => ({
                      value,
                      label: PAYMENT_METHOD_LABELS_RU[value],
                    }))}
                  />
                </Field>
              </>
            )}
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
            {items.map((item, index) => (
              <OrderItemFields
                key={item.id}
                item={item}
                index={index}
                canRemove={items.length > 1}
                onRemove={() => {
                  setItems((current) => current.filter((entry) => entry.id !== item.id));
                }}
                onChange={(patch) => {
                  patchItem(item.id, patch);
                }}
                onPortiere={(portiereId, patch) => {
                  patchPortiere(item.id, portiereId, patch);
                }}
                onAccessory={(accessoryId, patch) => {
                  patchAccessory(item.id, accessoryId, patch);
                }}
                catalog={{ options, accessoryOptions, mountOf, describeCode }}
              />
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

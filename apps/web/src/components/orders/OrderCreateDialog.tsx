'use client';

import {
  PRIORITIES,
  Priority,
  type Priority as PriorityName,
  PRIORITY_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

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
import { itemDraftToInput, OrderItemsSection, useOrderCatalog } from './OrderFormFields';
import { emptyItem, type ItemDraft } from './OrderItemFields';

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

  const catalog = useOrderCatalog(open);
  const errors = fieldErrors(submitting.error);

  const handleSubmit = (): void => {
    setSubmitted(true);
    const orderItemsPayload = items.map((item) => itemDraftToInput(item, catalog));

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
        <OrderItemsSection items={items} onChange={setItems} catalog={catalog} error={errors['items']} />
      </div>
    </Modal>
  );
}

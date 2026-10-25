'use client';

import {
  OrderType,
  parseMoney,
  PRIORITIES,
  PRIORITY_LABELS_RU,
  type Priority as PriorityName,
} from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
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
import { trpc, type RouterOutputs } from '@/lib/trpc';

import { DiscountFields, discountError, discountPayload, type DiscountDraft } from './DiscountFields';
import { itemDraftToInput, OrderItemsSection, orderItemToDraft, useOrderCatalog } from './OrderFormFields';
import type { ItemDraft } from './OrderItemFields';

type OrderDetails = RouterOutputs['orders']['byId'];

/** Сумма в тийинах → строка для поля денег: `500000000` → `'5000000'`. */
const moneyField = (minor: number): string => (minor / 100).toString();

/**
 * Правка заказа со страницы заказа.
 *
 * Те же поля, что при создании, кроме филиала, предоплаты и расценок: филиал
 * не переносится, оплата — это проводки (кнопка «Принять оплату»), расценки —
 * отдельная кнопка руководства. Уходит только изменённое: сервер пишет в
 * журнал и уведомляет исполнителя по тому, что реально поменялось.
 *
 * Разделы прячутся по типу заказа: у пошива на склад нет клиента и цены, а
 * состав продажи готовых штор не меняется — товар уже списан с полки.
 */
export function OrderEditDialog({
  order,
  open,
  onClose,
}: {
  readonly order: OrderDetails;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();
  const catalog = useOrderCatalog(open);

  const forStock = order.orderType === OrderType.STOCK;
  const itemsEditable = order.orderType !== OrderType.READY_MADE;
  // Цена видна только тем, кому сервер отдал деньги клиента.
  const priceEditable = !forStock && order.workPrice !== null;

  // В заказе хранится цена уже со скидкой; в поле — цена до скидки, как при создании.
  const initialPrice = (): string =>
    order.workPrice === null
      ? ''
      : moneyField(parseMoney(order.workPrice) + parseMoney(order.discountAmount ?? '0'));
  const initialDiscount = (): DiscountDraft => ({
    value:
      parseMoney(order.discountAmount ?? '0') > 0 ? moneyField(parseMoney(order.discountAmount ?? '0')) : '',
    mode: 'sum',
    reason: order.discountReason ?? '',
  });

  const [clientName, setClientName] = useState(order.clientName);
  const [clientPhone, setClientPhone] = useState(order.clientPhone);
  const [installAddress, setInstallAddress] = useState(order.installAddress ?? '');
  const [clientComment, setClientComment] = useState(order.clientComment ?? '');
  const [deadline, setDeadline] = useState(order.deadline ?? '');
  const [priority, setPriority] = useState<PriorityName>(order.priority);
  const [workPrice, setWorkPrice] = useState(initialPrice);
  const [discount, setDiscount] = useState(initialDiscount);
  const [items, setItems] = useState<ItemDraft[]>(() => order.items.map(orderItemToDraft));
  const [itemsTouched, setItemsTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Каждое открытие — с того, что сейчас в заказе, а не с прошлой попытки.
  useEffect(() => {
    if (!open) return;
    setClientName(order.clientName);
    setClientPhone(order.clientPhone);
    setInstallAddress(order.installAddress ?? '');
    setClientComment(order.clientComment ?? '');
    setDeadline(order.deadline ?? '');
    setPriority(order.priority);
    setWorkPrice(initialPrice());
    setDiscount(initialDiscount());
    setItems(order.items.map(orderItemToDraft));
    setItemsTouched(false);
    setSubmitted(false);
    // Только при открытии: `order` обновляется после сохранения, и сброс
    // посреди правки стёр бы набранное.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = trpc.orders.update.useMutation({
    async onSuccess() {
      await Promise.all([
        utils.orders.byId.invalidate({ id: order.id }),
        utils.orders.list.invalidate(),
        utils.orders.availableTransitions.invalidate({ id: order.id }),
      ]);
      toast.success('Заказ изменён');
      onClose();
    },
  });
  const errors = fieldErrors(update.error);

  const handleSubmit = (): void => {
    setSubmitted(true);
    if (priceEditable && discountError(workPrice, discount) !== undefined) return;

    const price = priceEditable ? discountPayload(workPrice, discount) : null;
    const priceChanged =
      price !== null &&
      (parseMoney(price.workPrice) !== parseMoney(order.workPrice ?? '0') ||
        parseMoney(price.discountAmount) !== parseMoney(order.discountAmount ?? '0'));

    const changes = {
      ...(!forStock && clientName.trim() !== order.clientName ? { clientName: clientName.trim() } : {}),
      ...(!forStock && clientPhone.trim() !== order.clientPhone ? { clientPhone: clientPhone.trim() } : {}),
      ...(!forStock && installAddress.trim() !== (order.installAddress ?? '')
        ? { installAddress: installAddress.trim() }
        : {}),
      ...(!forStock && clientComment.trim() !== (order.clientComment ?? '')
        ? { clientComment: clientComment.trim() }
        : {}),
      ...(deadline !== (order.deadline ?? '') ? { deadline: deadline === '' ? null : deadline } : {}),
      ...(priority !== order.priority ? { priority } : {}),
      ...(price !== null && priceChanged ? price : {}),
      ...(itemsEditable && itemsTouched
        ? { items: items.map((item) => itemDraftToInput(item, catalog)) }
        : {}),
    };

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: order.id, ...changes });
  };

  return (
    <Modal
      open={open}
      title={`Изменить заказ ${order.orderNumber ?? `#${order.id.toString()}`}`}
      width="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={update.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError
          message={update.error !== null && Object.keys(errors).length === 0 ? update.error.message : null}
        />

        {!forStock && (
          <section>
            <h3 className="section-title mb-2">Клиент</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя клиента" required error={errors['clientName']}>
                <Input
                  value={clientName}
                  onChange={(event) => {
                    setClientName(event.target.value);
                  }}
                  invalid={errors['clientName'] !== undefined}
                />
              </Field>
              <Field label="Телефон" required error={errors['clientPhone']}>
                <Input
                  value={clientPhone}
                  onChange={(event) => {
                    setClientPhone(event.target.value);
                  }}
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
                />
              </Field>
              <Field label="Пожелания клиента" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={clientComment}
                  onChange={(event) => {
                    setClientComment(event.target.value);
                  }}
                />
              </Field>
            </div>
          </section>
        )}

        <section>
          <h3 className="section-title mb-2">Условия</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS_RU[value] }))}
              />
            </Field>
            {priceEditable && (
              <>
                <Field label="Стоимость работ, сум" error={errors['workPrice']}>
                  <MoneyInput value={workPrice} onChange={setWorkPrice} />
                </Field>
                <DiscountFields
                  price={workPrice}
                  value={discount}
                  onChange={setDiscount}
                  error={errors['discountReason'] ?? (submitted ? discountError(workPrice, discount) : undefined)}
                />
              </>
            )}
          </div>
        </section>

        {itemsEditable ? (
          <OrderItemsSection
            items={items}
            onChange={(next) => {
              setItemsTouched(true);
              setItems(next);
            }}
            catalog={catalog}
            error={errors['items']}
          />
        ) : (
          <p className="text-footnote text-muted">
            Состав продажи готовых штор не меняется: товар уже списан со склада.
          </p>
        )}
      </div>
    </Modal>
  );
}

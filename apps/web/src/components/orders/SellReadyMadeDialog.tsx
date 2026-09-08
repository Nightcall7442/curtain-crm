'use client';

import { formatMoney, parseMoney } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Button, Field, fieldErrors, FormError, Input, Modal, Textarea } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Продажа готовых штор — товар с витрины, минуя цех.
 *
 * Форма короче обычного создания заказа НАМЕРЕННО: готовые шторы не проходят
 * замер, раскрой, пошив и контроль качества, поэтому весь набор полей под
 * позицию заказа (карниз, тюль, сачак, материалы...) здесь неуместен — это
 * атрибуты того, что ещё предстоит сшить, а не того, что уже готово и лежит
 * на витрине.
 *
 * Единственное ветвление — «нужна ли установка»: без неё заказ закрывается
 * тем же нажатием, с ней уходит админу в очередь на назначение установщика,
 * как обычный заказ на этом же этапе.
 */
export function SellReadyMadeDialog({
  open,
  onClose,
  onSold,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSold: (orderId: number) => void;
}): ReactElement {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [comment, setComment] = useState('');
  const [needsInstallation, setNeedsInstallation] = useState(false);
  const [installAddress, setInstallAddress] = useState('');
  /**
   * Выбранная штора со склада. `null` — продажа без склада: так продают то,
   * чего на полке не оказалось, и так продавали до появления остатков.
   */
  const [stockItemId, setStockItemId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const stock = trpc.readyMade.list.useQuery({}, { enabled: open });

  const sell = trpc.orders.sellReadyMade.useMutation({
    async onSuccess(order) {
      await Promise.all([
        utils.orders.list.invalidate(),
        utils.reports.dashboard.invalidate(),
        // Остаток списался — список склада в этой же вкладке иначе покажет
        // прежнее число, и следующую продажу продавец начнёт с неверного.
        utils.readyMade.list.invalidate(),
      ]);
      reset();
      onSold(order.id);
    },
  });

  const reset = (): void => {
    setClientName('');
    setClientPhone('');
    setModel('');
    setQuantity('1');
    setWorkPrice('');
    setDeposit('');
    setComment('');
    setNeedsInstallation(false);
    setInstallAddress('');
    setStockItemId(null);
    sell.reset();
  };

  const errors = fieldErrors(sell.error);

  const handleSubmit = (): void => {
    sell.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      workPrice: Number.parseFloat(workPrice.replace(',', '.')) || 0,
      deposit: Number.parseFloat(deposit.replace(',', '.')) || 0,
      needsInstallation,
      /* Одна позиция: несколько строк в продаже набирают в мобильном
         приложении, за кассой. Здесь форма осталась прежней. */
      items: [
        {
          quantity: Math.max(1, Number.parseInt(quantity, 10) || 1),
          ...(stockItemId === null ? {} : { readyMadeItemId: stockItemId }),
          ...(model.trim().length > 0 ? { model: model.trim() } : {}),
          ...(comment.trim().length > 0 ? { comment: comment.trim() } : {}),
        },
      ],
      ...(needsInstallation
        ? {
            installAddress: installAddress.trim(),
          }
        : {}),
    });
  };

  return (
    <Modal
      open={open}
      title="Продажа готовых штор"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={sell.isPending}>
            {needsInstallation ? 'Продать, передать на установку' : 'Продать и закрыть'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError
          message={sell.error !== null && Object.keys(errors).length === 0 ? sell.error.message : null}
        />

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
          </div>
        </section>

        <section>
          <h3 className="section-title mb-2">Товар</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Что продано" className="sm:col-span-2 lg:col-span-2">
              <Input
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  // Набранное руками расходится с выбранной вещью — снимаем
                  // выбор, чтобы со склада не списалось не то.
                  setStockItemId(null);
                }}
                placeholder="Готовый комплект, бежевый"
              />
            </Field>

            <Field label="Количество">
              <Input
                type="number"
                min={1}
                max={1000}
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
              />
            </Field>

            {/*
              Что лежит на складе по набранной модели. Выбранная строка
              списывается при продаже, а размер, цвет и код уезжают в заказ
              со склада — продавец выбирает вещь, а не переписывает её.
            */}
            <div className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1.5 block text-footnote font-medium text-secondary">
                Со склада
              </span>

              {(() => {
                const matching = (stock.data ?? []).filter(
                  (row) =>
                    model.trim().length === 0 ||
                    row.model.toLowerCase().includes(model.trim().toLowerCase()),
                );

                if (stock.isLoading) {
                  return <p className="text-footnote text-muted">Загрузка остатков…</p>;
                }

                if (matching.length === 0) {
                  return (
                    <p className="text-footnote text-muted">
                      Готовых штор по этой модели на складе нет — продажа пройдёт без списания
                    </p>
                  );
                }

                return (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matching.map((row) => {
                      const chosen = stockItemId === row.id;

                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            setStockItemId(chosen ? null : row.id);
                            if (!chosen) {
                              setModel(row.model);
                              if (workPrice.trim().length === 0) {
                                setWorkPrice(
                                  (
                                    Number.parseFloat(row.price) *
                                    Math.max(1, Number.parseInt(quantity, 10) || 1)
                                  ).toString(),
                                );
                              }
                            }
                          }}
                          className={`flex items-center gap-3 rounded border p-2 text-left transition-colors ${
                            chosen
                              ? 'border-accent bg-accent/10'
                              : 'border-subtle hover:border-accent/50'
                          }`}
                        >
                          <span className="block flex-1">
                            <span className="block text-footnote text-primary">
                              {`${row.model} · ${Number.parseFloat(row.widthCm).toString()}×${Number.parseFloat(
                                row.heightCm,
                              ).toString()} см`}
                            </span>
                            <span className="block text-overline text-muted">
                              {[row.color, row.code, row.branchName]
                                .filter((part) => part !== null)
                                .join(' · ')}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-footnote text-primary">
                              {formatMoney(parseMoney(row.price))}
                            </span>
                            <span className="block text-overline text-muted">
                              {`${row.quantity.toString()} шт`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <Field label="Цена, сум" error={errors['workPrice']}>
              <Input
                inputMode="decimal"
                value={workPrice}
                onChange={(event) => {
                  setWorkPrice(event.target.value);
                }}
                placeholder="1200000"
              />
            </Field>

            <Field label="Предоплата, сум" error={errors['deposit']} className="sm:col-span-2 lg:col-span-1">
              <Input
                inputMode="decimal"
                value={deposit}
                onChange={(event) => {
                  setDeposit(event.target.value);
                }}
                placeholder="0"
              />
            </Field>

            <Field label="Комментарий" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                rows={2}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
                placeholder="Что важно помнить по этой продаже"
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="section-title mb-2">Установка</h3>

          <label className="flex items-center gap-2 text-caption text-primary">
            <input
              type="checkbox"
              checked={needsInstallation}
              onChange={(event) => {
                setNeedsInstallation(event.target.checked);
              }}
              className="h-4 w-4 accent-accent"
            />
            Установка требуется — передать заказ админу на назначение установщика
          </label>

          {needsInstallation ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Адрес установки" required error={errors['installAddress']}>
                <Input
                  value={installAddress}
                  onChange={(event) => {
                    setInstallAddress(event.target.value);
                  }}
                  placeholder="г. Ургенч, ул. …"
                  invalid={errors['installAddress'] !== undefined}
                />
              </Field>
            </div>
          ) : (
            <p className="mt-2 text-footnote text-muted">
              Заказ закроется сразу — цех и установщик в нём не участвуют.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

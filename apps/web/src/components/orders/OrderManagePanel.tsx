'use client';

import {
  ASSIGNABLE_ROLES,
  formatMoney,
  parseMoney,
  ROLE_LABELS_RU,
  type AssignableRole,
  type Role,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Управление заказом: назначение исполнителей, цена и отмена.
 *
 * Панель показывается только руководству — но, как везде, это лишь удобство:
 * `orders.assign`, `orders.setPrice` и `orders.cancel` объявлены как
 * `managementProcedure`, и продавец получит `FORBIDDEN`, даже если доберётся
 * до кнопки.
 */

const ASSIGNABLE: readonly { readonly role: AssignableRole }[] = [
  ...ASSIGNABLE_ROLES.map((role) => ({ role })),
];

export function OrderManagePanel({
  orderId,
  current,
  workPrice,
  deposit,
  isClosed,
}: {
  readonly orderId: number;
  readonly current: Readonly<Record<AssignableRole, number | null>>;
  readonly workPrice: string;
  readonly deposit: string;
  readonly isClosed: boolean;
}): ReactElement {
  const utils = trpc.useUtils();

  const [priceOpen, setPriceOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [nextWorkPrice, setNextWorkPrice] = useState(workPrice);
  const [nextDeposit, setNextDeposit] = useState(deposit);
  const [reason, setReason] = useState('');

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.orders.availableTransitions.invalidate({ id: orderId }),
      utils.orders.history.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
    ]);
  };

  const assign = trpc.orders.assign.useMutation({ onSuccess: refresh });
  const setPrice = trpc.orders.setPrice.useMutation({
    async onSuccess() {
      setPriceOpen(false);
      await refresh();
    },
  });
  const cancel = trpc.orders.cancel.useMutation({
    async onSuccess() {
      setCancelOpen(false);
      setReason('');
      await refresh();
    },
  });

  return (
    <Card>
      <CardHeader
        title="Управление заказом"
        action={
          !isClosed && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setNextWorkPrice(workPrice);
                  setNextDeposit(deposit);
                  setPriceOpen(true);
                }}
              >
                Изменить цену
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setCancelOpen(true);
                }}
              >
                Отменить заказ
              </Button>
            </div>
          )
        }
      />

      <CardBody>
        <p className="mb-3 text-footnote text-muted">
          Назначение вступает в силу сразу. Сотрудник получит уведомление, а
          статус заказа при этом не меняется.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ASSIGNABLE.map(({ role }) => (
            <AssigneeSelect
              key={role}
              role={role}
              value={current[role]}
              disabled={isClosed || assign.isPending}
              onChange={(assigneeId) => {
                assign.mutate({ id: orderId, role, assigneeId });
              }}
            />
          ))}
        </div>

        {assign.error !== null && (
          <div className="mt-3">
            <FormError message={assign.error.message} />
          </div>
        )}
      </CardBody>

      {/* --- Цена ------------------------------------------------------- */}
      <Modal
        open={priceOpen}
        title="Стоимость заказа"
        onClose={() => {
          setPriceOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPriceOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={setPrice.isPending}
              onClick={() => {
                setPrice.mutate({
                  id: orderId,
                  workPrice: Number.parseFloat(nextWorkPrice.replace(',', '.')) || 0,
                  deposit: Number.parseFloat(nextDeposit.replace(',', '.')) || 0,
                });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={setPrice.error?.message ?? null} />

          <Field label="Стоимость работ, сум">
            <Input
              inputMode="decimal"
              value={nextWorkPrice}
              onChange={(event) => {
                setNextWorkPrice(event.target.value);
              }}
            />
          </Field>

          <Field label="Предоплата, сум">
            <Input
              inputMode="decimal"
              value={nextDeposit}
              onChange={(event) => {
                setNextDeposit(event.target.value);
              }}
            />
          </Field>

          <p className="text-footnote text-secondary">
            {`Остаток к оплате: ${formatMoney(
              parseMoney(Number.parseFloat(nextWorkPrice.replace(',', '.')) || 0) -
                parseMoney(Number.parseFloat(nextDeposit.replace(',', '.')) || 0),
            )}`}
          </p>
          <p className="text-overline text-muted">
            Остаток считает база, поле в форме — только предпросмотр.
          </p>
        </div>
      </Modal>

      {/* --- Отмена ----------------------------------------------------- */}
      <Modal
        open={cancelOpen}
        title="Отмена заказа"
        onClose={() => {
          setCancelOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCancelOpen(false);
              }}
            >
              Не отменять
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => {
                cancel.mutate({ id: orderId, reason: reason.trim() });
              }}
            >
              Отменить заказ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={cancel.error?.message ?? null} />

          <p className="text-caption text-secondary">
            Заказ не удаляется: он останется в архиве вместе с причиной и всей
            историей. Отменить отмену нельзя.
          </p>

          <Field label="Причина отмены" required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder="Например: клиент отказался от заказа"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/**
 * Выбор исполнителя на роль.
 *
 * Список приходит из `users.listByRole`, то есть содержит только активных
 * сотрудников с этой ролью. Назначить человека без нужной роли невозможно —
 * сервер отклонит, а список такого варианта и не покажет.
 */
function AssigneeSelect({
  role,
  value,
  disabled,
  onChange,
}: {
  readonly role: AssignableRole;
  readonly value: number | null;
  readonly disabled: boolean;
  readonly onChange: (assigneeId: number | null) => void;
}): ReactElement {
  const candidates = trpc.users.listByRole.useQuery({ role: role satisfies Role });

  return (
    <Field label={ROLE_LABELS_RU[role]}>
      <Select
        value={value === null ? '' : value.toString()}
        disabled={disabled || candidates.isLoading}
        placeholder="Не назначен"
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === '' ? null : Number.parseInt(next, 10));
        }}
        options={(candidates.data ?? []).map((person) => ({
          value: person.id.toString(),
          label: person.fullName,
        }))}
      />
    </Field>
  );
}

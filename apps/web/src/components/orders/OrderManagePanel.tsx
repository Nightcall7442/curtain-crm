'use client';

import {
  ASSIGNABLE_ROLES,
  formatMoney,
  parseMoney,
  ROLE_LABELS_RU,
  type AssignableRole,
  type OrderType as OrderTypeName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Modal, MoneyInput, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

import { useAssigneeCandidates } from './useAssigneeCandidates';

import { StageFeesFields, toStageFeesInput, type StageFeesDraft } from './StageFeesFields';

/**
 * Управление заказом: назначение исполнителей, цена и расценки.
 *
 * Панель показывается только руководству — но, как везде, это лишь удобство:
 * `orders.assign`, `orders.setPrice` и `orders.setStageFees` объявлены как
 * `managementProcedure`, и продавец получит `FORBIDDEN`, даже если доберётся
 * до кнопки.
 *
 * Отмены здесь нет: она живёт среди переходов статуса в «Действиях по
 * заказу» — там же, где остальные способы сдвинуть заказ, и с той же
 * обязательной причиной.
 *
 * Расценки исполнителям — отдельная кнопка, а не поля в «Изменить цену»:
 * `workPrice` платит клиент, а расценки получает цех, и смешивать их в одном
 * окне значило бы предлагать поправить чужую зарплату заодно с ценой.
 */

const ASSIGNABLE: readonly { readonly role: AssignableRole }[] = [
  ...ASSIGNABLE_ROLES.map((role) => ({ role })),
];

export function OrderManagePanel({
  orderId,
  current,
  workPrice,
  deposit,
  stageFees,
  orderType,
  isClosed,
}: {
  readonly orderId: number;
  readonly current: Readonly<Record<AssignableRole, number | null>>;
  readonly workPrice: string;
  readonly deposit: string;
  readonly stageFees: StageFeesDraft;
  readonly orderType: OrderTypeName;
  readonly isClosed: boolean;
}): ReactElement {
  const utils = trpc.useUtils();

  const [priceOpen, setPriceOpen] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);
  const [nextWorkPrice, setNextWorkPrice] = useState(workPrice);
  const [nextDeposit, setNextDeposit] = useState(deposit);
  const [nextFees, setNextFees] = useState(stageFees);

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
  const setStageFees = trpc.orders.setStageFees.useMutation({
    async onSuccess() {
      setFeesOpen(false);
      await refresh();
    },
  });

  return (
    <Card>
      <CardHeader
        title="Управление заказом"
        action={
          <div className="flex gap-2">
            {/*
              Расценки правятся и у закрытого заказа — в отличие от цены и
              отмены. Заказ закрывают раньше, чем считают зарплату, и
              забытую сумму дописывают до конца месяца; иначе исполнитель
              остался бы без денег из-за того, что кто-то поторопился нажать
              «выполнено».
            */}
            <Button
              variant="secondary"
              onClick={() => {
                setNextFees(stageFees);
                setFeesOpen(true);
              }}
            >
              Расценки
            </Button>

            {!isClosed && (
              <>
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
                {/*
                  Кнопки отмены здесь нет намеренно.

                  Она стояла в двух соседних блоках сразу: в «Действиях по
                  заказу» — как переход статуса, и здесь — как отдельное
                  действие. Делали они одно и то же, включая обязательную
                  причину, а рядом две красные кнопки с одинаковой подписью
                  заставляли выбирать между ними. Отмена — это смена статуса,
                  и живёт она среди других переходов.
                */}
              </>
            )}
          </div>
        }
      />

      <CardBody>
        <p className="mb-3 text-footnote text-muted">
          Назначение вступает в силу сразу. Сотрудник получит уведомление, а
          статус заказа при этом не меняется.
        </p>

        {/* Один столбец: панель живёт в узкой правой колонке карточки, и четыре селекта в ряд там не помещались. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
            <MoneyInput
              value={nextWorkPrice}
              onChange={setNextWorkPrice}
            />
          </Field>

          <Field label="Предоплата, сум">
            <MoneyInput
              value={nextDeposit}
              onChange={setNextDeposit}
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

      {/* --- Расценки по этапам ------------------------------------------ */}
      <Modal
        open={feesOpen}
        title="Расценки исполнителям"
        onClose={() => {
          setFeesOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setFeesOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={setStageFees.isPending}
              onClick={() => {
                setStageFees.mutate({ id: orderId, ...toStageFeesInput(nextFees) });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={setStageFees.error?.message ?? null} />

          <StageFeesFields value={nextFees} onChange={setNextFees} orderType={orderType} />

          <p className="text-footnote text-secondary">
            {`Всего исполнителям: ${formatMoney(
              parseMoney(toStageFeesInput(nextFees).measurementFee) +
                parseMoney(toStageFeesInput(nextFees).sewingFee) +
                parseMoney(toStageFeesInput(nextFees).qcFee) +
                parseMoney(toStageFeesInput(nextFees).installationFee),
            )}`}
          </p>
          <p className="text-overline text-muted">
            Суммы попадут в зарплату исполнителей за месяц, в котором заказ
            закрыт. Каждый видит только свою.
          </p>
        </div>
      </Modal>

    </Card>
  );
}

/** Выбор исполнителя на роль: свои по роли, по «Ещё» — все сотрудники. */
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
  const { loading, candidates, canShowMore, showMore } = useAssigneeCandidates(role, value);

  return (
    <Field label={ROLE_LABELS_RU[role]}>
      <Select
        value={value === null ? '' : value.toString()}
        disabled={disabled || loading}
        placeholder="Не назначен"
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === '' ? null : Number.parseInt(next, 10));
        }}
        options={candidates.map((person) => ({
          value: person.id.toString(),
          label:
            person.mainRole === null
              ? person.fullName
              : `${person.fullName} · ${ROLE_LABELS_RU[person.mainRole]}`,
        }))}
      />
      {canShowMore && (
        <button
          type="button"
          className="mt-1 text-footnote text-accent hover:underline"
          onClick={showMore}
        >
          Ещё сотрудники
        </button>
      )}
    </Field>
  );
}

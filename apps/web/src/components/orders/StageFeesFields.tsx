'use client';

import {
  ORDER_STAGE_FEE_LABELS_RU,
  OrderType,
  stageFeesOfOrderType,
  type OrderStageFee,
  type OrderType as OrderTypeName,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { Field, Input } from '@/components/ui/Form';

/**
 * Сдельные расценки по этапам — сколько получит каждый исполнитель за этот
 * заказ.
 *
 * Один и тот же блок в форме приёма заказа, в продаже готовых штор и в
 * панели руководства: правила «что показать» одни, а три копии полей
 * разъехались бы при первом же изменении состава этапов.
 *
 * Пустое поле — ноль, а не ошибка: у заказа без монтажа установки нет, а
 * забытую сумму руководство дописывает позже. Обязательность здесь дала бы
 * не заполненные ведомости, а проставленные наугад числа.
 */

export type StageFeesDraft = Readonly<Record<OrderStageFee, string>>;

export const emptyStageFees = (): StageFeesDraft => ({
  measurement: '',
  sewing: '',
  qc: '',
  installation: '',
});

/** Сумма из поля. Пустое и нечисловое — ноль. */
const amountOf = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

/** Приводит черновик к полям процедур `orders.create` и `orders.setStageFees`. */
export function toStageFeesInput(draft: StageFeesDraft): {
  readonly measurementFee: number;
  readonly sewingFee: number;
  readonly qcFee: number;
  readonly installationFee: number;
} {
  return {
    measurementFee: amountOf(draft.measurement),
    sewingFee: amountOf(draft.sewing),
    qcFee: amountOf(draft.qc),
    installationFee: amountOf(draft.installation),
  };
}

/** Заполняет черновик значениями из заказа. `null` — расценка скрыта от нас. */
export function stageFeesFromOrder(order: {
  readonly measurementFee: string | null;
  readonly sewingFee: string | null;
  readonly qcFee: string | null;
  readonly installationFee: string | null;
}): StageFeesDraft {
  const shown = (value: string | null): string =>
    value === null ? '' : Number.parseFloat(value).toString();

  return {
    measurement: shown(order.measurementFee),
    sewing: shown(order.sewingFee),
    qc: shown(order.qcFee),
    installation: shown(order.installationFee),
  };
}

const ERROR_FIELD: Readonly<Record<OrderStageFee, string>> = {
  measurement: 'measurementFee',
  sewing: 'sewingFee',
  qc: 'qcFee',
  installation: 'installationFee',
};

export function StageFeesFields({
  value,
  onChange,
  orderType = OrderType.CUSTOM,
  errors = {},
}: {
  readonly value: StageFeesDraft;
  readonly onChange: (next: StageFeesDraft) => void;
  readonly orderType?: OrderTypeName;
  readonly errors?: Readonly<Record<string, string | undefined>>;
}): ReactElement {
  const stages = stageFeesOfOrderType(orderType);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {stages.map((stage) => (
        <Field
          key={stage}
          label={`${ORDER_STAGE_FEE_LABELS_RU[stage]}, сум`}
          error={errors[ERROR_FIELD[stage]]}
        >
          <Input
            inputMode="decimal"
            value={value[stage]}
            onChange={(event) => {
              onChange({ ...value, [stage]: event.target.value });
            }}
            placeholder="0"
          />
        </Field>
      ))}
    </div>
  );
}

'use client';

import {
  formatMoney,
  ORDER_STAGE_FEE_LABELS_RU,
  OrderType,
  parseMoney,
  SEWER_CATEGORY_FEE_PERCENT,
  SEWER_CATEGORY_LABELS_RU,
  stageFeesOfOrderType,
  suggestedStageFee,
  type OrderStageFee,
  type OrderType as OrderTypeName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Field, MoneyInput } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

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
  cutting: '',
  sewing: '',
  qc: '',
  cornice: '',
  installation: '',
});

/** Сумма из поля. Пустое и нечисловое — ноль. */
const amountOf = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

/** Приводит черновик к полям процедур `orders.create` и `orders.setStageFees`. */
export function toStageFeesInput(draft: StageFeesDraft): {
  readonly measurementFee: number;
  readonly cuttingFee: number;
  readonly sewingFee: number;
  readonly qcFee: number;
  readonly corniceFee: number;
  readonly installationFee: number;
} {
  return {
    measurementFee: amountOf(draft.measurement),
    cuttingFee: amountOf(draft.cutting),
    sewingFee: amountOf(draft.sewing),
    qcFee: amountOf(draft.qc),
    corniceFee: amountOf(draft.cornice),
    installationFee: amountOf(draft.installation),
  };
}

/** Заполняет черновик значениями из заказа. `null` — расценка скрыта от нас. */
export function stageFeesFromOrder(order: {
  readonly measurementFee: string | null;
  readonly cuttingFee: string | null;
  readonly sewingFee: string | null;
  readonly qcFee: string | null;
  readonly corniceFee: string | null;
  readonly installationFee: string | null;
}): StageFeesDraft {
  const shown = (value: string | null): string =>
    value === null ? '' : Number.parseFloat(value).toString();

  return {
    measurement: shown(order.measurementFee),
    cutting: shown(order.cuttingFee),
    sewing: shown(order.sewingFee),
    qc: shown(order.qcFee),
    cornice: shown(order.corniceFee),
    installation: shown(order.installationFee),
  };
}

const ERROR_FIELD: Readonly<Record<OrderStageFee, string>> = {
  measurement: 'measurementFee',
  cutting: 'cuttingFee',
  sewing: 'sewingFee',
  qc: 'qcFee',
  cornice: 'corniceFee',
  installation: 'installationFee',
};

export function StageFeesFields({
  value,
  onChange,
  orderType = OrderType.CUSTOM,
  errors = {},
  sewerId = null,
}: {
  readonly value: StageFeesDraft;
  readonly onChange: (next: StageFeesDraft) => void;
  readonly orderType?: OrderTypeName;
  readonly errors?: Readonly<Record<string, string | undefined>>;
  /** Назначенная швея — для подсказки расценки по её категории. */
  readonly sewerId?: number | null;
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
          <MoneyInput
            value={value[stage]}
            onChange={(next) => {
              onChange({ ...value, [stage]: next });
            }}
            placeholder="0"
          />
          {stage === 'sewing' && sewerId !== null && (
            <SewingFeeHint
              sewerId={sewerId}
              typed={value.sewing}
              onApply={(next) => {
                onChange({ ...value, sewing: next });
              }}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

/**
 * Подсказка расценки по категории швеи.
 *
 * Руководитель пишет ставку первой категории — «за пошив 50 000», — а
 * программа отвечает: «швея второй категории, пишите 40 000». Подставить —
 * одна кнопка. После подстановки подсказка молчит, пока сумму не начнут
 * править снова: иначе от 40 000 она предложила бы 32 000, и так по кругу.
 */
function SewingFeeHint({
  sewerId,
  typed,
  onApply,
}: {
  readonly sewerId: number;
  readonly typed: string;
  readonly onApply: (next: string) => void;
}): ReactElement | null {
  const categories = trpc.rating.sewerCategories.useQuery();
  const [applied, setApplied] = useState<string | null>(null);

  const sewer = categories.data?.find((row) => row.userId === sewerId);
  if (sewer === undefined) return null;

  const base = Number.parseFloat(typed.replace(',', '.')) || 0;
  const label = `${sewer.fullName} — ${SEWER_CATEGORY_LABELS_RU[sewer.category]}`;
  if (sewer.category === 1 || base <= 0 || typed === applied) {
    return <p className="mt-1 text-footnote text-muted">{`${label} (${String(SEWER_CATEGORY_FEE_PERCENT[sewer.category])}% ставки)`}</p>;
  }

  const suggested = suggestedStageFee(base, sewer.category);
  return (
    <p className="mt-1 text-footnote text-secondary">
      {`${label}: ${String(SEWER_CATEGORY_FEE_PERCENT[sewer.category])}% от ${money(base)} — `}
      <button
        type="button"
        className="text-accent hover:underline"
        onClick={() => {
          const next = suggested.toString();
          setApplied(next);
          onApply(next);
        }}
      >
        {`подставить ${money(suggested)}`}
      </button>
    </p>
  );
}

/** Сумма в сумах — в строку с разрядами; поля расценок хранят сумы, не тийины. */
const money = (sum: number): string => formatMoney(parseMoney(sum.toString()));

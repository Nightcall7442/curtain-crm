import {
  ORDER_STAGE_FEE_LABELS,
  OrderType,
  stageFeesOfOrderType,
  type OrderStageFee,
  type OrderType as OrderTypeName,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, Input } from './Field';
import { useLocale } from '../hooks/useLocale';
import { spacing } from '../theme';

/**
 * Сдельные расценки по этапам — сколько получит каждый исполнитель за этот
 * заказ.
 *
 * Тот же блок, что в веб-панели: продавец заполняет его у клиента, с
 * телефоном в руках, и суммы должны попасть в заказ там же, где он заводится.
 * Возвращаться за компьютер ради четырёх чисел — ровно тот шаг, после
 * которого расценки проставляют вечером и по памяти.
 *
 * Пустое поле — ноль, а не ошибка: у заказа без монтажа установки нет, а
 * забытую сумму руководство дописывает позже.
 */

export type StageFeeDraft = Readonly<Record<OrderStageFee, string>>;

export const emptyStageFees = (): StageFeeDraft => ({
  measurement: '',
  sewing: '',
  qc: '',
  installation: '',
});

/** Сумма из поля. Пустое, нечисловое и отрицательное — ноль. */
const amountOf = (raw: string): number => {
  const parsed = Number.parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Приводит черновик к полям процедуры `orders.create`. */
export function toStageFeesInput(draft: StageFeeDraft): {
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

export function StageFeeFields({
  value,
  onChange,
  orderType = OrderType.CUSTOM,
}: {
  readonly value: StageFeeDraft;
  readonly onChange: (next: StageFeeDraft) => void;
  readonly orderType?: OrderTypeName;
}): ReactElement {
  const { t } = useLocale();
  const stages = stageFeesOfOrderType(orderType);

  return (
    <View style={styles.grid}>
      {stages.map((stage) => (
        <View key={stage} style={styles.cell}>
          <Field label={t(ORDER_STAGE_FEE_LABELS, stage)}>
            <Input
              value={value[stage]}
              onChangeText={(next) => {
                onChange({ ...value, [stage]: next });
              }}
              placeholder="0"
              keyboardType="numeric"
            />
          </Field>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  // Две колонки: четыре суммы в столбик вытянули бы форму на лишний экран.
  cell: {
    flexGrow: 1,
    flexBasis: '45%',
  },
});

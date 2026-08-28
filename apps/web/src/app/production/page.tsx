'use client';

import {
  PRODUCTION_STAGES,
  ProductionStage,
  type OrderStatus,
  type ProductionStageKey,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { OrdersView } from '@/components/orders/OrdersView';

/**
 * Производство: заказы от замера до готовности к установке.
 *
 * Набор статусов берётся из `PRODUCTION_STAGES`, а не перечисляется здесь
 * руками: добавление статуса в конвейер не должно требовать правки страницы.
 */
const STAGES_IN_PRODUCTION: readonly ProductionStageKey[] = [
  ProductionStage.MEASUREMENT,
  ProductionStage.CUTTING,
  ProductionStage.SEWING,
  ProductionStage.QC,
  ProductionStage.READY_FOR_INSTALL,
];

const PRODUCTION_STATUSES: readonly OrderStatus[] = PRODUCTION_STAGES.filter((stage) =>
  STAGES_IN_PRODUCTION.includes(stage.key),
).flatMap((stage) => [...stage.statuses]);

export default function ProductionPage(): ReactElement {
  return (
    <OrdersView
      title="Производство"
      lockedStatuses={PRODUCTION_STATUSES}
      emptyMessage="В производстве заказов нет"
    />
  );
}

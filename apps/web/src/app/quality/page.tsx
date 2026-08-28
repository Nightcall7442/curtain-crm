'use client';

import { OrderStatus, type OrderStatus as OrderStatusName } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { OrdersView } from '@/components/orders/OrdersView';

/**
 * Контроль качества.
 *
 * Включает и заказы с обнаруженным браком: они остаются в зоне внимания ОТК,
 * пока не вернутся с доработки.
 */
const QC_STATUSES: readonly OrderStatusName[] = [
  OrderStatus.PENDING_QC,
  OrderStatus.QC_FAILED,
  OrderStatus.QC_PASSED,
];

export default function QualityPage(): ReactElement {
  return (
    <OrdersView
      title="Контроль качества"
      lockedStatuses={QC_STATUSES}
      emptyMessage="Заказов на контроле нет"
    />
  );
}

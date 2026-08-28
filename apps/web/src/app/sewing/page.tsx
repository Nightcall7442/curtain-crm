'use client';

import { OrderStatus, type OrderStatus as OrderStatusName } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { OrdersView } from '@/components/orders/OrdersView';

/** Швейный цех: раскрой, пошив и передача на контроль качества. */
const SEWING_STATUSES: readonly OrderStatusName[] = [
  OrderStatus.PENDING_SEWING_ASSIGNMENT,
  OrderStatus.SEWING_IN_PROGRESS,
  OrderStatus.SEWING_DONE,
];

export default function SewingPage(): ReactElement {
  return (
    <OrdersView
      title="Швейный цех"
      lockedStatuses={SEWING_STATUSES}
      emptyMessage="В швейном цехе заказов нет"
    />
  );
}

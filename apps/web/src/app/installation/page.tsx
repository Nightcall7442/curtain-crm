'use client';

import { OrderStatus, type OrderStatus as OrderStatusName } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { OrdersView } from '@/components/orders/OrdersView';

/** Установка: от готовности к монтажу до завершения работ на объекте. */
const INSTALLATION_STATUSES: readonly OrderStatusName[] = [
  OrderStatus.QC_PASSED,
  OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
  OrderStatus.INSTALLATION_ASSIGNED,
  OrderStatus.INSTALLATION_IN_PROGRESS,
  OrderStatus.INSTALLATION_DONE,
];

export default function InstallationPage(): ReactElement {
  return (
    <OrdersView
      title="Установка"
      lockedStatuses={INSTALLATION_STATUSES}
      emptyMessage="Заказов на установку нет"
    />
  );
}

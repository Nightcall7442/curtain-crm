'use client';

import { isOrderStatus, isProductionStageKey } from '@curtain-crm/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { OrdersView } from '@/components/orders/OrdersView';

/**
 * Все заказы.
 *
 * По умолчанию выполненные и отменённые скрыты — они в разделе «Архив».
 * Чтобы увидеть их здесь, достаточно выбрать соответствующий статус.
 *
 * Раздел принимает фильтр из адреса — `?status=qc_failed` и `?stage=cutting`.
 * Сюда ведут плитки главной панели, и без разбора адреса они открывали бы
 * общий список: элемент выглядел бы рабочим, ничего при этом не фильтруя.
 */
export default function OrdersPage(): ReactElement {
  return (
    // `useSearchParams()` выключает статическую отрисовку страницы целиком,
    // поэтому чтение адреса вынесено под собственную границу Suspense.
    <Suspense fallback={<OrdersView title="Заказы" />}>
      <OrdersFromUrl />
    </Suspense>
  );
}

function OrdersFromUrl(): ReactElement {
  const params = useSearchParams();
  const status = params.get('status');
  const stage = params.get('stage');

  return (
    <OrdersView
      title="Заказы"
      // Мусор в адресе игнорируется молча: показать все заказы понятнее,
      // чем экран ошибки из-за опечатки в ссылке.
      {...(isOrderStatus(status) ? { initialStatus: status } : {})}
      {...(isProductionStageKey(stage) ? { initialStage: stage } : {})}
    />
  );
}

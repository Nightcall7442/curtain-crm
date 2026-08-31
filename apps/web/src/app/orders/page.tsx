'use client';

import {
  ARCHIVED_ORDER_STATUSES,
  isOrderStatus,
  isProductionStageKey,
  OrderStatus,
  PRODUCTION_STAGES,
  ProductionStage,
  type OrderStatus as OrderStatusName,
  type ProductionStageKey,
} from '@curtain-crm/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { OrdersView, type OrdersPreset } from '@/components/orders/OrdersView';

/**
 * Все заказы — один раздел с вкладками-участками.
 *
 * Вкладки заменили отдельные пункты меню «Производство», «Швейный цех»,
 * «Установка», «Качество» и «Архив» (ревизия «Диспетчерская»): всё это один
 * список с готовым фильтром, и пять «мест», где может быть заказ, сводятся
 * к одному. Старые адреса разделов живы и перенаправляют на свою вкладку.
 *
 * Раздел принимает фильтр из адреса — `?status=qc_failed`, `?stage=cutting`
 * и `?tab=sewing`. Сюда ведут плитки главной панели, и без разбора адреса
 * они открывали бы общий список: элемент выглядел бы рабочим, ничего при
 * этом не фильтруя.
 */

/** Статусы вкладки «Производство» — от замера до готовности к установке. */
const STAGES_IN_PRODUCTION: readonly ProductionStageKey[] = [
  ProductionStage.MEASUREMENT,
  ProductionStage.CUTTING,
  ProductionStage.SEWING,
  ProductionStage.QC,
  ProductionStage.READY_FOR_INSTALL,
];

const PRODUCTION_STATUSES: readonly OrderStatusName[] = PRODUCTION_STAGES.filter((stage) =>
  STAGES_IN_PRODUCTION.includes(stage.key),
).flatMap((stage) => [...stage.statuses]);

// Не экспортируется: страница App Router может отдавать наружу только свои
// служебные поля, а редиректам старых разделов достаточно адреса `?tab=…`.
const ORDER_PRESETS: readonly OrdersPreset[] = [
  { key: 'all', label: 'Все' },
  {
    key: 'production',
    label: 'Производство',
    statuses: PRODUCTION_STATUSES,
    emptyMessage: 'В производстве заказов нет',
  },
  {
    key: 'sewing',
    label: 'Швейный цех',
    statuses: [
      OrderStatus.PENDING_SEWING_ASSIGNMENT,
      OrderStatus.SEWING_IN_PROGRESS,
      OrderStatus.SEWING_DONE,
    ],
    emptyMessage: 'В швейном цехе заказов нет',
  },
  {
    key: 'quality',
    label: 'Качество',
    statuses: [OrderStatus.PENDING_QC, OrderStatus.QC_FAILED, OrderStatus.QC_PASSED],
    emptyMessage: 'На контроле качества заказов нет',
  },
  {
    key: 'installation',
    label: 'Установка',
    statuses: [
      OrderStatus.QC_PASSED,
      OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
      OrderStatus.INSTALLATION_ASSIGNED,
      OrderStatus.INSTALLATION_IN_PROGRESS,
      OrderStatus.INSTALLATION_DONE,
    ],
    emptyMessage: 'Заказов на установку нет',
  },
  {
    key: 'archive',
    label: 'Архив',
    statuses: [...ARCHIVED_ORDER_STATUSES],
    emptyMessage: 'Выполненных и отменённых заказов пока нет',
  },
];

export default function OrdersPage(): ReactElement {
  return (
    // `useSearchParams()` выключает статическую отрисовку страницы целиком,
    // поэтому чтение адреса вынесено под собственную границу Suspense.
    <Suspense fallback={<OrdersView title="Заказы" presets={ORDER_PRESETS} />}>
      <OrdersFromUrl />
    </Suspense>
  );
}

function OrdersFromUrl(): ReactElement {
  const params = useSearchParams();
  const status = params.get('status');
  const stage = params.get('stage');
  const tab = params.get('tab');

  return (
    <OrdersView
      title="Заказы"
      presets={ORDER_PRESETS}
      // Мусор в адресе игнорируется молча: показать все заказы понятнее,
      // чем экран ошибки из-за опечатки в ссылке.
      {...(isOrderStatus(status) ? { initialStatus: status } : {})}
      {...(isProductionStageKey(stage) ? { initialStage: stage } : {})}
      {...(tab === null ? {} : { initialPreset: tab })}
    />
  );
}

import {
  DEBT_FILTER_LABEL,
  ORDER_STATUS_LABELS,
  PRODUCTION_STAGE_LABELS,
  statusesOfProductionStage,
  type Locale,
  type OrderStatus,
  type ProductionStageKey,
} from '@curtain-crm/shared';

/**
 * Фильтр по статусу на экране «Работа».
 *
 * Этап целиком («Шитьё») или один статус внутри него — как в панели; плюс
 * «С долгом» для тех, кто видит деньги клиента.
 */
export type StatusFilter =
  | { readonly kind: 'stage'; readonly stage: ProductionStageKey }
  | { readonly kind: 'status'; readonly status: OrderStatus }
  | { readonly kind: 'debt' };

/** Часть входа `orders.list`, которую задаёт фильтр. */
export function statusFilterInput(
  filter: StatusFilter | null,
): { readonly status?: OrderStatus[]; readonly withDebt?: true } {
  if (filter === null) return {};
  if (filter.kind === 'debt') return { withDebt: true };
  if (filter.kind === 'status') return { status: [filter.status] };
  return { status: [...statusesOfProductionStage(filter.stage)] };
}

/** Подпись выбранного фильтра на чипе. */
export function statusFilterLabel(filter: StatusFilter, locale: Locale): string {
  if (filter.kind === 'debt') return DEBT_FILTER_LABEL[locale];
  if (filter.kind === 'status') return ORDER_STATUS_LABELS[locale][filter.status];
  return PRODUCTION_STAGE_LABELS[locale][filter.stage];
}

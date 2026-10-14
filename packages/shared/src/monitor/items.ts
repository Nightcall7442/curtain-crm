import { ORDER_ITEM_KIND_LABELS, type OrderItemKind } from '../enums/orderItemKind.enum';
import type { Locale } from '../i18n/locale';

export interface ItemsSummary {
  /** «Окно ×2, Дверь» — виды в порядке первого появления в заказе. */
  readonly text: string;
  readonly pieces: number;
  /** Площадь всех штук, м², с точностью до десятой. */
  readonly areaM2: number;
}

/** Короткий состав заказа для карточки табло. */
export function summarizeItems(
  items: readonly {
    readonly kind: OrderItemKind;
    readonly quantity: number;
    readonly areaM2: number | null;
  }[],
  locale: Locale,
): ItemsSummary {
  const byKind = new Map<OrderItemKind, number>();
  let pieces = 0;
  let area = 0;

  for (const item of items) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + item.quantity);
    pieces += item.quantity;
    area += (item.areaM2 ?? 0) * item.quantity;
  }

  const labels = ORDER_ITEM_KIND_LABELS[locale];
  const text = [...byKind]
    .map(([kind, count]) => (count > 1 ? `${labels[kind]} ×${count.toString()}` : labels[kind]))
    .join(', ');

  return { text, pieces, areaM2: Math.round(area * 10) / 10 };
}

import { ORDER_ITEM_KIND_LABELS_RU, type OrderItemKind } from '../enums/orderItemKind.enum';
import type { OrderItemAccessory } from '../types/orderItemAccessory';
import { formatMaterial, type OrderItemMaterial } from '../types/orderItemMaterial';

/**
 * Сборочный лист: что установщик берёт с собой на выезд.
 *
 * Забытый держатель означает второй выезд через весь город, а вспоминают о
 * нём уже у клиента. Поэтому перед выездом установщик сверяется со списком,
 * собранным из самого заказа: шторы по каждому окну, карниз с пластиком и
 * трубой, аксессуары поимённо и по количеству.
 *
 * Список не хранится, а собирается из позиций каждый раз: заказ до выезда
 * ещё правят — добавляют окно, меняют аксессуар, — и сохранённая копия
 * разошлась бы с тем, что действительно нужно везти. Хранятся только
 * отметки «взял» (`order_pack_checks`), по ключу строки.
 */

/** Позиция заказа в объёме, который нужен сборочному листу. */
export interface PackListItem {
  readonly id: number;
  readonly position: number;
  readonly kind: OrderItemKind;
  readonly model: string | null;
  readonly quantity: number;
  readonly portieres: readonly OrderItemMaterial[];
  readonly tulle: OrderItemMaterial | null;
  readonly protection: OrderItemMaterial | null;
  readonly cornice: OrderItemMaterial | null;
  readonly plastic: OrderItemMaterial | null;
  readonly pipe: OrderItemMaterial | null;
  readonly accessories: readonly OrderItemAccessory[];
}

export interface PackListRow {
  /**
   * Ключ отметки — переживает правку заказа.
   *
   * Строится от id позиции, а не от её номера в списке: удалили первое окно —
   * и отметки съехали бы на соседние строки, а установщик увидел бы галочку
   * там, где ничего не брал. У аксессуаров ключ включает порядковый номер в
   * списке позиции: их правят целиком, и правка честно сбрасывает отметку.
   */
  readonly key: string;
  readonly label: string;
  /** Уточнение под подписью: код, метраж, количество. */
  readonly detail: string | null;
}

/** Уточнение из частей: пустое — это `null`, а не пустая строка. */
const detailOf = (parts: readonly (string | null)[]): string | null => {
  const text = parts.filter((part) => part !== null && part !== '').join(' · ');
  return text === '' ? null : text;
};

const itemTitle = (item: PackListItem): string =>
  `${ORDER_ITEM_KIND_LABELS_RU[item.kind]} ${(item.position + 1).toString()}`;

/**
 * Строки листа в том порядке, в котором вещи кладут в машину: сначала сами
 * шторы, потом карниз с крепежом, потом мелочь.
 */
export function buildPackList(items: readonly PackListItem[]): readonly PackListRow[] {
  const rows: PackListRow[] = [];

  for (const item of items) {
    const title = itemTitle(item);

    /*
      Готовое изделие одной строкой, даже если ткани в нём две: в машину
      грузят сшитую штору, а не рулоны, из которых её кроили. Ткани уходят
      в уточнение — по ним штору узнают в куче одинаковых пакетов.
    */
    const fabrics = [...item.portieres, item.tulle, item.protection].filter(
      (material): material is OrderItemMaterial => material !== null,
    );

    if (fabrics.length > 0 || item.model !== null) {
      rows.push({
        key: `item:${item.id.toString()}:goods`,
        label: `${title} — шторы${item.model === null ? '' : `, ${item.model}`}`,
        detail: detailOf([
          item.quantity > 1 ? `${item.quantity.toString()} шт` : null,
          ...fabrics.map((material) => formatMaterial(material)),
        ]),
      });
    }

    const hardware = [
      { slot: 'cornice', label: 'карниз', material: item.cornice },
      { slot: 'plastic', label: 'пластик', material: item.plastic },
      { slot: 'pipe', label: 'труба', material: item.pipe },
    ] as const;

    for (const part of hardware) {
      if (part.material === null) continue;
      rows.push({
        key: `item:${item.id.toString()}:${part.slot}`,
        label: `${title} — ${part.label}`,
        detail: detailOf([formatMaterial(part.material)]),
      });
    }

    item.accessories.forEach((accessory, index) => {
      rows.push({
        key: `item:${item.id.toString()}:acc:${index.toString()}`,
        label: `${title} — ${accessory.name}`,
        detail: detailOf([`${accessory.quantity.toString()} шт`, accessory.code]),
      });
    });
  }

  return rows;
}

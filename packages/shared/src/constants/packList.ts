import { ORDER_ITEM_KIND_LABELS, type OrderItemKind } from '../enums/orderItemKind.enum';
import type { Locale } from '../i18n/locale';
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

/**
 * Слова листа на обоих языках.
 *
 * Лист собирается на сервере и приходит готовыми строками, поэтому язык
 * передаётся сюда. Без него узбекский интерфейс показывал русские «Окно 1 —
 * шторы» и «2 шт» под переведённым заголовком «Chiqishga yig'ish». Названия
 * моделей, тканей и аксессуаров — данные заказа, их не переводят.
 */
const PACK_WORDS: Readonly<
  Record<Locale, { readonly goods: string; readonly cornice: string; readonly plastic: string; readonly pipe: string; readonly pieces: string }>
> = {
  ru: { goods: 'шторы', cornice: 'карниз', plastic: 'пластик', pipe: 'труба', pieces: 'шт' },
  uz: { goods: 'pardalar', cornice: 'karniz', plastic: 'plastik', pipe: 'truba', pieces: 'dona' },
};

const itemTitle = (item: PackListItem, locale: Locale): string =>
  `${ORDER_ITEM_KIND_LABELS[locale][item.kind]} ${(item.position + 1).toString()}`;

/**
 * Строки листа в том порядке, в котором вещи кладут в машину: сначала сами
 * шторы, потом карниз с крепежом, потом мелочь.
 *
 * Ключи строк от языка не зависят: отметка «взял», поставленная в русском
 * интерфейсе, видна и в узбекском.
 */
export function buildPackList(
  items: readonly PackListItem[],
  locale: Locale = 'ru',
): readonly PackListRow[] {
  const rows: PackListRow[] = [];
  const words = PACK_WORDS[locale];

  for (const item of items) {
    const title = itemTitle(item, locale);

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
        label: `${title} — ${words.goods}${item.model === null ? '' : `, ${item.model}`}`,
        detail: detailOf([
          item.quantity > 1 ? `${item.quantity.toString()} ${words.pieces}` : null,
          ...fabrics.map((material) => formatMaterial(material)),
        ]),
      });
    }

    const hardware = [
      { slot: 'cornice', label: words.cornice, material: item.cornice },
      { slot: 'plastic', label: words.plastic, material: item.plastic },
      { slot: 'pipe', label: words.pipe, material: item.pipe },
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
        detail: detailOf([`${accessory.quantity.toString()} ${words.pieces}`, accessory.code]),
      });
    });
  }

  return rows;
}

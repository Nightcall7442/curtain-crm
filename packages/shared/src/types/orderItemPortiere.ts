import { z } from 'zod';

/**
 * Портьера позиции заказа — код ткани с этикетки, как у карниза и тюля.
 *
 * Список, а не одно поле: одна и та же позиция иногда шьётся из двух тканей
 * сразу (контрастная вставка, разный метраж на полотно и подхват), и одно
 * текстовое поле такое не выражает — тот же довод, что увёл аксессуары в
 * список (`orderItemAccessory.ts`). Имени здесь нет: в отличие от
 * аксессуара, портьера не выбирается из справочника, только код с этикетки.
 *
 * Хранится как `jsonb` на самой позиции (`order_items.portieres`) — список
 * живёт и умирает вместе с позицией, отдельной таблицы не заслуживает.
 */

export const MAX_PORTIERE_CODE_LENGTH = 100;

/** Потолок числа портьер на одну позицию — щедрый, но конечный. */
export const MAX_PORTIERES_PER_ITEM = 10;

export const orderItemPortiereSchema = z.object({
  code: z.string().trim().min(1).max(MAX_PORTIERE_CODE_LENGTH),
  quantity: z.number().int().positive().max(1000),
});

/**
 * Тип портьеры — общий и для валидации на входе API, и для колонки
 * `order_items.portieres` в `packages/db`: та же причина, что и у
 * `OrderItemAccessory` — одна форма данных, а не две, которые могут разойтись.
 */
export type OrderItemPortiere = z.infer<typeof orderItemPortiereSchema>;

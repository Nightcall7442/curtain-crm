import { z } from 'zod';

import { PURCHASE_UNIT_LABELS } from '../enums/payroll.enum';
import type { Locale } from '../i18n/locale';

/**
 * Строка материала позиции: код с этикетки, метраж и описание.
 *
 * Одна форма на все материалы позиции — портьеру, тюль, защиту, карниз,
 * пластик и трубу. Раньше каждый из них был отдельной текстовой колонкой
 * с одним лишь кодом, и на вопрос «сколько метров этой ткани» ответить
 * было нечем: метраж передавали на словах, а описание («тёмная сторона»,
 * «на балкон») дописывали в общий комментарий позиции, где оно терялось
 * среди прочего.
 *
 * Разные материалы описываются ОДИНАКОВО намеренно: у закройщика и
 * карнизчика вопросы к любой строке одни и те же — что за код, сколько
 * метров, что важно знать. Шесть слегка различающихся форм в этом месте
 * означали бы шесть путей ошибиться.
 *
 * Хранится как `jsonb` на самой позиции — как аксессуары: живёт и умирает
 * вместе с ней, отдельной таблицы не заслуживает.
 */

export const MAX_MATERIAL_CODE_LENGTH = 100;
export const MAX_MATERIAL_DESCRIPTION_LENGTH = 300;

/** Потолок числа портьер на одну позицию — щедрый, но конечный. */
export const MAX_PORTIERES_PER_ITEM = 10;

export const orderItemMaterialSchema = z.object({
  code: z.string().trim().min(1).max(MAX_MATERIAL_CODE_LENGTH),
  /** Метраж. `null` — не указан: не всякий материал меряют метрами. */
  meters: z.number().positive().max(10000).nullable().default(null),
  description: z
    .string()
    .trim()
    .max(MAX_MATERIAL_DESCRIPTION_LENGTH)
    .nullable()
    .default(null),
});

/**
 * Тип строки материала — общий и для валидации на входе API, и для колонок
 * `order_items.*` в `packages/db`: одна форма данных, а не две, которые
 * разойдутся при следующей правке.
 */
export type OrderItemMaterial = z.infer<typeof orderItemMaterialSchema>;

/**
 * Строка материала для показа: «П-31 · 3,5 м · тёмная сторона».
 *
 * Одна функция на веб и мобильное приложение: код без метража и описания
 * читается одинаково в обоих, а разъехавшиеся форматы — верный способ
 * получить спор о том, где заказ показан «правильно».
 *
 * `locale` меняет только единицу: узбекский пишется латиницей, и «3,5 м»
 * в узбекской строке — чужие буквы. Число — с запятой в обоих языках, как
 * `formatDistance`; между числом и единицей — неразрывный пробел, чтобы
 * «м» не уезжала на следующую строку одна. Код и описание — данные заказа,
 * их не переводят.
 */
export function formatMaterial(material: OrderItemMaterial, locale: Locale = 'ru'): string {
  return [
    material.code,
    material.meters === null
      ? null
      : `${material.meters.toLocaleString('ru-RU')}\u00A0${PURCHASE_UNIT_LABELS[locale].m}`,
    material.description,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

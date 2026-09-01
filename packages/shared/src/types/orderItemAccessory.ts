import { z } from 'zod';

/**
 * Аксессуары позиции заказа: держатели, султанчики, бубоны, обхваты, сачак и т.д.
 *
 * Раньше у позиции было два отдельных текстовых поля — «Сачак» и
 * «Аксессуары», — каждое ровно на одно значение. На практике к одной шторе
 * часто идёт сразу несколько аксессуаров разного количества («2 держателя
 * и 1 сачак»), и одно текстовое поле такое не выражает. Здесь — список: имя
 * берётся из готового справочника (`CatalogKind.ACCESSORY`, куда при выдаче
 * позиции сведён и бывший «Сачак»), количество и код — уже произвольные.
 *
 * Хранится как `jsonb` на самой позиции (`order_items.accessories`), а не
 * отдельной таблицей: список живёт и умирает вместе с позицией, отдельно
 * от него ничего не запрашивают и не связывают внешним ключом — ровно тот
 * случай, когда типизированный `jsonb` (как `payroll_records.scheme_snapshot`)
 * уместнее нормализованной таблицы.
 */

export const MAX_ACCESSORY_NAME_LENGTH = 200;
export const MAX_ACCESSORY_CODE_LENGTH = 100;

/** Потолок числа аксессуаров на одну позицию — щедрый, но конечный. */
export const MAX_ACCESSORIES_PER_ITEM = 20;

export const orderItemAccessorySchema = z.object({
  name: z.string().trim().min(1).max(MAX_ACCESSORY_NAME_LENGTH),
  quantity: z.number().int().positive().max(1000),
  code: z
    .string()
    .trim()
    .max(MAX_ACCESSORY_CODE_LENGTH)
    .nullable()
    .default(null),
});

/**
 * Тип аксессуара — общий и для валидации на входе API, и для колонки
 * `order_items.accessories` в `packages/db`: там нет своего Zod, и заводить
 * второй, независимый интерфейс означало бы держать одну форму данных
 * описанной в двух местах, которые могут разойтись при следующей правке.
 */
export type OrderItemAccessory = z.infer<typeof orderItemAccessorySchema>;

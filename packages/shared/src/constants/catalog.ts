/**
 * Справочники характеристик заказа.
 *
 * Значения перенесены из `curtain-bot`, где они задавались переменными окружения
 * (`CURTAIN_MODELS`, `MATERIALS_LIST`, ...). Здесь они играют роль ТОЛЬКО
 * начальных данных для `packages/db/src/seed.ts`: в CRM справочники живут в
 * таблице `catalog_items` и редактируются CEO/админом через веб-панель,
 * поэтому код не должен сравниваться с этими строками напрямую.
 */

import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/** Виды справочников характеристик заказа. */
export const CATALOG_KINDS = [
  'curtain_model',
  'material',
  'material_option',
  'color',
  'cornice',
  'tulle',
  'sachak',
  'accessory',
  /*
    Коды материалов — то, что продавец переписывает с этикетки.

    Отдельные справочники, а не один общий: у портьеры, тюля, защиты,
    карниза, пластика и трубы коды свои, и один список на всех означал бы,
    что подсказка к коду портьеры всплывает в поле трубы. Ведёт их
    руководитель, продавец только вводит код и видит описание.
  */
  'portiere_code',
  'tulle_code',
  'protection_code',
  'cornice_code',
  'plastic_code',
  'pipe_code',
  /*
    Коды аксессуаров — держатели, султанчики, бубоны, сачак.

    Отдельно от справочника названий (`accessory`): в заказе аксессуар
    называют словом, а на складе считают по бирке поставщика, как ткань.
  */
  'accessory_code',
] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CatalogKind = {
  CURTAIN_MODEL: 'curtain_model',
  MATERIAL: 'material',
  MATERIAL_OPTION: 'material_option',
  COLOR: 'color',
  CORNICE: 'cornice',
  TULLE: 'tulle',
  SACHAK: 'sachak',
  ACCESSORY: 'accessory',
  PORTIERE_CODE: 'portiere_code',
  TULLE_CODE: 'tulle_code',
  PROTECTION_CODE: 'protection_code',
  CORNICE_CODE: 'cornice_code',
  PLASTIC_CODE: 'plastic_code',
  PIPE_CODE: 'pipe_code',
  ACCESSORY_CODE: 'accessory_code',
} as const satisfies Record<string, CatalogKind>;

export const CATALOG_KIND_LABELS: Translated<CatalogKind> = {
  ru: {
    curtain_model: 'Модель штор',
    material: 'Материал',
    material_option: 'Опция материала',
    color: 'Цвет',
    cornice: 'Карниз',
    tulle: 'Тюль',
    sachak: 'Сачак',
    accessory: 'Аксессуар',
    portiere_code: 'Коды портьер',
    tulle_code: 'Коды тюля',
    protection_code: 'Коды защиты',
    cornice_code: 'Коды карнизов',
    plastic_code: 'Коды пластика',
    pipe_code: 'Коды труб',
    accessory_code: 'Коды аксессуаров',
  },
  uz: {
    curtain_model: 'Parda modeli',
    material: 'Material',
    material_option: 'Material varianti',
    color: 'Rang',
    cornice: 'Karniz',
    tulle: 'Tyul',
    sachak: 'Sochoq',
    accessory: 'Aksessuar',
    portiere_code: 'Parda kodlari',
    tulle_code: 'Tyul kodlari',
    protection_code: 'Himoya kodlari',
    cornice_code: 'Karniz kodlari',
    plastic_code: 'Plastik kodlari',
    pipe_code: 'Truba kodlari',
    accessory_code: 'Aksessuar kodlari',
  },
};

export const CATALOG_KIND_LABELS_RU = CATALOG_KIND_LABELS.ru;

/**
 * Начальное наполнение справочников (используется только при сидировании БД).
 *
 * Списки кодов пустые намеренно: код портьеры или трубы — это то, что
 * написано на конкретной этикетке конкретного поставщика. Выдумать их за
 * мастерскую нельзя, а непустой список из выдуманных кодов сразу же
 * начал бы всплывать подсказками в форме заказа.
 */
export const DEFAULT_CATALOG_ITEMS: Readonly<Record<CatalogKind, readonly string[]>> = {
  curtain_model: [
    'Прямые',
    'Жингалак',
    'Римские',
    'Австрийские',
    'Французские',
    'Японские',
    'Плиссе',
    'Рулонные',
    'Шторы-кафе',
    'Нитяные',
    'Бамбуковые',
    'Двойные',
    'Ламбрекен',
    'Блэкаут',
  ],
  material: [
    'Блэкаут',
    'Велюр',
    'Лён',
    'Шёлк',
    'Атлас',
    'Габардин',
    'Тюль',
    'Органза',
    'Жаккард',
    'Хлопок',
  ],
  material_option: [
    'Бархатные',
    'Шёлк',
    'Матовый',
    'Глянцевый',
    'Перламутровый',
    'Текстурный',
    'Однотонный',
    'С рисунком',
    'С принтом',
  ],
  color: [
    'Белый',
    'Бежевый',
    'Коричневый',
    'Серый',
    'Чёрный',
    'Синий',
    'Зелёный',
    'Красный',
    'Золотой',
    'Серебряный',
  ],
  cornice: [
    'Профильный алюминий',
    'Круглый металл',
    'Круглый дерево',
    'Потолочный пластик',
    'Потолочный алюминий',
    'Струнный',
    'Электро',
    'Багетный',
    'Магнитный',
    'Двойной',
  ],
  tulle: ['Органза', 'Сетка', 'Вуаль', 'Шёлковая', 'Полиэстер'],
  sachak: ['Лента-шнур', 'Магнитный', 'На липучке', 'Крючки'],
  accessory: ['Подхваты', 'Кисти', 'Заколки', 'Магниты', 'Шторный шнур'],
  portiere_code: [],
  tulle_code: [],
  protection_code: [],
  cornice_code: [],
  plastic_code: [],
  pipe_code: [],
  accessory_code: [],
};

/**
 * Чем модель крепится: трубой или связкой «пластик + карниз».
 *
 * У «Трубы» и «Киприка» карниза с пластиком не бывает вовсе, у остальных
 * моделей — наоборот, не бывает трубы. Спрашивать в заказе все три строки
 * значило бы каждый раз показывать продавцу два поля, которые он обязан
 * оставить пустыми.
 *
 * Группа задаётся у модели в справочнике: список моделей ведёт руководитель,
 * и кто из них на трубе — знает он же.
 */
export const CURTAIN_MOUNT_KINDS = ['pipe', 'cornice'] as const;

export type CurtainMountKind = (typeof CURTAIN_MOUNT_KINDS)[number];

export const CurtainMountKind = {
  PIPE: 'pipe',
  CORNICE: 'cornice',
} as const satisfies Record<string, CurtainMountKind>;

export const CURTAIN_MOUNT_KIND_LABELS: Translated<CurtainMountKind> = {
  ru: {
    pipe: 'Труба',
    cornice: 'Пластик + карниз',
  },
  uz: {
    pipe: 'Truba',
    cornice: 'Plastik + karniz',
  },
};

export const CURTAIN_MOUNT_KIND_LABELS_RU = CURTAIN_MOUNT_KIND_LABELS.ru;

/**
 * Группа крепления модели. У моделей, заведённых до появления групп, поле
 * пустое: их подавляющее большинство — «пластик + карниз», и это же значение
 * подставлено по умолчанию в справочнике.
 */
export const curtainMountKindOf = (value: string | null | undefined): CurtainMountKind =>
  value === CurtainMountKind.PIPE ? CurtainMountKind.PIPE : CurtainMountKind.CORNICE;

/** Строки материала позиции — в том порядке, в каком их спрашивает форма. */
export const MATERIAL_SLOTS = [
  'portiere',
  'tulle',
  'protection',
  'cornice',
  'plastic',
  'pipe',
] as const;

export type MaterialSlot = (typeof MATERIAL_SLOTS)[number];

/** Справочник кодов для каждой строки материала в форме заказа. */
export const MATERIAL_CODE_KINDS = {
  portiere: CatalogKind.PORTIERE_CODE,
  tulle: CatalogKind.TULLE_CODE,
  protection: CatalogKind.PROTECTION_CODE,
  cornice: CatalogKind.CORNICE_CODE,
  plastic: CatalogKind.PLASTIC_CODE,
  pipe: CatalogKind.PIPE_CODE,
} as const satisfies Readonly<Record<MaterialSlot, CatalogKind>>;

/** Виды справочников, по которым ведётся склад. */
export const MATERIAL_CODE_KIND_LIST = MATERIAL_SLOTS.map(
  (slot) => MATERIAL_CODE_KINDS[slot],
);

/**
 * Что лежит на складе.
 *
 * Материалы позиции плюс аксессуары. Аксессуара нет среди строк материала
 * (`MATERIAL_SLOTS`) намеренно: в заказе его называют словом и считают
 * штуками отдельным списком, а на складе он лежит рядом с тканью и
 * учитывается так же — по бирке.
 */
export const STOCK_KINDS = [...MATERIAL_CODE_KIND_LIST, CatalogKind.ACCESSORY_CODE] as const;

export type StockKind = (typeof STOCK_KINDS)[number];

/** Короткое название вида на складе. */
export const STOCK_KIND_LABELS: Translated<StockKind> = {
  ru: {
    portiere_code: 'Портьера',
    tulle_code: 'Тюль',
    protection_code: 'Защита',
    cornice_code: 'Карниз',
    plastic_code: 'Пластик',
    pipe_code: 'Труба',
    accessory_code: 'Аксессуар',
  },
  uz: {
    portiere_code: 'Portyera',
    tulle_code: 'Tyul',
    protection_code: 'Himoya',
    cornice_code: 'Karniz',
    plastic_code: 'Plastik',
    pipe_code: 'Truba',
    accessory_code: 'Aksessuar',
  },
};

export const STOCK_KIND_LABELS_RU = STOCK_KIND_LABELS.ru;

/**
 * Строка материала по виду справочника — обратная сторона `MATERIAL_CODE_KINDS`.
 *
 * Нужна складу: остаток хранится видом справочника (`portiere_code`), а
 * человеку показывается словом «Портьера».
 */
export const MATERIAL_SLOT_BY_CODE_KIND: Readonly<Partial<Record<CatalogKind, MaterialSlot>>> =
  Object.fromEntries(MATERIAL_SLOTS.map((slot) => [MATERIAL_CODE_KINDS[slot], slot]));

/** Короткие названия строк материала — для колонки «Вид» на складе. */
export const MATERIAL_SLOT_LABELS: Translated<MaterialSlot> = {
  ru: {
    portiere: 'Портьера',
    tulle: 'Тюль',
    protection: 'Защита',
    cornice: 'Карниз',
    plastic: 'Пластик',
    pipe: 'Труба',
  },
  uz: {
    portiere: 'Parda',
    tulle: 'Tyul',
    protection: 'Himoya',
    cornice: 'Karniz',
    plastic: 'Plastik',
    pipe: 'Truba',
  },
};

export const MATERIAL_SLOT_LABELS_RU = MATERIAL_SLOT_LABELS.ru;

/** Название вида склада: «Портьера» вместо «Коды портьер». */
export function materialKindLabel(kind: CatalogKind): string {
  if (kind === CatalogKind.ACCESSORY_CODE) return STOCK_KIND_LABELS_RU.accessory_code;
  const slot = MATERIAL_SLOT_BY_CODE_KIND[kind];
  return slot === undefined ? CATALOG_KIND_LABELS_RU[kind] : MATERIAL_SLOT_LABELS_RU[slot];
}

/** Категории закупочных товаров (`purchase_items.category`). */
export const PURCHASE_CATEGORIES = [
  'fabric',
  'cornice',
  'accessory',
  'consumable',
  'other',
] as const;

export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

/** Схема категории — нужна входам процедур (закупка, розничный прайс). */
export const purchaseCategorySchema = z.enum(PURCHASE_CATEGORIES);

export const PurchaseCategory = {
  FABRIC: 'fabric',
  CORNICE: 'cornice',
  ACCESSORY: 'accessory',
  CONSUMABLE: 'consumable',
  OTHER: 'other',
} as const satisfies Record<string, PurchaseCategory>;

export const PURCHASE_CATEGORY_LABELS: Translated<PurchaseCategory> = {
  ru: {
    fabric: 'Ткань',
    cornice: 'Карнизы',
    accessory: 'Аксессуары',
    consumable: 'Расходники',
    other: 'Прочее',
  },
  uz: {
    fabric: 'Mato',
    cornice: 'Karnizlar',
    accessory: 'Aksessuarlar',
    consumable: 'Sarf materiallar',
    other: 'Boshqa',
  },
};

export const PURCHASE_CATEGORY_LABELS_RU = PURCHASE_CATEGORY_LABELS.ru;

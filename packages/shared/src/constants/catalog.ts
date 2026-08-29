/**
 * Справочники характеристик заказа.
 *
 * Значения перенесены из `curtain-bot`, где они задавались переменными окружения
 * (`CURTAIN_MODELS`, `MATERIALS_LIST`, ...). Здесь они играют роль ТОЛЬКО
 * начальных данных для `packages/db/src/seed.ts`: в CRM справочники живут в
 * таблице `catalog_items` и редактируются CEO/админом через веб-панель,
 * поэтому код не должен сравниваться с этими строками напрямую.
 */

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
  },
};

export const CATALOG_KIND_LABELS_RU = CATALOG_KIND_LABELS.ru;

/** Начальное наполнение справочников (используется только при сидировании БД). */
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
};

/** Категории закупочных товаров (`purchase_items.category`). */
export const PURCHASE_CATEGORIES = [
  'fabric',
  'cornice',
  'accessory',
  'consumable',
  'other',
] as const;

export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

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

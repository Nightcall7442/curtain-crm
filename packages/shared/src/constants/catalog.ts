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

/** Справочник кодов для каждой строки материала в форме заказа. */
export const MATERIAL_CODE_KINDS = {
  portiere: CatalogKind.PORTIERE_CODE,
  tulle: CatalogKind.TULLE_CODE,
  protection: CatalogKind.PROTECTION_CODE,
  cornice: CatalogKind.CORNICE_CODE,
  plastic: CatalogKind.PLASTIC_CODE,
  pipe: CatalogKind.PIPE_CODE,
} as const;

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

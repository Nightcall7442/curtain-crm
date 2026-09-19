'use client';

import {
  areaM2FromCm,
  CatalogKind,
  CORNICE_ROTATION_LABELS_RU,
  CORNICE_ROTATIONS,
  CurtainMountKind,
  MATERIAL_CODE_KINDS,
  ORDER_ITEM_KIND_LABELS_RU,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  type CorniceRotation,
} from '@curtain-crm/shared';
import { Plus, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button, Field, Input, Select, Textarea } from '@/components/ui/Form';
import { formatQuantity } from '@/lib/utils';

/** Один аксессуар в списке позиции: держатель, султанчик, бубон, сачак и т.д. */
export interface AccessoryDraft {
  readonly id: string;
  name: string;
  quantity: number;
  code: string;
}

export const emptyAccessory = (): AccessoryDraft => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  quantity: 1,
  code: '',
});

/**
 * Материал позиции в форме: код с этикетки, метраж и описание.
 *
 * Остался один код с этикетки: метраж и описание продавец больше не
 * набирает. Описание приходит из справочника, который ведёт руководитель, —
 * так «П-31» значит одно и то же во всех заказах, а не то, что успел
 * дописать продавец.
 */
export interface MaterialDraft {
  code: string;
}

export const emptyMaterial = (): MaterialDraft => ({ code: '' });

/** Портьер на позицию бывает несколько — потому у них есть ключ списка. */
export interface PortiereDraft extends MaterialDraft {
  readonly id: string;
}

export const emptyPortiere = (): PortiereDraft => ({
  id: Math.random().toString(36).slice(2),
  ...emptyMaterial(),
});

/**
 * Материал для отправки на сервер. `undefined` — код не заполнен.
 *
 * Метраж уходит пустым: колонка осталась в позиции заказа, но продавец её
 * больше не набирает. Описание — из справочника, а не из формы.
 */
export function toMaterial(
  draft: MaterialDraft,
  description: string | null,
): { code: string; meters: number | null; description: string | null } | undefined {
  const code = draft.code.trim();
  if (code.length === 0) return undefined;

  return { code, meters: null, description };
}

/**
 * Код материала с подсказкой из справочника.
 *
 * Описание появляется только после того, как код введён: до этого показывать
 * нечего, а пустая строка на месте будущей подсказки читалась бы как
 * «справочник молчит».
 */
function MaterialFields({
  label,
  placeholder,
  value,
  description,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: MaterialDraft;
  readonly description: string | null;
  readonly onChange: (patch: Partial<MaterialDraft>) => void;
}): ReactElement {
  const filled = value.code.trim().length > 0;

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <span className="mb-1.5 block text-footnote font-medium text-secondary">{label}</span>
      <Input
        aria-label={`${label}: код`}
        value={value.code}
        onChange={(event) => {
          onChange({ code: event.target.value });
        }}
        placeholder={placeholder}
      />
      {!filled ? null : (
        <p
          className={
            description === null
              ? 'mt-1.5 text-footnote text-muted'
              : 'mt-1.5 text-footnote text-accent-strong'
          }
        >
          {description ?? 'Такого кода нет в справочнике'}
        </p>
      )}
    </div>
  );
}

export interface ItemDraft {
  readonly id: string;
  kind: OrderItemKind;
  model: string;
  materials: string[];
  materialOptions: string[];
  color: string;
  characteristics: string;
  widthCm: string;
  heightCm: string;
  /** Портьеры — коды тканей, которых на одну позицию бывает несколько. */
  portieres: PortiereDraft[];
  /** Остальные материалы — по одному на позицию, форма та же. */
  tulle: MaterialDraft;
  protection: MaterialDraft;
  cornice: MaterialDraft;
  plastic: MaterialDraft;
  pipe: MaterialDraft;
  corniceRotation: CorniceRotation | '';
  accessories: AccessoryDraft[];
  quantity: number;
  comment: string;
}

export const emptyItem = (): ItemDraft => ({
  id: Math.random().toString(36).slice(2),
  kind: OrderItemKind.WINDOW,
  model: '',
  materials: [],
  materialOptions: [],
  color: '',
  characteristics: '',
  widthCm: '',
  heightCm: '',
  portieres: [emptyPortiere()],
  tulle: emptyMaterial(),
  protection: emptyMaterial(),
  cornice: emptyMaterial(),
  plastic: emptyMaterial(),
  pipe: emptyMaterial(),
  corniceRotation: '',
  accessories: [],
  quantity: 1,
  comment: '',
});

/** Что позиции нужно из справочника; собирает диалог из `catalog.list`. */
export interface ItemCatalog {
  readonly options: (kind: string) => { value: string; label: string }[];
  readonly accessoryOptions: readonly { readonly value: string; readonly label: string }[];
  /** Труба или пластик с карнизом — что спрашивать для выбранной модели. */
  readonly mountOf: (model: string) => string;
  /** Описание кода со склада — подсказка под полем. */
  readonly describeCode: (kind: string, code: string) => string | null;
}

/**
 * Одна позиция заказа: окно или дверь с моделью, размерами, кодами тканей,
 * карнизом и аксессуарами. Состояние позиций живёт в диалоге — здесь только
 * поля и правки через `onChange`.
 */
export function OrderItemFields({
  item,
  index,
  canRemove,
  onRemove,
  onChange,
  onPortiere,
  onAccessory,
  catalog,
}: {
  readonly item: ItemDraft;
  readonly index: number;
  /** Единственную позицию удалить нельзя — заказ без позиций не бывает. */
  readonly canRemove: boolean;
  readonly onRemove: () => void;
  readonly onChange: (patch: Partial<ItemDraft>) => void;
  readonly onPortiere: (portiereId: string, patch: Partial<PortiereDraft>) => void;
  readonly onAccessory: (accessoryId: string, patch: Partial<AccessoryDraft>) => void;
  readonly catalog: ItemCatalog;
}): ReactElement {
  const widthNum = Number.parseFloat(item.widthCm.replace(',', '.'));
  const heightNum = Number.parseFloat(item.heightCm.replace(',', '.'));
  const area =
    Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0
      ? areaM2FromCm(widthNum, heightNum)
      : null;

  return (
    <div key={item.id} className="rounded-2xl border border-ink/[0.06] bg-ink/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-footnote font-medium text-primary">
          {`Позиция ${(index + 1).toString()}`}
        </span>
        {canRemove && (
          <button
            type="button"
            aria-label="Удалить позицию"
            onClick={() => {
              onRemove();
            }}
            className="ml-auto grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Вид">
          <Select
            value={item.kind}
            onChange={(event) => {
              onChange({
                kind: event.target.value as ItemDraft['kind'],
              });
            }}
            // Список видов и подписи — из общего справочника:
            // добавление вида не должно требовать правки формы.
            options={ORDER_ITEM_KINDS.map((value) => ({
              value,
              label: ORDER_ITEM_KIND_LABELS_RU[value],
            }))}
          />
        </Field>

        <Field label="Модель">
          <Select
            value={item.model}
            onChange={(event) => {
              onChange({ model: event.target.value });
            }}
            placeholder="Не выбрана"
            options={catalog.options(CatalogKind.CURTAIN_MODEL)}
          />
        </Field>

        <Field label="Цвет">
          <Select
            value={item.color}
            onChange={(event) => {
              onChange({ color: event.target.value });
            }}
            placeholder="Не выбран"
            options={catalog.options(CatalogKind.COLOR)}
          />
        </Field>

        <Field label="Высота, см">
          <Input
            type="number"
            min={1}
            max={2000}
            value={item.heightCm}
            onChange={(event) => {
              onChange({ heightCm: event.target.value });
            }}
            placeholder="200"
          />
        </Field>

        <Field
          label="Ширина, см"
          hint={area === null ? undefined : `Площадь: ${formatQuantity(area, 2)} м²`}
        >
          <Input
            type="number"
            min={1}
            max={2000}
            value={item.widthCm}
            onChange={(event) => {
              onChange({ widthCm: event.target.value });
            }}
            placeholder="150"
          />
        </Field>

        <Field label="Количество">
          <Input
            type="number"
            min={1}
            max={1000}
            value={item.quantity}
            onChange={(event) => {
              onChange({
                quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
              });
            }}
          />
        </Field>

        {/*
          Портьеры — списком, как аксессуары: на одну позицию
          иногда идут две ткани сразу. Код с этикетки, описание
          подтягивается из справочника кодов портьер.
        */}
        <div className="sm:col-span-2 lg:col-span-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-footnote font-medium text-secondary">Портьера</span>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                onChange({
                  portieres: [...item.portieres, emptyPortiere()],
                });
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Портьера
            </Button>
          </div>

          {item.portieres.length === 0 ? (
            <p className="text-footnote text-muted">Код ткани с этикетки</p>
          ) : (
            <div className="space-y-2">
              {item.portieres.map((portiere) => (
                <div key={portiere.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      aria-label="Портьера: код"
                      value={portiere.code}
                      onChange={(event) => {
                        onPortiere(portiere.id, { code: event.target.value });
                      }}
                      placeholder="Например: П-31"
                    />
                    {portiere.code.trim().length === 0 ? null : (
                      <p
                        className={
                          catalog.describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code) === null
                            ? 'mt-1.5 text-footnote text-muted'
                            : 'mt-1.5 text-footnote text-accent-strong'
                        }
                      >
                        {catalog.describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code) ??
                          'Такого кода нет в справочнике'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Удалить портьеру"
                    onClick={() => {
                      onChange({
                        portieres: item.portieres.filter((entry) => entry.id !== portiere.id),
                      });
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <MaterialFields
          label="Тюль"
          placeholder="Например: Т-22"
          value={item.tulle}
          description={catalog.describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code)}
          onChange={(patch) => {
            onChange({ tulle: { ...item.tulle, ...patch } });
          }}
        />

        {/*
          Защита вместо прежней «антимоскитной сетки»: сетка была
          не единственным защитным полотном, а какое именно нужно —
          цех узнавал на словах. Теперь это такая же строка
          материала, как тюль: заполнен код — защита есть.
        */}
        <MaterialFields
          label="Защита"
          placeholder="Например: З-07"
          value={item.protection}
          description={catalog.describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code)}
          onChange={(patch) => {
            onChange({ protection: { ...item.protection, ...patch } });
          }}
        />

        {/*
          Крепление модели решает, что спрашивать: у трубных
          моделей («Труба», «Киприк») карниза с пластиком не
          бывает, у остальных не бывает трубы. Группу задаёт
          руководитель у модели в справочнике.
        */}
        {catalog.mountOf(item.model) === CurtainMountKind.PIPE ? (
          <MaterialFields
            label="Труба"
            placeholder="Код трубы"
            value={item.pipe}
            description={catalog.describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code)}
            onChange={(patch) => {
              onChange({ pipe: { ...item.pipe, ...patch } });
            }}
          />
        ) : (
          <>
            <MaterialFields
              label="Карниз"
              placeholder="Например: К-104"
              value={item.cornice}
              description={catalog.describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code)}
              onChange={(patch) => {
                onChange({ cornice: { ...item.cornice, ...patch } });
              }}
            />

            <MaterialFields
              label="Пластик"
              placeholder="Код пластика"
              value={item.plastic}
              description={catalog.describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code)}
              onChange={(patch) => {
                onChange({ plastic: { ...item.plastic, ...patch } });
              }}
            />
          </>
        )}

        <Field label="Поворот карниза">
          <Select
            value={item.corniceRotation}
            onChange={(event) => {
              onChange({
                corniceRotation: event.target.value as CorniceRotation | '',
              });
            }}
            placeholder="Не задан"
            options={CORNICE_ROTATIONS.map((value) => ({
              value,
              label: CORNICE_ROTATION_LABELS_RU[value],
            }))}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-footnote font-medium text-secondary">Аксессуары</span>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                onChange({
                  accessories: [...item.accessories, emptyAccessory()],
                });
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Добавить аксессуар
            </Button>
          </div>

          {item.accessories.length === 0 ? (
            <p className="text-footnote text-muted">
              Держатели, султанчики, бубоны, обхваты, сачак — добавляются по одному, с количеством и
              кодом
            </p>
          ) : (
            <div className="space-y-2">
              {item.accessories.map((accessory) => (
                <div key={accessory.id} className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={accessory.name}
                    onChange={(event) => {
                      onAccessory(accessory.id, {
                        name: event.target.value,
                      });
                    }}
                    placeholder="Выберите аксессуар"
                    options={catalog.accessoryOptions}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    className="w-20 shrink-0"
                    value={accessory.quantity}
                    onChange={(event) => {
                      onAccessory(accessory.id, {
                        quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                      });
                    }}
                  />
                  <Input
                    className="w-28 shrink-0"
                    value={accessory.code}
                    onChange={(event) => {
                      onAccessory(accessory.id, { code: event.target.value });
                    }}
                    placeholder="Код"
                  />
                  <button
                    type="button"
                    aria-label="Удалить аксессуар"
                    onClick={() => {
                      onChange({
                        accessories: item.accessories.filter((entry) => entry.id !== accessory.id),
                      });
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field
          label="Характеристики"
          className="sm:col-span-2 lg:col-span-3"
          hint="Свободное описание: плотность, подкладка, способ крепления"
        >
          <Textarea
            rows={2}
            value={item.characteristics}
            onChange={(event) => {
              onChange({ characteristics: event.target.value });
            }}
            placeholder="Например: двойная подкладка, лента 1:2,5"
          />
        </Field>

        <Field label="Комментарий к позиции" className="sm:col-span-2 lg:col-span-3">
          <Input
            value={item.comment}
            onChange={(event) => {
              onChange({ comment: event.target.value });
            }}
            placeholder="Например: левое окно, выход на балкон"
          />
        </Field>
      </div>
    </div>
  );
}

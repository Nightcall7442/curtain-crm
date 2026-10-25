'use client';

import {
  CatalogKind,
  curtainMountKindOf,
  CurtainMountKind,
  MATERIAL_CODE_KINDS,
  type OrderItemMaterial,
} from '@curtain-crm/shared';
import { Plus } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';

import { Button } from '@/components/ui/Form';
import { trpc, type RouterOutputs } from '@/lib/trpc';

import {
  emptyAccessory,
  emptyItem,
  emptyPortiere,
  OrderItemFields,
  toMaterial,
  type AccessoryDraft,
  type ItemCatalog,
  type ItemDraft,
  type MaterialDraft,
  type PortiereDraft,
} from './OrderItemFields';

/**
 * Позиции заказа — общая часть создания и правки.
 *
 * Справочник, форма позиций и перевод черновика в вход API жили внутри
 * диалога создания. Правке нужно ровно то же: если бы она завела свою
 * копию, две формы разошлись бы при первой же новой колонке позиции.
 */

/** Справочники для полей позиции — из `catalog.list`. */
export function useOrderCatalog(enabled: boolean): ItemCatalog {
  const catalog = trpc.catalog.list.useQuery({}, { enabled });

  const byKind = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of catalog.data ?? []) {
      const bucket = map.get(entry.kind) ?? [];
      bucket.push(entry.name);
      map.set(entry.kind, bucket);
    }
    return map;
  }, [catalog.data]);

  /*
    Мини-описания кодов и группа крепления моделей — из того же справочника.
    Ключ с приведённым регистром: продавец переписывает код с этикетки от
    руки, и «п-31» должно найтись так же, как «П-31».
  */
  const codeDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog.data ?? []) {
      if (entry.description !== null && entry.description.length > 0) {
        map.set(`${entry.kind}:${entry.name.trim().toLowerCase()}`, entry.description);
      }
    }
    return map;
  }, [catalog.data]);

  const mountByModel = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of catalog.data ?? []) {
      if (entry.kind === CatalogKind.CURTAIN_MODEL) map.set(entry.name, entry.mountKind);
    }
    return map;
  }, [catalog.data]);

  /*
    Аксессуары на выбор — из двух справочников сразу: «сачак» такой же
    аксессуар, как держатель или бубон, просто из другого справочника.
  */
  const accessoryOptions = useMemo(() => {
    const names = new Set([
      ...(byKind.get(CatalogKind.ACCESSORY) ?? []),
      ...(byKind.get(CatalogKind.SACHAK) ?? []),
    ]);
    return Array.from(names).map((name) => ({ value: name, label: name }));
  }, [byKind]);

  return {
    options: (kind) => (byKind.get(kind) ?? []).map((name) => ({ value: name, label: name })),
    accessoryOptions,
    mountOf: (model) => curtainMountKindOf(mountByModel.get(model)),
    describeCode: (kind, code) => codeDescriptions.get(`${kind}:${code.trim().toLowerCase()}`) ?? null,
  };
}

/** Позиция в том виде, в каком её принимают `orders.create` и `orders.update`. */
export function itemDraftToInput(item: ItemDraft, catalog: ItemCatalog) {
  /*
    Строки материала, которых у этой модели не бывает, не уезжают на
    сервер, даже если продавец успел их заполнить до смены модели.
  */
  const onPipe = catalog.mountOf(item.model) === CurtainMountKind.PIPE;
  const material = (draft: MaterialDraft, kind: string) =>
    toMaterial(draft, catalog.describeCode(kind, draft.code));

  const tulle = material(item.tulle, MATERIAL_CODE_KINDS.tulle);
  const protection = material(item.protection, MATERIAL_CODE_KINDS.protection);
  const cornice = onPipe ? undefined : material(item.cornice, MATERIAL_CODE_KINDS.cornice);
  const plastic = onPipe ? undefined : material(item.plastic, MATERIAL_CODE_KINDS.plastic);
  const pipe = onPipe ? material(item.pipe, MATERIAL_CODE_KINDS.pipe) : undefined;

  return {
    kind: item.kind,
    ...(item.model.length > 0 ? { model: item.model } : {}),
    materials: item.materials,
    materialOptions: item.materialOptions,
    ...(item.color.length > 0 ? { color: item.color } : {}),
    ...(item.characteristics.trim().length > 0 ? { characteristics: item.characteristics.trim() } : {}),
    ...(item.widthCm.trim().length > 0 && item.heightCm.trim().length > 0
      ? {
          widthCm: Number.parseFloat(item.widthCm.replace(',', '.')),
          heightCm: Number.parseFloat(item.heightCm.replace(',', '.')),
        }
      : {}),
    portieres: item.portieres
      .map((portiere) => material(portiere, MATERIAL_CODE_KINDS.portiere))
      .filter((portiere) => portiere !== undefined),
    ...(tulle === undefined ? {} : { tulle }),
    ...(protection === undefined ? {} : { protection }),
    ...(cornice === undefined ? {} : { cornice }),
    ...(plastic === undefined ? {} : { plastic }),
    ...(pipe === undefined ? {} : { pipe }),
    ...(item.corniceRotation === '' ? {} : { corniceRotation: item.corniceRotation }),
    accessories: item.accessories
      .filter((accessory) => accessory.name.trim().length > 0)
      .map((accessory) => ({
        name: accessory.name.trim(),
        quantity: Math.max(1, accessory.quantity),
        code: accessory.code.trim().length > 0 ? accessory.code.trim() : null,
      })),
    quantity: item.quantity,
    ...(item.comment.trim().length > 0 ? { comment: item.comment.trim() } : {}),
  };
}

type OrderItemRow = RouterOutputs['orders']['byId']['items'][number];

/**
 * Размер позиции → строка поля.
 *
 * Тип говорит «строка», но позиции `orders.byId` приходят вложенным
 * запросом, и numeric-колонка внутри JSON доезжает числом (`190`, а не
 * `'190.0'`). Приводим явно — иначе поле упало бы на `.replace`.
 */
function sizeField(value: string | number | null): string {
  return value === null ? '' : String(value);
}

/**
 * Черновик из сохранённого материала: с прежним кодом и метражом, который
 * проставил админ, — чтобы правка позиции его не потеряла (см.
 * `editedMaterialMeters`).
 */
function materialDraft(material: OrderItemMaterial | null): MaterialDraft {
  return material === null
    ? { code: '' }
    : { code: material.code, originalCode: material.code, meters: material.meters };
}

/** Сохранённая позиция → черновик формы правки. */
export function orderItemToDraft(item: OrderItemRow): ItemDraft {
  const portieres: PortiereDraft[] = item.portieres.map((portiere) => ({
    ...emptyPortiere(),
    ...materialDraft(portiere),
  }));
  const accessories: AccessoryDraft[] = item.accessories.map((accessory) => ({
    ...emptyAccessory(),
    name: accessory.name,
    quantity: accessory.quantity,
    code: accessory.code ?? '',
  }));

  return {
    ...emptyItem(),
    kind: item.kind,
    model: item.model ?? '',
    materials: [...item.materials],
    materialOptions: [...item.materialOptions],
    color: item.color ?? '',
    characteristics: item.characteristics ?? '',
    widthCm: sizeField(item.widthCm),
    heightCm: sizeField(item.heightCm),
    portieres: portieres.length > 0 ? portieres : [emptyPortiere()],
    tulle: materialDraft(item.tulle),
    protection: materialDraft(item.protection),
    cornice: materialDraft(item.cornice),
    plastic: materialDraft(item.plastic),
    pipe: materialDraft(item.pipe),
    corniceRotation: item.corniceRotation ?? '',
    accessories,
    quantity: item.quantity,
    comment: item.comment ?? '',
  };
}

/** Раздел «Позиции заказа»: список позиций, добавление и удаление. */
export function OrderItemsSection({
  items,
  onChange,
  catalog,
  error,
}: {
  readonly items: readonly ItemDraft[];
  readonly onChange: (update: (current: ItemDraft[]) => ItemDraft[]) => void;
  readonly catalog: ItemCatalog;
  readonly error: string | undefined;
}): ReactElement {
  const patchItem = (id: string, patch: Partial<ItemDraft>): void => {
    onChange((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const patchPortiere = (itemId: string, portiereId: string, patch: Partial<PortiereDraft>): void => {
    onChange((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              portieres: item.portieres.map((portiere) =>
                portiere.id === portiereId ? { ...portiere, ...patch } : portiere,
              ),
            },
      ),
    );
  };

  const patchAccessory = (itemId: string, accessoryId: string, patch: Partial<AccessoryDraft>): void => {
    onChange((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              accessories: item.accessories.map((accessory) =>
                accessory.id === accessoryId ? { ...accessory, ...patch } : accessory,
              ),
            },
      ),
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-title">Позиции заказа</h3>
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            onChange((current) => [...current, emptyItem()]);
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Добавить позицию
        </Button>
      </div>

      {error !== undefined && <p className="mb-2 text-overline text-danger">{error}</p>}

      <div className="space-y-3">
        {items.map((item, index) => (
          <OrderItemFields
            key={item.id}
            item={item}
            index={index}
            canRemove={items.length > 1}
            onRemove={() => {
              onChange((current) => current.filter((entry) => entry.id !== item.id));
            }}
            onChange={(patch) => {
              patchItem(item.id, patch);
            }}
            onPortiere={(portiereId, patch) => {
              patchPortiere(item.id, portiereId, patch);
            }}
            onAccessory={(accessoryId, patch) => {
              patchAccessory(item.id, accessoryId, patch);
            }}
            catalog={catalog}
          />
        ))}
      </div>
    </section>
  );
}

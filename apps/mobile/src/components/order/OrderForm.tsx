import {
  CatalogKind,
  CurtainMountKind,
  curtainMountKindOf,
  MATERIAL_CODE_KINDS,
  type OrderItemMaterial,
} from '@curtain-crm/shared';
import { useMemo, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useLocale, type Translate } from '../../hooks/useLocale';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../../theme';
import { Icon } from '../Icon';
import {
  emptyItem,
  emptyPortiere,
  OrderItemCard,
  toMaterial,
  type AccessoryDraft,
  type DraftItem,
  type ItemCatalog,
  type MaterialDraft,
  type PortiereDraft,
} from './OrderItemCard';

/**
 * Позиции заказа — общая часть экранов создания и правки.
 *
 * Справочник, список позиций и перевод черновика в вход API жили на экране
 * создания. Правке нужно ровно то же; своя копия разошлась бы с ним при
 * первой же новой колонке позиции.
 */

/** Справочники для полей позиции — из `catalog.list`, как в веб-панели. */
export function useOrderCatalog(): ItemCatalog {
  const catalog = trpc.catalog.list.useQuery({});

  const byKind = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of catalog.data ?? []) {
      const bucket = map.get(entry.kind) ?? [];
      bucket.push(entry.name);
      map.set(entry.kind, bucket);
    }
    return map;
  }, [catalog.data]);

  /* Аксессуары — из двух справочников сразу: «Сачак» такой же аксессуар,
     как держатель или бубон, просто из другого списка. */
  const accessoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...(byKind.get(CatalogKind.ACCESSORY) ?? []), ...(byKind.get(CatalogKind.SACHAK) ?? [])]),
      ),
    [byKind],
  );

  /* Ключ с приведённым регистром: продавец переписывает код с этикетки от
     руки, и «п-31» должно найтись так же, как «П-31». */
  const codeDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog.data ?? []) {
      if (entry.description !== null && entry.description !== '') {
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

  return {
    modelOptions: byKind.get(CatalogKind.CURTAIN_MODEL) ?? [],
    accessoryOptions,
    mountOf: (model) => curtainMountKindOf(mountByModel.get(model)),
    describeCode: (kind, code) => codeDescriptions.get(`${kind}:${code.trim().toLowerCase()}`) ?? null,
  };
}

/** Позиция в том виде, в каком её принимают `orders.create` и `orders.update`. */
export function draftItemToInput(item: DraftItem, catalog: ItemCatalog) {
  /*
    Строки материала, которых у этой модели не бывает, на сервер не
    уезжают, даже если продавец успел их заполнить до смены модели.
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
    // Поля, которых форма телефона не показывает, — как пришли с сайта.
    ...(item.kept === undefined
      ? {}
      : {
          materials: [...item.kept.materials],
          materialOptions: [...item.kept.materialOptions],
          ...(item.kept.color === undefined ? {} : { color: item.kept.color }),
          ...(item.kept.characteristics === undefined
            ? {}
            : { characteristics: item.kept.characteristics }),
        }),
    kind: item.kind,
    quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
    ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
    ...(item.heightCm.trim() !== '' && item.widthCm.trim() !== ''
      ? {
          heightCm: Number.parseFloat(item.heightCm.replace(',', '.')),
          widthCm: Number.parseFloat(item.widthCm.replace(',', '.')),
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
    ...(item.corniceRotation === null ? {} : { corniceRotation: item.corniceRotation }),
    accessories: item.accessories
      .filter((accessory) => accessory.name.trim() !== '')
      .map((accessory) => ({
        name: accessory.name.trim(),
        quantity: Math.max(1, Number.parseInt(accessory.quantity, 10) || 1),
        code: accessory.code.trim() === '' ? null : accessory.code.trim(),
      })),
    ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
  };
}

type OrderItemRow = RouterOutputs['orders']['byId']['items'][number];

/** Сохранённый материал → черновик с прежним кодом и метражом (см. `editedMaterialMeters`). */
function materialDraft(material: OrderItemMaterial | null): MaterialDraft {
  return material === null
    ? { code: '' }
    : { code: material.code, originalCode: material.code, meters: material.meters };
}

/** Сохранённая позиция → черновик формы правки. `id` — ключ списка. */
export function orderItemToDraft(item: OrderItemRow, id: number): DraftItem {
  const portieres: PortiereDraft[] = item.portieres.map((portiere, index) => ({
    id: index + 1,
    ...materialDraft(portiere),
  }));
  const accessories: AccessoryDraft[] = item.accessories.map((accessory, index) => ({
    id: index + 1,
    name: accessory.name,
    quantity: accessory.quantity.toString(),
    code: accessory.code ?? '',
  }));

  return {
    ...emptyItem(id),
    kind: item.kind,
    model: item.model ?? '',
    heightCm: item.heightCm ?? '',
    widthCm: item.widthCm ?? '',
    quantity: item.quantity.toString(),
    portieres: portieres.length > 0 ? portieres : [emptyPortiere(1)],
    tulle: materialDraft(item.tulle),
    protection: materialDraft(item.protection),
    cornice: materialDraft(item.cornice),
    plastic: materialDraft(item.plastic),
    pipe: materialDraft(item.pipe),
    corniceRotation: item.corniceRotation,
    accessories,
    comment: item.comment ?? '',
    kept: {
      materials: [...item.materials],
      materialOptions: [...item.materialOptions],
      ...(item.color === null ? {} : { color: item.color }),
      ...(item.characteristics === null ? {} : { characteristics: item.characteristics }),
    },
  };
}

/** Список позиций с правками и кнопкой «Добавить позицию». */
export function OrderItemsEditor({
  items,
  onChange,
  catalog,
  askScan,
}: {
  readonly items: readonly DraftItem[];
  readonly onChange: (update: (current: readonly DraftItem[]) => readonly DraftItem[]) => void;
  readonly catalog: ItemCatalog;
  readonly askScan: (label: string, apply: (code: string) => void) => void;
}): ReactElement {
  const { m } = useLocale();

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    onChange((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updatePortiere = (itemId: number, portiereId: number, patch: Partial<PortiereDraft>): void => {
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

  const updateAccessory = (itemId: number, accessoryId: number, patch: Partial<AccessoryDraft>): void => {
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
    <>
      {items.map((item, index) => (
        <OrderItemCard
          key={item.id}
          item={item}
          index={index}
          canRemove={items.length > 1}
          onRemove={() => {
            onChange((current) => current.filter((entry) => entry.id !== item.id));
          }}
          onChange={(patch) => {
            updateItem(item.id, patch);
          }}
          onPortiere={(portiereId, patch) => {
            updatePortiere(item.id, portiereId, patch);
          }}
          onAccessory={(accessoryId, patch) => {
            updateAccessory(item.id, accessoryId, patch);
          }}
          catalog={catalog}
          askScan={askScan}
        />
      ))}

      <Pressable
        onPress={() => {
          onChange((current) => [
            ...current,
            // Идентификатор от максимума, а не от длины: после удаления
            // позиции длина повторяется, и ключи списка начинают совпадать.
            emptyItem(current.reduce((max, entry) => Math.max(max, entry.id), 0) + 1),
          ]);
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addItem, pressed ? styles.pressed : null]}
      >
        <Icon name="assigned" size={18} color={colors.accent} />
        <Text style={styles.addItemText}>{m('create.addItem')}</Text>
      </Pressable>
    </>
  );
}

/**
 * Проверка формы.
 *
 * Дублирует часть серверных правил НАМЕРЕННО: сервер всё равно проверит и
 * останется единственным источником истины, но подсказать об очевидной
 * ошибке до отправки дешевле, чем показать отказ после запроса — особенно
 * на плохой связи в чужой квартире.
 */
export function validateOrderForm(
  values: {
    readonly clientName: string;
    readonly clientPhone: string;
    readonly deadline: string;
    readonly items: readonly DraftItem[];
    /** Пошив для склада — клиента нет, и его поля не проверяются. */
    readonly skipClient: boolean;
  },
  m: Translate,
): Partial<Record<'clientName' | 'clientPhone' | 'deadline', string>> {
  const errors: Record<string, string> = {};

  if (!values.skipClient) {
    if (values.clientName.trim() === '') {
      errors['clientName'] = m('create.nameRequired');
    }

    // Только длина: приведение номера к единому виду делает сервер, и
    // повторять здесь его правила означало бы разойтись с ними при первой правке.
    const digits = values.clientPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      errors['clientPhone'] = m('create.phoneIncomplete');
    }
  }

  if (values.deadline.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline.trim())) {
    errors['deadline'] = m('dayoff.dateFormat');
  }

  return errors;
}

const styles = StyleSheet.create({
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  addItemText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

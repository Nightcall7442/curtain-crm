'use client';

import type { OrderItemMaterial } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Button, Input } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Метраж материалов позиции — заполняет админ или директор.
 *
 * Продавец вводит только код с этикетки: сколько метров уйдёт на эту штору,
 * он у клиента дома не считает, а цифра «на глазок» всплывает потом в
 * раскрое. Метраж проставляется здесь, на карточке заказа, когда позиции
 * уже пересчитаны.
 *
 * Блок показывается только руководству. Это удобство, а не защита:
 * `orders.setItemMeters` закрыта `managementProcedure` и откажет любому
 * другому, даже если он доберётся до неё в обход интерфейса.
 */

export interface MeterableItem {
  readonly id: number;
  readonly portieres: readonly OrderItemMaterial[];
  readonly tulle: OrderItemMaterial | null;
  readonly protection: OrderItemMaterial | null;
  readonly cornice: OrderItemMaterial | null;
  readonly plastic: OrderItemMaterial | null;
  readonly pipe: OrderItemMaterial | null;
}

interface MaterialLine {
  readonly key: string;
  readonly label: string;
  readonly material: OrderItemMaterial;
}

/** Строки материалов — в том же порядке, в каком они перечислены выше. */
function linesOf(item: MeterableItem): readonly MaterialLine[] {
  const single: readonly (readonly [string, string, OrderItemMaterial | null])[] = [
    ['tulle', 'Тюль', item.tulle],
    ['protection', 'Защита', item.protection],
    ['cornice', 'Карниз', item.cornice],
    ['plastic', 'Пластик', item.plastic],
    ['pipe', 'Труба', item.pipe],
  ];

  return [
    ...item.portieres.map((material, index) => ({
      key: `portiere:${index.toString()}`,
      label: item.portieres.length > 1 ? `Портьера ${(index + 1).toString()}` : 'Портьера',
      material,
    })),
    ...single
      .filter((entry): entry is readonly [string, string, OrderItemMaterial] => entry[2] !== null)
      .map(([key, label, material]) => ({ key, label, material })),
  ];
}

/** Строка ввода в число: пусто — метраж снят, мусор — поле не трогаем. */
function parseMeters(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const show = (meters: number | null): string =>
  meters === null ? '' : meters.toLocaleString('ru-RU');

export function ItemMeters({
  orderId,
  item,
}: {
  readonly orderId: number;
  readonly item: MeterableItem;
}): ReactElement | null {
  const utils = trpc.useUtils();
  const lines = linesOf(item);

  /*
    Черновик заводится из сохранённых значений, а не пустым: метраж правят,
    а не вводят с нуля, и пустое поле рядом с «3,5 м» в строке выше
    читалось бы как «ничего не проставлено».
  */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(lines.map((line) => [line.key, show(line.material.meters)])),
  );

  const save = trpc.orders.setItemMeters.useMutation({
    async onSuccess() {
      await utils.orders.byId.invalidate({ id: orderId });
    },
  });

  if (lines.length === 0) return null;

  const changed = lines.some((line) => (drafts[line.key] ?? '') !== show(line.material.meters));

  const submit = (): void => {
    /* В массиве «не трогать» выразить нечем — мусор в поле оставляет прежнее. */
    const portieres = item.portieres.map((material, index) => {
      const parsed = parseMeters(drafts[`portiere:${index.toString()}`] ?? '');
      return parsed === undefined ? material.meters : parsed;
    });

    const one = (key: string, material: OrderItemMaterial | null): number | null | undefined =>
      material === null ? undefined : parseMeters(drafts[key] ?? '');

    save.mutate({
      itemId: item.id,
      ...(item.portieres.length === 0 ? {} : { portieres }),
      tulle: one('tulle', item.tulle),
      protection: one('protection', item.protection),
      cornice: one('cornice', item.cornice),
      plastic: one('plastic', item.plastic),
      pipe: one('pipe', item.pipe),
    });
  };

  return (
    <div className="mt-3 border-t border-subtle pt-3">
      <span className="text-footnote font-medium text-secondary">Метраж</span>

      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {lines.map((line) => (
          <label key={line.key} className="flex items-center gap-2 text-footnote text-secondary">
            <span className="min-w-0 flex-1 truncate">{`${line.label} · ${line.material.code}`}</span>
            <Input
              className="w-24"
              inputMode="decimal"
              value={drafts[line.key] ?? ''}
              onChange={(event) => {
                setDrafts((current) => ({ ...current, [line.key]: event.target.value }));
              }}
              placeholder="метр"
            />
          </label>
        ))}
      </div>

      {save.error !== null && (
        <p className="mt-1.5 text-footnote text-danger">{save.error.message}</p>
      )}

      <Button
        className="mt-2"
        loading={save.isPending}
        disabled={!changed}
        onClick={submit}
      >
        Сохранить метраж
      </Button>
    </div>
  );
}

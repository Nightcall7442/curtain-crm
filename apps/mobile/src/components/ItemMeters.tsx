import type { OrderItemMaterial } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { Input } from './Field';

/**
 * Метраж материалов позиции — заполняет админ или директор.
 *
 * Продавец вводит только код с этикетки: сколько метров уйдёт на эту штору,
 * он у клиента дома не считает, а цифра «на глазок» всплывает потом в
 * раскрое. Поэтому метраж проставляется здесь, на карточке заказа, когда
 * позиции уже пересчитаны.
 *
 * Блок показывается только руководству. Это удобство, а не защита:
 * `orders.setItemMeters` закрыта `managementProcedure` и откажет любому
 * другому, даже если он доберётся до неё в обход интерфейса.
 */

/** Строка материала позиции: чем подписана, что за код, сколько метров. */
interface MaterialLine {
  readonly key: string;
  readonly label: string;
  readonly material: OrderItemMaterial;
}

export interface MeterableItem {
  readonly id: number;
  readonly portieres: readonly OrderItemMaterial[];
  readonly tulle: OrderItemMaterial | null;
  readonly protection: OrderItemMaterial | null;
  readonly cornice: OrderItemMaterial | null;
  readonly plastic: OrderItemMaterial | null;
  readonly pipe: OrderItemMaterial | null;
}

/** Строки материалов в том же порядке, в каком они показаны выше в карточке. */
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
  if (trimmed === '') return null;

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
    Черновик заводится сразу из сохранённых значений, а не пустым: метраж
    правят, а не вводят с нуля, и пустое поле рядом с «3,5 м» выше читалось
    бы как «ничего не проставлено».
  */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(lines.map((line) => [line.key, show(line.material.meters)])),
  );

  const save = trpc.orders.setItemMeters.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.orders.byId.invalidate({ id: orderId });
    },
    onError(error) {
      notifyError();
      Alert.alert('Метраж не сохранён', error.message);
    },
  });

  if (lines.length === 0) return null;

  const changed = lines.some(
    (line) => (drafts[line.key] ?? '') !== show(line.material.meters),
  );

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
    <View style={styles.block}>
      <Text style={styles.title}>Метраж</Text>

      {lines.map((line) => (
        <View key={line.key} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {`${line.label} · ${line.material.code}`}
          </Text>
          <View style={styles.input}>
            <Input
              value={drafts[line.key] ?? ''}
              onChangeText={(value) => {
                setDrafts((current) => ({ ...current, [line.key]: value }));
              }}
              keyboardType="decimal-pad"
              placeholder="метр"
              accessibilityLabel={`Метраж: ${line.label}`}
            />
          </View>
        </View>
      ))}

      <Pressable
        onPress={submit}
        disabled={save.isPending || !changed}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.submit,
          changed ? null : styles.submitOff,
          pressed ? styles.pressed : null,
        ]}
      >
        {save.isPending ? (
          <ActivityIndicator color={colors.onAccent} size="small" />
        ) : (
          <Text style={styles.submitText}>Сохранить метраж</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  title: {
    ...typography.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.footnote,
    color: colors.textSecondary,
    flex: 1,
  },
  input: {
    width: 104,
  },
  submit: {
    marginTop: spacing.xs,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: {
    opacity: opacity.disabled,
  },
  submitText: {
    ...typography.footnote,
    color: colors.onAccent,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

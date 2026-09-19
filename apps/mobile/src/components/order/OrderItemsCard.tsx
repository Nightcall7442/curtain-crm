import { CORNICE_ROTATION_LABELS, formatMaterial } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import type { RouterOutputs } from '../../lib/trpc';
import { colors, spacing, typography } from '../../theme';
import { Card, CardTitle, Empty } from '../Card';
import { ItemMeters } from '../ItemMeters';

type OrderItem = RouterOutputs['orders']['byId']['items'][number];

/** Позиции заказа: модель, размер, коды тканей и фурнитуры; метраж — руководству. */
export function OrderItemsCard({
  orderId,
  items,
  isManager,
}: {
  readonly orderId: number;
  readonly items: readonly OrderItem[];
  readonly isManager: boolean;
}): ReactElement {
  const { t, m } = useLocale();

  return (
    <Card>
      <CardTitle title={m('order.items')} icon="window" />
      {items.length === 0 ? (
        <Empty message={m('order.noItems')} />
      ) : (
        items.map((item, index) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemTitle}>
              {`${(index + 1).toString()}. ${item.model ?? m('order.noModel')}`}
              {item.readyMadeCode === null ? '' : ` · ${item.readyMadeCode}`}
            </Text>
            {item.widthCm !== null && item.heightCm !== null && (
              <Text style={styles.itemDetail}>
                {m('order.size', { w: trimNumber(item.widthCm), h: trimNumber(item.heightCm) })}
                {item.areaM2 === null ? '' : m('order.area', { a: trimNumber(item.areaM2, 2) })}
              </Text>
            )}
            {item.materials.length > 0 && (
              <Text style={styles.itemDetail}>
                {m('order.materials', { list: item.materials.join(', ') })}
              </Text>
            )}
            {item.color !== null && (
              <Text style={styles.itemDetail}>{m('order.color', { color: item.color })}</Text>
            )}
            {/*
                  Коды тканей и фурнитуры — то, по чему в цехе и работают:
                  раскройщик берёт по ним рулон, а установщик — карниз. Без
                  них карточка заказа на телефоне остаётся описанием, по
                  которому нельзя ничего сделать.
                */}
            {item.portieres.map((portiere, index) => (
              <Text key={`${portiere.code}-${index.toString()}`} style={styles.itemDetail}>
                {m('order.portiere', { v: formatMaterial(portiere) })}
              </Text>
            ))}
            {item.tulle !== null && (
              <Text style={styles.itemDetail}>
                {m('order.tulle', { v: formatMaterial(item.tulle) })}
              </Text>
            )}
            {item.protection !== null && (
              <Text style={styles.itemDetail}>
                {m('order.protection', { v: formatMaterial(item.protection) })}
              </Text>
            )}
            {item.cornice !== null && (
              <Text style={styles.itemDetail}>
                {m('order.cornice', { v: formatMaterial(item.cornice) })}
              </Text>
            )}
            {item.corniceRotation !== null && (
              <Text style={styles.itemDetail}>
                {m('order.rotation', { v: t(CORNICE_ROTATION_LABELS, item.corniceRotation) })}
              </Text>
            )}
            {item.plastic !== null && (
              <Text style={styles.itemDetail}>
                {m('order.plastic', { v: formatMaterial(item.plastic) })}
              </Text>
            )}
            {item.pipe !== null && (
              <Text style={styles.itemDetail}>
                {m('order.pipe', { v: formatMaterial(item.pipe) })}
              </Text>
            )}
            {item.comment !== null && <Text style={styles.itemComment}>{item.comment}</Text>}

            {/*
                  Метраж проставляет руководство: продавец у клиента дома его
                  не считает, а «на глазок» всплывает потом в раскрое.
                */}
            {isManager && <ItemMeters orderId={orderId} item={item} />}
          </View>
        ))
      )}
    </Card>
  );
}

/**
 * Число из колонки `numeric` без хвостовых нулей.
 *
 * Drizzle отдаёт такие колонки строками ровно с той точностью, что указана
 * в схеме: ширина приходит как `"150.0"`, а площадь — как `"3.9000"`, и на
 * экране это выглядело «Размер: 150.0 × 260.0 см · 3.9000 м²». Четыре знака
 * после запятой в площади — ложная точность: столько её никто не мерил.
 */
function trimNumber(value: string, maxFractionDigits = 1): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(parsed);
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemComment: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  itemDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemTitle: {
    ...typography.value,
  },
});

import { formatMoney, parseMoney, PURCHASE_UNIT_LABELS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, ErrorState, Row, Skeleton } from '../components/Card';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Чек целиком: что продано, по какой цене и на сколько.
 *
 * До этого экрана чек нельзя было открыть нигде — ни продавцу, ни
 * руководству: в списках стояли итог и число позиций, а состав продажи
 * оставался только в базе. Процедура `sales.byId` для этого была с самого
 * начала, вызывать её было некому.
 *
 * Права проверяет сервер: свой чек видит продавец, любой — руководство.
 * Экран не решает этого сам и не прячет кнопок «на всякий случай».
 */
export function SaleDetailScreen({
  route,
}: RootStackScreenProps<'SaleDetail'>): ReactElement {
  const { t } = useLocale();
  const sale = trpc.retail.sales.byId.useQuery({ id: route.params.saleId });

  if (sale.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={sale.error.message} />
      </View>
    );
  }

  if (sale.data === undefined) {
    return (
      <View style={styles.content}>
        <Card>
          <Skeleton />
        </Card>
      </View>
    );
  }

  const { data } = sale;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <CardTitle title={`Чек №${data.id.toString()}`} icon="paid" />
        <Row label="Клиент" value={data.clientName ?? 'Без имени'} />
        {data.clientPhone !== null && <Row label="Телефон" value={data.clientPhone} />}
        {data.comment !== null && <Row label="Комментарий" value={data.comment} />}
      </Card>

      <Card>
        <CardTitle title="Что продано" icon="orders" />

        {data.lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.lineText}>
              <Text style={styles.lineName} numberOfLines={2}>
                {line.itemName}
              </Text>
              {/*
                Количество и цена показываются вместе с итогом строки, а не
                вместо него: продавец пробивает метры и штуки, и «сколько
                взяли» — первое, что потом проверяют по чеку.
              */}
              <Text style={styles.lineMeta}>
                {`${Number.parseFloat(line.quantity).toString()} ${t(
                  PURCHASE_UNIT_LABELS,
                  line.unit,
                )} × ${formatMoney(parseMoney(line.unitPrice))}`}
              </Text>
            </View>
            <Text style={styles.lineTotal}>
              {formatMoney(parseMoney(line.lineTotal ?? '0'))}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Итого</Text>
          <Text style={styles.totalValue}>{formatMoney(parseMoney(data.total))}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  lineText: {
    flex: 1,
    minWidth: 0,
  },
  lineName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  lineMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  lineTotal: {
    ...typography.value,
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});

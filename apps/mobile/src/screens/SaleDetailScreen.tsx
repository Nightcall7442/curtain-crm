import { formatPhone, formatQuantity, parseMoney, PURCHASE_UNIT_LABELS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, typography, fonts } from '../theme';
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
export function SaleDetailScreen({ route }: RootStackScreenProps<'SaleDetail'>): ReactElement {
  const { t, m, money } = useLocale();
  const sale = trpc.retail.sales.byId.useQuery({ id: route.params.saleId });

  /*
    «Чек не найден» — не сбой связи, и подсказка «проверьте связь» под ним
    была неправдой. Отказ сервера по существу (нет чека, чужой чек) — своим
    текстом, он приходит уже на языке приложения; остальное — общий
    `ErrorState` с повтором, без сырого «Internal server error».
  */
  if (sale.isError) {
    const code = sale.error.data?.code;
    return (
      <View style={styles.center}>
        {code === 'NOT_FOUND' || code === 'FORBIDDEN' ? (
          <Empty message={sale.error.message} />
        ) : (
          <ErrorState />
        )}
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
        <CardTitle title={m('cash.receiptN', { n: data.id })} icon="paid" />
        <InfoRow label={m('sale.client')} value={data.clientName ?? m('cash.noName')} />
        {/* Номер — так же, как в карточке заказа: «+998 90 123 45 67». */}
        {data.clientPhone !== null && (
          <InfoRow label={m('sale.phone')} value={formatPhone(data.clientPhone)} />
        )}
        {/*
          Комментарий — абзацем во всю ширину, а не значением строки: жирный
          текст, выровненный вправо, читался рваным столбцом в три строки, а
          подпись висела посередине него.
        */}
        {data.comment !== null && (
          <View style={styles.comment}>
            <Text style={styles.commentLabel}>{m('sale.comment')}</Text>
            <Text style={styles.commentText}>{data.comment}</Text>
          </View>
        )}
      </Card>

      <Card>
        <CardTitle title={m('sale.whatSold')} icon="orders" />

        {data.lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.lineText}>
              {/* Название — целиком: чек обязан показывать, что именно продано. */}
              <Text style={styles.lineName}>{line.itemName}</Text>
              {/*
                Количество и цена показываются вместе с итогом строки, а не
                вместо него: продавец пробивает метры и штуки, и «сколько
                взяли» — первое, что потом проверяют по чеку.
              */}
              {/*
                Количество — тем же правилом, что остаток на витрине: дробь
                через запятую, разряды неразрывным пробелом («1 250 м»,
                «12,75 м»). Своя запись здесь разряды теряла, и одно и то же
                число в чеке и на складе выглядело по-разному.
              */}
              <Text style={styles.lineMeta}>
                {`${formatQuantity(Number.parseFloat(line.quantity))} ${t(
                  PURCHASE_UNIT_LABELS,
                  line.unit,
                )} × ${money(parseMoney(line.unitPrice))}`}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{money(parseMoney(line.lineTotal ?? '0'))}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{m('sale.total')}</Text>
          <Text style={styles.totalValue}>{money(parseMoney(data.total))}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

/**
 * Пара «подпись — значение» по первой строке.
 *
 * Как `Row`, только подпись стоит по первой строке значения, а не по
 * центру: имя клиента в две строки оставляло «Клиент» висеть между ними.
 * Высота строки у подписи и значения одна (21) — при выравнивании по верху
 * так совпадают и базовые линии (расхождение меньше точки). `baseline`
 * здесь не годится: на Android выравнивание по базовой линии текста в
 * разметке не гарантировано.
 */
function InfoRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  infoLabel: {
    ...typography.caption,
    lineHeight: typography.body.lineHeight,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.value,
    lineHeight: typography.body.lineHeight,
    color: colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  commentLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  comment: {
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
  },
  commentText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  /* Итог строки — по первой строке названия: по центру он съезжал на
     двадцать точек ниже начала позиции. */
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  // Высота строки — как у названия: верхние края совпадают, и базовые линии тоже.
  lineTotal: {
    ...typography.value,
    lineHeight: typography.body.lineHeight,
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
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});

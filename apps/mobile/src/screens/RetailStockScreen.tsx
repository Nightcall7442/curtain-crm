import { formatMoney, parseMoney, PURCHASE_UNIT_LABELS } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Витрина глазами руководителя: остатки, цена и чужие чеки.
 *
 * Продавец в кассе только пробивает — прайс и приход ведёт руководство, и
 * до этого экрана вести их можно было только из панели. Между тем товар
 * привозят в цех, и оприходовать его удобнее там же, где его считают.
 *
 * Приход прибавляется к остатку, а не заменяет его: «привезли ещё двадцать
 * метров» — то, что происходит на самом деле. Списание делается тем же
 * полем с минусом, и обе операции попадают в журнал действий.
 */
export function RetailStockScreen({
  header,
}: {
  /** Переключатель разделов сверху — его рисует экран закупочных материалов. */
  readonly header?: ReactElement;
} = {}): ReactElement {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const navigation = useNavigation();

  /** Позиция, которой добавляют приход. `null` — никакая. */
  const [stocking, setStocking] = useState<number | null>(null);
  const [delta, setDelta] = useState('');

  const items = trpc.retail.items.list.useQuery({ includeInactive: true });
  const sales = trpc.retail.sales.list.useQuery({ page: 1, pageSize: 10 });

  const addStock = trpc.retail.items.addStock.useMutation({
    async onSuccess(item) {
      notifySuccess();
      setStocking(null);
      setDelta('');
      await utils.retail.items.list.invalidate();
      Alert.alert(m('retail.stockUpdated'), `${item.name}: ${item.stockQuantity}`);
    },
    onError(error) {
      notifyError();
      Alert.alert(m('retail.receiveError'), error.message);
    },
  });

  if (items.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={items.error.message} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <Card>
          <CardTitle title={m('retail.title')} icon="orders" />

          {items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty
              message={m('cash.priceEmpty')}
              hint={m('retail.emptyHint')}
            />
          ) : (
            items.data.map((item) => {
              const stock = Number.parseFloat(item.stockQuantity);

              return (
                <View key={item.id}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemText}>
                      <Text
                        style={[styles.itemName, item.isActive ? null : styles.itemOff]}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {m('retail.stockMeta', {
                          price: formatMoney(parseMoney(item.price)),
                          unit: t(PURCHASE_UNIT_LABELS, item.unit),
                          n: stock,
                        })}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        setStocking(stocking === item.id ? null : item.id);
                        setDelta('');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={m('retail.receiveA11y', { name: item.name })}
                      style={({ pressed }) => [styles.stockButton, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.stockButtonText}>{m('retail.receive')}</Text>
                    </Pressable>
                  </View>

                  {stocking === item.id && (
                    <View style={styles.stockBox}>
                      <Field label={m('retail.howMuch')} hint={m('retail.howMuchHint')}>
                        <Input
                          value={delta}
                          onChangeText={setDelta}
                          placeholder="20"
                          keyboardType="numbers-and-punctuation"
                          autoFocus
                        />
                      </Field>

                      <Pressable
                        onPress={() => {
                          const quantity = Number.parseFloat(delta.replace(',', '.'));
                          if (!Number.isFinite(quantity) || quantity === 0) return;
                          addStock.mutate({ id: item.id, quantity });
                        }}
                        disabled={addStock.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
                      >
                        {addStock.isPending ? (
                          <ActivityIndicator color={colors.onAccent} size="small" />
                        ) : (
                          <Text style={styles.submitText}>{m('retail.submit')}</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <CardTitle title={m('retail.lastReceipts')} icon="paid" />

          {sales.data === undefined ? (
            <Skeleton />
          ) : sales.data.items.length === 0 ? (
            <Empty message={m('retail.noReceipts')} />
          ) : (
            sales.data.items.map((sale) => (
              <Pressable
                key={sale.id}
                onPress={() => {
                  navigation.navigate('SaleDetail', { saleId: sale.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={m('cash.openReceipt', { n: sale.id })}
                style={({ pressed }) => [styles.itemRow, pressed ? styles.pressed : null]}
              >
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>{m('cash.receiptN', { n: sale.id })}</Text>
                  <Text style={styles.itemMeta}>
                    {`${sale.sellerName} · ${sale.clientName ?? m('cash.noNameLower')}`}
                  </Text>
                </View>
                <Text style={styles.total}>{formatMoney(parseMoney(sale.total))}</Text>
                <Icon name="chevron" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemOff: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  total: {
    ...typography.value,
    color: colors.textPrimary,
  },
  stockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockButtonText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  stockBox: {
    paddingBottom: spacing.md,
  },
  submit: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

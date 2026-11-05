import { formatQuantity, parseMoney, PURCHASE_UNIT_LABELS } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

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
  const { t, m, money } = useLocale();
  const utils = trpc.useUtils();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
      Alert.alert(
        m('retail.stockUpdated'),
        `${item.name}: ${formatQuantity(Number.parseFloat(item.stockQuantity))}`,
      );
    },
    onError(error) {
      notifyError();
      Alert.alert(m('retail.receiveError'), error.message);
    },
  });

  /* Приход: число со знаком, не ноль. `null` — оприходовать нечего. */
  const parsedDelta = Number.parseFloat(delta.replace(',', '.'));
  const deltaValue = Number.isFinite(parsedDelta) && parsedDelta !== 0 ? parsedDelta : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Экран открыт поверх вкладок: снизу — обычный отступ, а не место
          под панель, которой здесь нет (было 114 точек пустоты). */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching || sales.isRefetching}
            onRefresh={() => {
              void Promise.all([items.refetch(), sales.refetch()]);
            }}
            tintColor={colors.accent}
          />
        }
      >
        {header}

        <Card>
          <CardTitle title={m('retail.title')} icon="orders" />

          {/*
            Ошибка — внутри карточки, а не вместо всего экрана: переключатель
            разделов сверху от списка не зависит, и при сбое до «Закупки» и
            «Склада» было не добраться. Текст — свой, локализованный: ответ
            сервера при сбое бывает английским.
          */}
          {items.isError ? (
            <ErrorState />
          ) : items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty message={m('cash.priceEmpty')} hint={m('retail.emptyHint')} />
          ) : (
            items.data.map((item, index, all) => {
              const stock = Number.parseFloat(item.stockQuantity);
              const isLast = index === all.length - 1;

              return (
                <View key={item.id}>
                  {/*
                    Под последней строкой линии нет — её роль делить строки,
                    а не дублировать низ карточки. У открытой формы прихода
                    своя линия не нужна: форма и так продолжает строку.
                  */}
                  <View style={[styles.itemRow, isLast && stocking !== item.id ? styles.itemRowLast : null]}>
                    <View style={styles.itemText}>
                      {/* Название целиком: обрезка на второй строке съедала
                          ровно то, чем товары и различаются. */}
                      <Text style={[styles.itemName, item.isActive ? null : styles.itemOff]}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {m('retail.stockMeta', {
                          price: money(parseMoney(item.price)),
                          unit: t(PURCHASE_UNIT_LABELS, item.unit),
                          n: formatQuantity(stock),
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

                      {/*
                        Пока количество не набрано (или ноль), кнопка
                        неактивна и выглядит так. Раньше она молча ничего не
                        делала — без ошибки и без отклика. Кнопка — общая, 48
                        и таблеткой: своя была в 46 со скруглением поля и
                        читалась ещё одним полем ввода.
                      */}
                      <SubmitButton
                        label={m('retail.submit')}
                        onPress={() => {
                          if (deltaValue === null) return;
                          addStock.mutate({ id: item.id, quantity: deltaValue });
                        }}
                        disabled={deltaValue === null}
                        pending={addStock.isPending}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <CardTitle title={m('retail.lastReceipts')} icon="paid" />

          {sales.isError ? (
            <ErrorState />
          ) : sales.data === undefined ? (
            <Skeleton />
          ) : sales.data.items.length === 0 ? (
            <Empty message={m('retail.noReceipts')} />
          ) : (
            sales.data.items.map((sale, index, all) => (
              <Pressable
                key={sale.id}
                onPress={() => {
                  navigation.navigate('SaleDetail', { saleId: sale.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={m('cash.openReceipt', { n: sale.id })}
                style={({ pressed }) => [
                  styles.itemRow,
                  index === all.length - 1 ? styles.itemRowLast : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>{m('cash.receiptN', { n: sale.id })}</Text>
                  <Text style={styles.itemMeta}>
                    {`${sale.sellerName} · ${sale.clientName ?? m('cash.noNameLower')}`}
                  </Text>
                </View>
                <Text style={styles.total}>{money(parseMoney(sale.total))}</Text>
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  itemRowLast: {
    borderBottomWidth: 0,
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
  // 44, как чипы разделов над ним и любая цель для пальца: при 40 кнопка
  // была ниже соседей и под порогом нажатия.
  stockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Вес — семейством: `fontWeight` поверх Medium браузер дорисовывает ложным жирным.
  stockButtonText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  stockBox: {
    paddingBottom: spacing.md,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

import {
  formatMoney,
  parseMoney,
  PURCHASE_CATEGORY_LABELS,
  PURCHASE_UNIT_LABELS,
  type PurchaseCategory,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactElement } from 'react';
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
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Касса: продажа тюля, аксессуаров и прочей мелочи с витрины.
 *
 * Чек, а не одна продажа: за тюлем заходят вместе с держателями, и три
 * отдельные записи вместо одной покупки — это три события там, где
 * произошло одно.
 *
 * Цены продавец не правит: прайс ведёт руководство, здесь он только
 * читается. Поэтому и полей цены в форме нет — есть количество.
 *
 * Клиент необязателен. За метром тюля заходят без имени и телефона, и
 * обязательные поля здесь означали бы, что продавец начнёт выдумывать
 * «Клиент» и «+998000000000».
 */

/** Строка чека, пока он не пробит. */
interface CartLine {
  readonly itemId: number;
  readonly quantity: string;
}

export function CashDeskScreen(): ReactElement {
  const { t } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [clientName, setClientName] = useState('');
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<PurchaseCategory | null>(null);

  const items = trpc.retail.items.list.useQuery({});

  const sell = trpc.retail.sell.useMutation({
    async onSuccess(sale) {
      notifySuccess();
      await Promise.all([
        utils.retail.items.list.invalidate(),
        utils.retail.sales.mine.invalidate(),
      ]);
      setCart([]);
      setClientName('');
      setComment('');
      Alert.alert('Продано', `Чек на ${formatMoney(parseMoney(sale.total))}`);
      navigation.goBack();
    },
    onError(error) {
      Alert.alert('Не удалось пробить чек', error.message);
    },
  });

  /*
    `?? []` завёрнут в `useMemo`: без него пустой массив создавался бы
    заново на каждый рендер, и три расчёта ниже пересчитывались бы всегда,
    даже когда прайс не менялся.
  */
  const catalog = useMemo(() => items.data ?? [], [items.data]);

  const visible = useMemo(
    () => (category === null ? catalog : catalog.filter((item) => item.category === category)),
    [catalog, category],
  );

  /** Категории, в которых реально что-то есть: пустой фильтр только мешает. */
  const categories = useMemo(
    () => [...new Set(catalog.map((item) => item.category))],
    [catalog],
  );

  const quantityOf = (itemId: number): string =>
    cart.find((line) => line.itemId === itemId)?.quantity ?? '';

  const setQuantity = (itemId: number, quantity: string): void => {
    setCart((current) => {
      const rest = current.filter((line) => line.itemId !== itemId);
      return quantity.trim() === '' ? rest : [...rest, { itemId, quantity }];
    });
  };

  const parsed = useMemo(
    () =>
      cart.flatMap((line) => {
        const quantity = Number.parseFloat(line.quantity.replace(',', '.'));
        if (!Number.isFinite(quantity) || quantity <= 0) return [];

        const item = catalog.find((entry) => entry.id === line.itemId);
        if (item === undefined) return [];

        return [{ itemId: line.itemId, quantity, item }];
      }),
    [cart, catalog],
  );

  const total = parsed.reduce(
    (sum, line) => sum + parseMoney(line.item.price) * line.quantity,
    0,
  );

  if (items.isError) {
    return (
      <View style={styles.center}>
        <ErrorState />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {items.isLoading ? (
          <Skeleton />
        ) : catalog.length === 0 ? (
          <Card>
            <Empty
              message="Прайс пуст"
              hint="Руководство заводит товары и цены в панели, раздел «Касса»"
            />
          </Card>
        ) : (
          <>
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filtersScroll}
                contentContainerStyle={styles.filters}
              >
                <Pressable
                  onPress={() => {
                    setCategory(null);
                  }}
                  style={[styles.chip, category === null ? styles.chipActive : null]}
                >
                  <Text
                    style={[styles.chipText, category === null ? styles.chipTextActive : null]}
                  >
                    Всё
                  </Text>
                </Pressable>

                {categories.map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setCategory(value);
                    }}
                    style={[styles.chip, category === value ? styles.chipActive : null]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === value ? styles.chipTextActive : null,
                      ]}
                    >
                      {t(PURCHASE_CATEGORY_LABELS, value)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Card>
              <CardTitle title="Товары" icon="orders" />

              {visible.map((item) => {
                const stock = Number.parseFloat(item.stockQuantity);
                const isOut = stock <= 0;

                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemText}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {`${formatMoney(parseMoney(item.price))} / ${t(PURCHASE_UNIT_LABELS, item.unit)}`}
                      </Text>
                      <Text style={[styles.itemStock, isOut ? styles.itemStockOut : null]}>
                        {isOut
                          ? 'нет на витрине'
                          : `остаток ${stock.toString()} ${t(PURCHASE_UNIT_LABELS, item.unit)}`}
                      </Text>
                    </View>

                    <View style={styles.itemQuantity}>
                      <Input
                        value={quantityOf(item.id)}
                        onChangeText={(value) => {
                          setQuantity(item.id, value);
                        }}
                        placeholder="0"
                        keyboardType="numeric"
                        editable={!isOut}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>

            <Card>
              <CardTitle title="Клиент" icon="person" />
              <Text style={styles.hint}>
                Необязательно — за метром тюля заходят без имени.
              </Text>

              <Field label="Имя">
                <Input
                  value={clientName}
                  onChangeText={setClientName}
                  placeholder="Как обращаться к клиенту"
                  autoCapitalize="words"
                />
              </Field>

              <Field label="Комментарий">
                <Input
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Что важно помнить по этой продаже"
                  multiline
                />
              </Field>
            </Card>
          </>
        )}

        <MySales />
      </ScrollView>

      {/*
        Итог и кнопка прибиты к низу экрана, а не лежат в прокрутке: продавец
        добавляет товар и тут же смотрит сумму, и уезжающий вверх итог
        заставлял бы листать туда-обратно на каждой позиции.
      */}
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {parsed.length === 0
              ? 'Ничего не выбрано'
              : `Позиций: ${parsed.length.toString()}`}
          </Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>

        <Pressable
          onPress={() => {
            sell.mutate({
              lines: parsed.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
              ...(clientName.trim() === '' ? {} : { clientName: clientName.trim() }),
              ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
            });
          }}
          disabled={parsed.length === 0 || sell.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            parsed.length === 0 ? styles.submitOff : null,
            pressed ? styles.submitPressed : null,
          ]}
        >
          {sell.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Icon name="paid" size={18} color={colors.onAccent} />
              <Text style={styles.submitText}>Пробить чек</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Свои чеки продавца — последние продажи с этой кассы.
 *
 * Раньше пробитый чек исчезал: приложение показывало «Продано» и всё. Ни
 * посмотреть, что именно ушло, ни свериться с клиентом, который вернулся
 * через час, было нечем — хотя `sales.mine` на сервере есть с самого
 * начала и до сих пор только сбрасывался после продажи.
 *
 * Пять последних, а не все: касса — экран продажи, а не журнал. Кому нужен
 * полный список, тот смотрит его в панели.
 */
function MySales(): ReactElement | null {
  const navigation = useNavigation();
  const sales = trpc.retail.sales.mine.useQuery({ page: 1, pageSize: 5 });

  const rows = sales.data?.items ?? [];
  // Пустую карточку не показываем: у нового продавца она была бы просто
  // шумом под формой, которую он ещё не заполнил.
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardTitle title="Мои чеки" icon="paid" />

      {rows.map((sale) => (
        <Pressable
          key={sale.id}
          onPress={() => {
            navigation.navigate('SaleDetail', { saleId: sale.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={`Открыть чек №${sale.id.toString()}`}
          style={({ pressed }) => [styles.saleRow, pressed ? styles.salePressed : null]}
        >
          <View style={styles.itemText}>
            <Text style={styles.itemName}>{`Чек №${sale.id.toString()}`}</Text>
            <Text style={styles.itemMeta}>
              {`${sale.clientName ?? 'Без имени'} · позиций: ${sale.lines}`}
            </Text>
          </View>
          <Text style={styles.saleTotal}>{formatMoney(parseMoney(sale.total))}</Text>
          <Icon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  salePressed: {
    opacity: opacity.pressed,
  },
  saleTotal: {
    ...typography.value,
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
    paddingBottom: tabBarSpace,
  },
  filtersScroll: {
    flexGrow: 0,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  itemStock: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  itemStockOut: {
    color: colors.danger,
  },
  itemQuantity: {
    width: 92,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  submitOff: {
    opacity: 0.4,
  },
  submitPressed: {
    opacity: opacity.pressed,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});

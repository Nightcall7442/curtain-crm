import {
  formatMoney,
  parseMoney,
  PURCHASE_CATEGORY_LABELS,
  PURCHASE_UNIT_LABELS,
} from '@curtain-crm/shared';
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
import { ChipSelect, Field, MoneyInput } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

import { FabricStockScreen } from './FabricStockScreen';
import { RetailStockScreen } from './RetailStockScreen';

/**
 * Закупочные цены: почём фирма покупает то, из чего шьёт.
 *
 * Цена меняется у поставщика, а узнаёт об этом тот, кто стоит у прилавка, —
 * и до этого экрана правку приходилось откладывать до возвращения к
 * компьютеру. Ровно так себестоимость и отставала от жизни.
 *
 * Это НЕ склад. Остатков ткани система не ведёт: здесь только справочник
 * «товар — единица — цена», из которого берётся снимок цены при списании
 * закупки на заказ. Себестоимость заказа считается по этим снимкам, а не по
 * текущей цене, поэтому вчерашние заказы правка не переписывает.
 *
 * Новые позиции заводятся в панели: там есть выбор категории и единицы
 * списком, а на телефоне нужен один жест — поправить цену.
 */
/**
 * Закупочные материалы: почём покупаем и что стоит на витрине.
 *
 * Три раздела в одном экране, а не три пункта в меню: закупочные цены,
 * витрина кассы и склад — про один и тот же привезённый в цех товар, и
 * руководитель, приехав с рынка, правит их за один заход.
 */
export function PurchaseMaterialsScreen(): ReactElement {
  const { m } = useLocale();
  const [section, setSection] = useState<'purchase' | 'retail' | 'fabric'>('purchase');

  const header = (
    <View style={styles.sections}>
      <ChipSelect
        value={section}
        onChange={setSection}
        options={[
          { value: 'purchase', label: m('prices.purchase') },
          { value: 'retail', label: m('prices.retail') },
          { value: 'fabric', label: m('prices.fabric') },
        ]}
      />
    </View>
  );

  if (section === 'purchase') return <PurchasePricesScreen header={header} />;
  if (section === 'retail') return <RetailStockScreen header={header} />;
  return <FabricStockScreen header={header} />;
}

export function PurchasePricesScreen({
  header,
}: {
  /** Переключатель разделов сверху; отдельно экран не открывается. */
  readonly header?: ReactElement;
} = {}): ReactElement {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();

  /** Позиция, которой правят цену. `null` — никакая. */
  const [editing, setEditing] = useState<number | null>(null);
  const [price, setPrice] = useState('');

  const items = trpc.purchases.items.list.useQuery({ includeInactive: true });

  const update = trpc.purchases.items.update.useMutation({
    async onSuccess(item) {
      notifySuccess();
      setEditing(null);
      setPrice('');
      await utils.purchases.items.list.invalidate();
      Alert.alert(m('prices.updated'), `${item.name}: ${formatMoney(parseMoney(item.price))}`);
    },
    onError(error) {
      notifyError();
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const setActive = trpc.purchases.items.setActive.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.purchases.items.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('prices.changeError'), error.message);
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
          <CardTitle title={m('prices.title')} icon="paid" />
          <Text style={styles.hint}>{m('prices.hint')}</Text>

          {items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty
              message={m('prices.empty')}
              hint={m('prices.emptyHint')}
            />
          ) : (
            items.data.map((item) => (
              <View key={item.id}>
                <View style={styles.row}>
                  <View style={styles.text}>
                    <Text
                      style={[styles.name, item.isActive ? null : styles.nameOff]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {`${t(PURCHASE_CATEGORY_LABELS, item.category)} · ${formatMoney(
                        parseMoney(item.price),
                      )} / ${t(PURCHASE_UNIT_LABELS, item.unit)}`}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setEditing(editing === item.id ? null : item.id);
                      setPrice(Number.parseFloat(item.price).toString());
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={m('prices.editA11y', { name: item.name })}
                    style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.actionText}>{m('prices.price')}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setActive.mutate({ id: item.id, isActive: !item.isActive });
                    }}
                    disabled={setActive.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.isActive ? m('prices.removeA11y', { name: item.name }) : m('prices.restoreA11y', { name: item.name })
                    }
                    style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.actionText}>{item.isActive ? m('prices.remove') : m('prices.restore')}</Text>
                  </Pressable>
                </View>

                {editing === item.id && (
                  <View style={styles.editor}>
                    <Field label={m('prices.newPrice')}>
                      <MoneyInput
                        value={price}
                        onChangeText={setPrice}
                        autoFocus
                      />
                    </Field>

                    <Pressable
                      onPress={() => {
                        const parsed = Number.parseFloat(price.replace(',', '.'));
                        if (!Number.isFinite(parsed) || parsed < 0) return;
                        update.mutate({ id: item.id, price: parsed });
                      }}
                      disabled={update.isPending}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
                    >
                      {update.isPending ? (
                        <ActivityIndicator color={colors.onAccent} size="small" />
                      ) : (
                        <Text style={styles.submitText}>{m('emp.save')}</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sections: {
    marginBottom: spacing.sm,
  },
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
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  nameOff: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  editor: {
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

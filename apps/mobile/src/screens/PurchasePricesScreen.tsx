import { parseMoney, PURCHASE_CATEGORY_LABELS, PURCHASE_UNIT_LABELS } from '@curtain-crm/shared';
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

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { ChipSelect, Field, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

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
  const { t, m, money } = useLocale();
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
      Alert.alert(m('prices.updated'), `${item.name}: ${money(parseMoney(item.price))}`);
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching}
            onRefresh={() => {
              void items.refetch();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {/*
          Переключатель разделов — и при ошибке. Прежде сбой загрузки закупки
          возвращал экран без него, и до работающих «Витрины» и «Склада»
          было уже не добраться.
        */}
        {header}

        <Card>
          <CardTitle title={m('prices.title')} icon="paid" />
          <Text style={styles.hint}>{m('prices.hint')}</Text>

          {/* Свой текст, а не сообщение сервера: при сбое оно бывает английским. */}
          {items.isError ? (
            <ErrorState />
          ) : items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty message={m('prices.empty')} hint={m('prices.emptyHint')} />
          ) : (
            items.data.map((item) => (
              <View key={item.id}>
                {/*
                  Название — целиком: это главное на экране. Две подписанные
                  кнопки справа оставляли ему 120–157 точек, и названия
                  обрезались многоточием на второй строке. «Снять»/«Вернуть»
                  теперь значок с полной целью 44 и подписью для чтения с
                  экрана, а «Цена» — одна и та же ширина в каждой строке,
                  поэтому кнопки стоят ровной колонкой.
                */}
                <View style={styles.row}>
                  <View style={styles.text}>
                    <Text style={[styles.name, item.isActive ? null : styles.nameOff]}>
                      {item.name}
                    </Text>
                    {/* Цена с единицей — неразрывно: «сум /» и «м» не расходятся по строкам. */}
                    <Text style={styles.meta}>
                      {`${t(PURCHASE_CATEGORY_LABELS, item.category)} · ${money(
                        parseMoney(item.price),
                      )}\u00A0/\u00A0${t(PURCHASE_UNIT_LABELS, item.unit)}`}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setEditing(editing === item.id ? null : item.id);
                      setPrice(Number.parseFloat(item.price).toString());
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={m('prices.editA11y', { name: item.name })}
                    accessibilityState={{ expanded: editing === item.id }}
                    style={({ pressed }) => [
                      styles.action,
                      editing === item.id ? styles.actionActive : null,
                      pressed ? styles.pressed : null,
                    ]}
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
                      item.isActive
                        ? m('prices.removeA11y', { name: item.name })
                        : m('prices.restoreA11y', { name: item.name })
                    }
                    style={({ pressed }) => [styles.iconAction, pressed ? styles.pressed : null]}
                  >
                    <Icon
                      name={item.isActive ? 'eyeOff' : 'rolledBack'}
                      size={20}
                      color={item.isActive ? colors.textSecondary : colors.accentStrong}
                    />
                  </Pressable>
                </View>

                {editing === item.id && (
                  <View style={styles.editor}>
                    <Field label={m('prices.newPrice')}>
                      <MoneyInput value={price} onChangeText={setPrice} autoFocus />
                    </Field>

                    <SubmitButton
                      label={m('emp.save')}
                      pending={update.isPending}
                      onPress={() => {
                        const parsed = Number.parseFloat(price.replace(',', '.'));
                        if (!Number.isFinite(parsed) || parsed < 0) return;
                        update.mutate({ id: item.id, price: parsed });
                      }}
                    />
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
    marginTop: 2,
  },
  // 44 — порог пальца, как у чипов и полей приложения; было 40.
  action: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  actionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  actionText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
  },
  /* Значок «снять/вернуть» стоит в той же колонке у каждой строки: ширина
     у него одна, и «Цена» рядом больше не прыгает между строками. */
  iconAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    // Сам значок — у правого края строки, вровень с линией под ней; цель
    // для пальца заходит на поле карточки.
    marginRight: -spacing.md,
  },
  /* Поле прижималось к линии строки вплотную — снизу у редактора отступ был,
     сверху нет. Своя линия снизу держит его вместе со строкой. */
  editor: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

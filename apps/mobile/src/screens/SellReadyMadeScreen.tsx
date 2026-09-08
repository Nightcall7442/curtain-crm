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

import { CatalogKind, formatMoney, parseMoney } from '@curtain-crm/shared';

import { Card, CardTitle } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Продажа готовых штор — товар с витрины, минуя цех.
 *
 * У мастерской два разных бизнеса: пошив на заказ (полный конвейер —
 * замер, раскрой, шитьё, контроль) и готовые шторы, которые продавец
 * отдаёт клиенту сразу. Цикл цеха здесь не нужен вовсе, поэтому форма не
 * спрашивает ни размеров, ни материалов, ни этапов — только то, что нужно
 * для продажи и, при необходимости, для установки.
 *
 * Позиций может быть несколько, и модель берётся из справочника — того же,
 * что и в заказе на пошив. Раньше было одно свободное поле на всю продажу:
 * комплект, тюль и карниз уезжали в одну строку текстом, и в отчёте нельзя
 * было понять, что именно продано.
 *
 * Развилка «нужна ли установка» — единственное ветвление формы:
 *  - «Нет» — заказ закрывается тем же нажатием, установку никто не ждёт;
 *  - «Да» — заказ уходит админу с адресом; дальше админ назначает
 *    установщика обычным порядком, как в пошиве.
 * Решает `orders.sellReadyMade` на сервере одной транзакцией — оба пути
 * недоступны обычному `orders.changeStatus`, чтобы их нельзя было пройти
 * в обход этой формы.
 */
export function SellReadyMadeScreen(): ReactElement {
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [needsInstallation, setNeedsInstallation] = useState<'no' | 'yes'>('no');
  const [installAddress, setInstallAddress] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  /*
    Модельный ряд — тот же справочник, что и в заказе на пошив
    (`catalog_items`, вид `curtain_model`), который директор ведёт в
    веб-панели. Раньше здесь было свободное поле: продавец писал модель
    как помнил, и одна и та же штора в отчётах называлась тремя способами.
  */
  /*
    Склад запрашивается целиком, один раз на экран, а не по запросу на
    позицию: позиции добавляют и удаляют, а хук, вызванный внутри списка,
    менял бы порядок хуков при каждом таком нажатии. Отбор по модели —
    здесь же, на клиенте: строк на витрине десятки, не тысячи.
  */
  const stock = trpc.readyMade.list.useQuery({});

  const catalog = trpc.catalog.list.useQuery({});
  const modelOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
        .map((entry) => entry.name),
    [catalog.data],
  );

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const sell = trpc.orders.sellReadyMade.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      Alert.alert(
        needsInstallation === 'yes' ? 'Продано' : 'Продано и закрыто',
        needsInstallation === 'yes'
          ? 'Заказ передан администратору — он назначит установщика.'
          : 'Установка не требуется, заказ закрыт сразу.',
      );
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert('Не удалось оформить продажу', error.message);
    },
  });

  const errors = validate({ clientName, clientPhone, needsInstallation, installAddress });
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    sell.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      workPrice: toMoney(workPrice),
      deposit: toMoney(deposit),
      needsInstallation: needsInstallation === 'yes',
      items: items.map((item) => ({
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.readyMadeItemId === null ? {} : { readyMadeItemId: item.readyMadeItemId }),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
      })),
      ...(needsInstallation === 'yes'
        ? {
            installAddress: installAddress.trim(),
          }
        : {}),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle title="Клиент" icon="person" />

          <Field label="Имя" required error={showErrors ? errors.clientName : undefined}>
            <Input
              value={clientName}
              onChangeText={setClientName}
              placeholder="Как обращаться к клиенту"
              autoCapitalize="words"
              invalid={showErrors && errors.clientName !== undefined}
            />
          </Field>

          <Field
            label="Телефон"
            required
            hint="Любой формат: +998 90 123 45 67 или 901234567"
            error={showErrors ? errors.clientPhone : undefined}
          >
            <Input
              value={clientPhone}
              onChangeText={setClientPhone}
              placeholder="+998 __ ___ __ __"
              keyboardType="phone-pad"
              autoComplete="tel"
              invalid={showErrors && errors.clientPhone !== undefined}
            />
          </Field>
        </Card>

        {/*
          Деньги — на всю продажу, а не на позицию: так же, как в заказе на
          пошив. Клиент платит одну сумму и оставляет один задаток, и
          раскладывать их по строкам продавцу на кассе не нужно.
        */}
        <Card>
          <CardTitle title="Оплата" icon="paid" />

          <View style={styles.money}>
            <View style={styles.moneyItem}>
              <Field label="Цена">
                <Input
                  value={workPrice}
                  onChangeText={setWorkPrice}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </Field>
            </View>
            <View style={styles.moneyItem}>
              <Field label="Предоплата">
                <Input
                  value={deposit}
                  onChangeText={setDeposit}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </Field>
            </View>
          </View>
        </Card>

        {items.map((item, index) => (
          <Card key={item.id}>
            <CardTitle
              title={`Позиция ${(index + 1).toString()}`}
              icon="window"
              action={
                items.length > 1 ? (
                  <Pressable
                    onPress={() => {
                      setItems((current) => current.filter((entry) => entry.id !== item.id));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить позицию ${(index + 1).toString()}`}
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.remove, pressed ? styles.pressed : null]}>Удалить</Text>
                    )}
                  </Pressable>
                ) : undefined
              }
            />

            <View style={styles.row}>
              <View style={styles.modelItem}>
                <Field label="Модель">
                  <CatalogPicker
                    value={item.model}
                    placeholder="Не выбрана"
                    options={modelOptions}
                    sheetTitle="Модельный ряд"
                    onChange={(model) => {
                      updateItem(item.id, { model });
                    }}
                  />
                </Field>
              </View>
              <View style={styles.quantityItem}>
                <Field label="Кол-во">
                  <Input
                    value={item.quantity}
                    onChangeText={(quantity) => {
                      updateItem(item.id, { quantity });
                    }}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </Field>
              </View>
            </View>

            {/*
              Что есть на складе по выбранной модели. Продавец выбирает вещь,
              а не переписывает её описание: размер, цвет и код приезжают со
              склада, а остаток списывается при продаже.
            */}
            {item.model.trim() !== '' && (
              <View style={styles.stock}>
                <Text style={styles.stockTitle}>В наличии</Text>

                {stock.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  (() => {
                    const matching = (stock.data ?? []).filter((entry) =>
                      entry.model.toLowerCase().includes(item.model.trim().toLowerCase()),
                    );

                    if (matching.length === 0) {
                      return (
                        <Text style={styles.stockHint}>
                          По этой модели готовых штор на складе нет — продажа пройдёт без списания
                        </Text>
                      );
                    }

                    return matching.map((entry) => {
                      const chosen = item.readyMadeItemId === entry.id;

                      return (
                        <Pressable
                          key={entry.id}
                          onPress={() => {
                            updateItem(item.id, {
                              readyMadeItemId: chosen ? null : entry.id,
                              model: entry.model,
                            });
                            // Цену подставляем, пока продавец её не трогал:
                            // переписать её он всегда успеет, а вот забыть
                            // ценник со склада — обычное дело.
                            if (!chosen && workPrice.trim() === '') {
                              setWorkPrice(
                                (
                                  Number.parseFloat(entry.price) *
                                  Math.max(1, Number.parseInt(item.quantity, 10) || 1)
                                ).toString(),
                              );
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: chosen }}
                          style={({ pressed }) => [
                            styles.stockRow,
                            chosen ? styles.stockRowChosen : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <View style={styles.stockBody}>
                            <Text style={styles.stockName}>
                              {`${Number.parseFloat(entry.widthCm).toString()}×${Number.parseFloat(
                                entry.heightCm,
                              ).toString()} см`}
                              {entry.color === null ? '' : ` · ${entry.color}`}
                              {entry.code === null ? '' : ` · ${entry.code}`}
                            </Text>
                            <Text style={styles.stockMeta}>
                              {`${entry.branchName} · ${entry.quantity.toString()} шт`}
                            </Text>
                          </View>
                          <Text style={styles.stockPrice}>
                            {formatMoney(parseMoney(entry.price))}
                          </Text>
                        </Pressable>
                      );
                    });
                  })()
                )}
              </View>
            )}

            <Field label="Комментарий">
              <Input
                value={item.comment}
                onChangeText={(comment) => {
                  updateItem(item.id, { comment });
                }}
                placeholder="Что важно помнить по этой позиции"
                multiline
              />
            </Field>
          </Card>
        ))}

        <Pressable
          onPress={() => {
            setItems((current) => [
              ...current,
              // Идентификатор от максимума, а не от длины: после удаления
              // позиции длина повторяется, и ключи списка начинают совпадать.
              emptyItem(current.reduce((max, entry) => Math.max(max, entry.id), 0) + 1),
            ]);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addItem, pressed ? styles.pressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.accent} />
          <Text style={styles.addItemText}>Добавить позицию</Text>
        </Pressable>

        <Card>
          <CardTitle title="Установка" icon="deadline" />

          <Field label="Установка требуется?">
            <ChipSelect
              value={needsInstallation}
              onChange={setNeedsInstallation}
              options={[
                { value: 'no', label: 'Нет — продажа без цеха' },
                { value: 'yes', label: 'Да, нужен установщик' },
              ]}
            />
          </Field>

          {needsInstallation === 'yes' ? (
            <>
              <Field
                label="Адрес установки"
                required
                error={showErrors ? errors.installAddress : undefined}
              >
                <Input
                  value={installAddress}
                  onChangeText={setInstallAddress}
                  placeholder="Улица, дом, квартира"
                  multiline
                  invalid={showErrors && errors.installAddress !== undefined}
                />
              </Field>
            </>
          ) : (
            <Text style={styles.hint}>
              Заказ закроется сразу — цех и установщик в нём не участвуют.
            </Text>
          )}
        </Card>

        <Pressable
          onPress={submit}
          disabled={sell.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            sell.isPending ? styles.submitBusy : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {sell.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>
              {needsInstallation === 'yes' ? 'Продать, передать на установку' : 'Продать и закрыть'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */

/** Позиция в форме: строки, потому что поля ввода отдают строки. */
interface DraftItem {
  readonly id: number;
  readonly model: string;
  readonly quantity: string;
  readonly comment: string;
  /**
   * Выбранная штора со склада. `null` — продажа без склада: так продавали
   * до появления остатков, и так продают то, чего на полке не оказалось.
   */
  readonly readyMadeItemId: number | null;
}

const emptyItem = (id: number): DraftItem => ({
  id,
  model: '',
  quantity: '1',
  comment: '',
  readyMadeItemId: null,
});

function validate(values: {
  readonly clientName: string;
  readonly clientPhone: string;
  readonly needsInstallation: 'no' | 'yes';
  readonly installAddress: string;
}): Partial<Record<'clientName' | 'clientPhone' | 'installAddress', string>> {
  const errors: Record<string, string> = {};

  if (values.clientName.trim() === '') {
    errors['clientName'] = 'Укажите имя клиента';
  }

  const digits = values.clientPhone.replace(/\D/g, '');
  if (digits.length < 9) {
    errors['clientPhone'] = 'Похоже, номер неполный';
  }

  if (values.needsInstallation === 'yes' && values.installAddress.trim() === '') {
    errors['installAddress'] = 'Укажите адрес — иначе установщику некуда ехать';
  }

  return errors;
}

function toMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  money: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyItem: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modelItem: {
    flex: 1,
    minWidth: 0,
  },
  quantityItem: {
    width: 80,
  },
  remove: {
    ...typography.footnote,
    color: colors.danger,
    fontWeight: '600',
  },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  stock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  stockTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  stockHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stockRowChosen: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  stockBody: { flex: 1 },
  stockName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  stockMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stockPrice: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  addItemText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  hint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  submit: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBusy: {
    opacity: opacity.disabled,
  },
  submitText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
});

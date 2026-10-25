import {
  inputToMajor,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
  PRIORITIES,
  Priority,
  PRIORITY_LABELS,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useRef, useState, type ReactElement } from 'react';
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

import { Card, CardTitle } from '../components/Card';
import {
  draftItemToInput,
  OrderItemsEditor,
  useOrderCatalog,
  validateOrderForm,
} from '../components/order/OrderForm';
import { emptyItem, type DraftItem } from '../components/order/OrderItemCard';
import { CodeScanner } from '../components/CodeScanner';
import { DateField } from '../components/DateField';
import { DiscountFields, discountMissingReason, discountPayload, emptyDiscount } from '../components/DiscountFields';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Создание заказа с телефона.
 *
 * Раньше заказ можно было завести только в веб-панели, хотя сервер разрешает
 * это продавцу (`orders.create` — процедура уровня приёмки). Продавец при
 * этом работает у клиента дома, с телефоном в руках, и возвращаться к
 * компьютеру ради ввода заказа — ровно тот шаг, из-за которого данные
 * попадают в систему вечером и по памяти.
 *
 * Позиция заказа здесь настолько же подробная, что и в веб-панели: продавец
 * заполняет карниз, тюль, антимоскитную сетку и аксессуары на месте, у
 * клиента, — а не восстанавливает их по памяти вечером за компьютером.
 *
 * Филиал не спрашивается: сервер берёт основной филиал сотрудника. Если он
 * не задан, придёт понятный отказ — выдумывать выбор из филиалов, к которым
 * продавец не привязан, незачем.
 */

export function OrderCreateScreen({ route }: RootStackScreenProps<'OrderCreate'>): ReactElement {
  // Пошив для склада — без клиента, установки и денег, той же формой позиций.
  const forStock = route.params?.mode === 'stock';
  const { t, m } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.NORMAL);
  const [deadline, setDeadline] = useState('');
  const [workPrice, setWorkPrice] = useState('');
  const [discount, setDiscount] = useState(emptyDiscount);
  const [deposit, setDeposit] = useState('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [showErrors, setShowErrors] = useState(false);

  /*
    Сканер один на всю форму: полей с кодом на позицию до семи, и держать
    камеру в каждом значило бы семь смонтированных камер сразу. Куда положить
    результат, помнит ref — состояние здесь перерисовывалось бы зря.
  */
  const [scanning, setScanning] = useState<string | null>(null);
  const applyScan = useRef<((code: string) => void) | null>(null);

  const askScan = (label: string, apply: (code: string) => void): void => {
    applyScan.current = apply;
    setScanning(label);
  };

  const catalog = useOrderCatalog();

  const create = trpc.orders.create.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      // Уходим сразу в карточку: следующий шаг продавца — приложить фото
      // и отправить заказ админу, и оба действия там.
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert(m('create.error'), error.message);
    },
  });

  const produceForStock = trpc.orders.produceForStock.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert(m('create.error'), error.message);
    },
  });

  const submitting = forStock ? produceForStock : create;

  const errors = validateOrderForm({ clientName, clientPhone, deadline, items, skipClient: forStock }, m);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors || (!forStock && discountMissingReason(workPrice, discount))) return;

    const orderItemsPayload = items.map((item) => draftItemToInput(item, catalog));

    if (forStock) {
      produceForStock.mutate({
        priority,
        ...(deadline.trim() === '' ? {} : { deadline: deadline.trim() }),
        items: orderItemsPayload,
      });
      return;
    }

    create.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      priority,
      ...(installAddress.trim() === '' ? {} : { installAddress: installAddress.trim() }),
      ...(deadline.trim() === '' ? {} : { deadline: deadline.trim() }),
      ...discountPayload(workPrice, discount),
      deposit: inputToMajor(deposit),
      depositMethod,
      items: orderItemsPayload,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // На Android окно поджимает система (`adjustResize`), на iOS — нет,
      // и без этого нижние поля формы уезжают под клавиатуру.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* У пошива для склада клиента нет: заказ существует не для него. */}
        {!forStock && (
          <Card>
            {/* Клиент пришёл за готовой шторой — сразу на продажу с полки, не через пошив. */}
            <CardTitle
              title={m('create.client')}
              icon="person"
              action={
                <Pressable
                  onPress={() => {
                    navigation.navigate('SellReadyMade');
                  }}
                  hitSlop={8}
                  accessibilityRole="link"
                >
                  <Text style={styles.addItemText}>{m('work.readyMade')} →</Text>
                </Pressable>
              }
            />

            <Field
              label={m('create.name')}
              required
              error={showErrors ? errors.clientName : undefined}
            >
              <Input
                value={clientName}
                onChangeText={setClientName}
                placeholder={m('create.namePlaceholder')}
                autoCapitalize="words"
                invalid={showErrors && errors.clientName !== undefined}
              />
            </Field>

            <Field
              label={m('create.phone')}
              required
              hint={m('create.phoneHint')}
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

            <Field label={m('create.address')}>
              <Input
                value={installAddress}
                onChangeText={setInstallAddress}
                placeholder={m('create.addressPlaceholder')}
                multiline
              />
            </Field>
          </Card>
        )}

        <Card>
          <CardTitle title={m('create.terms')} icon="deadline" />

          <Field label={m('create.priority')}>
            <ChipSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS, value) }))}
            />
          </Field>

          <Field label={m('create.deadline')} error={showErrors ? errors.deadline : undefined}>
            <DateField
              value={deadline}
              onChange={setDeadline}
              placeholder={m('create.deadline')}
              invalid={showErrors && errors.deadline !== undefined}
              minimumDate={new Date()}
            />
          </Field>

          {/* Платить здесь некому — заказ не для клиента. */}
          {!forStock && (
            <>
              <View style={styles.money}>
                <View style={styles.moneyItem}>
                  <Field label={m('create.workPrice')}>
                    <MoneyInput value={workPrice} onChangeText={setWorkPrice} placeholder="0" />
                  </Field>
                </View>
                <View style={styles.moneyItem}>
                  <Field label={m('create.deposit')}>
                    <MoneyInput value={deposit} onChangeText={setDeposit} placeholder="0" />
                  </Field>
                </View>
              </View>
              <DiscountFields price={workPrice} value={discount} onChange={setDiscount} showError={showErrors} />
              {/* Способ оплаты предоплаты — из него складывается касса дня. */}
              <Field label={m('cash.method')}>
                <ChipSelect
                  value={depositMethod}
                  onChange={setDepositMethod}
                  options={PAYMENT_METHODS.map((value) => ({
                    value,
                    label: t(PAYMENT_METHOD_LABELS, value),
                  }))}
                />
              </Field>
            </>
          )}
        </Card>

        <OrderItemsEditor items={items} onChange={setItems} catalog={catalog} askScan={askScan} />

        <Pressable
          onPress={submit}
          disabled={submitting.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            submitting.isPending ? styles.submitBusy : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {submitting.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>
              {forStock ? m('create.submitStock') : m('create.submit')}
            </Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          {forStock ? m('create.footnoteStock') : m('create.footnote')}
        </Text>
      </ScrollView>
      <CodeScanner
        visible={scanning !== null}
        label={scanning ?? ''}
        onScan={(code) => {
          applyScan.current?.(code);
        }}
        onClose={() => {
          setScanning(null);
        }}
      />
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
    paddingBottom: tabBarSpace,
  },
  money: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyItem: {
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  addItemText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
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
  footnote: {
    ...typography.footnote,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

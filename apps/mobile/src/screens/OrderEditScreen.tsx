import {
  OrderType,
  parseMoney,
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState, type ReactElement } from 'react';
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

import { Card, CardTitle, ErrorState, Skeleton } from '../components/Card';
import { CodeScanner } from '../components/CodeScanner';
import { DateField } from '../components/DateField';
import {
  DiscountFields,
  discountMissingReason,
  discountPayload,
  type DiscountDraft,
} from '../components/DiscountFields';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import {
  draftItemToInput,
  OrderItemsEditor,
  orderItemToDraft,
  useOrderCatalog,
  validateOrderForm,
} from '../components/order/OrderForm';
import type { DraftItem } from '../components/order/OrderItemCard';
import { useLocale } from '../hooks/useLocale';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

type OrderDetails = RouterOutputs['orders']['byId'];

/** Сумма в тийинах → строка для поля денег: `500000000` → `'5000000'`. */
const moneyField = (minor: number): string => (minor / 100).toString();

/**
 * Правка заказа с телефона — те же поля, что при создании.
 *
 * Не правятся филиал, предоплата и расценки: филиал не переносится, оплата —
 * это проводки («Принять оплату»), расценки — кнопка руководства. Уходит
 * только изменённое: сервер пишет в журнал и уведомляет исполнителя по тому,
 * что реально поменялось.
 */
export function OrderEditScreen({ route }: RootStackScreenProps<'OrderEdit'>): ReactElement {
  const { orderId } = route.params;
  const order = trpc.orders.byId.useQuery({ id: orderId });

  if (order.isLoading) {
    return (
      <View style={styles.content}>
        <Skeleton rows={4} />
      </View>
    );
  }
  if (order.data === undefined) return <ErrorState />;

  return <OrderEditForm order={order.data} />;
}

function OrderEditForm({ order }: { readonly order: OrderDetails }): ReactElement {
  const { t, m } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const catalog = useOrderCatalog();

  const forStock = order.orderType === OrderType.STOCK;
  const itemsEditable = order.orderType !== OrderType.READY_MADE;
  // Цена видна только тем, кому сервер отдал деньги клиента.
  const priceEditable = !forStock && order.workPrice !== null;
  const discountMinor = parseMoney(order.discountAmount ?? '0');

  const [clientName, setClientName] = useState(order.clientName);
  const [clientPhone, setClientPhone] = useState(order.clientPhone);
  const [installAddress, setInstallAddress] = useState(order.installAddress ?? '');
  const [priority, setPriority] = useState<Priority>(order.priority);
  const [deadline, setDeadline] = useState(order.deadline ?? '');
  // В заказе — цена уже со скидкой; в поле — до скидки, как при создании.
  const [workPrice, setWorkPrice] = useState(() =>
    order.workPrice === null ? '' : moneyField(parseMoney(order.workPrice) + discountMinor),
  );
  const [discount, setDiscount] = useState<DiscountDraft>(() => ({
    value: discountMinor > 0 ? moneyField(discountMinor) : '',
    mode: 'sum',
    reason: order.discountReason ?? '',
  }));
  const [items, setItems] = useState<readonly DraftItem[]>(() =>
    order.items.map((item, index) => orderItemToDraft(item, index + 1)),
  );
  const [itemsTouched, setItemsTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Сканер один на форму — как на экране создания.
  const [scanning, setScanning] = useState<string | null>(null);
  const applyScan = useRef<((code: string) => void) | null>(null);
  const askScan = (label: string, apply: (code: string) => void): void => {
    applyScan.current = apply;
    setScanning(label);
  };

  useEffect(() => {
    navigation.setOptions({ title: `${m('nav.editOrder')} ${order.orderNumber ?? ''}`.trim() });
  }, [navigation, m, order.orderNumber]);

  const update = trpc.orders.update.useMutation({
    async onSuccess() {
      await Promise.all([
        utils.orders.byId.invalidate({ id: order.id }),
        utils.orders.list.invalidate(),
        utils.orders.availableTransitions.invalidate({ id: order.id }),
      ]);
      navigation.goBack();
    },
    onError(error) {
      Alert.alert(m('create.error'), error.message);
    },
  });

  const errors = validateOrderForm({ clientName, clientPhone, deadline, items, skipClient: forStock }, m);

  const submit = (): void => {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    if (priceEditable && discountMissingReason(workPrice, discount)) return;

    const price = priceEditable ? discountPayload(workPrice, discount) : null;
    const priceChanged =
      price !== null &&
      (parseMoney(price.workPrice) !== parseMoney(order.workPrice ?? '0') ||
        parseMoney(price.discountAmount) !== discountMinor);

    const changes = {
      ...(!forStock && clientName.trim() !== order.clientName ? { clientName: clientName.trim() } : {}),
      ...(!forStock && clientPhone.trim() !== order.clientPhone ? { clientPhone: clientPhone.trim() } : {}),
      ...(!forStock && installAddress.trim() !== (order.installAddress ?? '')
        ? { installAddress: installAddress.trim() }
        : {}),
      ...(deadline.trim() !== (order.deadline ?? '')
        ? { deadline: deadline.trim() === '' ? null : deadline.trim() }
        : {}),
      ...(priority !== order.priority ? { priority } : {}),
      ...(price !== null && priceChanged ? price : {}),
      ...(itemsEditable && itemsTouched
        ? { items: items.map((item) => draftItemToInput(item, catalog)) }
        : {}),
    };

    if (Object.keys(changes).length === 0) {
      navigation.goBack();
      return;
    }
    update.mutate({ id: order.id, ...changes });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!forStock && (
          <Card>
            <CardTitle title={m('create.client')} icon="person" />
            <Field label={m('create.name')} required error={showErrors ? errors.clientName : undefined}>
              <Input
                value={clientName}
                onChangeText={setClientName}
                autoCapitalize="words"
                invalid={showErrors && errors.clientName !== undefined}
              />
            </Field>
            <Field label={m('create.phone')} required error={showErrors ? errors.clientPhone : undefined}>
              <Input
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                invalid={showErrors && errors.clientPhone !== undefined}
              />
            </Field>
            <Field label={m('create.address')}>
              <Input value={installAddress} onChangeText={setInstallAddress} multiline />
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
            />
          </Field>
          {priceEditable && (
            <>
              <Field label={m('create.workPrice')}>
                <MoneyInput value={workPrice} onChangeText={setWorkPrice} placeholder="0" />
              </Field>
              <DiscountFields price={workPrice} value={discount} onChange={setDiscount} showError={showErrors} />
            </>
          )}
        </Card>

        {itemsEditable ? (
          <OrderItemsEditor
            items={items}
            onChange={(next) => {
              setItemsTouched(true);
              setItems(next);
            }}
            catalog={catalog}
            askScan={askScan}
          />
        ) : (
          <Text style={styles.note}>{m('edit.readyMadeItems')}</Text>
        )}

        <Pressable
          onPress={submit}
          disabled={update.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            update.isPending ? styles.submitBusy : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {update.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>{m('edit.save')}</Text>
          )}
        </Pressable>
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
  note: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
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
  pressed: {
    opacity: opacity.pressed,
  },
});

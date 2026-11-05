import {
  formatPhone,
  normalizePhone,
  OrderType,
  parseMoney,
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { ShiftRequiredBanner, useNeedsShift } from '../components/ShiftRequiredBanner';
import type { DraftItem } from '../components/order/OrderItemCard';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { colors, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

type OrderDetails = RouterOutputs['orders']['byId'];

/**
 * Тот же ли это номер: оба приводятся к `+998XXXXXXXXX`. Нераспознанный —
 * сравнивается как записан, без пробелов по краям.
 */
const samePhone = (typed: string, stored: string): boolean =>
  (normalizePhone(typed) ?? typed.trim()) === (normalizePhone(stored) ?? stored.trim());

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
  // Правку без смены сервер не примет (412): «Сохранить» гаснет, баннер сверху говорит почему.
  const needsShift = useNeedsShift();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const catalog = useOrderCatalog();

  const forStock = order.orderType === OrderType.STOCK;
  const itemsEditable = order.orderType !== OrderType.READY_MADE;
  // Цена видна только тем, кому сервер отдал деньги клиента.
  const priceEditable = !forStock && order.workPrice !== null;
  const discountMinor = parseMoney(order.discountAmount ?? '0');

  const [clientName, setClientName] = useState(order.clientName);
  // Номер — в том же виде, что в карточке заказа («+998 90 577 45 27»), а не
  // как хранится в базе («+998905774527»).
  const [clientPhone, setClientPhone] = useState(() => formatPhone(order.clientPhone));
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
      // Сравнение — по номеру, а не по записи: отформатированный «+998 90 …»
      // тот же номер, что «+998905774527» в базе, и правкой он не считается.
      // Хранимый номер приводится тем же способом: у старых заказов он
      // записан как попало («905774527»), и без этого любое сохранение —
      // хоть одного срока — молча переписывало телефон клиента.
      ...(!forStock && !samePhone(clientPhone, order.clientPhone)
        ? { clientPhone: clientPhone.trim() }
        : {}),
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
        <ShiftRequiredBanner />
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
            {/* Последнее поле карточки — без нижнего отступа, иначе снизу 32 при 16 сверху. */}
            <Field label={m('create.address')} last>
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
          {/* Без цены срок — последнее поле карточки. */}
          <Field
            label={m('create.deadline')}
            error={showErrors ? errors.deadline : undefined}
            last={!priceEditable}
          >
            <DateField
              value={deadline}
              onChange={setDeadline}
              placeholder={m('create.deadline')}
              emptyText={m('common.datePlaceholder')}
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

        {/* Общая кнопка формы — как «Создать заказ» и кнопки карточки заказа. */}
        <SubmitButton
          label={m('edit.save')}
          onPress={submit}
          disabled={needsShift}
          pending={update.isPending}
        />
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
});

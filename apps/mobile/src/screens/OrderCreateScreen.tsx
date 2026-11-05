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
import { StackActions, useNavigation } from '@react-navigation/native';
import { useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardLink, CardTitle } from '../components/Card';
import {
  draftItemToInput,
  OrderItemsEditor,
  useOrderCatalog,
  validateOrderForm,
} from '../components/order/OrderForm';
import { ShiftRequiredBanner, useNeedsShift } from '../components/ShiftRequiredBanner';
import { emptyItem, type DraftItem } from '../components/order/OrderItemCard';
import { CodeScanner } from '../components/CodeScanner';
import { DateField } from '../components/DateField';
import { DiscountFields, discountMissingReason, discountPayload, emptyDiscount } from '../components/DiscountFields';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, spacing, tabBarSpace, typography } from '../theme';
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

  const needsShift = useNeedsShift();
  const catalog = useOrderCatalog();

  /*
    Карточка заказа встаёт НА МЕСТО формы, а не поверх неё. При обычном
    переходе «назад» из карточки возвращал к заполненной форме, и второе
    касание «Создать заказ» заводило тот же заказ ещё раз.
  */
  const openCreated = (orderId: number): void => {
    navigation.dispatch(StackActions.replace('OrderDetail', { orderId }));
  };

  const create = trpc.orders.create.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      // Уходим сразу в карточку: следующий шаг продавца — приложить фото
      // и отправить заказ админу, и оба действия там.
      openCreated(order.id);
    },
    onError(error) {
      Alert.alert(m('create.error'), error.message);
    },
  });

  const produceForStock = trpc.orders.produceForStock.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      openCreated(order.id);
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
        {/*
          Без открытой смены сервер заказ не примет (412 «Сначала начните
          смену»), а узнавал об этом продавец только на «Создать заказ» —
          заполнив всю длинную форму. Баннер говорит об этом сразу.
        */}
        <ShiftRequiredBanner />

        {/* У пошива для склада клиента нет: заказ существует не для него. */}
        {!forStock && (
          <Card>
            {/*
              Клиент пришёл за готовой шторой — сразу на продажу с полки, не
              через пошив. Общая ссылка шапки карточки: цель 44 точки без
              `hitSlop` и тот же кегль, что у «Подробнее» на других экранах,
              а не основной текст полужирным поверх Medium.
            */}
            <CardTitle
              title={m('create.client')}
              icon="person"
              action={
                <CardLink
                  label={`${m('work.readyMade')} →`}
                  onPress={() => {
                    navigation.navigate('SellReadyMade');
                  }}
                />
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

            {/* Последнее поле карточки — без нижнего отступа, иначе снизу 32 при 16 сверху. */}
            <Field label={m('create.address')} last>
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

          {/* У пошива на склад срок — последнее поле карточки. */}
          <Field
            label={m('create.deadline')}
            error={showErrors ? errors.deadline : undefined}
            last={forStock}
          >
            <DateField
              value={deadline}
              onChange={setDeadline}
              placeholder={m('create.deadline')}
              emptyText={m('common.datePlaceholder')}
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
              <Field label={m('cash.method')} last>
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

        {/*
          Общая кнопка формы: та же высота, скругление и вид «занято», что у
          «Добавить позицию» над ней и у кнопок карточки заказа, куда форма
          ведёт дальше. Своя кнопка в 52 точки была выше всех остальных.
        */}
        <SubmitButton
          label={forStock ? m('create.submitStock') : m('create.submit')}
          onPress={submit}
          // Без смены сервер заказ не примет — кнопка гаснет, баннер сверху говорит почему.
          disabled={needsShift}
          pending={submitting.isPending}
        />

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
  footnote: {
    ...typography.footnote,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

import {
  CatalogKind,
  CurtainMountKind,
  curtainMountKindOf,
  inputToMajor,
  MATERIAL_CODE_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
  PRIORITIES,
  Priority,
  PRIORITY_LABELS,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useRef, useState, type ReactElement } from 'react';
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
  emptyItem,
  OrderItemCard,
  toMaterial,
  type AccessoryDraft,
  type DraftItem,
  type PortiereDraft,
} from '../components/order/OrderItemCard';
import { CodeScanner } from '../components/CodeScanner';
import { DateField } from '../components/DateField';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale, type Translate } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
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

  const catalog = trpc.catalog.list.useQuery({});

  /** Справочники, сгруппированные по виду — как в веб-панели. */
  const byKind = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of catalog.data ?? []) {
      const bucket = map.get(entry.kind) ?? [];
      bucket.push(entry.name);
      map.set(entry.kind, bucket);
    }
    return map;
  }, [catalog.data]);

  /**
   * Аксессуары — из двух справочников сразу: «Сачак» такой же аксессуар,
   * как держатель или бубон, просто из другого списка (как в веб-панели).
   */
  const accessoryOptions = useMemo(() => {
    const names = new Set([
      ...(byKind.get(CatalogKind.ACCESSORY) ?? []),
      ...(byKind.get(CatalogKind.SACHAK) ?? []),
    ]);
    return Array.from(names);
  }, [byKind]);

  const modelOptions = byKind.get(CatalogKind.CURTAIN_MODEL) ?? [];

  /**
   * Мини-описания кодов и крепление моделей — из того же справочника.
   *
   * Ключ с приведённым регистром: продавец переписывает код с этикетки от
   * руки, и «п-31» должно найтись так же, как «П-31».
   */
  const codeDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog.data ?? []) {
      if (entry.description !== null && entry.description !== '') {
        map.set(`${entry.kind}:${entry.name.trim().toLowerCase()}`, entry.description);
      }
    }
    return map;
  }, [catalog.data]);

  const describeCode = (kind: string, code: string): string | null =>
    codeDescriptions.get(`${kind}:${code.trim().toLowerCase()}`) ?? null;

  const mountByModel = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of catalog.data ?? []) {
      if (entry.kind === CatalogKind.CURTAIN_MODEL) map.set(entry.name, entry.mountKind);
    }
    return map;
  }, [catalog.data]);

  /** Труба или пластик с карнизом — что спрашивать для выбранной модели. */
  const mountOf = (model: string): string => curtainMountKindOf(mountByModel.get(model));

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

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updatePortiere = (
    itemId: number,
    portiereId: number,
    patch: Partial<PortiereDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              portieres: item.portieres.map((portiere) =>
                portiere.id === portiereId ? { ...portiere, ...patch } : portiere,
              ),
            },
      ),
    );
  };

  const updateAccessory = (
    itemId: number,
    accessoryId: number,
    patch: Partial<AccessoryDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              accessories: item.accessories.map((accessory) =>
                accessory.id === accessoryId ? { ...accessory, ...patch } : accessory,
              ),
            },
      ),
    );
  };

  const errors = validate({ clientName, clientPhone, deadline, items, skipClient: forStock }, m);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    const orderItemsPayload = items.map((item) => {
      /*
          Строки материала, которых у этой модели не бывает, на сервер не
          уезжают, даже если продавец успел их заполнить до смены модели.
        */
      const onPipe = mountOf(item.model) === CurtainMountKind.PIPE;

      const tulle = toMaterial(
        item.tulle,
        describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code),
      );
      const protection = toMaterial(
        item.protection,
        describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code),
      );
      const cornice = onPipe
        ? undefined
        : toMaterial(item.cornice, describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code));
      const plastic = onPipe
        ? undefined
        : toMaterial(item.plastic, describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code));
      const pipe = onPipe
        ? toMaterial(item.pipe, describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code))
        : undefined;

      return {
        kind: item.kind,
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        ...(item.heightCm.trim() !== '' && item.widthCm.trim() !== ''
          ? {
              heightCm: Number.parseFloat(item.heightCm.replace(',', '.')),
              widthCm: Number.parseFloat(item.widthCm.replace(',', '.')),
            }
          : {}),
        portieres: item.portieres
          .map((portiere) =>
            toMaterial(portiere, describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code)),
          )
          .filter((portiere) => portiere !== undefined),
        ...(tulle === undefined ? {} : { tulle }),
        ...(protection === undefined ? {} : { protection }),
        ...(cornice === undefined ? {} : { cornice }),
        ...(plastic === undefined ? {} : { plastic }),
        ...(pipe === undefined ? {} : { pipe }),
        ...(item.corniceRotation === null ? {} : { corniceRotation: item.corniceRotation }),
        accessories: item.accessories
          .filter((accessory) => accessory.name.trim() !== '')
          .map((accessory) => ({
            name: accessory.name.trim(),
            quantity: Math.max(1, Number.parseInt(accessory.quantity, 10) || 1),
            code: accessory.code.trim() === '' ? null : accessory.code.trim(),
          })),
        ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
      };
    });

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
      workPrice: inputToMajor(workPrice),
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

        {items.map((item, index) => (
          <OrderItemCard
            key={item.id}
            item={item}
            index={index}
            canRemove={items.length > 1}
            onRemove={() => {
              setItems((current) => current.filter((entry) => entry.id !== item.id));
            }}
            onChange={(patch) => {
              updateItem(item.id, patch);
            }}
            onPortiere={(portiereId, patch) => {
              updatePortiere(item.id, portiereId, patch);
            }}
            onAccessory={(accessoryId, patch) => {
              updateAccessory(item.id, accessoryId, patch);
            }}
            catalog={{ modelOptions, accessoryOptions, mountOf, describeCode }}
            askScan={askScan}
          />
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
          <Text style={styles.addItemText}>{m('create.addItem')}</Text>
        </Pressable>

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

/* -------------------------------------------------------------------------- */

/**
 * Проверка формы.
 *
 * Дублирует часть серверных правил НАМЕРЕННО: сервер всё равно проверит и
 * останется единственным источником истины, но подсказать об очевидной
 * ошибке до отправки дешевле, чем показать отказ после запроса — особенно
 * на плохой связи в чужой квартире.
 */
function validate(
  values: {
    readonly clientName: string;
    readonly clientPhone: string;
    readonly deadline: string;
    readonly items: readonly DraftItem[];
    /** Пошив для склада — клиента нет, и его поля не проверяются. */
    readonly skipClient: boolean;
  },
  m: Translate,
): Partial<Record<'clientName' | 'clientPhone' | 'deadline', string>> {
  const errors: Record<string, string> = {};

  if (!values.skipClient) {
    if (values.clientName.trim() === '') {
      errors['clientName'] = m('create.nameRequired');
    }

    // Только длина: приведение номера к единому виду делает сервер, и
    // повторять здесь его правила означало бы разойтись с ними при первой правке.
    const digits = values.clientPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      errors['clientPhone'] = m('create.phoneIncomplete');
    }
  }

  if (values.deadline.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline.trim())) {
    errors['deadline'] = m('dayoff.dateFormat');
  }

  return errors;
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

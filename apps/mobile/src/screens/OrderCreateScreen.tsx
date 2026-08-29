import {
  ORDER_ITEM_KIND_LABELS,
  ORDER_ITEM_KINDS,
  PRIORITIES,
  PRIORITY_LABELS,
  type OrderItemKind,
  type Priority,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
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

import { Card, CardTitle } from '../components/Card';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Создание заказа с телефона.
 *
 * Раньше заказ можно было завести только в веб-панели, хотя сервер разрешает
 * это продавцу (`orders.create` — процедура уровня приёмки). Продавец при
 * этом работает у клиента дома, с телефоном в руках, и возвращаться к
 * компьютеру ради ввода заказа — ровно тот шаг, из-за которого данные
 * попадают в систему вечером и по памяти.
 *
 * Форма НАМЕРЕННО короче панельной. Сервер требует всего три вещи: имя
 * клиента, телефон и хотя бы одну позицию; остальное необязательно и
 * дозаполняется в панели. Переносить на экран телефона все двадцать полей
 * позиции — верный способ, чтобы ей не пользовались.
 *
 * Филиал не спрашивается: сервер берёт основной филиал сотрудника. Если он
 * не задан, придёт понятный отказ — выдумывать выбор из филиалов, к которым
 * продавец не привязан, незачем.
 */

/** Позиция заказа в форме. Идентификатор нужен только для ключа списка. */
interface DraftItem {
  readonly id: number;
  readonly kind: OrderItemKind;
  readonly model: string;
  readonly dimensions: string;
  readonly quantity: string;
  readonly comment: string;
}

const emptyItem = (id: number): DraftItem => ({
  id,
  kind: 'window',
  model: '',
  dimensions: '',
  quantity: '1',
  comment: '',
});

export function OrderCreateScreen(): ReactElement {
  const { t } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deadline, setDeadline] = useState('');
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [showErrors, setShowErrors] = useState(false);

  const create = trpc.orders.create.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      // Уходим сразу в карточку: следующий шаг продавца — приложить фото
      // и отправить заказ админу, и оба действия там.
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert('Заказ не создан', error.message);
    },
  });

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const errors = validate({ clientName, clientPhone, deadline });
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    create.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      priority,
      ...(installAddress.trim() === '' ? {} : { installAddress: installAddress.trim() }),
      ...(deadline.trim() === '' ? {} : { deadline: deadline.trim() }),
      workPrice: toMoney(workPrice),
      deposit: toMoney(deposit),
      items: items.map((item) => ({
        kind: item.kind,
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        ...(item.dimensions.trim() === '' ? {} : { dimensions: item.dimensions.trim() }),
        ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
      })),
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

          <Field label="Адрес установки">
            <Input
              value={installAddress}
              onChangeText={setInstallAddress}
              placeholder="Улица, дом, квартира"
              multiline
            />
          </Field>
        </Card>

        <Card>
          <CardTitle title="Условия" icon="deadline" />

          <Field label="Приоритет">
            <ChipSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS, value) }))}
            />
          </Field>

          <Field
            label="Срок"
            hint="Год-месяц-день, например 2026-09-15"
            error={showErrors ? errors.deadline : undefined}
          >
            <Input
              value={deadline}
              onChangeText={setDeadline}
              placeholder="2026-09-15"
              keyboardType="numbers-and-punctuation"
              invalid={showErrors && errors.deadline !== undefined}
            />
          </Field>

          <View style={styles.money}>
            <View style={styles.moneyItem}>
              <Field label="Стоимость работ">
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

            <Field label="Что шьём">
              <ChipSelect
                value={item.kind}
                onChange={(kind) => {
                  updateItem(item.id, { kind });
                }}
                options={ORDER_ITEM_KINDS.map((value) => ({
                  value,
                  label: t(ORDER_ITEM_KIND_LABELS, value),
                }))}
              />
            </Field>

            <Field label="Модель">
              <Input
                value={item.model}
                onChangeText={(model) => {
                  updateItem(item.id, { model });
                }}
                placeholder="Например, «Римская штора»"
              />
            </Field>

            <View style={styles.money}>
              <View style={styles.moneyItem}>
                <Field label="Размер" hint="Ширина на высоту, см">
                  <Input
                    value={item.dimensions}
                    onChangeText={(dimensions) => {
                      updateItem(item.id, { dimensions });
                    }}
                    placeholder="150x200"
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

        <Pressable
          onPress={submit}
          disabled={create.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            create.isPending ? styles.submitBusy : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>Создать заказ</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Заказ уйдёт администратору на проверку. Фотографии замера и остальные детали
          можно добавить в карточке заказа.
        </Text>
      </ScrollView>
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
function validate(values: {
  readonly clientName: string;
  readonly clientPhone: string;
  readonly deadline: string;
}): Partial<Record<'clientName' | 'clientPhone' | 'deadline', string>> {
  const errors: Record<string, string> = {};

  if (values.clientName.trim() === '') {
    errors['clientName'] = 'Укажите имя клиента';
  }

  // Только длина: приведение номера к единому виду делает сервер, и
  // повторять здесь его правила означало бы разойтись с ними при первой правке.
  const digits = values.clientPhone.replace(/\D/g, '');
  if (digits.length < 9) {
    errors['clientPhone'] = 'Похоже, номер неполный';
  }

  if (values.deadline.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline.trim())) {
    errors['deadline'] = 'Дата в виде 2026-09-15';
  }

  return errors;
}

/** Сумма из поля ввода. Пустое поле — ноль, а не отказ. */
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
  quantityItem: {
    width: 96,
  },
  remove: {
    ...typography.caption,
    color: colors.danger,
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

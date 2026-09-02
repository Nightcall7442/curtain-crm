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
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Продажа готовых штор — товар с витрины, минуя цех.
 *
 * У мастерской два разных бизнеса: пошив на заказ (полный конвейер —
 * замер, раскрой, шитьё, контроль) и готовые шторы, которые продавец
 * отдаёт клиенту сразу. Цикл цеха здесь не нужен вовсе, поэтому форма
 * не спрашивает ни модели изделия из каталога, ни этапов — только то,
 * что нужно для продажи и, при необходимости, для установки.
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
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [comment, setComment] = useState('');
  const [needsInstallation, setNeedsInstallation] = useState<'no' | 'yes'>('no');
  const [installAddress, setInstallAddress] = useState('');
  const [installationFee, setInstallationFee] = useState('');
  const [showErrors, setShowErrors] = useState(false);

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
      quantity: Math.max(1, Number.parseInt(quantity, 10) || 1),
      needsInstallation: needsInstallation === 'yes',
      ...(model.trim() === '' ? {} : { model: model.trim() }),
      ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
      ...(needsInstallation === 'yes'
        ? {
            installAddress: installAddress.trim(),
            installationFee: toMoney(installationFee),
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

        <Card>
          <CardTitle title="Товар" icon="window" />

          <Field label="Что продано" hint="Например, «Готовый комплект, бежевый»">
            <Input value={model} onChangeText={setModel} placeholder="Модель или описание" />
          </Field>

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
            <View style={styles.quantityItem}>
              <Field label="Кол-во">
                <Input
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </Field>
            </View>
          </View>

          <Field label="Комментарий">
            <Input
              value={comment}
              onChangeText={setComment}
              placeholder="Что важно помнить по этой продаже"
              multiline
            />
          </Field>
        </Card>

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

              {/*
                Единственная из четырёх расценок, применимая к готовым шторам:
                ни замера, ни пошива, ни контроля здесь нет. Стоит рядом с
                адресом — оба поля появляются по одному ответу «да» и
                описывают одну и ту же работу.
              */}
              <Field label="За установку, сум" hint="Сколько получит установщик">
                <Input
                  value={installationFee}
                  onChangeText={setInstallationFee}
                  placeholder="0"
                  keyboardType="numeric"
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
  quantityItem: {
    width: 80,
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

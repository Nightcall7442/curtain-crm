import { formatMoney, parseMoney, Role, todayIso } from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Card, CardTitle } from './Card';
import { Field, MoneyInput } from './Field';
import { Icon } from './Icon';

/**
 * Инкассация: наличные на руках у сотрудника и кнопка «сдал в кассу».
 *
 * Продавец и установщик принимают наличные от клиентов; пока они не
 * сданы, они «на руках» и в кассе не считаются. Сумму сотрудник пишет
 * сам — сдаёт то, что в кармане, а не то, что насчитала система. Ниже —
 * сколько уже сдано сегодня, чтобы не сдавать дважды.
 *
 * Сдать можно только с фото фискального чека: так решил владелец — инкассация
 * идёт с чеком для налоговой. Чек пробивает онлайн-касса, сюда попадает его
 * снимок, и без него кнопка «сдал» не срабатывает — проверяет и сервер.
 *
 * Сдаёт продавец: ему карточка показывается всегда (живёт в «Кассе», рядом с
 * продажей), «на руках 0» тоже ответ. Руководству сдавать некому — принятые
 * директором наличные и есть касса, сервер отдаёт ему «на руках 0», и
 * карточка не рисуется; свой контроль у него в кассе дня. Остальным — только
 * если у них что-то на руках: установщик принимает остаток у клиента по
 * своему заказу, и эти деньги должны быть сданы, а не повиснуть на нём без
 * кнопки «сдал».
 */
export function CashCollectionCard(): ReactElement | null {
  const { m } = useLocale();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const handlesCash = (user?.roles ?? []).includes(Role.SELLER);
  const today = todayIso();
  const onHands = trpc.payments.onHands.useQuery();
  const collections = trpc.payments.collections.useQuery({ day: today });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<{ uri: string; base64: string; mimeType: string } | null>(
    null,
  );

  const pickReceipt = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(m('photo.noAccess'), fromCamera ? m('photo.allowCamera') : m('photo.allowGallery'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      exif: false,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
      return;
    }
    setReceipt({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const collect = trpc.payments.collect.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setAmount('');
      setReceipt(null);
      await Promise.all([utils.payments.onHands.invalidate(), utils.payments.collections.invalidate()]);
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const onHandsValue = onHands.data === undefined ? 0 : parseMoney(onHands.data.onHands);
  const todayTotal = collections.data === undefined ? 0 : parseMoney(collections.data.total);
  if (!handlesCash && onHandsValue === 0 && todayTotal === 0) return null;

  return (
    <Card>
      <CardTitle title={m('collection.title')} icon="paid" />
      <View style={styles.row}>
        <Text style={styles.label}>{m('collection.onHands')}</Text>
        <Text style={styles.value}>{formatMoney(onHandsValue)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{m('collection.todayTotal')}</Text>
        <Text style={styles.value}>{formatMoney(todayTotal)}</Text>
      </View>

      {onHandsValue > 0 && (
        <Pressable
          onPress={() => {
            setAmount(String(onHandsValue / 100));
            setOpen(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.accent} />
          <Text style={styles.buttonText}>{m('collection.create')}</Text>
        </Pressable>
      )}

      <BottomSheet
        visible={open}
        title={m('collection.create')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field label={m('payment.amount')} hint={m('collection.onHandsHint', { sum: formatMoney(onHandsValue) })}>
          <MoneyInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>

        {/* Чек с онлайн-кассы — обязателен: без снимка кнопка не активна. */}
        <Field label={m('collection.receipt')} required hint={m('collection.receiptHint')}>
          <View style={styles.photoRow}>
            {receipt === null ? (
              <Text style={styles.photoHint}>{m('collection.noReceipt')}</Text>
            ) : (
              <Image source={{ uri: receipt.uri }} style={styles.photoPreview} />
            )}
            <Pressable
              onPress={() => {
                void pickReceipt(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.camera')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="camera" size={18} color={colors.accentStrong} />
            </Pressable>
            <Pressable
              onPress={() => {
                void pickReceipt(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.gallery')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="photo" size={18} color={colors.accentStrong} />
            </Pressable>
          </View>
        </Field>

        <Pressable
          onPress={() => {
            if (receipt === null) return;
            collect.mutate({
              amount: toMajor(amount),
              receipt: { mimeType: receipt.mimeType, content: receipt.base64 },
            });
          }}
          disabled={collect.isPending || toMajor(amount) <= 0 || receipt === null}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            pressed ? styles.pressed : null,
            receipt === null || toMajor(amount) <= 0 ? styles.submitDisabled : null,
          ]}
        >
          {collect.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>{m('collection.confirm')}</Text>
          )}
        </Pressable>
      </BottomSheet>
    </Card>
  );
}

function toMajor(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.value,
    color: colors.textPrimary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  submit: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: {
    opacity: opacity.disabled,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoHint: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    marginRight: 'auto',
  },
  photoButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
});

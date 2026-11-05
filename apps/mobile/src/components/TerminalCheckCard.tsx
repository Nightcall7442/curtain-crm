import {
  formatTime,
  inputToMajor,
  ORDER_INTAKE_ROLES,
  parseMoney,
  TERMINAL_PAY_TYPE_LABELS,
  TERMINAL_PAY_TYPES,
  type TerminalPayType,
} from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { ShiftRequiredBanner, useNeedsShift } from './ShiftRequiredBanner';
import { SubmitButton } from './SubmitButton';
import { Card, CardTitle, ErrorState } from './Card';
import { Field, Input, MoneyInput } from './Field';
import { Icon } from './Icon';
import { PayTypeBadge } from './PayTypeBadge';
import { TerminalDaySummary } from './TerminalDaySummary';

/**
 * Терминальные чеки — задание продавцов на день.
 *
 * Три чека на терминале за день на всех продавцов, каждый с фото. Карточка
 * живёт в «Работе»: это такая же обязанность, как заказ, а не касса —
 * владелец отдельно сказал, что к наличным и инкассации чек не привязан.
 *
 * Счётчик общий: пробил один — у всех «2 из 3». Кто и когда — списком, чтобы
 * не пробить лишний и не спорить, чей был второй.
 */
export function TerminalCheckCard(): ReactElement {
  const { m, money, locale } = useLocale();
  const needsShift = useNeedsShift();
  const utils = trpc.useUtils();
  const today = trpc.terminalChecks.today.useQuery();
  const { user } = useAuth();
  // Чек без прихода заводят те, кто принимает заказы; фото к своему приходу — любой.
  const canCreate = (user?.roles ?? []).some((role) => ORDER_INTAKE_ROLES.includes(role));

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  /** Чем заплатил клиент — спрашивается у каждого нового чека (заказчик, 05.11). */
  const [payType, setPayType] = useState<TerminalPayType | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(
    null,
  );
  /** Приход по карте, к которому прикрепляем фото; `null` — чек без прихода. */

  const pickPhoto = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        m('photo.noAccess'),
        fromCamera ? m('photo.allowCamera') : m('photo.allowGallery'),
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      // Массив типов, а не `MediaTypeOptions`: тот объявлен устаревшим и на каждый выбор пишет предупреждение.
      mediaTypes: ['images'],
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
    setPhoto({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const create = trpc.terminalChecks.create.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setPhoto(null);
      setAmount('');
      setComment('');
      setPayType(null);
      await Promise.all([utils.terminalChecks.today.invalidate(), utils.terminalChecks.byDay.invalidate()]);
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const data = today.data;
  const done = data !== undefined && data.remaining === 0;

  return (
    <Card>
      <CardTitle title={m('terminal.title')} icon="paid" />
      {/*
        Ошибка — отдельно от загрузки. Раньше `data === undefined` означало
        только «грузится», и при сбое карточка крутила индикатор вечно, хотя
        список заказов под ней уже честно писал «Не удалось загрузить».
      */}
      {data === undefined ? (
        today.isError ? (
          <ErrorState />
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )
      ) : (
        <>
          <View style={styles.progressRow}>
            <Text style={[styles.count, done ? styles.countDone : null]}>
              {m('terminal.progress', { n: data.count, target: data.target })}
            </Text>
            <Text style={styles.remaining}>
              {done ? m('terminal.done') : m('terminal.remaining', { n: data.remaining })}
            </Text>
          </View>
          <View style={styles.dots}>
            {Array.from({ length: data.target }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, index < data.count ? styles.dotFilled : null]}
              />
            ))}
          </View>

          {/*
            Строка — пробитый чек: кто, на сколько, когда. Приходов по карте
            здесь больше нет: чек и касса — разные вещи, и прикреплять фото
            к оплате незачем.
          */}
          {/*
            Две строки на чек, как в карточке «Терминал» на главной: сверху
            кто и когда, снизу чем и сколько. В одну строку имя ужималось до
            «Фар…», а значки и суммы вставали каждый на своём месте — колонок
            не получалось.
          */}
          {data.rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.rowLine}>
                <Text style={styles.rowName}>{row.fullName}</Text>
                <View style={styles.rowWhen}>
                  <Text style={styles.rowTime}>{formatTime(row.createdAt)}</Text>
                  <Icon name="completed" size={16} color={colors.textMuted} />
                </View>
              </View>
              <View style={styles.rowLine}>
                <PayTypeBadge type={row.payType} />
                <Text style={styles.rowAmount}>{money(parseMoney(row.amount))}</Text>
              </View>
            </View>
          ))}

          {data.summary != null && data.summary.count > 0 && (
            <TerminalDaySummary summary={data.summary} title={m('terminal.todayTotal')} />
          )}
          {canCreate && (
            <Pressable
              onPress={() => {
                // Каждый чек — с чистого листа: тип, фото и сумма от
                // брошенной попытки не должны уйти со следующим клиентом.
                setAmount('');
                setPayType(null);
                setPhoto(null);
                setComment('');
                setOpen(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
            >
              <Icon name="camera" size={18} color={colors.accent} />
              <Text style={styles.buttonText}>{m('terminal.create')}</Text>
            </Pressable>
          )}
        </>
      )}

      <BottomSheet
        visible={open}
        title={m('terminal.create')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field label={m('terminal.photo')} required hint={m('terminal.photoHint')}>
          <View style={styles.photoRow}>
            {photo === null ? (
              <Text style={styles.photoHint}>{m('terminal.noPhoto')}</Text>
            ) : (
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            )}
            <Pressable
              onPress={() => {
                void pickPhoto(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.camera')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="camera" size={18} color={colors.accentStrong} />
            </Pressable>
            <Pressable
              onPress={() => {
                void pickPhoto(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.gallery')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="photo" size={18} color={colors.accentStrong} />
            </Pressable>
          </View>
        </Field>
        <Field label={m('terminal.payType')} required hint={m('terminal.payTypeHint')}>
          <View style={styles.typeGrid} accessibilityRole="radiogroup">
            {TERMINAL_PAY_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setPayType(type);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: payType === type }}
                accessibilityLabel={TERMINAL_PAY_TYPE_LABELS[locale][type]}
                style={({ pressed }) => [
                  styles.typeTile,
                  payType === type ? styles.typeTileActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <PayTypeBadge type={type} size="lg" />
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label={m('terminal.amount')} required>
          <MoneyInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        <Field label={m('terminal.comment')}>
          <Input
            value={comment}
            onChangeText={setComment}
            placeholder={m('terminal.commentPlaceholder')}
          />
        </Field>
        {/* Без смены чек не примут (412): баннер объясняет погашенную кнопку. */}
        <ShiftRequiredBanner style={styles.shiftBanner} />
        <SubmitButton
          label={m('terminal.submit')}
          onPress={() => {
            if (photo === null || payType === null) return;
            create.mutate({
              photo: { mimeType: photo.mimeType, content: photo.base64 },
              amount: inputToMajor(amount),
              payType,
              comment: comment.trim() === '' ? null : comment.trim(),
            });
          }}
          disabled={photo === null || payType === null || inputToMajor(amount) <= 0 || needsShift}
          pending={create.isPending}
        />
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  // В шторке у полей свой нижний отступ, у баннера — этот: до кнопки тот же шаг.
  shiftBanner: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  /*
    Две плитки в ряд, а не три.

    В трети ряда (104 px на экране 360) значок «Наличные» — купюра и слово
    — не помещался: он шире плитки на 11 px и вылезал на её рамку с обеих
    сторон. Ширина значка задана его словом, и ужимать слово нельзя.
    Базовая ширина меньше половины, добор до края делает `flexGrow`, —
    так же собраны плитки на главной.
  */
  typeTile: {
    flexBasis: '40%',
    flexGrow: 1,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeTileActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  loader: {
    paddingVertical: spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  count: {
    ...typography.title,
    color: colors.textPrimary,
  },
  countDone: {
    color: colors.positive,
  },
  remaining: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  row: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.body,
    color: colors.textPrimary,
    // Имя переносится, а не обрезается: кто пробил чек — главное в строке.
    flexShrink: 1,
    minWidth: 0,
  },
  rowWhen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowAmount: {
    ...typography.value,
    color: colors.textPrimary,
    // Значка у старого чека может не быть — сумма всё равно у правого края.
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  rowTime: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  /* Та же высота и скругление, что у кнопок «Новый заказ», «Касса» на этом экране. */
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    ...typography.body,
    // Вес — семейством: `fontWeight` поверх Medium в браузере дорисовывается грубым жирным.
    fontFamily: fonts.semibold,
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
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

import type { ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Skeleton } from './Card';
import { Icon } from './Icon';
import { useNeedsShift } from './ShiftRequiredBanner';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

/**
 * Сбор на выезд — на телефоне, у машины.
 *
 * Именно здесь список и нужен: установщик грузит машину, а не сидит за
 * панелью. Забытый держатель — это второй выезд через весь город, и
 * вспоминают о нём уже у клиента.
 *
 * Пока не отмечено всё, заказ не уйдёт в «Установка идёт»: проверку держит
 * сервер, поэтому обойти список, не открывая его, не получится.
 */
export function OrderPackList({ orderId }: { readonly orderId: number }): ReactElement | null {
  const { m } = useLocale();
  const needsShift = useNeedsShift();
  const utils = trpc.useUtils();
  const rows = trpc.orders.packList.useQuery({ id: orderId });

  const setPacked = trpc.orders.setPacked.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.orders.packList.invalidate({ id: orderId });
    },
    onError(error) {
      notifyError();
      Alert.alert(m('pack.error'), error.message);
    },
  });

  if (rows.isLoading) return <Skeleton />;

  const items = rows.data ?? [];
  // Собирать нечего — карточки нет.
  if (items.length === 0) return null;

  const packed = items.filter((row) => row.checked).length;
  const ready = packed === items.length;

  return (
    <Card>
      <CardTitle
        title={m('pack.title')}
        icon="orders"
        action={
          <Text style={[styles.counter, ready ? styles.counterReady : null]}>
            {ready ? m('pack.ready') : m('pack.count', { a: packed, b: items.length })}
          </Text>
        }
      />

      {items.map((row, index) => (
        <Pressable
          key={row.key}
          onPress={() => {
            setPacked.mutate({ id: orderId, key: row.key, packed: !row.checked });
          }}
          disabled={setPacked.isPending || needsShift}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.checked, disabled: needsShift }}
          accessibilityLabel={row.label}
          /*
            Черта — сверху каждой строки, кроме первой: под последней она
            висела бы над подсказкой и низом карточки, ничего не разделяя.
          */
          style={({ pressed }) => [
            styles.row,
            index === 0 ? null : styles.rowDivided,
            pressed ? styles.pressed : null,
            // Без смены отметку не сохранят (412): строки гаснут, как погашенная кнопка.
            needsShift ? styles.off : null,
          ]}
        >
          {/*
            Квадрат — по центру ПЕРВОЙ строки подписи: ячейка высотой в
            строку (21), квадрат в ней посередине. С отступом сверху в 1
            точку он стоял на полторы ниже середины строки.

            Птичка — значок набора, а не символ «✓»: тот брался из
            системного шрифта и на Android, в Chrome и в Safari был разной
            толщины и сидел в квадрате по-разному.
          */}
          <View style={styles.boxSlot}>
            <View style={[styles.box, row.checked ? styles.boxChecked : null]}>
              {row.checked && <Icon name="check" size={TICK_SIZE} color={colors.onAccent} />}
            </View>
          </View>

          <View style={styles.text}>
            <Text style={[styles.label, row.checked ? styles.labelChecked : null]}>
              {row.label}
            </Text>
            {row.detail !== null && <Text style={styles.detail}>{row.detail}</Text>}
            {row.checkedBy !== null && (
              <Text style={styles.detail}>{m('pack.checkedBy', { name: row.checkedBy })}</Text>
            )}
          </View>
        </Pressable>
      ))}

      {/* Собранному заказу напоминание про «не уйдёт» уже ни к чему. */}
      {!ready && (
        <Text style={styles.note}>{m('pack.note')}</Text>
      )}
    </Card>
  );
}

/**
 * Квадрат отметки. Скругление — меньше токена `radius.sm` (10): на стороне
 * 22 оно превращало квадрат в кружок, и список читался как выбор одного
 * варианта из многих, а не как отметки.
 */
const CHECKBOX_SIZE = 22;
const CHECKBOX_RADIUS = 6;
/**
 * Птичка в квадрате. У глифа набора свои поля внутри, поэтому 16 в
 * квадрате 22 на глаз дают те же поля, что и рамка вокруг: при 14 птичка
 * выходила тоньше, чем прежний символ «✓».
 */
const TICK_SIZE = 16;

const styles = StyleSheet.create({
  off: {
    opacity: opacity.disabled,
  },
  counter: {
    ...typography.footnote,
    // Начертанием, а не `fontWeight` поверх Medium: браузер рисовал ложный полужирный.
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  counterReady: {
    color: colors.positive,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivided: {
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  boxSlot: {
    height: typography.body.lineHeight,
    justifyContent: 'center',
  },
  box: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: CHECKBOX_RADIUS,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  text: {
    flex: 1,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
  },
  labelChecked: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  detail: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  note: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});

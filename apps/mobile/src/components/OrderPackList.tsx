import type { ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Skeleton } from './Card';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

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
  const utils = trpc.useUtils();
  const rows = trpc.orders.packList.useQuery({ id: orderId });

  const setPacked = trpc.orders.setPacked.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.orders.packList.invalidate({ id: orderId });
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось отметить', error.message);
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
        title="Сбор на выезд"
        icon="orders"
        action={
          <Text style={[styles.counter, ready ? styles.counterReady : null]}>
            {ready ? 'Всё в машине' : `${packed.toString()} из ${items.length.toString()}`}
          </Text>
        }
      />

      {items.map((row) => (
        <Pressable
          key={row.key}
          onPress={() => {
            setPacked.mutate({ id: orderId, key: row.key, packed: !row.checked });
          }}
          disabled={setPacked.isPending}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.checked }}
          accessibilityLabel={row.label}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          {/* Галочка нарисована рамкой и заливкой, без значка из набора:
              квадрат с птичкой и так читается, а лишний глиф в списке из
              пятнадцати строк — рябь. */}
          <View style={[styles.box, row.checked ? styles.boxChecked : null]}>
            {row.checked && <Text style={styles.tick}>✓</Text>}
          </View>

          <View style={styles.text}>
            <Text style={[styles.label, row.checked ? styles.labelChecked : null]}>
              {row.label}
            </Text>
            {row.detail !== null && <Text style={styles.detail}>{row.detail}</Text>}
            {row.checkedBy !== null && (
              <Text style={styles.detail}>{`Отметил: ${row.checkedBy}`}</Text>
            )}
          </View>
        </Pressable>
      ))}

      <Text style={styles.note}>
        Пока отмечено не всё, заказ не уйдёт в «Установка идёт».
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  counter: {
    ...typography.footnote,
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
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tick: {
    ...typography.footnote,
    color: colors.onAccent,
    fontWeight: '700',
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

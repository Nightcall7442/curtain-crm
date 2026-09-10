import {
  STOCK_KIND_LABELS_RU,
  STOCK_KINDS,
  stockUnitLabel,
  type StockKind,
} from '@curtain-crm/shared';
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

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { CodeScanner } from '../components/CodeScanner';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Склад с телефона: что лежит в цехе и сколько.
 *
 * Ткани, карнизы, пластик, трубы и аксессуары — одним списком: кладовщик
 * ходит вдоль одних и тех же полок.
 *
 * Позиция — это код с бирки, мини-описание и остаток. Прихода как отдельного
 * действия нет: пришла партия — остаток пересчитывают. Расход система
 * списывает сама, когда заказ уходит в пошив.
 *
 * Отрицательный остаток показан красным и ошибкой не считается: то, что
 * забыли завести, всё равно раскроили.
 */

/** Количество строкой: «12,5» и «12.5» набирают одинаково часто. */
const toQuantity = (raw: string): number => Number.parseFloat(raw.replace(',', '.'));

const showQuantity = (raw: string, kind: StockKind): string =>
  `${Number.parseFloat(raw).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${stockUnitLabel(kind)}`;

export function FabricStockScreen({
  header,
}: {
  /** Переключатель разделов сверху — его рисует экран закупочных материалов. */
  readonly header?: ReactElement;
} = {}): ReactElement {
  const utils = trpc.useUtils();

  /** Позиция, которой правят остаток пересчётом. `null` — никакая. */
  const [counting, setCounting] = useState<number | null>(null);
  const [countValue, setCountValue] = useState('');

  /** Открыта карточка позиции: `null` — новая, число — правка. */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [kind, setKind] = useState<StockKind>('portiere_code');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('0');

  const rows = trpc.fabric.list.useQuery({});

  const refresh = async (): Promise<void> => {
    await utils.fabric.list.invalidate();
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    setCode('');
    setDescription('');
    setQuantity('0');
  };

  const create = trpc.fabric.create.useMutation({
    async onSuccess(row) {
      notifySuccess();
      closeForm();
      await refresh();
      Alert.alert('Позиция заведена', row.code);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось завести позицию', error.message);
    },
  });

  const update = trpc.fabric.update.useMutation({
    async onSuccess(row) {
      notifySuccess();
      closeForm();
      await refresh();
      Alert.alert('Сохранено', row.code);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось сохранить', error.message);
    },
  });

  const setQuantityMutation = trpc.fabric.setMeters.useMutation({
    async onSuccess(row) {
      notifySuccess();
      setCounting(null);
      setCountValue('');
      await refresh();
      Alert.alert('Остаток обновлён', row.code);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось обновить остаток', error.message);
    },
  });

  if (rows.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={rows.error.message} />
      </View>
    );
  }

  const all = rows.data ?? [];
  const needle = search.trim().toLowerCase();
  const items =
    needle === ''
      ? all
      : all.filter((row) =>
          [row.code, row.description ?? ''].some((field) => field.toLowerCase().includes(needle)),
        );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <Card>
          <CardTitle
            title="Склад"
            icon="window"
            action={
              formOpen ? undefined : (
                <Pressable
                  onPress={() => {
                    setEditingId(null);
                    setCode('');
                    setDescription('');
                    setQuantity('0');
                    setFormOpen(true);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.addButtonText}>Позиция</Text>
                </Pressable>
              )
            }
          />

          {formOpen && (
            <>
              {/* Вид у заведённой позиции не меняется: это другой остаток. */}
              {editingId === null && (
                <Field label="Что это">
                  <ChipSelect
                    value={kind}
                    onChange={setKind}
                    options={STOCK_KINDS.map((value) => ({
                      value,
                      label: STOCK_KIND_LABELS_RU[value],
                    }))}
                  />
                </Field>
              )}

              <Field label="Код с бирки" hint="Наберите или отсканируйте">
                <View style={styles.codeRow}>
                  <View style={styles.codeInput}>
                    <Input value={code} onChangeText={setCode} placeholder="Например: П-31" />
                  </View>
                  {/*
                    Рулон с биркой в руках — сканер здесь уместнее всего: код
                    попадает на склад тем же, каким его потом считает продавец
                    в заказе.
                  */}
                  <Pressable
                    onPress={() => {
                      setScanning(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Считать код камерой"
                    style={({ pressed }) => [styles.scanButton, pressed ? styles.pressed : null]}
                  >
                    <Icon name="camera" size={18} color={colors.accent} />
                  </Pressable>
                </View>
              </Field>

              <Field label="Мини-описание" hint="Чем эта партия отличается">
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Например: тёмная сторона, плотный"
                  multiline
                />
              </Field>

              {editingId === null && (
                <Field label={`Остаток, ${stockUnitLabel(kind)}`}>
                  <Input
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                  />
                </Field>
              )}

              <View style={styles.formRow}>
                <Pressable
                  onPress={closeForm}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (code.trim() === '') return;
                    const card = {
                      code: code.trim(),
                      description: description.trim() === '' ? null : description.trim(),
                    };

                    if (editingId === null) {
                      create.mutate({ ...card, kind, quantity: toQuantity(quantity) || 0 });
                    } else {
                      update.mutate({ id: editingId, ...card });
                    }
                  }}
                  disabled={create.isPending || update.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.submit,
                    styles.submitFlex,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {create.isPending || update.isPending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.submitText}>
                      {editingId === null ? 'Завести' : 'Сохранить'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}

          {/*
            Поиск появляется, когда позиций становится много: на пяти строках
            он лишний ряд, на сорока — единственный способ найти нужную.
          */}
          {all.length > 8 && (
            <View style={styles.search}>
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Поиск по коду или описанию"
              />
            </View>
          )}

          {rows.data === undefined ? (
            <Skeleton />
          ) : items.length === 0 ? (
            <Empty
              message={all.length === 0 ? 'Склад пуст' : 'Ничего не нашлось'}
              hint={all.length === 0 ? 'Заведите первую позицию' : 'Проверьте код'}
            />
          ) : (
            items.map((row) => {
              const rowKind = row.kind as StockKind;
              const left = Number.parseFloat(row.meters);

              return (
                <View key={row.id}>
                  <Pressable
                    onPress={() => {
                      setCounting(counting === row.id ? null : row.id);
                      setCountValue(left.toString());
                    }}
                    onLongPress={() => {
                      create.reset();
                      update.reset();
                      setEditingId(row.id);
                      setKind(rowKind);
                      setCode(row.code);
                      setDescription(row.description ?? '');
                      setFormOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Пересчитать «${row.code}», долгое нажатие — правка`}
                    style={({ pressed }) => [styles.itemRow, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.itemText}>
                      <Text style={styles.itemName}>{row.code}</Text>
                      <Text style={styles.itemMeta} numberOfLines={2}>
                        {`${STOCK_KIND_LABELS_RU[rowKind]}${
                          row.description === null ? '' : ` · ${row.description}`
                        }`}
                      </Text>
                    </View>
                    <Text style={[styles.itemMeters, left < 0 ? styles.itemDebt : null]}>
                      {showQuantity(row.meters, rowKind)}
                    </Text>
                  </Pressable>

                  {counting === row.id && (
                    <View style={styles.countBox}>
                      <Field label="Сколько намерили" hint="Число «сколько стало»">
                        <Input
                          value={countValue}
                          onChangeText={setCountValue}
                          keyboardType="numbers-and-punctuation"
                          autoFocus
                        />
                      </Field>

                      <Pressable
                        onPress={() => {
                          const value = toQuantity(countValue);
                          if (!Number.isFinite(value)) return;
                          setQuantityMutation.mutate({ id: row.id, meters: value });
                        }}
                        disabled={setQuantityMutation.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
                      >
                        {setQuantityMutation.isPending ? (
                          <ActivityIndicator color={colors.onAccent} size="small" />
                        ) : (
                          <Text style={styles.submitText}>Сохранить остаток</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Text style={styles.note}>
            Расход списывается сам, когда заказ уходит в пошив: раскроили — значит, ушло.
            Долгое нажатие на позицию — правка кода и описания.
          </Text>
        </Card>
      </ScrollView>

      <CodeScanner
        visible={scanning}
        label="Код с бирки"
        onScan={setCode}
        onClose={() => {
          setScanning(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: tabBarSpace,
    gap: spacing.md,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  search: {
    marginTop: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  itemMeta: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  itemMeters: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  itemDebt: {
    color: colors.danger,
  },
  countBox: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  addButton: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    ...typography.footnote,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  submit: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitFlex: {
    flex: 1,
  },
  submitText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
  cancel: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
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

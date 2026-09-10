import { STOCK_KIND_LABELS_RU, STOCK_KINDS, type StockKind } from '@curtain-crm/shared';
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
 * Склад с телефона: какие коды бывают и что за ними стоит.
 *
 * Метров здесь нет. Учёт остатков не поспевал за полкой — владелец попросил
 * убрать приход, расход и списание, — и склад остался тем, ради чего его
 * открывают у стеллажа: код с бирки и мини-описание к нему.
 *
 * Тот же список продавец видит в заказе, когда вводит код: описание, которое
 * кладовщик написал здесь, появляется у продавца сразу после ввода.
 */

/** Фильтр по видам: «Все» и виды складских кодов. */
type Filter = StockKind | 'all';

export function FabricStockScreen({
  header,
}: {
  /** Переключатель разделов сверху — его рисует экран закупочных материалов. */
  readonly header?: ReactElement;
} = {}): ReactElement {
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  /** Открыта карточка кода: `null` — заводится новый, число — правка. */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<StockKind>('portiere_code');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [scanning, setScanning] = useState(false);

  const rows = trpc.catalog.list.useQuery({ includeInactive: false });

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    setCode('');
    setDescription('');
  };

  const done = async (title: string, name: string): Promise<void> => {
    notifySuccess();
    closeForm();
    await utils.catalog.list.invalidate();
    Alert.alert(title, name);
  };

  const create = trpc.catalog.create.useMutation({
    onSuccess: (row) => void done('Код заведён', row.name),
    onError(error) {
      notifyError();
      Alert.alert('Не удалось завести код', error.message);
    },
  });

  const update = trpc.catalog.update.useMutation({
    onSuccess: (row) => void done('Сохранено', row.name),
    onError(error) {
      notifyError();
      Alert.alert('Не удалось сохранить', error.message);
    },
  });

  if (rows.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={rows.error.message} />
      </View>
    );
  }

  const all = (rows.data ?? []).filter((row) => (STOCK_KINDS as readonly string[]).includes(row.kind));
  const needle = search.trim().toLowerCase();

  const items = all.filter((row) => {
    const byKind = filter === 'all' || row.kind === filter;
    const byText =
      needle === '' ||
      [row.name, row.description ?? ''].some((field) => field.toLowerCase().includes(needle));
    return byKind && byText;
  });

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
                    create.reset();
                    update.reset();
                    closeForm();
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
              {/* Вид у заведённого кода не меняется: это другой справочник. */}
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

              <Field label="Мини-описание" hint="Его увидит продавец сразу после ввода кода">
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Например: тёмная сторона, плотный"
                  multiline
                />
              </Field>

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
                    const name = code.trim();
                    if (name === '') return;
                    const card = {
                      name,
                      description: description.trim() === '' ? null : description.trim(),
                    };

                    if (editingId === null) {
                      create.mutate({ ...card, kind });
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

          <Field label="Что смотрим">
            <ChipSelect
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Все' },
                ...STOCK_KINDS.map((value) => ({
                  value,
                  label: STOCK_KIND_LABELS_RU[value],
                })),
              ]}
            />
          </Field>

          {/*
            Поиск появляется, когда кодов становится много: на пяти строках он
            лишний ряд, на сорока — единственный способ найти нужный.
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
              message={all.length === 0 ? 'Кодов пока нет' : 'Ничего не нашлось'}
              hint={all.length === 0 ? 'Заведите первый — его увидит продавец' : 'Проверьте код'}
            />
          ) : (
            items.map((row) => (
              <Pressable
                key={row.id}
                onLongPress={() => {
                  create.reset();
                  update.reset();
                  setEditingId(row.id);
                  setKind(row.kind as StockKind);
                  setCode(row.name);
                  setDescription(row.description ?? '');
                  setFormOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`«${row.name}», долгое нажатие — правка`}
                style={({ pressed }) => [styles.itemRow, pressed ? styles.pressed : null]}
              >
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>{row.name}</Text>
                  <Text style={styles.itemMeta} numberOfLines={2}>
                    {`${STOCK_KIND_LABELS_RU[row.kind as StockKind]}${
                      row.description === null ? '' : ` · ${row.description}`
                    }`}
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <Text style={styles.note}>
            Долгое нажатие на код — правка описания. Вывести код из обращения можно в
            веб-панели.
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

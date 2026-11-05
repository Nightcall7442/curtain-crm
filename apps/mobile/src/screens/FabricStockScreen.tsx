import { STOCK_KIND_LABELS, STOCK_KINDS, type StockKind } from '@curtain-crm/shared';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardLink, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { CodeScanner } from '../components/CodeScanner';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

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
  const { m, t } = useLocale();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();

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
    onSuccess: (row) => void done(m('fabric.codeCreated'), row.name),
    onError(error) {
      notifyError();
      Alert.alert(m('fabric.createError'), error.message);
    },
  });

  const update = trpc.catalog.update.useMutation({
    onSuccess: (row) => void done(m('common.saved'), row.name),
    onError(error) {
      notifyError();
      Alert.alert(m('common.saveError'), error.message);
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
  const canSave = code.trim() !== '' && !create.isPending && !update.isPending;

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
      {/*
        Снизу — обычный отступ и безопасная зона, а не место под панель
        вкладок: экран открыт поверх вкладок, и `tabBarSpace` оставлял
        под списком пустую полосу в 114 точек.
      */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {header}

        <Card>
          {/*
            «+ Позиция» — ссылкой в шапке, как «+ Мероприятие» на главной.
            Была пилюля 74×32 с подписью 12 точек без плюса: ниже порога
            нажатия, ниже чипов 44 под ней и читалась как метка, а не
            действие.
          */}
          <CardTitle
            title={m('fabric.title')}
            icon="window"
            action={
              formOpen ? undefined : (
                <CardLink
                  label={`+ ${m('fabric.item')}`}
                  onPress={() => {
                    create.reset();
                    update.reset();
                    closeForm();
                    setFormOpen(true);
                  }}
                />
              )
            }
          />

          {formOpen && (
            <View style={styles.form}>
              {/* Вид у заведённого кода не меняется: это другой справочник. */}
              {editingId === null && (
                <Field label={m('fabric.what')}>
                  <ChipSelect
                    value={kind}
                    onChange={setKind}
                    options={STOCK_KINDS.map((value) => ({
                      value,
                      label: t(STOCK_KIND_LABELS, value),
                    }))}
                  />
                </Field>
              )}

              <Field label={m('fabric.code')} hint={m('fabric.codeHint')}>
                <View style={styles.codeRow}>
                  <View style={styles.codeInput}>
                    <Input value={code} onChangeText={setCode} placeholder={m('fabric.codeExample')} />
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
                    accessibilityLabel={m('create.scanA11y')}
                    style={({ pressed }) => [styles.scanButton, pressed ? styles.pressed : null]}
                  >
                    <Icon name="camera" size={18} color={colors.accent} />
                  </Pressable>
                </View>
              </Field>

              <Field label={m('fabric.description')} hint={m('fabric.descriptionHint')}>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder={m('fabric.descriptionExample')}
                  multiline
                />
              </Field>

              <View style={styles.formRow}>
                <Pressable
                  onPress={closeForm}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.cancelText}>{m('common.cancel')}</Text>
                </Pressable>

                {/*
                  Без кода кнопка неактивна и выглядит неактивной. Раньше она
                  была обычной зелёной и при пустом поле молча ничего не
                  делала — ни ошибки, ни отклика: казалось, что приложение
                  зависло.
                */}
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
                  disabled={!canSave}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSave }}
                  style={({ pressed }) => [
                    styles.submit,
                    styles.submitFlex,
                    code.trim() === '' ? styles.submitOff : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {create.isPending || update.isPending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.submitText}>
                      {editingId === null ? m('fabric.create') : m('emp.save')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <Field label={m('fabric.filter')}>
            <ChipSelect
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: m('fabric.all') },
                ...STOCK_KINDS.map((value) => ({
                  value,
                  label: t(STOCK_KIND_LABELS, value),
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
                placeholder={m('fabric.search')}
              />
            </View>
          )}

          {rows.data === undefined ? (
            <Skeleton />
          ) : items.length === 0 ? (
            <Empty
              message={all.length === 0 ? m('fabric.noCodes') : m('fabric.notFound')}
              hint={all.length === 0 ? m('fabric.noCodesHint') : m('fabric.checkCode')}
            />
          ) : (
            items.map((row, index) => (
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
                accessibilityLabel={m('fabric.rowA11y', { name: row.name })}
                style={({ pressed }) => [
                  styles.itemRow,
                  // Под последним кодом линии нет: её роль — делить коды, а
                  // не отчёркивать список от сноски.
                  index === items.length - 1 ? styles.itemRowLast : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>{row.name}</Text>
                  <Text style={styles.itemMeta} numberOfLines={2}>
                    {`${t(STOCK_KIND_LABELS, row.kind as StockKind)}${
                      row.description === null ? '' : ` · ${row.description}`
                    }`}
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <Text style={styles.note}>{m('fabric.note')}</Text>
        </Card>
      </ScrollView>

      <CodeScanner
        visible={scanning}
        label={m('fabric.code')}
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
    gap: spacing.lg,
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
  /*
    Форма отчёркнута от фильтра и списка: кнопки «Отмена / Завести» стояли
    вплотную к подписи «Что смотрим» — ноль точек между ними, и форма
    сливалась со списком под ней.
  */
  form: {
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
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
  itemRowLast: {
    borderBottomWidth: 0,
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
  submitOff: {
    opacity: opacity.disabled,
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

import {
  MATERIAL_CODE_KINDS,
  MATERIAL_SLOT_LABELS,
  MATERIAL_SLOTS,
  type MaterialSlot,
} from '@curtain-crm/shared';
import { useMemo, useState, type ReactElement } from 'react';
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
import { CatalogPicker } from '../components/CatalogPicker';
import { CodeScanner } from '../components/CodeScanner';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Склад тканей с телефона: сколько метров какого кода лежит в цехе.
 *
 * Рулоны привозят в цех, и записать приход удобнее там же, где их считают, —
 * ровно та причина, по которой на телефон попали закупочные цены и витрина.
 *
 * Расход эта карточка не трогает: ткань списывается сама, когда заказ уходит
 * в пошив (раскроили — значит, ушло). Здесь только приход и пересчёт.
 *
 * Отрицательный остаток показан красным и не считается ошибкой: ткань,
 * которую забыли оприходовать, всё равно раскроили.
 */

/** Метраж строкой: «12,5» и «12.5» набирают одинаково часто. */
const toMeters = (raw: string): number => Number.parseFloat(raw.replace(',', '.'));

const showMeters = (raw: string): string =>
  `${Number.parseFloat(raw).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} м`;

export function FabricStockScreen({
  header,
}: {
  /** Переключатель разделов сверху — его рисует экран закупочных материалов. */
  readonly header?: ReactElement;
} = {}): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  /** Позиция, которой правят остаток пересчётом. `null` — никакая. */
  const [counting, setCounting] = useState<number | null>(null);
  const [countValue, setCountValue] = useState('');

  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [slot, setSlot] = useState<MaterialSlot>('portiere');
  const [code, setCode] = useState('');
  const [meters, setMeters] = useState('');

  const rows = trpc.fabric.list.useQuery({});
  const catalog = trpc.catalog.list.useQuery({});

  /** Коды из справочника — по виду, который сейчас выбран в приходе. */
  const codeOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === MATERIAL_CODE_KINDS[slot])
        .map((entry) => entry.name),
    [catalog.data, slot],
  );

  const refresh = async (): Promise<void> => {
    await utils.fabric.list.invalidate();
  };

  const receive = trpc.fabric.receive.useMutation({
    async onSuccess(row) {
      notifySuccess();
      setAdding(false);
      setCode('');
      setMeters('');
      await refresh();
      Alert.alert('Приход записан', `${row.code}: ${showMeters(row.meters)}`);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось записать приход', error.message);
    },
  });

  const setMetersMutation = trpc.fabric.setMeters.useMutation({
    async onSuccess(row) {
      notifySuccess();
      setCounting(null);
      setCountValue('');
      await refresh();
      Alert.alert('Остаток обновлён', `${row.code}: ${showMeters(row.meters)}`);
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

  const items = rows.data ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <Card>
          <CardTitle title="Приход ткани" icon="payroll" />

          {!adding ? (
            <Pressable
              onPress={() => {
                setAdding(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
            >
              <Text style={styles.submitText}>Записать приход</Text>
            </Pressable>
          ) : (
            <>
              <Field label="Что привезли">
                <ChipSelect
                  value={slot}
                  onChange={(value) => {
                    setSlot(value);
                    setCode('');
                  }}
                  options={MATERIAL_SLOTS.map((value) => ({
                    value,
                    label: t(MATERIAL_SLOT_LABELS, value),
                  }))}
                />
              </Field>

              {/*
                Код выбирается из справочника, но его можно и набрать: на
                рулоне бывает бирка, которой в справочнике ещё нет, и не
                принять её значило бы не принять привезённую ткань.
              */}
              <Field label="Код с этикетки" hint="Из справочника или руками">
                <CatalogPicker
                  value={code}
                  placeholder="Выбрать из справочника"
                  options={codeOptions}
                  sheetTitle="Коды"
                  onChange={setCode}
                />
                <View style={styles.codeRow}>
                  <View style={styles.codeInput}>
                    <Input value={code} onChangeText={setCode} placeholder="Например: П-31" />
                  </View>
                  {/*
                    Рулон с кодом в руках — сканер здесь уместнее всего:
                    приход заводят по той самой этикетке, которую потом
                    считает продавец в заказе.
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

              <Field label="Сколько метров">
                <Input
                  value={meters}
                  onChangeText={setMeters}
                  keyboardType="decimal-pad"
                  placeholder="63"
                />
              </Field>

              <View style={styles.formRow}>
                <Pressable
                  onPress={() => {
                    setAdding(false);
                    setCode('');
                    setMeters('');
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const value = toMeters(meters);
                    if (code.trim() === '' || !Number.isFinite(value) || value <= 0) return;
                    receive.mutate({
                      kind: MATERIAL_CODE_KINDS[slot],
                      code: code.trim(),
                      meters: value,
                    });
                  }}
                  disabled={receive.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.submit,
                    styles.submitFlex,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {receive.isPending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.submitText}>Записать</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Card>

        <Card>
          <CardTitle title="Остатки" icon="orders" />

          {rows.data === undefined ? (
            <Skeleton />
          ) : items.length === 0 ? (
            <Empty message="Склад пуст" hint="Запишите первый приход" />
          ) : (
            items.map((row) => {
              const left = Number.parseFloat(row.meters);
              const slotName = MATERIAL_SLOTS.find(
                (value) => MATERIAL_CODE_KINDS[value] === row.kind,
              );

              return (
                <View key={row.id}>
                  <Pressable
                    onPress={() => {
                      setCounting(counting === row.id ? null : row.id);
                      setCountValue(left.toString());
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Пересчитать «${row.code}»`}
                    style={({ pressed }) => [styles.itemRow, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.itemText}>
                      <Text style={styles.itemName}>{row.code}</Text>
                      <Text style={styles.itemMeta} numberOfLines={2}>
                        {`${slotName === undefined ? '' : `${t(MATERIAL_SLOT_LABELS, slotName)} · `}${
                          row.description ?? row.branchName
                        }`}
                      </Text>
                    </View>
                    <Text style={[styles.itemMeters, left < 0 ? styles.itemDebt : null]}>
                      {showMeters(row.meters)}
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
                          const value = toMeters(countValue);
                          if (!Number.isFinite(value)) return;
                          setMetersMutation.mutate({ id: row.id, meters: value });
                        }}
                        disabled={setMetersMutation.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.submit, pressed ? styles.pressed : null]}
                      >
                        {setMetersMutation.isPending ? (
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
          </Text>
        </Card>
      </ScrollView>

      <CodeScanner
        visible={scanning}
        label="Код рулона"
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
    marginTop: spacing.sm,
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

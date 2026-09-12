import { useNavigation } from '@react-navigation/native';
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

import {
  CatalogKind,
  curtainMountKindOf,
  CurtainMountKind,
  formatMoney,
  MATERIAL_CODE_KINDS,
  parseMoney,
} from '@curtain-crm/shared';

import { Card, CardTitle } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import { useLocale, type Translate } from '../hooks/useLocale';

/**
 * Продажа готовых штор — товар с витрины, минуя цех.
 *
 * У мастерской два разных бизнеса: пошив на заказ (полный конвейер —
 * замер, раскрой, шитьё, контроль) и готовые шторы, которые продавец
 * отдаёт клиенту сразу. Цикл цеха здесь не нужен вовсе, поэтому форма не
 * спрашивает ни размеров, ни материалов, ни этапов — только то, что нужно
 * для продажи и, при необходимости, для установки.
 *
 * Позиций может быть несколько, и модель берётся из справочника — того же,
 * что и в заказе на пошив. Раньше было одно свободное поле на всю продажу:
 * комплект, тюль и карниз уезжали в одну строку текстом, и в отчёте нельзя
 * было понять, что именно продано.
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
  const { m } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [needsInstallation, setNeedsInstallation] = useState<'no' | 'yes'>('no');
  const [installAddress, setInstallAddress] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  /*
    Модельный ряд — тот же справочник, что и в заказе на пошив
    (`catalog_items`, вид `curtain_model`), который директор ведёт в
    веб-панели. Раньше здесь было свободное поле: продавец писал модель
    как помнил, и одна и та же штора в отчётах называлась тремя способами.
  */
  /*
    Склад запрашивается целиком, один раз на экран, а не по запросу на
    позицию: позиции добавляют и удаляют, а хук, вызванный внутри списка,
    менял бы порядок хуков при каждом таком нажатии. Отбор по модели —
    здесь же, на клиенте: строк на витрине десятки, не тысячи.
  */
  const stock = trpc.readyMade.list.useQuery({});

  const catalog = trpc.catalog.list.useQuery({});
  const modelOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
        .map((entry) => entry.name),
    [catalog.data],
  );

  /*
    Карнизы — из своего справочника: к шторе с полки карниз берут тут же, а
    иногда покупают и один карниз, без штор. Поэтому позиция может быть и
    «штора с карнизом», и только карниз — модель тогда остаётся пустой.
  */
  const corniceOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === CatalogKind.CORNICE)
        .map((entry) => entry.name),
    [catalog.data],
  );

  /**
   * Крепление модели — из справочника: у трубных («Труба», «Киприк»)
   * спрашивается труба, у остальных — карниз с пластиком. Как в пошиве.
   */
  const mountByModel = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of catalog.data ?? []) {
      if (entry.kind === CatalogKind.CURTAIN_MODEL) map.set(entry.name, entry.mountKind);
    }
    return map;
  }, [catalog.data]);
  const mountOf = (model: string): CurtainMountKind => curtainMountKindOf(mountByModel.get(model));

  /** Мини-описание складского кода — как в заказе на пошив: «п-31» = «П-31». */
  const describeCode = (kind: string, code: string): string | null => {
    const needle = code.trim().toLowerCase();
    if (needle === '') return null;
    const entry = (catalog.data ?? []).find(
      (row) => row.kind === kind && row.name.trim().toLowerCase() === needle,
    );
    return entry?.description ?? null;
  };

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const sell = trpc.orders.sellReadyMade.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      Alert.alert(
        needsInstallation === 'yes' ? m('sell.sold') : m('sell.soldClosed'),
        needsInstallation === 'yes' ? m('sell.soldBodyInstall') : m('sell.soldBodyClosed'),
      );
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert(m('sell.error'), error.message);
    },
  });

  const errors = validate({ clientName, clientPhone, needsInstallation, installAddress }, m);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    sell.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      workPrice: toMoney(workPrice),
      deposit: toMoney(deposit),
      needsInstallation: needsInstallation === 'yes',
      items: items.map((item) => ({
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.readyMadeItemId === null ? {} : { readyMadeItemId: item.readyMadeItemId }),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        ...(mountOf(item.model) === CurtainMountKind.PIPE && item.pipe.trim() !== ''
          ? { pipe: item.pipe.trim() }
          : {}),
        ...(item.cornice.trim() === '' ? {} : { cornice: item.cornice.trim() }),
        ...(item.cornice.trim() === '' || item.corniceCode.trim() === ''
          ? {}
          : { corniceCode: item.corniceCode.trim() }),
        ...(item.cornice.trim() === '' || item.plastic.trim() === ''
          ? {}
          : { plastic: item.plastic.trim() }),
        ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
      })),
      ...(needsInstallation === 'yes'
        ? {
            installAddress: installAddress.trim(),
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
          <CardTitle title={m('create.client')} icon="person" />

          <Field label={m('create.name')} required error={showErrors ? errors.clientName : undefined}>
            <Input
              value={clientName}
              onChangeText={setClientName}
              placeholder={m('create.namePlaceholder')}
              autoCapitalize="words"
              invalid={showErrors && errors.clientName !== undefined}
            />
          </Field>

          <Field
            label={m('create.phone')}
            required
            hint={m('create.phoneHint')}
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

        {/*
          Деньги — на всю продажу, а не на позицию: так же, как в заказе на
          пошив. Клиент платит одну сумму и оставляет один задаток, и
          раскладывать их по строкам продавцу на кассе не нужно.
        */}
        <Card>
          <CardTitle title={m('sell.payment')} icon="paid" />

          <View style={styles.money}>
            <View style={styles.moneyItem}>
              <Field label={m('sell.price')}>
                <MoneyInput
                  value={workPrice}
                  onChangeText={setWorkPrice}
                  placeholder="0"
                />
              </Field>
            </View>
            <View style={styles.moneyItem}>
              <Field label={m('create.deposit')}>
                <MoneyInput
                  value={deposit}
                  onChangeText={setDeposit}
                  placeholder="0"
                />
              </Field>
            </View>
          </View>
        </Card>

        {items.map((item, index) => (
          <Card key={item.id}>
            <CardTitle
              title={m('create.item', { n: index + 1 })}
              icon="window"
              action={
                items.length > 1 ? (
                  <Pressable
                    onPress={() => {
                      setItems((current) => current.filter((entry) => entry.id !== item.id));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={m('create.removeItem', { n: index + 1 })}
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.remove, pressed ? styles.pressed : null]}>{m('create.remove')}</Text>
                    )}
                  </Pressable>
                ) : undefined
              }
            />

            <View style={styles.row}>
              <View style={styles.modelItem}>
                <Field label={m('create.model')}>
                  <CatalogPicker
                    value={item.model}
                    placeholder={m('create.notChosen')}
                    options={modelOptions}
                    sheetTitle={m('sell.modelRange')}
                    onChange={(model) => {
                      updateItem(item.id, { model });
                    }}
                  />
                </Field>
              </View>
              <View style={styles.quantityItem}>
                <Field label={m('sell.qty')}>
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

            {/*
              Что есть на складе по выбранной модели. Продавец выбирает вещь,
              а не переписывает её описание: размер, цвет и код приезжают со
              склада, а остаток списывается при продаже.
            */}
            {mountOf(item.model) === CurtainMountKind.PIPE && (
              <Field label={m('create.pipe')} hint={m('sell.pipeHint')}>
                <Input
                  value={item.pipe}
                  onChangeText={(pipe) => {
                    updateItem(item.id, { pipe });
                  }}
                  placeholder={m('create.examplePipe')}
                  autoCapitalize="characters"
                />
                <CodeDescription description={describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe)} />
              </Field>
            )}

            <Field label={m('create.cornice')} hint={m('sell.corniceHint')}>
              <CatalogPicker
                value={item.cornice}
                placeholder={m('sell.noCornice')}
                options={corniceOptions}
                sheetTitle={m('sell.cornices')}
                onChange={(cornice) => {
                  updateItem(item.id, { cornice });
                }}
              />
            </Field>

            {/*
              Коды со склада показываются только при выбранном карнизе: без
              него продажа к карнизчику не идёт, и два лишних поля на каждую
              позицию только мешали бы. С ними заказ уходит карнизчикам —
              как заказ на пошив после проверки админом.
            */}
            {item.cornice.trim() !== '' && (
              <>
                <Field label={m('sell.corniceCode')} hint={m('sell.corniceCodeHint')}>
                  <Input
                    value={item.corniceCode}
                    onChangeText={(corniceCode) => {
                      updateItem(item.id, { corniceCode });
                    }}
                    placeholder={m('create.exampleCornice')}
                    autoCapitalize="characters"
                  />
                  <CodeDescription
                    description={describeCode(MATERIAL_CODE_KINDS.cornice, item.corniceCode)}
                  />
                </Field>
                <Field label={m('sell.plasticCode')}>
                  <Input
                    value={item.plastic}
                    onChangeText={(plastic) => {
                      updateItem(item.id, { plastic });
                    }}
                    placeholder={m('create.examplePlastic')}
                    autoCapitalize="characters"
                  />
                  <CodeDescription
                    description={describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic)}
                  />
                </Field>
              </>
            )}

            {item.model.trim() !== '' && (
              <View style={styles.stock}>
                <Text style={styles.stockTitle}>{m('sell.inStock')}</Text>

                {stock.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  (() => {
                    /* Ищем и по коду с бирки: клиент называет его, а не модель. */
                    const needle = item.model.trim().toLowerCase();
                    const matching = (stock.data ?? []).filter(
                      (entry) =>
                        entry.model.toLowerCase().includes(needle) ||
                        (entry.code ?? '').toLowerCase().includes(needle),
                    );

                    if (matching.length === 0) {
                      return (
                        <Text style={styles.stockHint}>{m('sell.noStock')}</Text>
                      );
                    }

                    return matching.map((entry) => {
                      const chosen = item.readyMadeItemId === entry.id;

                      return (
                        <Pressable
                          key={entry.id}
                          onPress={() => {
                            updateItem(item.id, {
                              readyMadeItemId: chosen ? null : entry.id,
                              model: entry.model,
                            });
                            // Цену подставляем, пока продавец её не трогал:
                            // переписать её он всегда успеет, а вот забыть
                            // ценник со склада — обычное дело.
                            if (!chosen && workPrice.trim() === '') {
                              setWorkPrice(
                                (
                                  Number.parseFloat(entry.price) *
                                  Math.max(1, Number.parseInt(item.quantity, 10) || 1)
                                ).toString(),
                              );
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: chosen }}
                          style={({ pressed }) => [
                            styles.stockRow,
                            chosen ? styles.stockRowChosen : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <View style={styles.stockBody}>
                            <Text style={styles.stockName}>
                              {m('sell.cm', {
                                w: Number.parseFloat(entry.widthCm),
                                h: Number.parseFloat(entry.heightCm),
                              })}
                              {entry.code === null ? '' : ` · ${entry.code}`}
                            </Text>
                            {entry.comment !== null && (
                              <Text style={styles.stockMeta} numberOfLines={2}>
                                {entry.comment}
                              </Text>
                            )}
                            <Text style={styles.stockMeta}>
                              {m('sell.pcs', { branch: entry.branchName, n: entry.quantity })}
                            </Text>
                          </View>
                          <Text style={styles.stockPrice}>
                            {formatMoney(parseMoney(entry.price))}
                          </Text>
                        </Pressable>
                      );
                    });
                  })()
                )}
              </View>
            )}

            <Field label={m('create.comment')}>
              <Input
                value={item.comment}
                onChangeText={(comment) => {
                  updateItem(item.id, { comment });
                }}
                placeholder={m('create.commentPlaceholder')}
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
          <Text style={styles.addItemText}>{m('create.addItem')}</Text>
        </Pressable>

        <Card>
          <CardTitle title={m('sell.installation')} icon="deadline" />

          <Field label={m('sell.needInstall')}>
            <ChipSelect
              value={needsInstallation}
              onChange={setNeedsInstallation}
              options={[
                { value: 'no', label: m('sell.installNo') },
                { value: 'yes', label: m('sell.installYes') },
              ]}
            />
          </Field>

          {needsInstallation === 'yes' ? (
            <>
              <Field
                label={m('create.address')}
                required
                error={showErrors ? errors.installAddress : undefined}
              >
                <Input
                  value={installAddress}
                  onChangeText={setInstallAddress}
                  placeholder={m('create.addressPlaceholder')}
                  multiline
                  invalid={showErrors && errors.installAddress !== undefined}
                />
              </Field>
            </>
          ) : (
            <Text style={styles.hint}>{m('sell.closesNow')}</Text>
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
              {needsInstallation === 'yes' ? m('sell.submitInstall') : m('sell.submitClose')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */

/** Позиция в форме: строки, потому что поля ввода отдают строки. */
interface DraftItem {
  readonly id: number;
  readonly model: string;
  /** Карниз из справочника. Пусто — продают одни шторы. */
  readonly cornice: string;
  /** Коды со склада — карниза и пластика к нему. Только при выбранном карнизе. */
  readonly corniceCode: string;
  readonly plastic: string;
  /** Труба — у трубных моделей вместо карниза. */
  readonly pipe: string;
  readonly quantity: string;
  readonly comment: string;
  /**
   * Выбранная штора со склада. `null` — продажа без склада: так продавали
   * до появления остатков, и так продают то, чего на полке не оказалось.
   */
  readonly readyMadeItemId: number | null;
}

const emptyItem = (id: number): DraftItem => ({
  id,
  model: '',
  cornice: '',
  corniceCode: '',
  plastic: '',
  pipe: '',
  quantity: '1',
  comment: '',
  readyMadeItemId: null,
});

function validate(values: {
  readonly clientName: string;
  readonly clientPhone: string;
  readonly needsInstallation: 'no' | 'yes';
  readonly installAddress: string;
}, m: Translate): Partial<Record<'clientName' | 'clientPhone' | 'installAddress', string>> {
  const errors: Record<string, string> = {};

  if (values.clientName.trim() === '') {
    errors['clientName'] = m('create.nameRequired');
  }

  const digits = values.clientPhone.replace(/\D/g, '');
  if (digits.length < 9) {
    errors['clientPhone'] = m('create.phoneIncomplete');
  }

  if (values.needsInstallation === 'yes' && values.installAddress.trim() === '') {
    errors['installAddress'] = m('sell.addressRequired');
  }

  return errors;
}

function toMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Строка под кодом: что это за материал по справочнику, если код там есть. */
function CodeDescription({ description }: { readonly description: string | null }): ReactElement | null {
  if (description === null) return null;
  return <Text style={styles.codeDescription}>{description}</Text>;
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modelItem: {
    flex: 1,
    minWidth: 0,
  },
  quantityItem: {
    width: 80,
  },
  remove: {
    ...typography.footnote,
    color: colors.danger,
    fontWeight: '600',
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
  stock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  codeDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  stockTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  stockHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stockRowChosen: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  stockBody: { flex: 1 },
  stockName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  stockMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stockPrice: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  addItemText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
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

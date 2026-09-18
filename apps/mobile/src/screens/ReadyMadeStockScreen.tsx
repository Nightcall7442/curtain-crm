import {
  CatalogKind,
  formatMoney,
  ORDER_ITEM_KIND_LABELS,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  parseMoney,
  type OrderItemKind as OrderItemKindName,
} from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Image,
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
import { BottomSheet } from '../components/BottomSheet';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

/**
 * Склад готовых штор: что сшито заранее и лежит на полке.
 *
 * Заводит записи тот же круг, что и продаёт (продавец, админ, директор):
 * шторы приносят из цеха в торговый зал, и ждать, пока их оприходует
 * руководство, значит не продать их сегодня.
 *
 * Остаток вводится числом «сколько стало», а не «сколько прибавить»:
 * продавец пересчитывает стопку и вводит то, что видит. Прибавление
 * требовало бы вычитания в уме, а ошибка в нём тихо разошлась бы с полкой.
 */

interface FormState {
  readonly model: string;
  readonly kind: OrderItemKindName;
  readonly code: string;
  readonly widthCm: string;
  readonly heightCm: string;
  readonly price: string;
  readonly quantity: string;
  readonly comment: string;
  readonly photo: { readonly uri: string; readonly base64: string; readonly mimeType: string } | null;
  /** Остальные шторы комплекта — дверь к окну: свой вид, размер, цена, штук. */
  readonly mates: readonly MateDraft[];
}

interface MateDraft {
  readonly id: number;
  readonly kind: OrderItemKindName;
  readonly widthCm: string;
  readonly heightCm: string;
  readonly price: string;
  readonly quantity: string;
}

const emptyForm = (): FormState => ({
  model: '',
  kind: OrderItemKind.WINDOW,
  code: '',
  widthCm: '',
  heightCm: '',
  price: '',
  quantity: '1',
  comment: '',
  mates: [],
  photo: null,
});

const toNumber = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

export function ReadyMadeStockScreen(): ReactElement {
  const navigation = useNavigation();
  const { m, t } = useLocale();
  const utils = trpc.useUtils();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);
  const [countValue, setCountValue] = useState('');
  /** Штора, которой сейчас ставят ценник; `null` — никому. */
  const [pricing, setPricing] = useState<number | null>(null);
  const [priceValue, setPriceValue] = useState('');

  const items = trpc.readyMade.list.useQuery({ includeEmpty: true, includeInactive: false });
  const catalog = trpc.catalog.list.useQuery({});

  const modelOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
        .map((entry) => entry.name),
    [catalog.data],
  );

  const patch = (next: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...next }));
  };

  const create = trpc.readyMade.create.useMutation({
    async onSuccess(item) {
      notifySuccess();
      setForm(emptyForm());
      setAdding(false);
      await utils.readyMade.list.invalidate();
      Alert.alert(m('stock.added'), m('stock.addedBody', { model: item.model, n: item.quantity }));
    },
    onError(error) {
      notifyError();
      Alert.alert(m('stock.addError'), error.message);
    },
  });

  const setQuantity = trpc.readyMade.setQuantity.useMutation({
    async onSuccess() {
      notifySuccess();
      setCounting(null);
      setCountValue('');
      await utils.readyMade.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('stock.countError'), error.message);
    },
  });

  /*
    Ценник — отдельной правкой, как пересчёт остатка. Штора из пошива для
    склада приходит на полку без цены: цену ставит руководство, и раньше
    сделать это с телефона было нечем — владелец показал нули на складе.
  */
  const setPrice = trpc.readyMade.update.useMutation({
    async onSuccess() {
      notifySuccess();
      setPricing(null);
      setPriceValue('');
      await utils.readyMade.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('common.saveError'), error.message);
    },
  });

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
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

    patch({
      photo: {
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
    });
  };

  const submit = (): void => {
    if (form.model.trim() === '') {
      Alert.alert(m('stock.modelRequired'), m('stock.modelRequiredBody'));
      return;
    }
    if (
      toNumber(form.widthCm) <= 0 ||
      toNumber(form.heightCm) <= 0 ||
      form.mates.some((mate) => toNumber(mate.widthCm) <= 0 || toNumber(mate.heightCm) <= 0)
    ) {
      Alert.alert(m('stock.sizeRequired'), m('stock.sizeRequiredBody'));
      return;
    }

    create.mutate({
      model: form.model.trim(),
      kind: form.kind,
      widthCm: toNumber(form.widthCm),
      heightCm: toNumber(form.heightCm),
      price: toNumber(form.price),
      quantity: Math.max(0, Number.parseInt(form.quantity, 10) || 0),
      mates: form.mates.map((mate) => ({
        kind: mate.kind,
        widthCm: toNumber(mate.widthCm),
        heightCm: toNumber(mate.heightCm),
        price: toNumber(mate.price),
        quantity: Math.max(0, Number.parseInt(mate.quantity, 10) || 0),
      })),
      ...(form.code.trim() === '' ? {} : { code: form.code.trim() }),
      ...(form.comment.trim() === '' ? {} : { comment: form.comment.trim() }),
      ...(form.photo === null
        ? {}
        : {
            photo: {
              fileName: 'ready-made.jpg',
              mimeType: form.photo.mimeType,
              content: form.photo.base64,
            },
          }),
    });
  };

  if (items.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={items.error.message} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/*
          Склад — единственный вход во всё про готовые шторы. Две кнопки рядом:
          продать то, что лежит, и заказать цеху ещё. На экране «Работа» они
          стояли двумя одинаковыми кнопками и читались как одно действие.
        */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              navigation.navigate('SellReadyMade');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          >
            <Icon name="paid" size={18} color={colors.accentStrong} />
            <Text style={styles.actionText}>{m('stock.sell')}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              navigation.navigate('OrderCreate', { mode: 'stock' });
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          >
            <Icon name="assigned" size={18} color={colors.accentStrong} />
            <Text style={styles.actionText}>{m('stock.produce')}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setAdding((open) => !open);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.add, pressed ? styles.pressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.onAccent} />
          <Text style={styles.addText}>
            {adding ? m('stock.collapse') : m('stock.add')}
          </Text>
        </Pressable>

        {adding && (
          <Card>
            <CardTitle title={m('stock.new')} icon="window" />

            {/* Окно или дверь — иначе дверную штору на полку было не завести. */}
            <Field label={m('create.kind')}>
              <ChipSelect
                value={form.kind}
                onChange={(kind) => {
                  patch({ kind });
                }}
                options={ORDER_ITEM_KINDS.map((value) => ({ value, label: t(ORDER_ITEM_KIND_LABELS, value) }))}
              />
            </Field>

            <Field label={m('create.model')} required>
              <CatalogPicker
                value={form.model}
                placeholder={m('create.notChosen')}
                options={modelOptions}
                sheetTitle={m('sell.modelRange')}
                onChange={(model) => {
                  patch({ model });
                }}
              />
            </Field>

            {/*
              Код — своя бирка мастерской, а не код ткани с этикетки рулона:
              две шторы одной модели и размера различают по нему. Описание
              рядом заполняется руками — справочнику здесь взяться неоткуда,
              штора одна такая.
            */}
            <Field label={m('stock.code')} hint={m('stock.codeHint')}>
              <Input
                value={form.code}
                onChangeText={(code) => {
                  patch({ code });
                }}
                placeholder={m('stock.codeExample')}
                autoCapitalize="characters"
              />
            </Field>

            <Field label={m('stock.description')}>
              <Input
                value={form.comment}
                onChangeText={(comment) => {
                  patch({ comment });
                }}
                placeholder={m('stock.descriptionPlaceholder')}
                multiline
              />
            </Field>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label={m('create.width')} required>
                  <Input
                    value={form.widthCm}
                    onChangeText={(widthCm) => {
                      patch({ widthCm });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="150"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label={m('create.height')} required>
                  <Input
                    value={form.heightCm}
                    onChangeText={(heightCm) => {
                      patch({ heightCm });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="200"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label={m('stock.priceSum')} required>
                  <MoneyInput
                    value={form.price}
                    onChangeText={(price) => {
                      patch({ price });
                    }}
                    placeholder="450 000"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label={m('stock.quantity')}>
                  <Input
                    value={form.quantity}
                    onChangeText={(quantity) => {
                      patch({ quantity });
                    }}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </Field>
              </View>
            </View>

            {/*
              Комплект руками: окно + дверь одной карточкой. Модель, код и
              описание общие, у каждой шторы свой размер, цена и остаток —
              на полке они лягут группой, как из пошива.
            */}
            {form.mates.map((mate, index) => (
              <View key={mate.id} style={styles.mate}>
                <View style={styles.mateHead}>
                  <Text style={styles.mateTitle}>{m('stock.mate', { n: index + 2 })}</Text>
                  <Pressable
                    onPress={() => {
                      patch({ mates: form.mates.filter((entry) => entry.id !== mate.id) });
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.countOpen, pressed ? styles.pressed : null]}>{m('create.remove')}</Text>
                    )}
                  </Pressable>
                </View>
                <Field label={m('create.kind')}>
                  <ChipSelect
                    value={mate.kind}
                    onChange={(kind) => {
                      patch({ mates: form.mates.map((entry) => (entry.id === mate.id ? { ...entry, kind } : entry)) });
                    }}
                    options={ORDER_ITEM_KINDS.map((value) => ({ value, label: t(ORDER_ITEM_KIND_LABELS, value) }))}
                  />
                </Field>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Field label={m('create.width')} required>
                      <Input
                        value={mate.widthCm}
                        onChangeText={(widthCm) => {
                          patch({ mates: form.mates.map((entry) => (entry.id === mate.id ? { ...entry, widthCm } : entry)) });
                        }}
                        keyboardType="decimal-pad"
                        placeholder="150"
                      />
                    </Field>
                  </View>
                  <View style={styles.half}>
                    <Field label={m('create.height')} required>
                      <Input
                        value={mate.heightCm}
                        onChangeText={(heightCm) => {
                          patch({ mates: form.mates.map((entry) => (entry.id === mate.id ? { ...entry, heightCm } : entry)) });
                        }}
                        keyboardType="decimal-pad"
                        placeholder="200"
                      />
                    </Field>
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Field label={m('stock.priceSum')} required>
                      <MoneyInput
                        value={mate.price}
                        onChangeText={(price) => {
                          patch({ mates: form.mates.map((entry) => (entry.id === mate.id ? { ...entry, price } : entry)) });
                        }}
                        placeholder="300 000"
                      />
                    </Field>
                  </View>
                  <View style={styles.half}>
                    <Field label={m('stock.quantity')}>
                      <Input
                        value={mate.quantity}
                        onChangeText={(quantity) => {
                          patch({ mates: form.mates.map((entry) => (entry.id === mate.id ? { ...entry, quantity } : entry)) });
                        }}
                        keyboardType="number-pad"
                        placeholder="1"
                      />
                    </Field>
                  </View>
                </View>
              </View>
            ))}
            <Pressable
              onPress={() => {
                patch({
                  mates: [
                    ...form.mates,
                    {
                      id: form.mates.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
                      kind: form.kind === OrderItemKind.DOOR ? OrderItemKind.WINDOW : OrderItemKind.DOOR,
                      widthCm: '',
                      heightCm: '',
                      price: '',
                      quantity: '1',
                    },
                  ],
                });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addMate, pressed ? styles.pressed : null]}
            >
              <Icon name="assigned" size={18} color={colors.accent} />
              <Text style={styles.addMateText}>{m('stock.addMate')}</Text>
            </Pressable>

            <View style={styles.photoRow}>
              {form.photo === null ? (
                <Text style={styles.photoHint}>{m('stock.photoHint')}</Text>
              ) : (
                <Image source={{ uri: form.photo.uri }} style={styles.photoPreview} />
              )}

              <Pressable
                onPress={() => {
                  void pickPhoto(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="camera" size={18} color={colors.accentStrong} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void pickPhoto(false);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="photo" size={18} color={colors.accentStrong} />
              </Pressable>
            </View>

            <Pressable
              disabled={create.isPending}
              onPress={submit}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.submit,
                pressed ? styles.pressed : null,
                create.isPending ? styles.disabled : null,
              ]}
            >
              <Text style={styles.submitText}>{m('stock.submit')}</Text>
            </Pressable>
          </Card>
        )}

        <Card>
          <CardTitle title={m('stock.title')} icon="orders" />

          {items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty
              message={m('stock.none')}
              hint={m('stock.noneHint')}
            />
          ) : (
            items.data.map((item, index) => (
              <View key={item.id} style={styles.item}>
                {/*
                  Комплект: шторы из одного пошива (окно + дверь) лежат и
                  продаются вместе. Заголовок — над первой позицией комплекта,
                  с суммой по всем; сами позиции — как обычно, каждая со своим
                  остатком: продали одну — вторая остаётся на полке.
                */}
                {item.setId !== null && items.data[index - 1]?.setId !== item.setId && (
                  <View style={styles.setHead}>
                    <Text style={styles.setTitle}>
                      {m('stock.set', { n: item.setLabel ?? '' })}
                      {' · '}
                      {items.data
                        .filter((entry) => entry.setId === item.setId)
                        .map((entry) => t(ORDER_ITEM_KIND_LABELS, entry.kind).toLowerCase())
                        .join(' + ')}
                    </Text>
                    <Text style={styles.setTotal}>
                      {formatMoney(
                        items.data
                          .filter((entry) => entry.setId === item.setId)
                          .reduce((sum, entry) => sum + parseMoney(entry.price), 0),
                      )}
                    </Text>
                  </View>
                )}
                <View style={styles.itemHead}>
                  {item.photoUrl === null ? (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Text style={styles.thumbLetter}>{item.model.trim().charAt(0).toUpperCase()}</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
                  )}

                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle}>
                      {item.code === null ? item.model : `${item.model} · ${item.code}`}
                    </Text>
                    <Text style={styles.itemMeta}>{t(ORDER_ITEM_KIND_LABELS, item.kind)}</Text>
                    <Text style={styles.itemMeta}>
                      {m('sell.cm', {
                        w: Number.parseFloat(item.widthCm),
                        h: Number.parseFloat(item.heightCm),
                      })}
                    </Text>
                    {item.comment !== null && (
                      <Text style={styles.itemMeta} numberOfLines={2}>
                        {item.comment}
                      </Text>
                    )}
                    <Text style={styles.itemMeta}>{item.branchName}</Text>
                  </View>

                  <View style={styles.itemNumbers}>
                    <Text style={styles.itemPrice}>{formatMoney(parseMoney(item.price))}</Text>
                    <Text style={styles.itemQuantity}>{m('stock.pcsOnly', { n: item.quantity })}</Text>
                  </View>
                </View>

                {/* Остаток и ценник правятся в шторке: строка внизу списка уезжала под клавиатуру. */}
                <View style={styles.actionsRow}>
                    {item.quantity > 0 && (
                      <Pressable
                        onPress={() => {
                          navigation.navigate('SellReadyMade', { readyMadeItemId: item.id });
                        }}
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        {({ pressed }) => (
                          <Text style={[styles.countOpen, pressed ? styles.pressed : null]}>{m('stock.sell')}</Text>
                        )}
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => {
                        setCounting(item.id);
                        setCountValue(item.quantity.toString());
                      }}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      {({ pressed }) => (
                        <Text style={[styles.countOpen, pressed ? styles.pressed : null]}>
                          {m('stock.recount')}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setPricing(item.id);
                        setPriceValue(parseMoney(item.price) > 0 ? (parseMoney(item.price) / 100).toString() : '');
                      }}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      {({ pressed }) => (
                        <Text style={[styles.countOpen, pressed ? styles.pressed : null]}>
                          {parseMoney(item.price) > 0 ? m('stock.changePrice') : m('stock.setPrice')}
                        </Text>
                      )}
                    </Pressable>
                </View>
              </View>
            ))
          )}
        </Card>

        <BottomSheet
          visible={counting !== null}
          title={m('stock.recount')}
          onClose={() => {
            setCounting(null);
          }}
        >
          <Field label={m('stock.quantity')}>
            <Input value={countValue} onChangeText={setCountValue} keyboardType="number-pad" placeholder="0" autoFocus />
          </Field>
          <Pressable
            disabled={setQuantity.isPending || counting === null}
            onPress={() => {
              if (counting === null) return;
              setQuantity.mutate({ id: counting, quantity: Math.max(0, Number.parseInt(countValue, 10) || 0) });
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.sheetSave, pressed ? styles.pressed : null]}
          >
            <Text style={styles.sheetSaveText}>{m('emp.save')}</Text>
          </Pressable>
        </BottomSheet>

        <BottomSheet
          visible={pricing !== null}
          title={m('stock.changePrice')}
          onClose={() => {
            setPricing(null);
          }}
        >
          <Field label={m('sell.price')}>
            <MoneyInput value={priceValue} onChangeText={setPriceValue} placeholder="0" autoFocus />
          </Field>
          <Pressable
            disabled={setPrice.isPending || pricing === null || toMoney(priceValue) <= 0}
            onPress={() => {
              if (pricing === null) return;
              setPrice.mutate({ id: pricing, price: toMoney(priceValue) });
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sheetSave,
              pressed ? styles.pressed : null,
              toMoney(priceValue) <= 0 ? styles.disabled : null,
            ]}
          >
            <Text style={styles.sheetSaveText}>{m('emp.save')}</Text>
          </Pressable>
        </BottomSheet>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function toMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  mate: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  mateHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  mateTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addMate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  addMateText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  sheetSave: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  sheetSaveText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
  setHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  setTitle: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.accent,
    flex: 1,
  },
  setTotal: {
    ...typography.footnote,
    fontWeight: '700',
    color: colors.accent,
  },
  actionsRow: { flexDirection: 'row', gap: spacing.lg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: {
    padding: spacing.lg,
    paddingBottom: tabBarSpace,
    gap: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  actionText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  addText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: { flex: 1 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    flex: 0,
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
  submit: {
    minHeight: 48,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  /* Без снимка — первая буква модели на светло-зелёном: серый квадрат с
     иконкой окна на каждой строке выглядел заглушкой. */
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  thumbLetter: {
    ...typography.title,
    color: colors.accentStrong,
  },
  itemBody: { flex: 1 },
  itemTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemNumbers: { alignItems: 'flex-end' },
  itemPrice: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemQuantity: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  countOpen: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '700',
  },
  pressed: { opacity: opacity.pressed },
  disabled: { opacity: opacity.disabled },
});

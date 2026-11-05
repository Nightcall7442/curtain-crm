import {
  CatalogKind,
  inputToMajor,
  ORDER_ITEM_KIND_LABELS,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  type OrderItemKind as OrderItemKindName,
  parseMoney,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardLink, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import { BottomSheet } from '../components/BottomSheet';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { SubmitButton } from '../components/SubmitButton';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';
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
  readonly photo: {
    readonly uri: string;
    readonly base64: string;
    readonly mimeType: string;
  } | null;
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
  readonly photo: {
    readonly uri: string;
    readonly base64: string;
    readonly mimeType: string;
  } | null;
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
  const { m, t, money } = useLocale();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);
  const [countValue, setCountValue] = useState('');
  /** Штора, которой сейчас ставят ценник; `null` — никому. */
  const [pricing, setPricing] = useState<number | null>(null);
  const [priceValue, setPriceValue] = useState('');

  /*
    Проданные с полки не показываем: «0 шт» в списке остатков — не ответ на
    вопрос «что есть». Ошибочную продажу возвращает панель: там список
    полный, вместе с пустыми и снятыми.
  */
  const items = trpc.readyMade.list.useQuery({ includeEmpty: false, includeInactive: false });
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

  /**
   * Снимок — на позицию, а не на карточку: окно и дверь выглядят по-разному,
   * и один снимок на комплект оставлял бы вторую позицию совсем без фото.
   * `mateId === null` — снимок основной позиции, иначе — позиции комплекта.
   */
  const pickPhoto = async (fromCamera: boolean, mateId: number | null): Promise<void> => {
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

    const photo = {
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType ?? 'image/jpeg',
    };

    if (mateId === null) {
      patch({ photo });
      return;
    }
    patch({
      mates: form.mates.map((entry) => (entry.id === mateId ? { ...entry, photo } : entry)),
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
        ...(mate.photo === null
          ? {}
          : {
              photo: {
                fileName: 'ready-made.jpg',
                mimeType: mate.photo.mimeType,
                content: mate.photo.base64,
              },
            }),
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

  /** Размер шторы — «300×260 см»: в строке списка и в шапке шторки. */
  const sizeOf = (item: { readonly widthCm: string; readonly heightCm: string }): string =>
    m('sell.cm', { w: Number.parseFloat(item.widthCm), h: Number.parseFloat(item.heightCm) });

  /*
    Какую штору правят в шторке. Список под ней затемнён, а две позиции
    комплекта бывают одной модели и с одним кодом — без этой строки
    «Пересчитать остаток» не говорил, чей остаток пересчитывают.
  */
  const counted = items.data?.find((entry) => entry.id === counting) ?? null;
  const priced = items.data?.find((entry) => entry.id === pricing) ?? null;
  const subjectOf = (
    item: NonNullable<typeof counted>,
  ): { readonly title: string; readonly meta: string } => ({
    title: item.code === null ? item.model : `${item.model} · ${item.code}`,
    meta: `${t(ORDER_ITEM_KIND_LABELS, item.kind)} · ${sizeOf(item)}`,
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        /*
          Снизу — обычный отступ и безопасная зона, а не место под панель
          вкладок: склад открыт поверх вкладок, панели под ним нет, и прежний
          отступ оставлял под списком пустую полосу в 114 точек.
        */
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Склад — единственный вход во всё про готовые шторы. Две кнопки рядом:
          продать то, что лежит, и заказать цеху ещё. На экране «Работа» они
          стояли двумя одинаковыми кнопками и читались как одно действие.

          Без значков: в половину ширины телефона значок, промежуток, подпись
          «Пошив для склада» и поля кнопки не помещаются — подпись либо
          упиралась в рамку вплотную, либо ломалась на две строки рядом с
          однострочной соседкой. Прежний значок к тому же был тем же «плюсом»,
          что у «Добавить готовые шторы», — третье действие с одним знаком.
        */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              navigation.navigate('SellReadyMade');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          >
            <Text style={styles.actionText}>{m('stock.sell')}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              navigation.navigate('OrderCreate', { mode: 'stock' });
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          >
            <Text style={styles.actionText}>{m('stock.produce')}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setAdding((open) => !open);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: adding }}
          style={({ pressed }) => [styles.add, pressed ? styles.pressed : null]}
        >
          {/* Открытая форма — крестик «свернуть», а не тот же «плюс». */}
          <Icon name={adding ? 'close' : 'assigned'} size={18} color={colors.onAccent} />
          <Text style={styles.addText}>{adding ? m('stock.collapse') : m('stock.add')}</Text>
        </Pressable>

        {adding && (
          <Card>
            <CardTitle title={m('stock.new')} icon="window" />

            {/*
              Окно или дверь — иначе дверную штору на полку было не завести.
              Подпись — «Что это», а не «Тип» из заказа: на складе выбирают
              вещь на полке, а не вид работы.
            */}
            <Field label={m('stock.kind')}>
              <ChipSelect
                value={form.kind}
                onChange={(kind) => {
                  patch({ kind });
                }}
                options={ORDER_ITEM_KINDS.map((value) => ({
                  value,
                  label: t(ORDER_ITEM_KIND_LABELS, value),
                }))}
              />
            </Field>

            <Field label={m('create.model')} required>
              {/* Пока справочник грузится, шторка крутит загрузку, а не пишет «пуст». */}
              <CatalogPicker
                value={form.model}
                placeholder={m('create.notChosen')}
                options={modelOptions}
                loading={catalog.isLoading}
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

            <View style={styles.photoRow}>
              {form.photo === null ? (
                <Text style={styles.photoHint}>{m('stock.photoHint')}</Text>
              ) : (
                <Image source={{ uri: form.photo.uri }} style={styles.photoPreview} />
              )}

              <Pressable
                onPress={() => {
                  void pickPhoto(true, null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="camera" size={18} color={colors.accentStrong} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void pickPhoto(false, null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="photo" size={18} color={colors.accentStrong} />
              </Pressable>
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
                  {/*
                    Общая ссылка-действие, как «Удалить» у позиции в продаже с
                    полки: тот же кегль, тот же цвет опасного действия и цель
                    в 44 точки. Своя подпись была зелёной — удаление читалось
                    как обычная кнопка.
                  */}
                  <CardLink
                    label={m('create.remove')}
                    tone="danger"
                    accessibilityLabel={m('create.removeItem', { n: index + 2 })}
                    onPress={() => {
                      patch({ mates: form.mates.filter((entry) => entry.id !== mate.id) });
                    }}
                  />
                </View>
                <Field label={m('stock.kind')}>
                  <ChipSelect
                    value={mate.kind}
                    onChange={(kind) => {
                      patch({
                        mates: form.mates.map((entry) =>
                          entry.id === mate.id ? { ...entry, kind } : entry,
                        ),
                      });
                    }}
                    options={ORDER_ITEM_KINDS.map((value) => ({
                      value,
                      label: t(ORDER_ITEM_KIND_LABELS, value),
                    }))}
                  />
                </Field>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Field label={m('create.width')} required>
                      <Input
                        value={mate.widthCm}
                        onChangeText={(widthCm) => {
                          patch({
                            mates: form.mates.map((entry) =>
                              entry.id === mate.id ? { ...entry, widthCm } : entry,
                            ),
                          });
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
                          patch({
                            mates: form.mates.map((entry) =>
                              entry.id === mate.id ? { ...entry, heightCm } : entry,
                            ),
                          });
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
                          patch({
                            mates: form.mates.map((entry) =>
                              entry.id === mate.id ? { ...entry, price } : entry,
                            ),
                          });
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
                          patch({
                            mates: form.mates.map((entry) =>
                              entry.id === mate.id ? { ...entry, quantity } : entry,
                            ),
                          });
                        }}
                        keyboardType="number-pad"
                        placeholder="1"
                      />
                    </Field>
                  </View>
                </View>

                <View style={styles.photoRow}>
                  {mate.photo === null ? (
                    <Text style={styles.photoHint}>{m('stock.photoHint')}</Text>
                  ) : (
                    <Image source={{ uri: mate.photo.uri }} style={styles.photoPreview} />
                  )}

                  <Pressable
                    onPress={() => {
                      void pickPhoto(true, mate.id);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
                  >
                    <Icon name="camera" size={18} color={colors.accentStrong} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void pickPhoto(false, mate.id);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
                  >
                    <Icon name="photo" size={18} color={colors.accentStrong} />
                  </Pressable>
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
                      kind:
                        form.kind === OrderItemKind.DOOR
                          ? OrderItemKind.WINDOW
                          : OrderItemKind.DOOR,
                      widthCm: '',
                      heightCm: '',
                      price: '',
                      quantity: '1',
                      photo: null,
                    },
                  ],
                });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addMate, pressed ? styles.pressed : null]}
            >
              <Icon name="assigned" size={18} color={colors.accentStrong} />
              <Text style={styles.addMateText}>{m('stock.addMate')}</Text>
            </Pressable>

            <SubmitButton label={m('stock.submit')} onPress={submit} pending={create.isPending} />
          </Card>
        )}

        <Card>
          <CardTitle title={m('stock.title')} icon="orders" />

          {/*
            Ошибка — внутри карточки списка, а не вместо всего экрана: кнопки
            «Продать», «Пошив для склада» и «Добавить» от списка не зависят и
            при сбое загрузки оставаться обязаны. Текст — свой, локализованный:
            сообщение сервера при сбое бывает английским «Internal server error».
          */}
          {items.isError ? (
            <ErrorState />
          ) : items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty message={m('stock.none')} hint={m('stock.noneHint')} />
          ) : (
            items.data.map((item, index, all) => (
              <View
                key={item.id}
                // Под последней шторой линии нет: её роль — делить строки, а
                // не отчёркивать список от скруглённого низа карточки.
                style={[styles.item, index === all.length - 1 ? styles.itemLast : null]}
              >
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
                      {money(
                        items.data
                          .filter((entry) => entry.setId === item.setId)
                          .reduce((sum, entry) => sum + parseMoney(entry.price), 0),
                      )}
                    </Text>
                  </View>
                )}
                {/*
                  Строка — сеткой: модель и цена в первой строке, код и остаток
                  во второй, вид · размер · филиал одной строкой ниже.

                  Раньше цена стояла колонкой справа от ВСЕГО текста и сжимала
                  его до 124 px: модель с кодом ломалась на три строки прямо по
                  дефисам кода, описание обрезалось, а цена с миниатюрой висели
                  по центру блока — на полсотни точек ниже названия.
                */}
                <View style={styles.itemHead}>
                  {item.photoUrl === null ? (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Text style={styles.thumbLetter}>
                        {item.model.trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
                  )}

                  <View style={styles.itemBody}>
                    <View style={styles.itemLine}>
                      <Text style={styles.itemTitle}>{item.model}</Text>
                      <Text style={styles.itemPrice}>{money(parseMoney(item.price))}</Text>
                    </View>
                    <View style={styles.itemLine}>
                      <Text style={styles.itemCode}>{item.code ?? ''}</Text>
                      <Text style={styles.itemQuantity}>
                        {m('stock.pcsOnly', { n: item.quantity })}
                      </Text>
                    </View>
                    <Text style={styles.itemMeta}>
                      {`${t(ORDER_ITEM_KIND_LABELS, item.kind)} · ${sizeOf(item)} · ${item.branchName}`}
                    </Text>
                    {/* Описание — целиком: по нему продавец отличает штору на полке. */}
                    {item.comment !== null && <Text style={styles.itemComment}>{item.comment}</Text>}
                  </View>
                </View>

                {/* Остаток и ценник правятся в шторке: строка внизу списка уезжала под клавиатуру. */}
                {/*
                  Действия — кнопками с полной высотой пальца, а не строками
                  текста: `hitSlop` браузер не знает, и в PWA цель была высотой
                  18 точек. Кнопки растягиваются по ряду, а не лежат рваной
                  строкой: три подписи в ширину телефона не помещаются ни
                  на одном из языков.
                */}
                <View style={styles.actionsRow}>
                  {item.quantity > 0 && (
                    <Pressable
                      onPress={() => {
                        navigation.navigate('SellReadyMade', { readyMadeItemId: item.id });
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.rowAction, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.rowActionText}>{m('stock.sell')}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setCounting(item.id);
                      setCountValue(item.quantity.toString());
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rowAction, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.rowActionText}>{m('stock.recount')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPricing(item.id);
                      setPriceValue(
                        parseMoney(item.price) > 0 ? (parseMoney(item.price) / 100).toString() : '',
                      );
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rowAction, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.rowActionText}>
                      {parseMoney(item.price) > 0 ? m('stock.changePrice') : m('stock.setPrice')}
                    </Text>
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
          {counted !== null && <SheetSubject {...subjectOf(counted)} />}
          <Field label={m('stock.quantity')}>
            <Input
              value={countValue}
              onChangeText={setCountValue}
              keyboardType="number-pad"
              placeholder="0"
              autoFocus
            />
          </Field>
          <SubmitButton
            label={m('emp.save')}
            disabled={counting === null}
            pending={setQuantity.isPending}
            onPress={() => {
              if (counting === null) return;
              setQuantity.mutate({
                id: counting,
                quantity: Math.max(0, Number.parseInt(countValue, 10) || 0),
              });
            }}
          />
        </BottomSheet>

        <BottomSheet
          visible={pricing !== null}
          // Заголовок — тем же словом, что и кнопка, которой шторку открыли.
          title={
            priced !== null && parseMoney(priced.price) <= 0
              ? m('stock.setPrice')
              : m('stock.changePrice')
          }
          onClose={() => {
            setPricing(null);
          }}
        >
          {priced !== null && <SheetSubject {...subjectOf(priced)} />}
          <Field label={m('sell.price')}>
            <MoneyInput value={priceValue} onChangeText={setPriceValue} placeholder="0" autoFocus />
          </Field>
          <SubmitButton
            label={m('emp.save')}
            disabled={pricing === null || inputToMajor(priceValue) <= 0}
            pending={setPrice.isPending}
            onPress={() => {
              if (pricing === null) return;
              setPrice.mutate({ id: pricing, price: inputToMajor(priceValue) });
            }}
          />
        </BottomSheet>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Какую штору правят: модель с кодом и вид с размером — над полем шторки. */
function SheetSubject({
  title,
  meta,
}: {
  readonly title: string;
  readonly meta: string;
}): ReactElement {
  return (
    <View style={styles.subject}>
      <Text style={styles.subjectTitle}>{title}</Text>
      <Text style={styles.subjectMeta}>{meta}</Text>
    </View>
  );
}

/*
  Кнопки экрана — одной системой, как на «Работе», откуда сюда приходят:
  крупные — 48 точек и таблеткой (как общая `SubmitButton`), кнопки строки
  списка — 44, тоже таблеткой. Прежде на одном экране жили четыре разных
  кнопки: 44 и 48 в высоту, скругление 14 и 999, с рамкой и без.
*/
const styles = StyleSheet.create({
  mate: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  /* Как шапка карточки (`CardTitle`): ссылка «Удалить» своей целью в 44
     заходит на отступы, а сама строка остаётся высотой в текст, и до
     первого поля — те же 12, что под заголовком карточки. */
  mateHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  mateTitle: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  /* Та же «добавить строку», что «Добавить позицию» в продаже с полки. */
  addMate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  addMateText: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
    flexShrink: 1,
    textAlign: 'center',
  },
  subject: {
    marginBottom: spacing.md,
    gap: 2,
  },
  subjectTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  subjectMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  setHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  /* 13, а не сноска: шапка комплекта и его сумма — то, что читают. */
  setTitle: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
    flex: 1,
    minWidth: 0,
  },
  setTotal: {
    ...typography.caption,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowAction: {
    flexGrow: 1,
    // 48, как «Пошив для склада» выше и любая кнопка действия: на одном
    // экране кнопки в 44 и в 48 выглядели собранными из разных наборов.
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  rowActionText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
    textAlign: 'center',
  },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /* Свои поля по бокам: без них узбекская подпись «Ombor uchun tikuv»
     упиралась в рамку кнопки вплотную. Восемь, а не двенадцать: при
     двенадцати она в половину ширины 360 уже не помещалась в строку. */
  action: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  actionText: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
    flexShrink: 1,
    textAlign: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  addText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
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
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
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
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  /* Строка «слева — своё, справа — число»: верхним краем, а не по центру. */
  itemLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemTitle: {
    ...typography.headline,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  itemCode: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemComment: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemPrice: {
    ...typography.headline,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'right',
  },
  itemQuantity: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  pressed: { opacity: opacity.pressed },
});

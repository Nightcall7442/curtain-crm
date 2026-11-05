import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CatalogKind,
  CurtainMountKind,
  curtainMountKindOf,
  inputToMajor,
  MATERIAL_CODE_KINDS,
  parseMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardLink, CardTitle } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import {
  DiscountFields,
  discountMissingReason,
  discountPayload,
  emptyDiscount,
} from '../components/DiscountFields';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import type { RootStackParamList } from '../types';
import { colors, fonts, hairline, opacity, radius, spacing, typography } from '../theme';
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
  const { t, m, money } = useLocale();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'SellReadyMade'>>();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [workPrice, setWorkPrice] = useState('');
  const [discount, setDiscount] = useState(emptyDiscount);
  const [deposit, setDeposit] = useState('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
  const [needsInstallation, setNeedsInstallation] = useState<'no' | 'yes'>('no');
  const [needsRework, setNeedsRework] = useState<'no' | 'yes'>('no');
  const [installAddress, setInstallAddress] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const insets = useSafeAreaInsets();

  /*
    Куда прокрутить при ошибке: «Продать» стоит в самом низу формы, а
    ошибки — у полей наверху, за тысячу точек от кнопки. Нажатие выглядело
    мёртвым: экран не двигался, рядом с кнопкой ничего не появлялось.
    Здесь запоминается, где лежит каждая карточка с проверяемыми полями.
  */
  const scroll = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<'client' | 'payment' | 'installation', number>>>({});
  const rememberY =
    (section: 'client' | 'payment' | 'installation') =>
    (event: LayoutChangeEvent): void => {
      sectionY.current[section] = event.nativeEvent.layout.y;
    };

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

  /*
    Пришли со склада с уже выбранной шторой — она и есть первая позиция, а
    остальные шторы её комплекта добавляются следом. Раньше продажа со
    склада начиналась с пустой формы, и если продавец не нажимал на строку
    остатка, штора с полки не списывалась — владелец увидел это как «покупка
    не минусуется».
  */
  const presetId = route.params?.readyMadeItemId;
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetId === undefined || presetApplied.current || stock.data === undefined) return;
    const chosen = stock.data.find((entry) => entry.id === presetId);
    if (chosen === undefined) return;
    presetApplied.current = true;
    const mates =
      chosen.setId === null
        ? []
        : stock.data.filter((entry) => entry.setId === chosen.setId && entry.id !== chosen.id);
    setItems([
      { ...emptyItem(1), model: chosen.model, readyMadeItemId: chosen.id },
      ...mates.map((mate, index) => ({
        ...emptyItem(index + 2),
        model: mate.model,
        readyMadeItemId: mate.id,
      })),
    ]);
    setWorkPrice(
      [chosen, ...mates].reduce((sum, entry) => sum + Number.parseFloat(entry.price), 0).toString(),
    );
  }, [presetId, stock.data]);

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const sell = trpc.orders.sellReadyMade.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      Alert.alert(
        needsRework === 'yes' || needsInstallation === 'yes'
          ? m('sell.sold')
          : m('sell.soldClosed'),
        needsRework === 'yes'
          ? m('sell.soldBodyRework')
          : needsInstallation === 'yes'
            ? m('sell.soldBodyInstall')
            : m('sell.soldBodyClosed'),
      );
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert(m('sell.error'), error.message);
    },
  });

  const errors = validate({ clientName, clientPhone, needsInstallation, installAddress }, m);
  /*
    Штора со склада без цены не продаётся. Иначе она уходила с полки
    даром: заказ закрывался со «Стоимость 0 сум», и это никто не замечал.
  */
  const priceMissing =
    items.some((item) => item.readyMadeItemId !== null) && inputToMajor(workPrice) <= 0;
  const hasErrors = Object.keys(errors).length > 0 || priceMissing;

  /*
    Без установки и переделки продажа закрывается сразу, а заказ с долгом
    не закрывается — поэтому такая продажа только за всю сумму: оплата
    подставляется сама и не правится.
  */
  const paidInFull = needsInstallation === 'no' && needsRework === 'no';
  const priceDue = discountPayload(workPrice, discount).workPrice;

  /** Цена со склада: ценник строки на количество, плюс шторы комплекта. */
  const stockPrice = (price: string, quantity: string, extra = 0): string =>
    (Number.parseFloat(price) * Math.max(1, Number.parseInt(quantity, 10) || 1) + extra).toString();

  const submit = (): void => {
    setShowErrors(true);
    const reasonMissing = discountMissingReason(workPrice, discount);
    if (hasErrors || reasonMissing) {
      notifyError();
      const target =
        errors.clientName !== undefined || errors.clientPhone !== undefined
          ? sectionY.current.client
          : priceMissing || reasonMissing
            ? sectionY.current.payment
            : sectionY.current.installation;
      if (target !== undefined) {
        scroll.current?.scrollTo({ y: Math.max(0, target - spacing.lg), animated: true });
      }
      return;
    }

    sell.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      ...discountPayload(workPrice, discount),
      deposit: paidInFull ? priceDue : inputToMajor(deposit),
      depositMethod,
      needsInstallation: needsInstallation === 'yes',
      needsRework: needsRework === 'yes',
      items: items.map((item) => ({
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.readyMadeItemId === null ? {} : { readyMadeItemId: item.readyMadeItemId }),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        // Крепление модели решает, какие коды уходят: труба — или карниз с
        // пластиком. Без модели кодов нет — и карнизчику ехать не за чем.
        ...(item.model.trim() === ''
          ? {}
          : mountOf(item.model) === CurtainMountKind.PIPE
            ? item.pipe.trim() === ''
              ? {}
              : { pipe: item.pipe.trim() }
            : {
                ...(item.corniceCode.trim() === '' ? {} : { corniceCode: item.corniceCode.trim() }),
                ...(item.plastic.trim() === '' ? {} : { plastic: item.plastic.trim() }),
              }),
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
      <ScrollView
        ref={scroll}
        /*
          Снизу — безопасная зона и обычный отступ, а не место под панель
          вкладок: это экран стека, панели под ним нет, и прежний отступ
          оставлял под кнопкой пустую полосу в 114 точек.
        */
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={rememberY('client')}>
          <Card>
            <CardTitle title={m('create.client')} icon="person" />

            <Field
              label={m('create.name')}
              required
              error={showErrors ? errors.clientName : undefined}
            >
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
        </View>

        {/*
          Деньги — на всю продажу, а не на позицию: так же, как в заказе на
          пошив. Клиент платит одну сумму и оставляет один задаток, и
          раскладывать их по строкам продавцу на кассе не нужно.
        */}
        <View onLayout={rememberY('payment')}>
          <Card>
            <CardTitle title={m('sell.payment')} icon="paid" />

            <View style={styles.money}>
              <View style={styles.moneyItem}>
                <Field label={m('sell.price')} required={items.some((item) => item.readyMadeItemId !== null)}>
                  <MoneyInput
                    value={workPrice}
                    onChangeText={setWorkPrice}
                    placeholder="0"
                    invalid={showErrors && priceMissing}
                  />
                </Field>
              </View>
              <View style={styles.moneyItem}>
                <Field
                  label={paidInFull ? m('sell.paidInFull') : m('create.deposit')}
                  {...(paidInFull ? { hint: m('sell.fullPaymentOnly') } : {})}
                >
                  {/* Подставленная сумма не правится — и выглядит не полем
                      ввода, а справкой: приглушённая подложка и текст. */}
                  <MoneyInput
                    value={paidInFull ? (priceDue > 0 ? priceDue.toString() : '') : deposit}
                    onChangeText={setDeposit}
                    editable={!paidInFull}
                    placeholder="0"
                    style={paidInFull ? styles.inputReadOnly : undefined}
                  />
                </Field>
              </View>
            </View>
            <DiscountFields
              price={workPrice}
              value={discount}
              onChange={setDiscount}
              showError={showErrors}
            />
            {/* Способ оплаты предоплаты — из него складывается касса дня. */}
            <Field label={m('cash.method')}>
              <ChipSelect
                value={depositMethod}
                onChange={setDepositMethod}
                options={PAYMENT_METHODS.map((value) => ({
                  value,
                  label: t(PAYMENT_METHOD_LABELS, value),
                }))}
              />
            </Field>
          </Card>
        </View>

        {items.map((item, index) => (
          <Card key={item.id}>
            <CardTitle
              title={m('create.item', { n: index + 1 })}
              icon="window"
              /*
                Ссылка шапки карточки — общая `CardLink`: цель в 44 точки (была
                подпись 15 точек ростом, `hitSlop` в браузере не работает) и
                тот же кегль, что у остальных действий в шапках карточек.
              */
              action={
                items.length > 1 ? (
                  <CardLink
                    label={m('create.remove')}
                    tone="danger"
                    accessibilityLabel={m('create.removeItem', { n: index + 1 })}
                    onPress={() => {
                      setItems((current) => current.filter((entry) => entry.id !== item.id));
                    }}
                  />
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
                      /* Модель есть на полке ровно в одном варианте — берём его
                         сразу, чтобы штора списалась, даже если строку остатка
                         никто не нажмёт. Несколько вариантов — выбор ниже. */
                      const matching = (stock.data ?? []).filter(
                        (entry) => entry.model === model && entry.quantity > 0,
                      );
                      const only = matching.length === 1 ? matching[0] : undefined;
                      updateItem(item.id, {
                        model,
                        readyMadeItemId: only?.id ?? null,
                      });
                      // Цена — как при нажатии на строку остатка: строка выбрана
                      // сама, и без ценника продажа ушла бы за ноль.
                      if (only !== undefined && workPrice.trim() === '') {
                        setWorkPrice(stockPrice(only.price, item.quantity));
                      }
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
              Коды со склада — как в заказе на пошив, по креплению модели из
              справочника: трубным («Труба», «Киприк») — код трубы, остальным —
              карниз с пластиком. Появляются после выбора модели: без неё
              неизвестно, что спрашивать. С кодами продажа уходит карнизчику.
            */}
            {item.model.trim() !== '' && mountOf(item.model) === CurtainMountKind.PIPE && (
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

            {item.model.trim() !== '' && mountOf(item.model) !== CurtainMountKind.PIPE && (
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
                      return <Text style={styles.stockHint}>{m('sell.noStock')}</Text>;
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
                            /*
                              Комплект: остальные шторы того же пошива (дверь к
                              окну) добавляются позициями сами — продаются они
                              вместе. Лишнюю позицию продавец убирает крестиком,
                              и комплект расторгается: неснятое остаётся на полке.
                            */
                            const mates =
                              chosen || entry.setId === null
                                ? []
                                : (stock.data ?? []).filter(
                                    (other) =>
                                      other.setId === entry.setId &&
                                      other.id !== entry.id &&
                                      !items.some((draft) => draft.readyMadeItemId === other.id),
                                  );
                            if (mates.length > 0) {
                              setItems((current) => [
                                ...current,
                                ...mates.map((mate, offset) => ({
                                  ...emptyItem(
                                    Math.max(0, ...current.map((draft) => draft.id)) + offset + 1,
                                  ),
                                  model: mate.model,
                                  readyMadeItemId: mate.id,
                                })),
                              ]);
                              Alert.alert(
                                m('stock.set', { n: entry.setLabel ?? '' }),
                                m('sell.setAdded', { n: entry.setLabel ?? '' }),
                              );
                            }
                            // Цену подставляем, пока продавец её не трогал:
                            // переписать её он всегда успеет, а вот забыть
                            // ценник со склада — обычное дело.
                            if (!chosen && workPrice.trim() === '') {
                              setWorkPrice(
                                stockPrice(
                                  entry.price,
                                  item.quantity,
                                  mates.reduce(
                                    (sum, mate) => sum + Number.parseFloat(mate.price),
                                    0,
                                  ),
                                ),
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
                          {/*
                            Выбор — кружком, как у переключателя: прежде
                            выбранную строку отличала только бледная заливка,
                            и на солнце её было не разглядеть.
                          */}
                          <View style={styles.stockMark}>
                            {chosen ? (
                              <Icon name="completed" size={22} color={colors.accent} />
                            ) : (
                              <View style={styles.stockRadio} />
                            )}
                          </View>
                          {/*
                            Размер и цена — одной строкой сверху, код и
                            остальное — под ними во всю ширину. Прежде цена
                            занимала свою колонку по центру строки, тексту
                            оставалось 160 точек, и код с бирки рвался по
                            дефису: «ГШ-015-» / «ЛЕН-ВЕНЕЦИЯ».
                          */}
                          <View style={styles.stockBody}>
                            <View style={styles.stockHead}>
                              <Text style={styles.stockName}>
                                {m('sell.cm', {
                                  w: Number.parseFloat(entry.widthCm),
                                  h: Number.parseFloat(entry.heightCm),
                                })}
                              </Text>
                              <Text style={styles.stockPrice}>{money(parseMoney(entry.price))}</Text>
                            </View>
                            {entry.code !== null && <Text style={styles.stockCode}>{entry.code}</Text>}
                            {entry.comment !== null && (
                              <Text style={styles.stockMeta} numberOfLines={2}>
                                {entry.comment}
                              </Text>
                            )}
                            <Text style={styles.stockMeta}>
                              {m('sell.pcs', { branch: entry.branchName, n: entry.quantity })}
                            </Text>
                          </View>
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

        <View onLayout={rememberY('installation')}>
          <Card>
            <CardTitle title={m('sell.installation')} icon="deadline" />

            {/* Переделка — штору подгоняют в цеху; продажа уходит админу, как заказ. */}
            <Field label={m('sell.needRework')}>
              <ChipSelect
                value={needsRework}
                onChange={setNeedsRework}
                options={[
                  { value: 'no', label: m('sell.reworkNo') },
                  { value: 'yes', label: m('sell.reworkYes') },
                ]}
              />
            </Field>

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
        </View>

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
              {needsRework === 'yes'
                ? m('sell.submitRework')
                : needsInstallation === 'yes'
                  ? m('sell.submitInstall')
                  : m('sell.submitClose')}
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
  /** Коды со склада — карниза и пластика к нему; какие спрашивать, решает модель. */
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
  corniceCode: '',
  plastic: '',
  pipe: '',
  quantity: '1',
  comment: '',
  readyMadeItemId: null,
});

function validate(
  values: {
    readonly clientName: string;
    readonly clientPhone: string;
    readonly needsInstallation: 'no' | 'yes';
    readonly installAddress: string;
  },
  m: Translate,
): Partial<Record<'clientName' | 'clientPhone' | 'installAddress', string>> {
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

/** Строка под кодом: что это за материал по справочнику, если код там есть. */
function CodeDescription({
  description,
}: {
  readonly description: string | null;
}): ReactElement | null {
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
    // Ритм полей формы: отступ снизу, как у `Field`, а не сверху. Прежде
    // блок стоял в 24 точках от поля выше и вплотную к «Комментарию».
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  codeDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  stockTitle: {
    ...typography.caption,
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    fontWeight: '700',
    // Подпись к строкам — как подпись поля к полю (`Field`): 4 точки.
    marginBottom: spacing.xs - spacing.sm,
  },
  stockHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockRowChosen: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  /** Колонка значка ростом в строку размера — кружок по её центру. */
  stockMark: {
    width: 22,
    height: typography.body.lineHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockRadio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  stockBody: {
    flex: 1,
    minWidth: 0,
  },
  stockHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stockName: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  stockCode: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stockMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stockPrice: {
    ...typography.headline,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 0,
  },
  addItemText: {
    ...typography.body,
    fontFamily: fonts.semibold,
    color: colors.accentStrong,
    fontWeight: '600',
  },
  inputReadOnly: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
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
    fontFamily: fonts.semibold,
    color: colors.onAccent,
    fontWeight: '600',
  },
});

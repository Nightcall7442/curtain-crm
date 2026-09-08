import {
  areaM2FromCm,
  CatalogKind,
  CORNICE_ROTATION_LABELS,
  CORNICE_ROTATIONS,
  curtainMountKindOf,
  CurtainMountKind,
  MATERIAL_CODE_KINDS,
  ORDER_ITEM_KIND_LABELS,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  PRIORITIES,
  PRIORITY_LABELS,
  Priority,
  type CorniceRotation,
} from '@curtain-crm/shared';
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

import { Card, CardTitle } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Создание заказа с телефона.
 *
 * Раньше заказ можно было завести только в веб-панели, хотя сервер разрешает
 * это продавцу (`orders.create` — процедура уровня приёмки). Продавец при
 * этом работает у клиента дома, с телефоном в руках, и возвращаться к
 * компьютеру ради ввода заказа — ровно тот шаг, из-за которого данные
 * попадают в систему вечером и по памяти.
 *
 * Позиция заказа здесь настолько же подробная, что и в веб-панели: продавец
 * заполняет карниз, тюль, антимоскитную сетку и аксессуары на месте, у
 * клиента, — а не восстанавливает их по памяти вечером за компьютером.
 *
 * Филиал не спрашивается: сервер берёт основной филиал сотрудника. Если он
 * не задан, придёт понятный отказ — выдумывать выбор из филиалов, к которым
 * продавец не привязан, незачем.
 */

/** Один аксессуар позиции: держатель, султанчик, бубон, сачак и т.д. */
interface AccessoryDraft {
  readonly id: number;
  readonly name: string;
  readonly quantity: string;
  readonly code: string;
}

const emptyAccessory = (id: number): AccessoryDraft => ({ id, name: '', quantity: '1', code: '' });

/**
 * Материал позиции в форме — один код с этикетки.
 *
 * Метраж и описание продавец больше не набирает: описание приходит из
 * справочника, который ведёт руководитель, и «П-31» значит одно и то же во
 * всех заказах, а не то, что успел дописать продавец у клиента дома.
 */
interface MaterialDraft {
  readonly code: string;
}

const emptyMaterial = (): MaterialDraft => ({ code: '' });

/** Портьер на позицию бывает несколько — потому у них есть ключ списка. */
interface PortiereDraft extends MaterialDraft {
  readonly id: number;
}

const emptyPortiere = (id: number): PortiereDraft => ({ id, ...emptyMaterial() });

/**
 * Материал для отправки на сервер. `undefined` — код не заполнен.
 *
 * Метраж уходит пустым: колонка в позиции заказа осталась, но продавец её
 * больше не набирает. Описание — из справочника, а не из формы.
 */
function toMaterial(
  draft: MaterialDraft,
  description: string | null,
): { code: string; meters: number | null; description: string | null } | undefined {
  const code = draft.code.trim();
  if (code === '') return undefined;

  return { code, meters: null, description };
}

/**
 * Код материала с подсказкой из справочника.
 *
 * Описание показывается только после того, как код введён: до этого
 * показывать нечего, а пустая строка на месте подсказки читалась бы как
 * «справочник молчит».
 */
function MaterialFields({
  label,
  placeholder,
  value,
  description,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: MaterialDraft;
  readonly description: string | null;
  readonly onChange: (patch: Partial<MaterialDraft>) => void;
}): ReactElement {
  return (
    <Field label={label} hint="Код с этикетки">
      <Input
        value={value.code}
        onChangeText={(code) => {
          onChange({ code });
        }}
        placeholder={placeholder}
      />
      <CodeDescription code={value.code} description={description} />
    </Field>
  );
}

/** Описание кода из справочника — под полем, только после ввода кода. */
function CodeDescription({
  code,
  description,
}: {
  readonly code: string;
  readonly description: string | null;
}): ReactElement | null {
  if (code.trim() === '') return null;

  return (
    <Text style={description === null ? styles.codeMissing : styles.codeDescription}>
      {description ?? 'Такого кода нет в справочнике'}
    </Text>
  );
}

/** Позиция заказа в форме. Идентификатор нужен только для ключа списка. */
interface DraftItem {
  readonly id: number;
  readonly kind: OrderItemKind;
  readonly model: string;
  readonly heightCm: string;
  readonly widthCm: string;
  readonly quantity: string;
  /** Портьеры — коды тканей, которых на одну позицию бывает несколько. */
  readonly portieres: readonly PortiereDraft[];
  /** Остальные материалы — по одному на позицию, форма та же. */
  readonly tulle: MaterialDraft;
  readonly protection: MaterialDraft;
  readonly cornice: MaterialDraft;
  readonly plastic: MaterialDraft;
  readonly pipe: MaterialDraft;
  readonly corniceRotation: CorniceRotation | null;
  readonly accessories: readonly AccessoryDraft[];
  readonly comment: string;
}

const emptyItem = (id: number): DraftItem => ({
  id,
  kind: OrderItemKind.WINDOW,
  model: '',
  heightCm: '',
  widthCm: '',
  quantity: '1',
  portieres: [emptyPortiere(1)],
  tulle: emptyMaterial(),
  protection: emptyMaterial(),
  cornice: emptyMaterial(),
  plastic: emptyMaterial(),
  pipe: emptyMaterial(),
  corniceRotation: null,
  accessories: [],
  comment: '',
});

export function OrderCreateScreen(): ReactElement {
  const { t } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.NORMAL);
  const [deadline, setDeadline] = useState('');
  const [workPrice, setWorkPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [items, setItems] = useState<readonly DraftItem[]>([emptyItem(1)]);
  const [showErrors, setShowErrors] = useState(false);

  const catalog = trpc.catalog.list.useQuery({});

  /** Справочники, сгруппированные по виду — как в веб-панели. */
  const byKind = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of catalog.data ?? []) {
      const bucket = map.get(entry.kind) ?? [];
      bucket.push(entry.name);
      map.set(entry.kind, bucket);
    }
    return map;
  }, [catalog.data]);

  /**
   * Аксессуары — из двух справочников сразу: «Сачак» такой же аксессуар,
   * как держатель или бубон, просто из другого списка (как в веб-панели).
   */
  const accessoryOptions = useMemo(() => {
    const names = new Set([
      ...(byKind.get(CatalogKind.ACCESSORY) ?? []),
      ...(byKind.get(CatalogKind.SACHAK) ?? []),
    ]);
    return Array.from(names);
  }, [byKind]);

  const modelOptions = byKind.get(CatalogKind.CURTAIN_MODEL) ?? [];

  /**
   * Мини-описания кодов и крепление моделей — из того же справочника.
   *
   * Ключ с приведённым регистром: продавец переписывает код с этикетки от
   * руки, и «п-31» должно найтись так же, как «П-31».
   */
  const codeDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog.data ?? []) {
      if (entry.description !== null && entry.description !== '') {
        map.set(`${entry.kind}:${entry.name.trim().toLowerCase()}`, entry.description);
      }
    }
    return map;
  }, [catalog.data]);

  const describeCode = (kind: string, code: string): string | null =>
    codeDescriptions.get(`${kind}:${code.trim().toLowerCase()}`) ?? null;

  const mountByModel = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of catalog.data ?? []) {
      if (entry.kind === CatalogKind.CURTAIN_MODEL) map.set(entry.name, entry.mountKind);
    }
    return map;
  }, [catalog.data]);

  /** Труба или пластик с карнизом — что спрашивать для выбранной модели. */
  const mountOf = (model: string): string => curtainMountKindOf(mountByModel.get(model));

  const create = trpc.orders.create.useMutation({
    async onSuccess(order) {
      await utils.orders.list.invalidate();
      // Уходим сразу в карточку: следующий шаг продавца — приложить фото
      // и отправить заказ админу, и оба действия там.
      navigation.navigate('OrderDetail', { orderId: order.id });
    },
    onError(error) {
      Alert.alert('Заказ не создан', error.message);
    },
  });

  const updateItem = (id: number, patch: Partial<DraftItem>): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const updatePortiere = (
    itemId: number,
    portiereId: number,
    patch: Partial<PortiereDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              portieres: item.portieres.map((portiere) =>
                portiere.id === portiereId ? { ...portiere, ...patch } : portiere,
              ),
            },
      ),
    );
  };

  const updateAccessory = (
    itemId: number,
    accessoryId: number,
    patch: Partial<AccessoryDraft>,
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              accessories: item.accessories.map((accessory) =>
                accessory.id === accessoryId ? { ...accessory, ...patch } : accessory,
              ),
            },
      ),
    );
  };

  const errors = validate({ clientName, clientPhone, deadline, items });
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    create.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      priority,
      ...(installAddress.trim() === '' ? {} : { installAddress: installAddress.trim() }),
      ...(deadline.trim() === '' ? {} : { deadline: deadline.trim() }),
      workPrice: toMoney(workPrice),
      deposit: toMoney(deposit),
      items: items.map((item) => {
        /*
          Строки материала, которых у этой модели не бывает, на сервер не
          уезжают, даже если продавец успел их заполнить до смены модели.
        */
        const onPipe = mountOf(item.model) === CurtainMountKind.PIPE;

        const tulle = toMaterial(
          item.tulle,
          describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code),
        );
        const protection = toMaterial(
          item.protection,
          describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code),
        );
        const cornice = onPipe
          ? undefined
          : toMaterial(item.cornice, describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code));
        const plastic = onPipe
          ? undefined
          : toMaterial(item.plastic, describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code));
        const pipe = onPipe
          ? toMaterial(item.pipe, describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code))
          : undefined;

        return {
        kind: item.kind,
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        ...(item.model.trim() === '' ? {} : { model: item.model.trim() }),
        ...(item.heightCm.trim() !== '' && item.widthCm.trim() !== ''
          ? {
              heightCm: Number.parseFloat(item.heightCm.replace(',', '.')),
              widthCm: Number.parseFloat(item.widthCm.replace(',', '.')),
            }
          : {}),
        portieres: item.portieres
          .map((portiere) =>
            toMaterial(portiere, describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code)),
          )
          .filter((portiere) => portiere !== undefined),
        ...(tulle === undefined ? {} : { tulle }),
        ...(protection === undefined ? {} : { protection }),
        ...(cornice === undefined ? {} : { cornice }),
        ...(plastic === undefined ? {} : { plastic }),
        ...(pipe === undefined ? {} : { pipe }),
        ...(item.corniceRotation === null ? {} : { corniceRotation: item.corniceRotation }),
        accessories: item.accessories
          .filter((accessory) => accessory.name.trim() !== '')
          .map((accessory) => ({
            name: accessory.name.trim(),
            quantity: Math.max(1, Number.parseInt(accessory.quantity, 10) || 1),
            code: accessory.code.trim() === '' ? null : accessory.code.trim(),
          })),
        ...(item.comment.trim() === '' ? {} : { comment: item.comment.trim() }),
        };
      }),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // На Android окно поджимает система (`adjustResize`), на iOS — нет,
      // и без этого нижние поля формы уезжают под клавиатуру.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle title="Клиент" icon="person" />

          <Field label="Имя" required error={showErrors ? errors.clientName : undefined}>
            <Input
              value={clientName}
              onChangeText={setClientName}
              placeholder="Как обращаться к клиенту"
              autoCapitalize="words"
              invalid={showErrors && errors.clientName !== undefined}
            />
          </Field>

          <Field
            label="Телефон"
            required
            hint="Любой формат: +998 90 123 45 67 или 901234567"
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

          <Field label="Адрес установки">
            <Input
              value={installAddress}
              onChangeText={setInstallAddress}
              placeholder="Улица, дом, квартира"
              multiline
            />
          </Field>
        </Card>

        <Card>
          <CardTitle title="Условия" icon="deadline" />

          <Field label="Приоритет">
            <ChipSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS, value) }))}
            />
          </Field>

          <Field
            label="Срок"
            hint="Год-месяц-день, например 2026-09-15"
            error={showErrors ? errors.deadline : undefined}
          >
            <Input
              value={deadline}
              onChangeText={setDeadline}
              placeholder="2026-09-15"
              keyboardType="numbers-and-punctuation"
              invalid={showErrors && errors.deadline !== undefined}
            />
          </Field>

          <View style={styles.money}>
            <View style={styles.moneyItem}>
              <Field label="Стоимость работ">
                <MoneyInput
                  value={workPrice}
                  onChangeText={setWorkPrice}
                  placeholder="0"
                />
              </Field>
            </View>
            <View style={styles.moneyItem}>
              <Field label="Предоплата">
                <MoneyInput
                  value={deposit}
                  onChangeText={setDeposit}
                  placeholder="0"
                />
              </Field>
            </View>
          </View>
        </Card>


        {items.map((item, index) => {
          const widthNum = Number.parseFloat(item.widthCm.replace(',', '.'));
          const heightNum = Number.parseFloat(item.heightCm.replace(',', '.'));
          const area =
            Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0
              ? areaM2FromCm(widthNum, heightNum)
              : null;

          return (
            <Card key={item.id}>
              <CardTitle
                title={`Позиция ${(index + 1).toString()}`}
                icon="window"
                action={
                  items.length > 1 ? (
                    <Pressable
                      onPress={() => {
                        setItems((current) => current.filter((entry) => entry.id !== item.id));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Удалить позицию ${(index + 1).toString()}`}
                      hitSlop={8}
                    >
                      {({ pressed }) => (
                        <Text style={[styles.remove, pressed ? styles.pressed : null]}>Удалить</Text>
                      )}
                    </Pressable>
                  ) : undefined
                }
              />

              <Field label="Что шьём">
                <ChipSelect
                  value={item.kind}
                  onChange={(kind) => {
                    updateItem(item.id, { kind });
                  }}
                  options={ORDER_ITEM_KINDS.map((value) => ({
                    value,
                    label: t(ORDER_ITEM_KIND_LABELS, value),
                  }))}
                />
              </Field>

              <Field label="Модель">
                <CatalogPicker
                  value={item.model}
                  placeholder="Не выбрана"
                  options={modelOptions}
                  sheetTitle="Модель"
                  onChange={(model) => {
                    updateItem(item.id, { model });
                  }}
                />
              </Field>

              <View style={styles.money}>
                <View style={styles.moneyItem}>
                  <Field label="Высота, см">
                    <Input
                      value={item.heightCm}
                      onChangeText={(heightCm) => {
                        updateItem(item.id, { heightCm });
                      }}
                      keyboardType="numeric"
                      placeholder="200"
                    />
                  </Field>
                </View>
                <View style={styles.moneyItem}>
                  <Field
                    label="Ширина, см"
                    hint={area === null ? undefined : `Площадь: ${area.toFixed(2)} м²`}
                  >
                    <Input
                      value={item.widthCm}
                      onChangeText={(widthCm) => {
                        updateItem(item.id, { widthCm });
                      }}
                      keyboardType="numeric"
                      placeholder="150"
                    />
                  </Field>
                </View>
              </View>

              <Field label="Количество">
                <Input
                  value={item.quantity}
                  onChangeText={(quantity) => {
                    updateItem(item.id, { quantity });
                  }}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </Field>

              {/*
                Портьеры — список: на одну позицию иногда идут две ткани
                (контрастная вставка, разный метраж). Тот же приём, что у
                аксессуаров: код с этикетки, описание подтягивается из
                справочника кодов портьер.
              */}
              <View style={styles.accessories}>
                <View style={styles.accessoriesHeader}>
                  <Text style={styles.accessoriesTitle}>Портьера</Text>
                  <Pressable
                    onPress={() => {
                      const nextId =
                        item.portieres.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
                      updateItem(item.id, { portieres: [...item.portieres, emptyPortiere(nextId)] });
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.addAccessory, pressed ? styles.pressed : null]}>
                        + Портьера
                      </Text>
                    )}
                  </Pressable>
                </View>

                {item.portieres.length === 0 ? (
                  <Text style={styles.accessoriesHint}>Код ткани с этикетки</Text>
                ) : (
                  item.portieres.map((portiere) => (
                    <View key={portiere.id} style={styles.accessoryRow}>
                      <View style={styles.accessoryName}>
                        <Input
                          value={portiere.code}
                          onChangeText={(code) => {
                            updatePortiere(item.id, portiere.id, { code });
                          }}
                          placeholder="Например: П-31"
                        />
                        <CodeDescription
                          code={portiere.code}
                          description={describeCode(MATERIAL_CODE_KINDS.portiere, portiere.code)}
                        />
                      </View>
                      {item.portieres.length > 1 ? (
                        <Pressable
                          onPress={() => {
                            updateItem(item.id, {
                              portieres: item.portieres.filter((entry) => entry.id !== portiere.id),
                            });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Удалить портьеру"
                          hitSlop={8}
                          style={styles.accessoryRemove}
                        >
                          <Icon name="remove" size={18} color={colors.danger} />
                        </Pressable>
                      ) : (
                        <View style={styles.accessoryRemove} />
                      )}
                    </View>
                  ))
                )}
              </View>

              <MaterialFields
                label="Тюль"
                placeholder="Например: Т-22"
                value={item.tulle}
                description={describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code)}
                onChange={(patch) => {
                  updateItem(item.id, { tulle: { ...item.tulle, ...patch } });
                }}
              />

              {/*
                Защита пришла на смену «антимоскитной сетке»: сетка была не
                единственным защитным полотном, а какое именно нужно — цех
                узнавал только на словах. Теперь это такая же строка
                материала, как тюль: заполнен код — защита есть.
              */}
              <MaterialFields
                label="Защита"
                placeholder="Например: З-07"
                value={item.protection}
                description={describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code)}
                onChange={(patch) => {
                  updateItem(item.id, { protection: { ...item.protection, ...patch } });
                }}
              />

              {/*
                Крепление модели решает, что спрашивать: у трубных моделей
                («Труба», «Киприк») карниза с пластиком не бывает, у остальных
                не бывает трубы. Группу задаёт руководитель у модели
                в справочнике.
              */}
              {mountOf(item.model) === CurtainMountKind.PIPE ? (
                <MaterialFields
                  label="Труба"
                  placeholder="Код трубы"
                  value={item.pipe}
                  description={describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code)}
                  onChange={(patch) => {
                    updateItem(item.id, { pipe: { ...item.pipe, ...patch } });
                  }}
                />
              ) : (
                <>
                  <MaterialFields
                    label="Карниз"
                    placeholder="Например: К-104"
                    value={item.cornice}
                    description={describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code)}
                    onChange={(patch) => {
                      updateItem(item.id, { cornice: { ...item.cornice, ...patch } });
                    }}
                  />

                  <MaterialFields
                    label="Пластик"
                    placeholder="Код пластика"
                    value={item.plastic}
                    description={describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code)}
                    onChange={(patch) => {
                      updateItem(item.id, { plastic: { ...item.plastic, ...patch } });
                    }}
                  />
                </>
              )}

              <Field label="Поворот карниза">
                <ChipSelect
                  value={item.corniceRotation ?? ''}
                  onChange={(corniceRotation) => {
                    updateItem(item.id, {
                      corniceRotation: corniceRotation === '' ? null : corniceRotation,
                    });
                  }}
                  options={[
                    { value: '', label: 'Не задан' },
                    ...CORNICE_ROTATIONS.map((value) => ({
                      value,
                      label: t(CORNICE_ROTATION_LABELS, value),
                    })),
                  ]}
                />
              </Field>

              <View style={styles.accessories}>
                <View style={styles.accessoriesHeader}>
                  <Text style={styles.accessoriesTitle}>Аксессуары</Text>
                  <Pressable
                    onPress={() => {
                      const nextId =
                        item.accessories.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
                      updateItem(item.id, { accessories: [...item.accessories, emptyAccessory(nextId)] });
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.addAccessory, pressed ? styles.pressed : null]}>
                        + Добавить
                      </Text>
                    )}
                  </Pressable>
                </View>

                {item.accessories.length === 0 ? (
                  <Text style={styles.accessoriesHint}>
                    Держатели, султанчики, бубоны, обхваты, сачак — по одному, с количеством и кодом
                  </Text>
                ) : (
                  item.accessories.map((accessory) => (
                    <View key={accessory.id} style={styles.accessoryRow}>
                      <View style={styles.accessoryName}>
                        <CatalogPicker
                          value={accessory.name}
                          placeholder="Аксессуар"
                          options={accessoryOptions}
                          sheetTitle="Аксессуар"
                          onChange={(name) => {
                            updateAccessory(item.id, accessory.id, { name });
                          }}
                        />
                      </View>
                      <View style={styles.accessoryQuantity}>
                        <Input
                          value={accessory.quantity}
                          onChangeText={(quantity) => {
                            updateAccessory(item.id, accessory.id, { quantity });
                          }}
                          keyboardType="number-pad"
                          placeholder="1"
                        />
                      </View>
                      <View style={styles.accessoryCode}>
                        <Input
                          value={accessory.code}
                          onChangeText={(code) => {
                            updateAccessory(item.id, accessory.id, { code });
                          }}
                          placeholder="Код"
                        />
                      </View>
                      <Pressable
                        onPress={() => {
                          updateItem(item.id, {
                            accessories: item.accessories.filter((entry) => entry.id !== accessory.id),
                          });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Удалить аксессуар"
                        hitSlop={8}
                        style={styles.accessoryRemove}
                      >
                        <Icon name="remove" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>

              <Field label="Комментарий">
                <Input
                  value={item.comment}
                  onChangeText={(comment) => {
                    updateItem(item.id, { comment });
                  }}
                  placeholder="Что важно помнить по этой позиции"
                  multiline
                />
              </Field>
            </Card>
          );
        })}

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
          <Text style={styles.addItemText}>Добавить позицию</Text>
        </Pressable>

        <Pressable
          onPress={submit}
          disabled={create.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            create.isPending ? styles.submitBusy : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>Создать заказ</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Заказ уйдёт администратору на проверку. Фотографии замера и остальные детали
          можно добавить в карточке заказа.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Проверка формы.
 *
 * Дублирует часть серверных правил НАМЕРЕННО: сервер всё равно проверит и
 * останется единственным источником истины, но подсказать об очевидной
 * ошибке до отправки дешевле, чем показать отказ после запроса — особенно
 * на плохой связи в чужой квартире.
 */
function validate(values: {
  readonly clientName: string;
  readonly clientPhone: string;
  readonly deadline: string;
  readonly items: readonly DraftItem[];
}): Partial<Record<'clientName' | 'clientPhone' | 'deadline', string>> {
  const errors: Record<string, string> = {};

  if (values.clientName.trim() === '') {
    errors['clientName'] = 'Укажите имя клиента';
  }

  // Только длина: приведение номера к единому виду делает сервер, и
  // повторять здесь его правила означало бы разойтись с ними при первой правке.
  const digits = values.clientPhone.replace(/\D/g, '');
  if (digits.length < 9) {
    errors['clientPhone'] = 'Похоже, номер неполный';
  }

  if (values.deadline.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline.trim())) {
    errors['deadline'] = 'Дата в виде 2026-09-15';
  }

  return errors;
}

/** Сумма из поля ввода. Пустое поле — ноль, а не отказ. */
function toMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  moneyItem: {
    flex: 1,
  },
  remove: {
    ...typography.caption,
    color: colors.danger,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  protectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: hairline * 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  protectionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  accessories: {
    marginBottom: spacing.lg,
  },
  accessoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  accessoriesTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addAccessory: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  accessoriesHint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  accessoryName: {
    flex: 1,
  },
  /* Описание из справочника: подсказка, а не введённое значение. */
  codeDescription: {
    ...typography.footnote,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  codeMissing: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  accessoryQuantity: {
    width: 56,
  },
  accessoryCode: {
    width: 84,
  },
  accessoryRemove: {
    width: 32,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
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
  addItemText: {
    ...typography.body,
    color: colors.accentStrong,
    fontWeight: '600',
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
  footnote: {
    ...typography.footnote,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

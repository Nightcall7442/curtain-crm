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
import { useMemo, useRef, useState, type ReactElement } from 'react';
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
import { CodeScanner } from '../components/CodeScanner';
import { ChipSelect, Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale, type Translate } from '../hooks/useLocale';
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
  onScan,
  hint,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: MaterialDraft;
  readonly description: string | null;
  readonly onChange: (patch: Partial<MaterialDraft>) => void;
  readonly onScan: () => void;
  /*
    Подсказка про камеру нужна один раз на позицию: под каждым из шести
    полей одна и та же фраза читалась как шум и отодвигала следующее поле.
  */
  readonly hint?: string;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <CodeInput
        value={value.code}
        placeholder={placeholder}
        onChangeText={(code) => {
          onChange({ code });
        }}
        onScan={onScan}
      />
      <CodeDescription code={value.code} description={description} />
    </Field>
  );
}

/**
 * Поле кода с кнопкой сканера.
 *
 * Код на этикетке рулона напечатан мелко и часто читается сквозь плёнку
 * зеркально; ошибка в одном символе означает, что справочник ткань не
 * найдёт, а цех возьмёт не тот рулон. Ввод руками остался — не на каждом
 * рулоне есть целая наклейка.
 */
function CodeInput({
  value,
  placeholder,
  onChangeText,
  onScan,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onChangeText: (value: string) => void;
  readonly onScan: () => void;
}): ReactElement {
  const { m } = useLocale();
  return (
    <View style={styles.codeRow}>
      <View style={styles.codeInput}>
        <Input value={value} onChangeText={onChangeText} placeholder={placeholder} />
      </View>
      <Pressable
        onPress={onScan}
        accessibilityRole="button"
        accessibilityLabel={m('create.scanA11y')}
        style={({ pressed }) => [styles.scanButton, pressed ? styles.pressed : null]}
      >
        <Icon name="camera" size={18} color={colors.accent} />
      </Pressable>
    </View>
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
  const { m } = useLocale();
  if (code.trim() === '') return null;

  return (
    <Text style={description === null ? styles.codeMissing : styles.codeDescription}>
      {description ?? m('create.codeMissing')}
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
  const { t, m } = useLocale();
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

  /*
    Сканер один на всю форму: полей с кодом на позицию до семи, и держать
    камеру в каждом значило бы семь смонтированных камер сразу. Куда положить
    результат, помнит ref — состояние здесь перерисовывалось бы зря.
  */
  const [scanning, setScanning] = useState<string | null>(null);
  const applyScan = useRef<((code: string) => void) | null>(null);

  const askScan = (label: string, apply: (code: string) => void): void => {
    applyScan.current = apply;
    setScanning(label);
  };

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
      Alert.alert(m('create.error'), error.message);
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

  const errors = validate({ clientName, clientPhone, deadline, items }, m);
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

          <Field label={m('create.address')}>
            <Input
              value={installAddress}
              onChangeText={setInstallAddress}
              placeholder={m('create.addressPlaceholder')}
              multiline
            />
          </Field>
        </Card>

        <Card>
          <CardTitle title={m('create.terms')} icon="deadline" />

          <Field label={m('create.priority')}>
            <ChipSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS, value) }))}
            />
          </Field>

          <Field
            label={m('create.deadline')}
            hint={m('create.deadlineHint')}
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
              <Field label={m('create.workPrice')}>
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

              <Field label={m('create.kind')}>
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

              <Field label={m('create.model')}>
                <CatalogPicker
                  value={item.model}
                  placeholder={m('create.notChosen')}
                  options={modelOptions}
                  sheetTitle={m('create.model')}
                  onChange={(model) => {
                    updateItem(item.id, { model });
                  }}
                />
              </Field>

              <View style={styles.money}>
                <View style={styles.moneyItem}>
                  <Field label={m('create.height')}>
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
                    label={m('create.width')}
                    hint={area === null ? undefined : m('create.area', { a: area.toFixed(2) })}
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

              <Field label={m('create.quantity')}>
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
                  <Text style={styles.accessoriesTitle}>{m('create.portiere')}</Text>
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
                        {m('create.addPortiere')}
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/*
                  Подсказка про камеру стоит здесь, у первой строки кода: она
                  одна на всю позицию, и повторять её под каждым из шести
                  полей значило бы шесть раз сказать одно и то же.
                */}
                <Text style={styles.accessoriesHint}>{m('create.codeHint')}</Text>

                {item.portieres.length === 0 ? null : (
                  item.portieres.map((portiere) => (
                    <View key={portiere.id} style={styles.accessoryRow}>
                      <View style={styles.accessoryName}>
                        <CodeInput
                          value={portiere.code}
                          placeholder={m('create.examplePortiere')}
                          onChangeText={(code) => {
                            updatePortiere(item.id, portiere.id, { code });
                          }}
                          onScan={() => {
                            askScan(m('create.portiere'), (code) => {
                              updatePortiere(item.id, portiere.id, { code });
                            });
                          }}
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
                          accessibilityLabel={m('create.removePortiere')}
                          hitSlop={8}
                          style={styles.accessoryRemove}
                        >
                          <Icon name="remove" size={18} color={colors.danger} />
                        </Pressable>
                      ) : null}
                      {/*
                        Пустого места под кнопку удаления не оставляем: с ним
                        поле единственной портьеры было короче остальных пяти
                        кодов — ряд полей переставал держать общий край.
                      */}
                    </View>
                  ))
                )}
              </View>

              <MaterialFields
                label={m('create.tulle')}
                placeholder={m('create.exampleTulle')}
                value={item.tulle}
                description={describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code)}
                onChange={(patch) => {
                  updateItem(item.id, { tulle: { ...item.tulle, ...patch } });
                }}
                onScan={() => {
                  askScan(m('create.tulle'), (code) => {
                    updateItem(item.id, { tulle: { ...item.tulle, code } });
                  });
                }}
              />

              {/*
                Защита пришла на смену «антимоскитной сетке»: сетка была не
                единственным защитным полотном, а какое именно нужно — цех
                узнавал только на словах. Теперь это такая же строка
                материала, как тюль: заполнен код — защита есть.
              */}
              <MaterialFields
                label={m('create.protection')}
                placeholder={m('create.exampleProtection')}
                value={item.protection}
                description={describeCode(MATERIAL_CODE_KINDS.protection, item.protection.code)}
                onChange={(patch) => {
                  updateItem(item.id, { protection: { ...item.protection, ...patch } });
                }}
                onScan={() => {
                  askScan(m('create.protection'), (code) => {
                    updateItem(item.id, { protection: { ...item.protection, code } });
                  });
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
                  label={m('create.pipe')}
                  placeholder={m('create.examplePipe')}
                  value={item.pipe}
                  description={describeCode(MATERIAL_CODE_KINDS.pipe, item.pipe.code)}
                  onChange={(patch) => {
                    updateItem(item.id, { pipe: { ...item.pipe, ...patch } });
                  }}
                  onScan={() => {
                    askScan(m('create.pipe'), (code) => {
                      updateItem(item.id, { pipe: { ...item.pipe, code } });
                    });
                  }}
                />
              ) : (
                <>
                  <MaterialFields
                    label={m('create.cornice')}
                    placeholder={m('create.exampleCornice')}
                    value={item.cornice}
                    description={describeCode(MATERIAL_CODE_KINDS.cornice, item.cornice.code)}
                    onChange={(patch) => {
                      updateItem(item.id, { cornice: { ...item.cornice, ...patch } });
                    }}
                    onScan={() => {
                      askScan(m('create.cornice'), (code) => {
                        updateItem(item.id, { cornice: { ...item.cornice, code } });
                      });
                    }}
                  />

                  <MaterialFields
                    label={m('create.plastic')}
                    placeholder={m('create.examplePlastic')}
                    value={item.plastic}
                    description={describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code)}
                    onChange={(patch) => {
                      updateItem(item.id, { plastic: { ...item.plastic, ...patch } });
                    }}
                    onScan={() => {
                      askScan(m('create.plastic'), (code) => {
                        updateItem(item.id, { plastic: { ...item.plastic, code } });
                      });
                    }}
                  />
                </>
              )}

              <Field label={m('create.rotation')}>
                <ChipSelect
                  value={item.corniceRotation ?? ''}
                  onChange={(corniceRotation) => {
                    updateItem(item.id, {
                      corniceRotation: corniceRotation === '' ? null : corniceRotation,
                    });
                  }}
                  options={[
                    /* «Нет» вместо «Не задан»: четыре чипа влезают в строку,
                       а рядом с подписью «Поворот карниза» смысл тот же. */
                    { value: '', label: m('create.none') },
                    ...CORNICE_ROTATIONS.map((value) => ({
                      value,
                      label: t(CORNICE_ROTATION_LABELS, value),
                    })),
                  ]}
                />
              </Field>

              <View style={styles.accessories}>
                <View style={styles.accessoriesHeader}>
                  <Text style={styles.accessoriesTitle}>{m('create.accessories')}</Text>
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
                        {m('create.add')}
                      </Text>
                    )}
                  </Pressable>
                </View>

                {item.accessories.length === 0 ? (
                  <Text style={styles.accessoriesHint}>{m('create.accessoriesHint')}</Text>
                ) : (
                  item.accessories.map((accessory) => (
                    <View key={accessory.id} style={styles.accessoryRow}>
                      <View style={styles.accessoryName}>
                        <CatalogPicker
                          value={accessory.name}
                          placeholder={m('create.accessory')}
                          options={accessoryOptions}
                          sheetTitle={m('create.accessory')}
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
                          placeholder={m('create.code')}
                        />
                      </View>
                      <Pressable
                        onPress={() => {
                          updateItem(item.id, {
                            accessories: item.accessories.filter((entry) => entry.id !== accessory.id),
                          });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={m('create.removeAccessory')}
                        hitSlop={8}
                        style={styles.accessoryRemove}
                      >
                        <Icon name="remove" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>

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
          <Text style={styles.addItemText}>{m('create.addItem')}</Text>
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
            <Text style={styles.submitText}>{m('create.submit')}</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>{m('create.footnote')}</Text>
      </ScrollView>
      <CodeScanner
        visible={scanning !== null}
        label={scanning ?? ''}
        onScan={(code) => {
          applyScan.current?.(code);
        }}
        onClose={() => {
          setScanning(null);
        }}
      />
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
}, m: Translate): Partial<Record<'clientName' | 'clientPhone' | 'deadline', string>> {
  const errors: Record<string, string> = {};

  if (values.clientName.trim() === '') {
    errors['clientName'] = m('create.nameRequired');
  }

  // Только длина: приведение номера к единому виду делает сервер, и
  // повторять здесь его правила означало бы разойтись с ними при первой правке.
  const digits = values.clientPhone.replace(/\D/g, '');
  if (digits.length < 9) {
    errors['clientPhone'] = m('create.phoneIncomplete');
  }

  if (values.deadline.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline.trim())) {
    errors['deadline'] = m('dayoff.dateFormat');
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
    /* Заголовок слева, «+ Добавить» справа: без этого они слипались в
       «Аксессуары+ Добавить» — читалось как одно слово. */
    justifyContent: 'space-between',
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

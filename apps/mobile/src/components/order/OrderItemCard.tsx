import {
  areaM2FromCm,
  CORNICE_ROTATION_LABELS,
  CORNICE_ROTATIONS,
  CurtainMountKind,
  MATERIAL_CODE_KINDS,
  ORDER_ITEM_KIND_LABELS,
  ORDER_ITEM_KINDS,
  OrderItemKind,
  type CorniceRotation,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, hairline, opacity, radius, spacing, typography } from '../../theme';
import { Card, CardTitle } from '../Card';
import { CatalogPicker } from '../CatalogPicker';
import { ChipSelect, Field, Input } from '../Field';
import { Icon } from '../Icon';

/** Один аксессуар позиции: держатель, султанчик, бубон, сачак и т.д. */
export interface AccessoryDraft {
  readonly id: number;
  readonly name: string;
  readonly quantity: string;
  readonly code: string;
}

export const emptyAccessory = (id: number): AccessoryDraft => ({
  id,
  name: '',
  quantity: '1',
  code: '',
});

/**
 * Материал позиции в форме — один код с этикетки.
 *
 * Метраж и описание продавец больше не набирает: описание приходит из
 * справочника, который ведёт руководитель, и «П-31» значит одно и то же во
 * всех заказах, а не то, что успел дописать продавец у клиента дома.
 */
export interface MaterialDraft {
  readonly code: string;
}

export const emptyMaterial = (): MaterialDraft => ({ code: '' });

/** Портьер на позицию бывает несколько — потому у них есть ключ списка. */
export interface PortiereDraft extends MaterialDraft {
  readonly id: number;
}

export const emptyPortiere = (id: number): PortiereDraft => ({ id, ...emptyMaterial() });

/**
 * Материал для отправки на сервер. `undefined` — код не заполнен.
 *
 * Метраж уходит пустым: колонка в позиции заказа осталась, но продавец её
 * больше не набирает. Описание — из справочника, а не из формы.
 */
export function toMaterial(
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
export interface DraftItem {
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

export const emptyItem = (id: number): DraftItem => ({
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

/** Что позиции нужно из справочника; собирает экран из `catalog.list`. */
export interface ItemCatalog {
  readonly modelOptions: readonly string[];
  readonly accessoryOptions: readonly string[];
  /** Труба или пластик с карнизом — что спрашивать для выбранной модели. */
  readonly mountOf: (model: string) => string;
  /** Описание кода со склада — подсказка под полем. */
  readonly describeCode: (kind: string, code: string) => string | null;
}

/**
 * Одна позиция заказа: окно или дверь с моделью, размерами, кодами тканей,
 * карнизом и аксессуарами.
 *
 * Состояние позиций живёт на экране — здесь только форма и её правки через
 * `onChange`; так экран создания остаётся про заказ целиком, а позиция —
 * про одну позицию.
 */
export function OrderItemCard({
  item,
  index,
  canRemove,
  onRemove,
  onChange,
  onPortiere,
  onAccessory,
  catalog,
  askScan,
}: {
  readonly item: DraftItem;
  readonly index: number;
  /** Единственную позицию удалить нельзя — заказ без позиций не бывает. */
  readonly canRemove: boolean;
  readonly onRemove: () => void;
  readonly onChange: (patch: Partial<DraftItem>) => void;
  readonly onPortiere: (portiereId: number, patch: Partial<PortiereDraft>) => void;
  readonly onAccessory: (accessoryId: number, patch: Partial<AccessoryDraft>) => void;
  /** Справочник: модели, аксессуары, крепление модели и описания кодов. */
  readonly catalog: ItemCatalog;
  /** Открыть сканер: куда положить результат, решает вызывающий. */
  readonly askScan: (label: string, apply: (code: string) => void) => void;
}): ReactElement {
  const { t, m } = useLocale();
  const { modelOptions, accessoryOptions, mountOf, describeCode } = catalog;
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
          canRemove ? (
            <Pressable
              onPress={() => {
                onRemove();
              }}
              accessibilityRole="button"
              accessibilityLabel={m('create.removeItem', { n: index + 1 })}
              hitSlop={8}
            >
              {({ pressed }) => (
                <Text style={[styles.remove, pressed ? styles.pressed : null]}>
                  {m('create.remove')}
                </Text>
              )}
            </Pressable>
          ) : undefined
        }
      />

      <Field label={m('create.kind')}>
        <ChipSelect
          value={item.kind}
          onChange={(kind) => {
            onChange({ kind });
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
            onChange({ model });
          }}
        />
      </Field>

      <View style={styles.money}>
        <View style={styles.moneyItem}>
          <Field label={m('create.height')}>
            <Input
              value={item.heightCm}
              onChangeText={(heightCm) => {
                onChange({ heightCm });
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
                onChange({ widthCm });
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
            onChange({ quantity });
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
              const nextId = item.portieres.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
              onChange({ portieres: [...item.portieres, emptyPortiere(nextId)] });
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

        {item.portieres.length === 0
          ? null
          : item.portieres.map((portiere) => (
              <View key={portiere.id} style={styles.accessoryRow}>
                <View style={styles.accessoryName}>
                  <CodeInput
                    value={portiere.code}
                    placeholder={m('create.examplePortiere')}
                    onChangeText={(code) => {
                      onPortiere(portiere.id, { code });
                    }}
                    onScan={() => {
                      askScan(m('create.portiere'), (code) => {
                        onPortiere(portiere.id, { code });
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
                      onChange({
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
            ))}
      </View>

      <MaterialFields
        label={m('create.tulle')}
        placeholder={m('create.exampleTulle')}
        value={item.tulle}
        description={describeCode(MATERIAL_CODE_KINDS.tulle, item.tulle.code)}
        onChange={(patch) => {
          onChange({ tulle: { ...item.tulle, ...patch } });
        }}
        onScan={() => {
          askScan(m('create.tulle'), (code) => {
            onChange({ tulle: { ...item.tulle, code } });
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
          onChange({ protection: { ...item.protection, ...patch } });
        }}
        onScan={() => {
          askScan(m('create.protection'), (code) => {
            onChange({ protection: { ...item.protection, code } });
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
            onChange({ pipe: { ...item.pipe, ...patch } });
          }}
          onScan={() => {
            askScan(m('create.pipe'), (code) => {
              onChange({ pipe: { ...item.pipe, code } });
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
              onChange({ cornice: { ...item.cornice, ...patch } });
            }}
            onScan={() => {
              askScan(m('create.cornice'), (code) => {
                onChange({ cornice: { ...item.cornice, code } });
              });
            }}
          />

          <MaterialFields
            label={m('create.plastic')}
            placeholder={m('create.examplePlastic')}
            value={item.plastic}
            description={describeCode(MATERIAL_CODE_KINDS.plastic, item.plastic.code)}
            onChange={(patch) => {
              onChange({ plastic: { ...item.plastic, ...patch } });
            }}
            onScan={() => {
              askScan(m('create.plastic'), (code) => {
                onChange({ plastic: { ...item.plastic, code } });
              });
            }}
          />
        </>
      )}

      <Field label={m('create.rotation')}>
        <ChipSelect
          value={item.corniceRotation ?? ''}
          onChange={(corniceRotation) => {
            onChange({
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
              onChange({ accessories: [...item.accessories, emptyAccessory(nextId)] });
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
                    onAccessory(accessory.id, { name });
                  }}
                />
              </View>
              <View style={styles.accessoryQuantity}>
                <Input
                  value={accessory.quantity}
                  onChangeText={(quantity) => {
                    onAccessory(accessory.id, { quantity });
                  }}
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </View>
              <View style={styles.accessoryCode}>
                <Input
                  value={accessory.code}
                  onChangeText={(code) => {
                    onAccessory(accessory.id, { code });
                  }}
                  placeholder={m('create.code')}
                />
              </View>
              <Pressable
                onPress={() => {
                  onChange({
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
            onChange({ comment });
          }}
          placeholder={m('create.commentPlaceholder')}
          multiline
        />
      </Field>
    </Card>
  );
}

const styles = StyleSheet.create({
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
  accessoriesHint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  accessoriesTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  accessoryCode: {
    width: 84,
  },
  accessoryName: {
    flex: 1,
  },
  accessoryQuantity: {
    width: 56,
  },
  accessoryRemove: {
    width: 32,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addAccessory: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  codeDescription: {
    ...typography.footnote,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  codeInput: {
    flex: 1,
  },
  codeMissing: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  money: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyItem: {
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  remove: {
    ...typography.caption,
    color: colors.danger,
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
});

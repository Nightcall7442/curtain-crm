import {
  parseMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  PURCHASE_UNIT_LABELS,
  type PaymentMethod as PaymentMethodName,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
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

import { Card, CardTitle } from '../components/Card';
import { CashCollectionCard } from '../components/CashCollectionCard';
import { CashDayReport } from '../components/CashDayReport';
import { CodeScanner } from '../components/CodeScanner';
import {
  DiscountFields,
  discountMissingReason,
  discountPayload,
  emptyDiscount,
} from '../components/DiscountFields';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import {
  colors,
  hairline,
  opacity,
  radius,
  spacing,
  typography,
  fonts,
} from '../theme';

/**
 * Касса: продажа по кодам склада.
 *
 * Продавец набирает код с бирки и количество — метры или штуки, — а
 * название, единицу и цену система берёт из справочника кодов, куда цену
 * ставит руководство. Сумма строки и итог считаются сами: цену продавец
 * не вводит и не правит.
 *
 * Прежний прайс витрины с остатками (`retail.items`) убран с этого экрана
 * по решению владельца: товары на складе и есть справочник кодов, и второй
 * список тех же вещей с другими ценами только расходился с первым.
 *
 * Способ оплаты спрашивается при пробитии: наличные, карта, QR, Click —
 * из него складывается касса дня. Клиент необязателен: за метром тюля
 * заходят без имени.
 */

/** Строка чека, пока он не пробит. */
interface CartLine {
  readonly key: number;
  readonly code: string;
  readonly quantity: string;
}

let nextKey = 1;
const emptyLine = (): CartLine => ({ key: nextKey++, code: '', quantity: '' });

export function CashDeskScreen(): ReactElement {
  const { t, m, money } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const isManager = useIsManagement();
  const insets = useSafeAreaInsets();

  const [lines, setLines] = useState<readonly CartLine[]>([emptyLine()]);
  const [method, setMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
  const [clientName, setClientName] = useState('');
  const [comment, setComment] = useState('');
  const [discount, setDiscount] = useState(emptyDiscount);
  const [showErrors, setShowErrors] = useState(false);
  /* Какая строка ждёт код с камеры: QR с бирки вместо набора вручную. */
  const [scanningKey, setScanningKey] = useState<number | null>(null);

  const sell = trpc.retail.sellByCodes.useMutation({
    async onSuccess(sale) {
      notifySuccess();
      await utils.retail.sales.mine.invalidate();
      setLines([emptyLine()]);
      setClientName('');
      setComment('');
      setDiscount(emptyDiscount());
      setShowErrors(false);
      Alert.alert(m('cash.sold'), m('cash.receiptFor', { sum: money(parseMoney(sale.total)) }));
      navigation.goBack();
    },
    onError(error) {
      Alert.alert(m('cash.error'), error.message);
    },
  });

  const updateLine = (key: number, patch: Partial<CartLine>): void => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const filled = lines.filter((line) => line.code.trim() !== '' && quantityOf(line) > 0);
  /* Подытог нужен и внизу экрана, и полю скидки: процент считается от него. */
  const { subtotal, priced } = useCartSubtotal(filled);
  const subtotalInput = (subtotal / 100).toString();
  const discountSum = discountPayload(subtotalInput, discount).discountAmount;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/*
          Руководству — сначала касса дня, как в панели: директор открывает
          «Кассу» посчитать вечер, а не пробить чек. Продавцу отчёт по всем
          не положен — у него ниже свои чеки и своя инкассация.
        */}
        {isManager && <CashDayReport />}

        <Card>
          <CardTitle title={m('cash.goods')} icon="orders" />
          <Text style={styles.hint}>{m('cash.codeHint')}</Text>

          {lines.map((line, index) => (
            <CodeLine
              key={line.key}
              line={line}
              index={index}
              canRemove={lines.length > 1}
              onChange={(patch) => {
                updateLine(line.key, patch);
              }}
              onRemove={() => {
                setLines((current) => current.filter((entry) => entry.key !== line.key));
              }}
              onScan={() => {
                setScanningKey(line.key);
              }}
            />
          ))}

          <Pressable
            onPress={() => {
              setLines((current) => [...current, emptyLine()]);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addLine, pressed ? styles.pressed : null]}
          >
            <Text style={styles.addLineText}>+ {m('cash.addLine')}</Text>
          </Pressable>
        </Card>

        <Card>
          <CardTitle title={m('sale.client')} icon="person" />
          <Text style={styles.hint}>{m('cash.clientOptional')}</Text>

          <Field label={m('create.name')}>
            <Input
              value={clientName}
              onChangeText={setClientName}
              placeholder={m('create.namePlaceholder')}
              autoCapitalize="words"
            />
          </Field>

          {/* Последнее поле карточки — без своего нижнего отступа, иначе
              снизу у карточки выходило 32 при 16 сверху. */}
          <Field label={m('sale.comment')} last>
            <Input
              value={comment}
              onChangeText={setComment}
              placeholder={m('cash.commentPlaceholder')}
              multiline
            />
          </Field>
        </Card>

        {/*
          Скидка на кассе: за метр тюля торгуются у прилавка, и продавец
          должен уметь уступить, не пересчитывая цену в уме. Цена строки
          остаётся ценой с бирки, скидка идёт отдельной суммой — и попадает
          в отчёт по скидкам.
        */}
        <Card>
          <CardTitle title={m('discount.title')} icon="paid" />
          <DiscountFields
            price={subtotalInput}
            value={discount}
            onChange={setDiscount}
            showError={showErrors}
          />
        </Card>

        <MySales />

        {/* Наличные на руках и «сдал в кассу» — здесь, у кассы, а не на
            экране заказов: деньги живут там же, где продажа. */}
        <CashCollectionCard />
      </ScrollView>

      {/*
        Итог, способ оплаты и кнопка прибиты к низу: продавец добавляет
        строку и тут же видит сумму, а способ спрашивается в момент, когда
        клиент достаёт деньги или телефон.
      */}
      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <TotalRow count={priced} subtotal={subtotal} discount={discountSum} />

        {/*
          `last` — без нижнего отступа поля: он складывался с зазором
          подвала, и между чипами и кнопкой выходило 28 при 12 между
          остальными частями подвала.
        */}
        <Field label={m('cash.method')} last>
          <ChipSelect
            value={method}
            onChange={setMethod}
            options={PAYMENT_METHODS.map((value) => ({
              value,
              label: t(PAYMENT_METHOD_LABELS, value),
            }))}
          />
        </Field>

        <Pressable
          onPress={() => {
            setShowErrors(true);
            if (discountMissingReason(subtotalInput, discount)) return;

            const { discountAmount, discountReason } = discountPayload(subtotalInput, discount);
            sell.mutate({
              method,
              lines: filled.map((line) => ({ code: line.code.trim(), quantity: quantityOf(line) })),
              ...(clientName.trim() === '' ? {} : { clientName: clientName.trim() }),
              ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
              ...(discountAmount > 0 ? { discountAmount, discountReason } : {}),
            });
          }}
          disabled={filled.length === 0 || sell.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            filled.length === 0 ? styles.submitOff : null,
            pressed ? styles.submitPressed : null,
          ]}
        >
          {sell.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Icon name="paid" size={18} color={colors.onAccent} />
              <Text style={styles.submitText}>{m('cash.submit')}</Text>
            </>
          )}
        </Pressable>
      </View>
      <CodeScanner
        visible={scanningKey !== null}
        label={m('cash.codePlaceholder')}
        onScan={(code) => {
          if (scanningKey !== null) updateLine(scanningKey, { code });
          setScanningKey(null);
        }}
        onClose={() => {
          setScanningKey(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function quantityOf(line: CartLine): number {
  const value = Number.parseFloat(line.quantity.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Одна строка чека: код, количество, сумма.
 *
 * Код ищется на складе по мере набора — описание, цена и единица
 * появляются под полем, и продавец видит, что набрал правильно, до того
 * как нажмёт «Пробить». Код без цены подсвечивается сразу.
 *
 * Строка в три этажа: поля ввода, что за товар, деньги. Сумма раньше
 * стояла в одном ряду с полями и была колонкой переменной ширины: крупная
 * сумма сжимала поле кода до 72 точек, код с бирки обрезался
 * («FAUDIT-TL…»), а поле количества прыгало от строки к строке. Теперь у
 * полей ряд целиком, и колонки стоят на одном месте во всех строках.
 */
function CodeLine({
  line,
  index,
  canRemove,
  onChange,
  onRemove,
  onScan,
}: {
  readonly line: CartLine;
  readonly index: number;
  readonly canRemove: boolean;
  readonly onChange: (patch: Partial<CartLine>) => void;
  readonly onRemove: () => void;
  readonly onScan: () => void;
}): ReactElement {
  const { t, m, money } = useLocale();
  const code = line.code.trim();
  const lookup = trpc.retail.codeLookup.useQuery({ code }, { enabled: code.length > 0 });
  const item = lookup.data ?? null;
  const quantity = quantityOf(line);
  const price = item?.price == null ? null : parseMoney(item.price);
  const sum = price === null ? null : Math.round(price * quantity);
  /* Ряд с деньгами — только у кода с ценой: пустой строке и неизвестному
     коду показывать в нём нечего. */
  const priceLabel =
    code === '' || price === null || item?.unit == null
      ? null
      : `${money(price)} / ${t(PURCHASE_UNIT_LABELS, item.unit)}`;

  return (
    <View style={styles.line}>
      <View style={styles.lineRow}>
        <View style={styles.lineCode}>
          <Input
            value={line.code}
            onChangeText={(value) => {
              onChange({ code: value });
            }}
            placeholder={m('cash.codePlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <View style={styles.lineQuantity}>
          <Input
            value={line.quantity}
            onChangeText={(value) => {
              onChange({ quantity: value });
            }}
            placeholder={
              item?.unit == null ? m('cash.qtyPlaceholder') : t(PURCHASE_UNIT_LABELS, item.unit)
            }
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.lineMeta}>
        <Text style={styles.lineDescription} numberOfLines={2}>
          {code === ''
            ? m('cash.lineN', { n: index + 1 })
            : lookup.isLoading
              ? '…'
              : item === null
                ? m('cash.codeUnknown')
                : item.price == null || item.unit == null
                  ? m('cash.codeNoPrice')
                  : (item.description ?? item.name)}
        </Text>
        {/*
          Иконки — в настоящих кнопках 44×44, а не голые глифы 18×20 с
          `hitSlop`: в браузере `hitSlop` не работает вовсе, а на телефоне
          добирал только до 34. Обе иконки одного размера — разные (18 и 16)
          рядом смотрелись случайными.
        */}
        <Pressable
          onPress={onScan}
          accessibilityRole="button"
          accessibilityLabel={m('create.scanA11y')}
          style={({ pressed }) => [styles.lineIcon, pressed ? styles.pressed : null]}
        >
          <Icon name="camera" size={LINE_ICON} color={colors.accent} />
        </Pressable>
        {canRemove && (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={m('common.close')}
            style={({ pressed }) => [styles.lineIcon, pressed ? styles.pressed : null]}
          >
            <Icon name="remove" size={LINE_ICON} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {priceLabel !== null && (
        <View style={styles.lineMoney}>
          <Text style={styles.linePrice} numberOfLines={1}>
            {priceLabel}
          </Text>
          {sum !== null && quantity > 0 && (
            <Text style={styles.lineSum} numberOfLines={1}>
              {money(sum)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** Размер иконок строки чека — камеры и корзины. */
const LINE_ICON = 18;

/**
 * Сумма строк чека — считается на клиенте по тем же ценам, что и на сервере.
 *
 * `priced` — сколько строк в этой сумме. Внизу экрана считаются именно они:
 * строка с неизвестным кодом ни цены, ни суммы не даёт, и «Позиций: 4» над
 * суммой трёх строк читалось как ошибка кассы.
 *
 * Запросы кодов подписаны здесь же, а не только в строках: иначе итог
 * пересчитывался лишь при следующем нажатии клавиши, и код, найденный уже
 * после набора количества, в сумму не попадал до новой правки.
 */
function useCartSubtotal(lines: readonly CartLine[]): {
  readonly subtotal: number;
  readonly priced: number;
} {
  const lookups = trpc.useQueries((query) =>
    lines.map((line) => query.retail.codeLookup({ code: line.code.trim() })),
  );

  return lines.reduce(
    (total, line, index) => {
      const found = lookups[index]?.data;
      if (found == null || found.price == null) return total;
      return {
        subtotal: total.subtotal + Math.round(parseMoney(found.price) * quantityOf(line)),
        priced: total.priced + 1,
      };
    },
    { subtotal: 0, priced: 0 },
  );
}

/** Итог у кнопки: к оплате, а под ним — сколько уступили, если уступили. */
function TotalRow({
  count,
  subtotal,
  discount,
}: {
  /** Строки с найденной ценой — те, что вошли в сумму. */
  readonly count: number;
  readonly subtotal: number;
  /** Скидка в основных единицах — как её вводит продавец. */
  readonly discount: number;
}): ReactElement {
  const { m, money } = useLocale();
  const discountMinor = Math.min(subtotal, Math.round(discount * 100));

  return (
    <View style={styles.totalRow}>
      <View style={styles.totalText}>
        <Text style={styles.totalLabel}>
          {count === 0 ? m('cash.nothingSelected') : m('cash.items', { n: count })}
        </Text>
        {discountMinor > 0 && (
          <Text style={styles.totalDiscount}>
            {m('cash.discountLine', { v: money(discountMinor) })}
          </Text>
        )}
      </View>
      <Text style={styles.totalValue}>{money(subtotal - discountMinor)}</Text>
    </View>
  );
}

/**
 * Свои чеки продавца — последние продажи с этой кассы.
 *
 * Пять последних, а не все: касса — экран продажи, а не журнал. Кому нужен
 * полный список, тот смотрит его в панели.
 */
function MySales(): ReactElement | null {
  const { m, money } = useLocale();
  const navigation = useNavigation();
  const sales = trpc.retail.sales.mine.useQuery({ page: 1, pageSize: 5 });

  const rows = sales.data?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardTitle title={m('cash.myReceipts')} icon="paid" />
      {rows.map((sale, index) => (
        <Pressable
          key={sale.id}
          onPress={() => {
            navigation.navigate('SaleDetail', { saleId: sale.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={m('cash.openReceipt', { n: sale.id })}
          style={({ pressed }) => [
            styles.saleRow,
            // Разделитель — только между чеками: у последнего линия
            // висела над скруглённым низом карточки лишней чертой.
            index === rows.length - 1 ? styles.saleRowLast : null,
            pressed ? styles.salePressed : null,
          ]}
        >
          <View style={styles.itemText}>
            <Text style={styles.itemName}>{m('cash.receiptN', { n: sale.id })}</Text>
            <Text style={styles.itemMeta}>
              {m('cash.receiptMeta', {
                name: sale.clientName ?? m('cash.noName'),
                n: Number(sale.lines),
              })}
            </Text>
          </View>
          <Text style={styles.saleTotal}>{money(parseMoney(sale.total))}</Text>
          <Icon name="chevron" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  /*
    Снизу — обычный отступ, а не место под панель вкладок: касса открыта
    поверх вкладок, панели под ней нет, а свой низ держит подвал с кнопкой.
    С `tabBarSpace` список кончался полосой пустоты в 114 точек.
  */
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  line: {
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lineCode: {
    flex: 1,
    minWidth: 0,
  },
  /* Под самую длинную подсказку единиц — узбекскую «Metr/dona»: в 88 она
     обрезалась на «Metr/dor». */
  lineQuantity: {
    width: 100,
  },
  lineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  lineDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  lineIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineMoney: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  linePrice: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
  lineSum: {
    ...typography.value,
    color: colors.textPrimary,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  addLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addLineText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  saleRowLast: {
    borderBottomWidth: 0,
  },
  salePressed: {
    opacity: opacity.pressed,
  },
  saleTotal: {
    ...typography.value,
    color: colors.textPrimary,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  /* Зазор обязателен: в узбекском со скидкой левый столбец доходил до
     самой суммы — между ними не оставалось ни точки. */
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  totalText: {
    flex: 1,
    minWidth: 0,
  },
  totalDiscount: {
    ...typography.footnote,
    color: colors.accent,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalValue: {
    fontFamily: fonts.bold,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 0,
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  submitOff: {
    opacity: 0.5,
  },
  submitPressed: {
    opacity: opacity.pressed,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});

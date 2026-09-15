import {
  formatMoney,
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

import { Card, CardTitle } from '../components/Card';
import { CashCollectionCard } from '../components/CashCollectionCard';
import { CashDayReport } from '../components/CashDayReport';
import { CodeScanner } from '../components/CodeScanner';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

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
  const { t, m } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const isManager = useIsManagement();

  const [lines, setLines] = useState<readonly CartLine[]>([emptyLine()]);
  const [method, setMethod] = useState<PaymentMethodName>(PaymentMethod.CASH);
  const [clientName, setClientName] = useState('');
  const [comment, setComment] = useState('');
  /* Какая строка ждёт код с камеры: QR с бирки вместо набора вручную. */
  const [scanningKey, setScanningKey] = useState<number | null>(null);

  const sell = trpc.retail.sellByCodes.useMutation({
    async onSuccess(sale) {
      notifySuccess();
      await utils.retail.sales.mine.invalidate();
      setLines([emptyLine()]);
      setClientName('');
      setComment('');
      Alert.alert(m('cash.sold'), m('cash.receiptFor', { sum: formatMoney(parseMoney(sale.total)) }));
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

          <Field label={m('sale.comment')}>
            <Input
              value={comment}
              onChangeText={setComment}
              placeholder={m('cash.commentPlaceholder')}
              multiline
            />
          </Field>
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
      <View style={styles.footer}>
        <TotalRow lines={filled} />

        <Field label={m('cash.method')}>
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
            sell.mutate({
              method,
              lines: filled.map((line) => ({ code: line.code.trim(), quantity: quantityOf(line) })),
              ...(clientName.trim() === '' ? {} : { clientName: clientName.trim() }),
              ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
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
  const { t, m } = useLocale();
  const code = line.code.trim();
  const lookup = trpc.retail.codeLookup.useQuery({ code }, { enabled: code.length > 0 });
  const item = lookup.data ?? null;
  const quantity = quantityOf(line);
  const price = item?.price == null ? null : parseMoney(item.price);
  const sum = price === null ? null : Math.round(price * quantity);

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
            placeholder={item?.unit == null ? m('cash.qtyPlaceholder') : t(PURCHASE_UNIT_LABELS, item.unit)}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.lineSum} numberOfLines={1}>
          {sum === null || quantity === 0 ? '—' : formatMoney(sum)}
        </Text>
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
                  : `${item.description ?? item.name} · ${formatMoney(parseMoney(item.price))} / ${t(PURCHASE_UNIT_LABELS, item.unit)}`}
        </Text>
        <Pressable onPress={onScan} hitSlop={8} accessibilityRole="button" accessibilityLabel={m('create.scanA11y')}>
          <Icon name="camera" size={18} color={colors.accent} />
        </Pressable>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={m('common.close')}>
            <Icon name="remove" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Итог по заполненным строкам — считается на клиенте по тем же ценам, что и сервер. */
function TotalRow({ lines }: { readonly lines: readonly CartLine[] }): ReactElement {
  const { m } = useLocale();
  const utils = trpc.useUtils();

  const total = lines.reduce((sum, line) => {
    const cached = utils.retail.codeLookup.getData({ code: line.code.trim() });
    if (cached == null || cached.price == null) return sum;
    return sum + Math.round(parseMoney(cached.price) * quantityOf(line));
  }, 0);

  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>
        {lines.length === 0 ? m('cash.nothingSelected') : m('cash.items', { n: lines.length })}
      </Text>
      <Text style={styles.totalValue}>{formatMoney(total)}</Text>
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
  const { m } = useLocale();
  const navigation = useNavigation();
  const sales = trpc.retail.sales.mine.useQuery({ page: 1, pageSize: 5 });

  const rows = sales.data?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardTitle title={m('cash.myReceipts')} icon="paid" />
      {rows.map((sale) => (
        <Pressable
          key={sale.id}
          onPress={() => {
            navigation.navigate('SaleDetail', { saleId: sale.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={m('cash.openReceipt', { n: sale.id })}
          style={({ pressed }) => [styles.saleRow, pressed ? styles.salePressed : null]}
        >
          <View style={styles.itemText}>
            <Text style={styles.itemName}>{m('cash.receiptN', { n: sale.id })}</Text>
            <Text style={styles.itemMeta}>
              {m('cash.receiptMeta', { name: sale.clientName ?? m('cash.noName'), n: Number(sale.lines) })}
            </Text>
          </View>
          <Text style={styles.saleTotal}>{formatMoney(parseMoney(sale.total))}</Text>
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
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
  lineQuantity: {
    width: 88,
  },
  lineSum: {
    ...typography.value,
    color: colors.textPrimary,
    minWidth: 96,
    textAlign: 'right',
  },
  lineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  lineDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
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
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
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

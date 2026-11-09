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
import { CodeScanner } from '../components/CodeScanner';
import {
  DiscountFields,
  discountMissingReason,
  discountPayload,
  emptyDiscount,
} from '../components/DiscountFields';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { ShiftRequiredBanner, useNeedsShift } from '../components/ShiftRequiredBanner';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, sizes, spacing, typography } from '../theme';

/**
 * Метраж: продажа по кодам склада.
 *
 * Продавец набирает код с бирки и количество — метры или штуки, — а
 * название, единицу и цену система берёт из справочника кодов, куда цену
 * ставит руководство. Сумма строки и итог считаются сами: цену продавец
 * не вводит и не правит.
 *
 * Раньше эта форма жила в «Кассе», вперемешку с отчётом дня, терминалом и
 * инкассацией. Владелец попросил развести: продажа — отдельным экраном с
 * «Работы», рядом с кнопкой «Касса», а в «Кассе» остаются только деньги.
 * Порядок карточек — его же: клиент, товары, скидка, оплата. Так продавец
 * и ведёт разговор у прилавка: кто пришёл, что берёт, сколько уступить,
 * чем платит.
 *
 * Прежний прайс витрины с остатками (`retail.items`) сюда не вернулся по
 * решению владельца: товары на складе и есть справочник кодов, и второй
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

export function MetrajScreen(): ReactElement {
  const { t, m, money } = useLocale();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();
  /*
    Без открытой смены сервер чек не пробьёт (412 «Сначала начните смену»),
    а продавец узнавал об этом только на «Пробить чек» — набрав все коды.
    Баннер — тот же, что в новом заказе и на «Работе», и ведёт туда, где
    смену начинают; кнопка до тех пор выключена. Руководству смена не нужна.
  */
  const needsShift = useNeedsShift();

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
      /*
        Пробитый чек ищут в «Кассе», в «Моих чеках»: там же, где искали,
        пока форма жила в ней. Сбрасываем список, чтобы «Касса», открытая
        следом, показала новый чек сразу, а не через полминуты свежести.

        Деньги чека — тоже: продажа кладёт оплату в кассу дня и наличные
        «на руки». Без сброса «Касса» показывала новый чек в «Моих чеках»,
        а над ним — «Принято за день» и «На руках» без него. Не ждём: это
        не нужно ни алерту, ни возврату на «Работу».
      */
      void utils.payments.invalidate();
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
  /* Подытог нужен и в «Оплате», и полю скидки: процент считается от него. */
  const { subtotal, priced } = useCartSubtotal(filled);
  const subtotalInput = (subtotal / 100).toString();
  const discountSum = discountPayload(subtotalInput, discount).discountAmount;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        /*
          Снизу — безопасная зона и обычный отступ, а не место под панель
          вкладок: это экран стека, панели под ним нет. Подвала с кнопкой
          тоже больше нет — «Пробить чек» стоит в карточке «Оплата».
        */
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <ShiftRequiredBanner />

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

          {/*
            Второстепенная кнопка — та же таблетка в 48, что «Пробить чек»
            в «Оплате», только на светлой подложке. Пунктирная рамка в 44
            была третьей системой кнопок на одном экране.
          */}
          <SubmitButton
            variant="secondary"
            label={`+ ${m('cash.addLine')}`}
            onPress={() => {
              setLines((current) => [...current, emptyLine()]);
            }}
          />
        </Card>

        {/*
          Скидка у прилавка: за метр тюля торгуются, и продавец должен уметь
          уступить, не пересчитывая цену в уме. Цена строки остаётся ценой с
          бирки, скидка идёт отдельной суммой — и попадает в отчёт по скидкам.
        */}
        <Card>
          <CardTitle title={m('discount.title')} icon="discount" />
          {/* Причина — последнее поле карточки: снизу 16, как сверху, а не 32. */}
          <DiscountFields
            price={subtotalInput}
            value={discount}
            onChange={setDiscount}
            showError={showErrors}
            last
          />
        </Card>

        {/*
          Оплата — последней карточкой, как просил владелец, а не прибитым
          к низу подвалом. Подвал с итогом, чипами и кнопкой занимал четверть
          экрана 360×780 и закрывал собой карточки, которые продавец как раз
          заполняет; сумма каждой строки и так видна в «Товарах». Способ
          оплаты — первым: его спрашивают, когда клиент достаёт деньги или
          телефон, а итог стоит прямо над кнопкой — что пробиваем.
        */}
        <Card>
          <CardTitle title={m('sell.payment')} icon="paid" />
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

          <TotalRow count={priced} subtotal={subtotal} discount={discountSum} />

          {/*
            Общая кнопка формы — 48 и таблеткой, как «Создать заказ» и
            «Продать и закрыть». Своя была в 52: выше всех остальных кнопок
            приложения.
          */}
          <SubmitButton
            label={m('cash.submit')}
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
            disabled={filled.length === 0 || needsShift}
            pending={sell.isPending}
          />
        </Card>
      </ScrollView>

      {/* Метраж сканирует бирку товара, а не этикетку рулона — своя подсказка. */}
      <CodeScanner
        visible={scanningKey !== null}
        label={m('cash.codePlaceholder')}
        hint={m('scanner.aimTag')}
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
 * `priced` — сколько строк в этой сумме. В «Оплате» считаются именно они:
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
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
    width: sizes.touchTarget,
    height: sizes.touchTarget,
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
  pressed: {
    opacity: opacity.pressed,
  },
  /*
    Итог отделён от чипов волосяной линией, как строки чека в «Товарах»:
    без неё сумма читалась ещё одним вариантом оплаты. Зазор обязателен:
    в узбекском со скидкой левый столбец доходил до самой суммы — между
    ними не оставалось ни точки.
  */
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
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
});

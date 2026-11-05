import { groupDigits, ungroupDigits } from '@curtain-crm/shared';
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

/**
 * Поля ввода.
 *
 * Появились вместе с первой формой в приложении: до неё единственный ввод был
 * на экране входа и жил там же инлайном. Второй экран с полями — повод завести
 * общий примитив, а не скопировать стили: разъехавшиеся поля видно сразу, а
 * чинить их приходится по всем экранам.
 *
 * Подпись — настоящий `<Text>` над полем, а не подсказка внутри. Подсказка
 * исчезает, как только человек начинает печатать, и через минуту он уже не
 * помнит, что это за поле; на форме из десяти строк это критично.
 */

export function Field({
  label,
  hint,
  error,
  required = false,
  last = false,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly required?: boolean;
  /**
   * Последнее поле карточки — без нижнего отступа.
   *
   * Отступ поля складывался с внутренним отступом карточки, и снизу
   * выходило 32 при 16 сверху: карточка «Клиент» стояла кривой рядом с
   * «Товарами».
   */
  readonly last?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <View style={[styles.field, last ? styles.fieldLast : null]}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {children}

      {error !== undefined ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : (
        hint !== undefined && <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );
}

/** Высота многострочного поля: от трёх строк текста до семи, дальше — прокрутка внутри. */
const MULTILINE_MIN = typography.body.lineHeight * 3 + spacing.sm * 2;
const MULTILINE_MAX = typography.body.lineHeight * 7 + spacing.sm * 2;

/**
 * Многострочное поле в браузере растёт вместе с текстом.
 *
 * На телефоне это делает сама система. В браузере `<textarea>` стоит
 * фиксированной высоты в две строки: третья строка уезжала вверх, и
 * первая видимая резалась рамкой пополам. Высота считается по содержимому
 * после каждой правки — сначала поле схлопывается, чтобы `scrollHeight`
 * умел и уменьшаться, когда текст стёрли.
 *
 * Отдельным хуком — для полей, которые собраны не на `Input` (поле
 * комментария с кнопкой отправки): вторая копия того же расчёта рано или
 * поздно разошлась бы с первой. Вне браузера и для однострочного поля
 * возвращает `undefined` — высоту тогда ведёт сама платформа.
 */
export function useWebAutoGrow(
  ref: RefObject<TextInput | null>,
  value: string | undefined,
  { enabled = true, min = MULTILINE_MIN, max = MULTILINE_MAX }: {
    readonly enabled?: boolean;
    readonly min?: number;
    readonly max?: number;
  } = {},
): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const node = ref.current as unknown as HTMLTextAreaElement | null;
    if (node === null) return;
    const borders = node.offsetHeight - node.clientHeight;
    const previous = node.style.height;
    node.style.height = '0px';
    const content = node.scrollHeight + borders;
    node.style.height = previous;
    // Та же высота — то же значение, и React повторный рендер пропускает:
    // поле перерисовывается, только когда меняется число строк.
    setHeight(Math.min(max, Math.max(min, content)));
  }, [ref, value, enabled, min, max]);

  return Platform.OS === 'web' && enabled ? height : undefined;
}

/**
 * Однострочный (или с `multiline` — многострочный) ввод.
 *
 * `forwardRef` нужен для перевода фокуса по клавише «Далее»: без него форму
 * из десяти полей приходится проходить, целясь пальцем в каждое.
 *
 * Фокус показывается рамкой цвета акцента — так же на телефоне и в
 * браузере. Своё кольцо браузера (оранжевое, поверх скруглённой рамки)
 * снято глобально в `public/index.html`: оно выдавало в PWA веб-форму.
 *
 * Поле только для чтения (`editable={false}` или `readOnly`) приглушено:
 * серая подложка и вторичный цвет текста. В белом поле вычисленную сумму
 * пытались исправить — и не понимали, почему клавиатура не открывается.
 */
export const Input = forwardRef<TextInput, TextInputProps & { readonly invalid?: boolean }>(
  function Input(
    { invalid = false, style, onFocus, onBlur, multiline, value, editable, readOnly, ...rest },
    ref,
  ): ReactElement {
    const [focused, setFocused] = useState(false);
    const inner = useRef<TextInput>(null);
    useImperativeHandle(ref, () => inner.current as TextInput);
    const webHeight = useWebAutoGrow(inner, value, { enabled: multiline === true });
    const locked = editable === false || readOnly === true;

    return (
      <TextInput
        ref={inner}
        {...rest}
        value={value}
        multiline={multiline}
        {...(editable === undefined ? {} : { editable })}
        {...(readOnly === undefined ? {} : { readOnly })}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          multiline === true ? styles.inputMultiline : null,
          // Рассчитанная высота идёт ДО стиля вызывающего экрана: высота,
          // заданная экраном явно, главнее подсчёта по тексту.
          webHeight === undefined ? null : { height: webHeight },
          locked ? styles.inputReadOnly : null,
          focused && !locked ? styles.inputFocused : null,
          invalid ? styles.inputInvalid : null,
          style,
        ]}
      />
    );
  },
);

/**
 * Поле для суммы: показывает разряды, отдаёт чистое число.
 *
 * Владелец попросил, чтобы суммы везде читались как «1 000 000», а не
 * сплошной лентой цифр: в «1000000» и «10000000» разница видна только
 * пересчётом нулей пальцем по экрану, а ошибка на порядок в цене заказа
 * стоит дорого. Особенно на телефоне, где сумму набирают стоя у клиента.
 *
 * Разряды — ТОЛЬКО показ. В состоянии формы значение остаётся без пробелов,
 * поэтому отправка и проверки в вызывающих экранах не меняются.
 */
export function MoneyInput({
  value,
  onChangeText,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  readonly invalid?: boolean;
  /** Чистое значение без пробелов: `1000000`. */
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}): ReactElement {
  return (
    <Input
      {...rest}
      keyboardType="decimal-pad"
      value={groupDigits(value)}
      onChangeText={(next) => {
        onChangeText(ungroupDigits(next));
      }}
    />
  );
}

/**
 * Выбор одного значения из нескольких.
 *
 * Чипами, а не системным списком: вариантов здесь три-четыре, и открывать
 * ради них модальное окно — лишний шаг в форме, которую заполняют стоя
 * у клиента.
 */
export function ChipSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              pressed ? { opacity: opacity.pressed } : null,
            ]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.lg,
  },
  fieldLast: {
    marginBottom: 0,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    // Высота больше порога нажатия: поле — такая же цель для пальца, как кнопка.
    minHeight: sizes.controlHeight,
    paddingVertical: spacing.sm,
  },
  inputReadOnly: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
  },
  inputMultiline: {
    minHeight: MULTILINE_MIN,
    maxHeight: MULTILINE_MAX,
    // Android по умолчанию ставит текст многострочного поля по центру.
    textAlignVertical: 'top',
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  hint: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.footnote,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    // Высота поля, а не 44: чипы «сум / %» стоят в одной строке с полем
    // суммы, и разница в два пикселя была видна по верхнему и нижнему краю.
    minHeight: sizes.controlHeight,
    // Не уже своей высоты: однобуквенный «%» был 38 × 46 — меньше пальца и
    // вытянутым овалом рядом с круглым «сум». Так он — ровный круг.
    minWidth: sizes.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    // 12, а не 16: на экране в 360 точек группа из трёх-четырёх вариантов
    // («Обычный · Срочный · Критический», «Наличные · Карта · QR · Click»)
    // не помещалась в строку на считанные пиксели, и последний вариант
    // одиноко висел на второй строке.
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.headerText,
    // Начертанием, а не `fontWeight` поверх Medium — иначе браузер
    // дорисовывает ложный полужирный.
    fontFamily: fonts.semibold,
    fontWeight: '600',
  },
});

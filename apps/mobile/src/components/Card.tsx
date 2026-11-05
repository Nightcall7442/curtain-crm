import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { isValidElement, useState, type ReactElement, type ReactNode } from 'react';

import { cardShadow, colors, hairline, opacity, radius, sizes, spacing, typography, fonts } from '../theme';

import { Icon, type IconName } from './Icon';
import { useLocale } from '../hooks/useLocale';

/**
 * Базовые блоки экранов.
 *
 * Только представление: обращений к API и проверок прав здесь нет —
 * бизнес-логика живёт на бэкенде.
 */

export function Card({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}): ReactElement {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Карточка под список строк.
 *
 * Отличие от обычной — НУЛЕВОЙ внутренний отступ: его берут на себя строки.
 * Иначе подсветка нажатой строки не доходит до краёв карточки и выглядит
 * приклеенной наклейкой, а не нажатой строкой. Отступ от края при этом не
 * теряется — он просто переезжает внутрь строки.
 *
 * `overflow: 'hidden'` обязателен: без него подсветка первой и последней
 * строки вылезает за скруглённые углы прямоугольными ушами.
 */
export function ListCard({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}): ReactElement {
  return <View style={[styles.card, styles.listCard, style]}>{children}</View>;
}

/**
 * Заголовок секции НАД карточкой.
 *
 * Так устроены системные настройки: подпись группы стоит снаружи, мелкая и
 * приглушённая, а карточка под ней остаётся чистой. Заголовок внутри карточки
 * съедает её первую строку и мешает списку начинаться сразу.
 */
export function SectionHeader({
  title,
  action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title.toUpperCase()}</Text>
      {action !== undefined && <View style={styles.sectionHeaderAction}>{action}</View>}
    </View>
  );
}

/**
 * Заголовок карточки с действием справа.
 *
 * Раньше ужималось действие: плашка статуса («Ждёт подтверждения»)
 * выезжала за белый край карточки, а переключатель «‹ Ноябрь 2026 ›»
 * заезжал на внутренний отступ. Теперь действие своей ширины не отдаёт и
 * не обрезается: если рядом с заголовком ему места нет, оно уходит на
 * строку ниже, к правому краю. Заголовок берёт, что осталось, и
 * переносится по словам.
 *
 * Плашке статуса (`Pill`) заголовок уступает охотнее: она остаётся в
 * строку, пока заголовку достаётся хотя бы 40% ширины. Так в списке
 * карточек (отгулы, зарплата) статус стоит на одном месте у всех, а не
 * прыгает вниз у каждого длинного имени.
 */
export function CardTitle({
  title,
  icon,
  action,
}: {
  readonly title: string;
  /** Иконка называется по роли — список в `Icon.tsx`. */
  readonly icon?: IconName;
  readonly action?: ReactNode;
}): ReactElement {
  const isStatus = isValidElement(action) && action.type === Pill;

  return (
    <View>
      {/*
        Латунная черта над заголовком — тот же знак раздела, что и в
        веб-панели. Одна деталь, повторённая на каждой карточке в обоих
        приложениях: панель и телефон должны узнаваться как одна вещь, а
        не как два продукта с общим логотипом.
      */}
      <View style={styles.titleRule} />

      <View style={styles.titleRow}>
        {icon !== undefined && (
          <View style={styles.titleIcon}>
            <Icon name={icon} size={16} color={colors.accent} />
          </View>
        )}
        <Text style={[styles.title, isStatus ? styles.titleBesideStatus : null]}>{title}</Text>
        {action !== undefined && <View style={styles.titleAction}>{action}</View>}
      </View>
    </View>
  );
}

/**
 * Ссылка-действие в шапке карточки: «Подробнее», «Мои задачи», «+ Мероприятие».
 *
 * Голая подпись давала цель нажатия 18 точек в высоту — мимо неё промахивались
 * пальцем. `hitSlop` не спасал: в браузере его нет вовсе, а на
 * телефоне он добирал только до 34. Здесь зона нажатия — настоящие 44 точки,
 * а отрицательный вертикальный отступ возвращает строке заголовка прежнюю
 * высоту: карточка не становится выше от того, что в неё легче попасть.
 */
export function CardLink({
  label,
  onPress,
  accessibilityLabel,
  tone = 'accent',
}: {
  readonly label: string;
  readonly onPress: () => void;
  /** Если подпись сама по себе непонятна вне карточки («Убрать»). */
  readonly accessibilityLabel?: string;
  readonly tone?: 'accent' | 'danger';
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={styles.link}
    >
      {({ pressed }) => (
        <Text
          style={[
            styles.linkText,
            tone === 'danger' ? styles.linkDanger : null,
            pressed ? styles.linkPressed : null,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Число или сумма — значение, которое переносить нельзя.
 *
 * Цифры, сгруппированные неразрывными пробелами (`486\u00A0380\u00A0414`),
 * со знаком, запятой, точкой, двоеточием или процентом, и не больше двух
 * единиц через неразрывный пробел: «сум», «млн сум», «шт». Так собирают
 * суммы `formatMoney` и `formatMoneyShort`.
 *
 * Прежде неделимым считалось ЛЮБОЕ значение без обычного пробела, и под
 * правило попадали коды через дефис, телефоны без пробелов, почта, имя из
 * одного слова: такие значения переставали переноситься и уходили за край
 * карточки. Теперь неделимы только числа, всё остальное переносится.
 */
const NUMBER_LIKE = /^[-−+]?\d[\d\u00A0\u202F.,:%]*(?:[\u00A0\u202F][^\s]+){0,2}$/;

/** Строка «подпись — значение». */
export function Row({
  label,
  value,
  valueColor,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
}): ReactElement {
  /*
    Кто уступает место, решает ЗНАЧЕНИЕ. Имя, адрес или код переносятся —
    тогда ужимается значение, а подпись из словаря остаётся в одну строку.
    Сумму перенести нельзя: она собрана неразрывными пробелами, и пока
    подпись не уступала, «На руках · У 4 сотрудников, сейчас» вытолкнула
    «486 380 414 сум» за край карточки и экрана. Для числа переносится
    подпись.
  */
  const unbreakable = NUMBER_LIKE.test(value);

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, unbreakable ? styles.rowLabelWrap : null]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          unbreakable ? styles.rowValueWhole : null,
          valueColor === undefined ? null : { color: valueColor },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Цветная метка состояния. Цвет всегда сопровождается текстом. */
export function Pill({
  text,
  tone = 'neutral',
}: {
  readonly text: string;
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
}): ReactElement {
  const palette = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
    positive: { bg: colors.positiveSoft, fg: colors.positive },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.infoSoft, fg: colors.info },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      {/*
        Точка-индикатор перед текстом — из утверждённого макета «Хвоя UI».
        Помимо ритма она страхует восприятие: на солнце тонированная
        подложка выцветает первой, а плотная точка остаётся видимой.
      */}
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Полоса прогресса. */
export function Progress({
  percent,
  color = colors.accent,
}: {
  readonly percent: number;
  readonly color?: string;
}): ReactElement {
  // NaN пролезал бы в ширину как «NaN%», и полоса пропадала бы целиком.
  // Проверка на null от нечислового значения не защищает: она пропускает
  // результат неудачного разбора строки, а он тут вполне возможен.
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View style={[styles.progressFill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

/**
 * Состояние «нет данных».
 *
 * Отдельный компонент: пустая карточка без пояснения читается как сбой
 * загрузки, а объяснение снимает половину вопросов к поддержке.
 */
export function Empty({
  message,
  hint,
}: {
  readonly message: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
      {hint !== undefined && <Text style={styles.emptyHint}>{hint}</Text>}
    </View>
  );
}

/**
 * Состояние «не удалось загрузить».
 *
 * Отдельно от `Empty`, и это главное в компоненте. Пока ошибка отрисовывалась
 * тем же пустым состоянием, экран при обрыве связи писал «Заказов пока нет» —
 * сотрудник читал это как «мне ничего не назначили» и уходил домой. Пусто и
 * сломано — разные вещи, и выглядеть они обязаны по-разному.
 */
export function ErrorState({
  message,
  hint,
  onRetry,
}: {
  readonly message?: string;
  readonly hint?: string;
  /**
   * Свой повтор, если экрану мало перезапроса упавших запросов
   * (например, нужно сбросить фильтр).
   */
  readonly onRetry?: () => unknown;
}): ReactElement {
  const { m } = useLocale();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  /*
    Подсказка по умолчанию — только к общему «Не удалось загрузить». Своё
    сообщение (сеть, сервер) уже говорит, что делать, и вторая строка
    «Проверьте связь» под «Нет связи с сервером. Проверьте интернет» лишь
    повторяла его.
  */
  const shownHint = hint ?? (message === undefined ? m('common.retryHint') : undefined);

  /*
    Кнопка, а не «потяните вниз». В браузере жеста обновления нет вовсе:
    `RefreshControl` в react-native-web — пустая обёртка, а собственный жест
    браузера выключен (`overscroll-behavior`), и экран ошибки в PWA был
    тупиком. Кнопка работает одинаково на обеих платформах.

    По умолчанию перезапрашивается всё, что сейчас на экране и упало: экран
    не обязан передавать свой `refetch`, а повтор делает ровно то же, что
    сделал бы жест обновления.
  */
  const retry = (): void => {
    setRetrying(true);
    const run =
      onRetry === undefined
        ? queryClient.refetchQueries({
            type: 'active',
            predicate: (query) => query.state.status === 'error',
          })
        : Promise.resolve(onRetry());
    void run
      .catch(() => undefined)
      .finally(() => {
        setRetrying(false);
      });
  };

  return (
    <View style={styles.empty} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message ?? m('common.loadError')}</Text>
      {shownHint !== undefined && <Text style={styles.emptyHint}>{shownHint}</Text>}
      <Pressable
        onPress={retry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityState={{ busy: retrying, disabled: retrying }}
        style={({ pressed }) => [styles.retry, pressed ? styles.retryPressed : null]}
      >
        {/* Подпись остаётся под индикатором прозрачной — кнопка не меняет ширину. */}
        <Text style={[styles.retryText, retrying ? styles.retryTextHidden : null]}>
          {m('common.retry')}
        </Text>
        {retrying && (
          <ActivityIndicator size="small" color={colors.accentStrong} style={StyleSheet.absoluteFill} />
        )}
      </Pressable>
    </View>
  );
}

/**
 * Строка сгруппированного списка.
 *
 * Главная деталь — РАЗДЕЛИТЕЛЬ, и он рисуется внутри строки со сдвигом
 * влево, а не по всей ширине карточки. Так устроены системные списки iOS:
 * линия начинается там, где начинается текст, и не пересекает колонку с
 * иконками. Разделитель во всю ширину режет карточку на куски и выглядит
 * как таблица, а не как список.
 *
 * Линия волосяная (`hairline`), а не в пиксель: на плотном экране пиксельная
 * черта выглядит грубо.
 *
 * Последняя строка идёт без разделителя — линия у самого низа карточки
 * дублировала бы её край.
 */
export function ListRow({
  icon,
  label,
  value,
  tone = 'default',
  isLast = false,
  onPress,
}: {
  readonly icon?: IconName;
  readonly label: string;
  readonly value?: string;
  readonly tone?: 'default' | 'danger';
  readonly isLast?: boolean;
  /** Если задан, строка становится кнопкой с шевроном. */
  readonly onPress?: () => void;
}): ReactElement {
  const labelColor = tone === 'danger' ? colors.danger : colors.textPrimary;

  const content = (
    <>
      {icon !== undefined && (
        <View style={styles.listIcon}>
          <Icon name={icon} size={19} color={tone === 'danger' ? colors.danger : colors.accent} />
        </View>
      )}

      <View style={[styles.listBody, isLast ? null : styles.listDivider]}>
        <Text style={[styles.listLabel, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>

        {value !== undefined && (
          <Text style={styles.listValue} numberOfLines={1}>
            {value}
          </Text>
        )}

        {onPress !== undefined && (
          <Icon name="chevron" size={17} color={colors.textMuted} />
        )}
      </View>
    </>
  );

  if (onPress === undefined) {
    return <View style={styles.listRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? label : `${label}: ${value}`}
      style={({ pressed }) => [styles.listRow, pressed ? styles.listRowPressed : null]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Заглушка на время первой загрузки.
 *
 * Держит высоту, чтобы список не «прыгал», когда данные приедут. Без неё
 * экран сначала показывает пустое состояние, а через долю секунды —
 * содержимое, и это читается как мигание.
 */
export function Skeleton({ rows = 3 }: { readonly rows?: number }): ReactElement {
  return (
    <View style={styles.skeleton}>
      {Array.from({ length: rows }, (_unused, index) => (
        <View key={index} style={styles.skeletonRow}>
          {/*
            Заглушка повторяет ФОРМУ строки, а не рисует серую полосу во всю
            ширину. Полоса ничего не обещает, и когда данные приезжают, экран
            перестраивается целиком. Два блока — короткий слева и длинный
            справа — заранее занимают те же места, что займут подпись и
            значение, поэтому появление данных не двигает раскладку.

            Ширины намеренно разной длины по строкам: одинаковые выглядят
            как таблица, а живой список так не выглядит никогда.
          */}
          <View style={[styles.skeletonBlock, { width: index % 2 === 0 ? '42%' : '34%' }]} />
          <View style={[styles.skeletonBlock, { width: index % 2 === 0 ? '22%' : '30%' }]} />
        </View>
      ))}
    </View>
  );
}

/** Точка-индикатор плашки — та же, что у плашек в карточке заказа. */
const PILL_DOT = 6;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...cardShadow,
  },
  titleRule: {
    width: 14,
    height: 1,
    backgroundColor: colors.brass,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Перенос — вместо ужимания: не поместившееся действие встаёт ниже.
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    marginBottom: spacing.md,
  },
  titleIcon: {
    marginRight: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flexGrow: 1,
    flexShrink: 1,
    // В браузере у элемента flex минимум ширины — по самому длинному слову,
    // и заголовок толкал соседей за край вместо переноса.
    minWidth: 0,
  },
  titleBesideStatus: {
    // По этой доле решается, влезает ли плашка в строку (см. `CardTitle`).
    flexBasis: '40%',
  },
  titleAction: {
    // Без отступа заголовок слипается с действием: в карточке зарплаты
    // выходило «ЗарплатаАвгуст 2026» без пробела между ними.
    paddingLeft: spacing.sm,
    // В строку с заголовком и на своей строке — у правого края.
    marginLeft: 'auto',
    // Строкой и с правом ужаться — только на случай, когда действие не
    // помещается даже одно во всю ширину: тогда плашка обрежется
    // многоточием, а не вылезет за карточку.
    flexShrink: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  link: {
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
    // Зона нажатия шире подписи и влево — туда, где палец, а не к краю
    // карточки; вертикальный «минус» возвращает строке её высоту.
    paddingLeft: spacing.sm,
    marginVertical: -spacing.md,
  },
  linkText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accent,
  },
  linkDanger: {
    color: colors.danger,
  },
  linkPressed: {
    opacity: opacity.pressed,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textMuted,
    // Подпись из фиксированного словаря — ужиматься должно ЗНАЧЕНИЕ.
    // Пока сжимались обе, пара «Контроль качества — Абдурахмонов Шерзодбек
    // Улугбекович» разъезжалась в три этажа и переставала читаться.
    flexShrink: 0,
    // Но не больше 60% строки: если подписью пришло имя, значению всё равно
    // остаётся место, и оно не сжимается до столбика из одной буквы.
    maxWidth: '60%',
    marginRight: spacing.md,
  },
  rowLabelWrap: {
    flexShrink: 1,
  },
  rowValueWhole: {
    flexGrow: 0,
    flexShrink: 0,
  },
  rowValue: {
    ...typography.value,
    textAlign: 'right',
    flexShrink: 1,
    flexGrow: 1,
    // В браузере минимум ширины у элемента flex — самое длинное слово:
    // «Чиланзар-Центральный-склад» не переносился и уходил за край.
    minWidth: 0,
    // Через эту строку идёт вся числовая и денежная отчётность приложения:
    // без табличных цифр правый край колонки сумм получается неровным.
    fontVariant: ['tabular-nums'],
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    // Плашка обязана ужиматься: в узкой карточке «Смена закрыта» вылезала
    // за белый край на серый фон — RN без этого ничего не обрезает.
    flexShrink: 1,
    // В вебе плашка в одну строку берёт ширину по тексту (`alignSelf` плюс
    // `nowrap`) и без предела выходит из узкой колонки, а не ужимается.
    maxWidth: '100%',
  },
  pillDot: {
    width: PILL_DOT,
    height: PILL_DOT,
    borderRadius: radius.pill,
  },
  pillText: {
    // Строка сноски задана явно: высота плашки — ровно 16 + 2 × 4 на любом
    // экране, а не «normal» шрифта, который браузер и Android считают
    // по-разному.
    ...typography.footnote,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    minHeight: sizes.touchTarget,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  retryPressed: {
    opacity: opacity.pressed,
  },
  retryText: {
    ...typography.headline,
    color: colors.accentStrong,
  },
  retryTextHidden: {
    opacity: 0,
  },
  listCard: {
    padding: 0,
    // Иначе подсветка крайних строк вылезает за скруглённые углы.
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // Прижат к своей карточке снизу и отбит сверху от предыдущей: подпись
    // должна принадлежать тому, что под ней, а не висеть между блоками.
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionHeaderText: {
    ...typography.footnote,
    color: colors.textMuted,
    // Разрядка — единственное место, где она уместна: мелкие прописные без
    // неё сливаются в сплошную полосу.
    letterSpacing: 0.6,
    // Полужирный — своим начертанием: от `fontWeight` на Medium браузер
    // рисует поддельный жирный, размытый и шире настоящего.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    flex: 1,
  },
  sectionHeaderAction: {
    marginLeft: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.touchTarget,
    // Отступ от края карточки живёт здесь, а не на карточке: только так
    // подсветка нажатой строки доходит до её краёв.
    paddingHorizontal: spacing.lg,
  },
  listRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  listIcon: {
    width: 30,
    alignItems: 'flex-start',
  },
  /**
   * Разделитель живёт ЗДЕСЬ, а не на всей строке.
   *
   * Блок начинается после колонки с иконкой, поэтому линия автоматически
   * получает тот же левый отступ, что и текст, — без магических чисел и
   * без ручной подгонки под ширину иконки.
   */
  listBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  listDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  listLabel: {
    ...typography.body,
    flex: 1,
  },
  listValue: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  skeleton: {
    paddingVertical: spacing.xs,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Высота строки та же, что у настоящей: 44 — минимальная зона нажатия,
    // и заглушка обязана занимать ровно столько же, иначе список подпрыгнет.
    minHeight: sizes.touchTarget,
    paddingVertical: spacing.md,
  },
  skeletonBlock: {
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

import {
  AWAITING_PAYMENT_LABEL,
  EXECUTOR_NOT_ASSIGNED_LABEL,
  formatInstallSlot,
  formatIsoDateShort,
  formatMoneyShort,
  isActiveStatus,
  isOverdueDate,
  ORDER_STATUS_LABELS,
  OrderStatus,
  parseMoney,
  Priority,
  PRIORITY_LABELS,
  type OrderStatus as OrderStatusName,
  type Priority as PriorityName,
} from '@curtain-crm/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';
import { useLocale } from '../hooks/useLocale';
import { cardShadow, colors, radius, spacing, typography, fonts } from '../theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { SwipeableRow } from './SwipeableRow';

/** Статусы, в которых карточка показывает время установки вместо срока. */
const INSTALLATION_STAGE: readonly OrderStatusName[] = [
  OrderStatus.INSTALLATION_ASSIGNED,
  OrderStatus.INSTALLATION_IN_PROGRESS,
];

/**
 * Заказ в списке — карточка из утверждённого макета «Хвоя UI».
 *
 * Слева — полоса приоритета (терракота у критического, янтарь у срочного),
 * статус — чипом, сумма — компактно («13,8 млн сум») и сверхжирно. Просрочка
 * подсвечивается терракотой И подписывается словом: в цехе экран смотрят
 * под углом и при ярком свете, где на один цвет полагаться нельзя.
 *
 * Свайпы — ускорители, а не единственный путь: вправо — позвонить клиенту
 * (телефон есть и в карточке заказа), влево — открыть заказ (то же, что тап).
 * Оба действия ничего не решают сами: переходы статусов остаются за
 * кнопками карточки, которые сервер выдаёт по `availableTransitions`.
 */
export function OrderCard({
  orderNumber,
  clientName,
  clientPhone,
  status,
  priority,
  deadline,
  workPrice,
  remaining,
  installationAt = null,
  executor,
  awaitingPayment = false,
  onPress,
}: {
  readonly orderNumber: string;
  readonly clientName: string;
  /** Не передан — свайп «позвонить» выключен. */
  readonly clientPhone?: string;
  readonly status: OrderStatusName;
  readonly priority: PriorityName;
  readonly deadline: string | null;
  /** `null` — сумму этому сотруднику не показывают. */
  readonly workPrice: string | null;
  /** Остаток по заказу: `0` — оплачен целиком. Не передан — не показывается. */
  readonly remaining?: string | null;
  /** Время установки: у назначенной установки оно важнее срока. */
  readonly installationAt?: Date | null;
  /**
   * Кто сейчас ведёт этап: `name: null` — этап ждёт человека («не назначен»);
   * `null` или не передан — у статуса исполнителя нет, строки не будет.
   */
  readonly executor?: { readonly name: string | null } | null;
  /** Установка сделана, остаток не получен — пометка «Ждёт оплаты». */
  readonly awaitingPayment?: boolean;
  readonly onPress: () => void;
}): ReactElement {
  const { t, m, locale } = useLocale();
  const isOverdue =
    deadline !== null && isActiveStatus(status) && isOverdueDate(deadline);

  const deadlineLabel =
    deadline === null ? m('orderCard.noDeadline') : m('orderCard.until', { date: formatIsoDateShort(deadline) });
  // Установщику на выезде важнее не срок, а когда его ждёт клиент.
  const slot =
    installationAt !== null && INSTALLATION_STAGE.includes(status) ? formatInstallSlot(installationAt) : null;

  const card = (
    <View style={styles.card}>
      {priority !== Priority.NORMAL && (
        <View
          style={[
            styles.stripe,
            { backgroundColor: priority === Priority.CRITICAL ? colors.danger : colors.warning },
          ]}
          accessibilityLabel={m('orderCard.priority', { p: t(PRIORITY_LABELS, priority) })}
        />
      )}

      {/*
        Шапка — две строки по две колонки: «номер — статус» и «клиент —
        исполнитель». Раньше клиент стоял под всей стопкой плашек, и у
        заказа с исполнителем отъезжал от своего номера на 30 точек вместо
        шести: соседние карточки одного списка различались по высоте, а
        имя клиента «плавало». Теперь клиент всегда строкой ниже номера,
        а исполнитель — по-прежнему сразу под статусом, у правого края.
      */}
      <View style={styles.headerRow}>
        <Text style={styles.number} numberOfLines={1}>
          {orderNumber}
        </Text>
        <View style={styles.statusSlot}>
          <Chip
            text={t(ORDER_STATUS_LABELS, status)}
            tone={statusTone(status, isOverdue)}
            wrap
          />
        </View>
      </View>

      <View style={[styles.headerRow, styles.clientRow]}>
        <Text style={styles.client} numberOfLines={1}>
          {clientName}
        </Text>
        {(awaitingPayment || executor != null) && (
          <View style={styles.sideChips}>
            {awaitingPayment && <Chip text={AWAITING_PAYMENT_LABEL[locale]} tone="warning" />}
            {/* Кто сейчас ведёт заказ — сразу под статусом, как просил заказчик. */}
            {executor != null &&
              (executor.name === null ? (
                <Chip text={EXECUTOR_NOT_ASSIGNED_LABEL[locale]} tone="neutral" icon="profile" />
              ) : (
                <Chip text={executor.name} tone="accent" icon="profile" />
              ))}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.when}>
          {/*
            Просрочка пишется словом и тогда, когда назначена установка:
            прошедшее время выезда спокойным зелёным выглядело как «всё по
            плану», и тревогу несла одна только плашка.
          */}
          {(slot === null || isOverdue) && (
            <Text style={[styles.deadline, isOverdue ? styles.overdue : null]} numberOfLines={1}>
              {isOverdue ? m('orderCard.overdue', { date: formatIsoDateShort(deadline) }) : deadlineLabel}
            </Text>
          )}
          {slot !== null && (
            <Text style={[styles.deadline, isOverdue ? null : styles.slot]} numberOfLines={1}>
              {m('install.at', { date: slot.date, time: slot.time })}
            </Text>
          )}
        </View>
        {workPrice !== null && (
          <View style={styles.money}>
            {/* Единицы — на языке экрана: без локали узбек видел «млн сум». */}
            <Text style={styles.price}>{formatMoneyShort(parseMoney(workPrice), { locale })}</Text>
            {/* Продавцу важно с первого взгляда: взяли деньги или нет. */}
            {remaining != null &&
              (parseMoney(remaining) > 0 ? (
                <Text style={styles.unpaid}>
                  {m('orderCard.remaining', { sum: formatMoneyShort(parseMoney(remaining), { locale }) })}
                </Text>
              ) : (
                <Text style={styles.paid}>{m('orderCard.paid')}</Text>
              ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.cardWrapper}>
      <SwipeableRow
        left={
          clientPhone === undefined
            ? undefined
            : {
                icon: 'call',
                label: m('orderCard.call'),
                color: colors.accentBright,
                onTrigger: () => {
                  void Linking.openURL(`tel:${clientPhone}`);
                },
              }
        }
        right={{
          icon: 'forward',
          label: m('orderCard.open'),
          color: colors.header,
          onTrigger: onPress,
        }}
      >
        <PressableScale
          onPress={onPress}
          accessibilityLabel={m('orderCard.a11y', { n: orderNumber, client: clientName, status: t(ORDER_STATUS_LABELS, status) })}
        >
          {card}
        </PressableScale>
      </SwipeableRow>
    </View>
  );
}

type ChipTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

/**
 * Плашка в шапке карточки: статус, «Ждёт оплаты», исполнитель.
 *
 * Своя, а не общий `Pill`, по двум причинам. Первая — ширина: `Pill` в
 * одну строку и в вебе шире своей колонки не сжимается, поэтому «Отклонён,
 * решение за директором» уезжала за край карточки и обрезалась на
 * «директоро». Здесь плашка не шире колонки, а длинный статус переносится
 * на вторую строку целиком — статус в списке заказов читают, многоточие
 * съело бы как раз главное. Вторая — единый размер: исполнитель раньше
 * был текстом на подложке другой высоты (20 против 25) и другого кегля,
 * и стопка под номером выглядела собранной из разных наборов.
 *
 * Скругление `radius.md`, а не «пилюля»: у плашки в строку высотой 24 оно
 * всё равно даёт полукруглые торцы, а у перенесённой в две строки — ровный
 * прямоугольник вместо вытянутого овала.
 */
function Chip({
  text,
  tone,
  icon,
  wrap = false,
}: {
  readonly text: string;
  readonly tone: ChipTone;
  /** Иконка вместо точки-индикатора — у плашки, которая не статус. */
  readonly icon?: IconName;
  /** Разрешить вторую строку. Имя исполнителя — в одну, с многоточием. */
  readonly wrap?: boolean;
}): ReactElement {
  const palette = CHIP_PALETTE[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      {icon === undefined ? (
        <View style={[styles.chipDot, { backgroundColor: palette.fg }]} />
      ) : (
        <View style={styles.chipIcon}>
          <Icon name={icon} size={12} color={palette.fg} />
        </View>
      )}
      <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={wrap ? 2 : 1}>
        {text}
      </Text>
    </View>
  );
}

/** Те же пары «подложка — текст», что у `Pill`, плюс зелёная — для исполнителя. */
const CHIP_PALETTE: Record<ChipTone, { readonly bg: string; readonly fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  positive: { bg: colors.positiveSoft, fg: colors.positive },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  accent: { bg: colors.accentSoft, fg: colors.accentStrong },
};

/**
 * Статусы, в которых заказ СТОИТ и ждёт чьего-то решения, — им янтарный чип.
 * Работа в движении — зелёный, брак — терракота, закрытые — нейтральный.
 */
const WAITING_STATUSES: ReadonlySet<OrderStatusName> = new Set<OrderStatusName>([
  OrderStatus.NEW,
  OrderStatus.PENDING_ADMIN_REVIEW,
  OrderStatus.REJECTED_TO_CEO,
  OrderStatus.PENDING_SEWING_ASSIGNMENT,
  OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
]);

/**
 * Тон чипа по положению заказа на конвейере.
 *
 * Просрочка перекрашивает чип в терракоту независимо от статуса — она важнее.
 */
function statusTone(status: OrderStatusName, isOverdue: boolean): ChipTone {
  if (isOverdue || status === OrderStatus.QC_FAILED) return 'danger';
  if (!isActiveStatus(status)) return 'neutral';
  if (WAITING_STATUSES.has(status)) return 'warning';

  return 'positive';
}

const styles = StyleSheet.create({
  // Внешняя обёртка держит отступ между карточками, внутренняя — саму
  // карточку. Разделены потому, что масштабируется при нажатии ВНУТРЕННЯЯ:
  // если сжимать вместе с отступом, соседние карточки дёргаются.
  cardWrapper: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...cardShadow,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  clientRow: {
    marginTop: spacing.xs,
  },
  /*
    Колонка статуса забирает всё место справа от номера и не шире его:
    `minWidth: 0` разрешает ей быть уже своего содержимого, иначе в вебе
    ширину диктует длина статуса в одну строку.
  */
  statusSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  /*
    Плашки справа от клиента — не шире половины карточки, чтобы имя
    клиента не сжималось в многоточие из-за длинного имени исполнителя.
    Саму плашку держит `maxWidth: '100%'`: без него в вебе она шире
    колонки, если имя не помещается в одну строку.
  */
  sideChips: {
    flexShrink: 1,
    maxWidth: '50%',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-end',
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  /* Точка и иконка — по центру ПЕРВОЙ строки текста (высота строки 16). */
  chipDot: {
    width: 6,
    height: 6,
    marginTop: 5,
    borderRadius: radius.pill,
  },
  chipIcon: {
    height: 16,
    justifyContent: 'center',
  },
  chipText: {
    ...typography.footnote,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  number: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    fontWeight: '800',
    // Высота строки = высоте плашки (16 + 2 × 4): номер стоит по центру
    // статуса, а не прижат к его верху.
    lineHeight: 24,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  client: {
    ...typography.body,
    lineHeight: 24,
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  when: {
    flexShrink: 1,
    minWidth: 0,
  },
  deadline: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  slot: {
    color: colors.accentStrong,
    fontWeight: '600',
  },
  overdue: {
    color: colors.danger,
    fontWeight: '700',
  },
  money: {
    alignItems: 'flex-end',
  },
  // Остаток — то, что продавец ищет глазами первым, поэтому не мельче
  // подписи (13), а не сноской в 11, как было.
  unpaid: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.warning,
  },
  paid: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.positive,
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

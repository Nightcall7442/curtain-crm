'use client';

import type { ReactElement, ReactNode } from 'react';
import {
  DAY_OFF_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  OrderType,
  PRESENCE_STATUS_LABELS,
  PRIORITY_LABELS,
  type DayOffStatus,
  type OrderStatus,
  type OrderType as OrderTypeName,
  type PresenceStatus,
  type Priority,
} from '@curtain-crm/shared';

import { useLocale } from '@/components/providers/LocaleProvider';
import { cn } from '@/lib/utils';

/**
 * Статусные метки.
 *
 * Цвет всегда сопровождается текстом: сотрудник с нарушением цветовосприятия
 * должен различать «Выполнен» и «Отменён» без опоры на оттенок.
 */

type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'accent';

/**
 * Тона на светлом фоне держатся на РАМКЕ, а не на заливке.
 *
 * Заливка была вдвое плотнее, и двадцать строк подряд превращались в набор
 * пастельных таблеток — на льняном фоне это первое, что выдавало дешёвый
 * шаблон. Теперь цвет несут рамка и текст, а фон под меткой почти чистый:
 * форма метки остаётся, крика нет.
 */
const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  neutral: 'border-ink/10 bg-ink/[0.06] text-secondary',
  positive: 'border-positive/30 bg-positive/[0.12] text-positive',
  warning: 'border-warning/30 bg-warning/[0.12] text-warning',
  danger: 'border-danger/30 bg-danger/[0.12] text-danger',
  info: 'border-info/30 bg-info/[0.12] text-info',
  accent: 'border-accent/30 bg-accent/[0.12] text-accent',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: Tone;
  readonly className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        // Пилюля — как чипы и кнопки языка «Неон»; в таблице она стоит в ряд
        // с такими же круглыми кнопками действий.
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-overline font-semibold leading-4',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Тон статуса заказа: конечные — спокойные, проблемные — тревожные. */
const ORDER_STATUS_TONE: Readonly<Record<OrderStatus, Tone>> = {
  new: 'info',
  pending_admin_review: 'warning',
  rejected_to_ceo: 'danger',
  measurement_assigned: 'info',
  measurement_done: 'info',
  pending_sewing_assignment: 'warning',
  sewing_in_progress: 'accent',
  sewing_done: 'accent',
  pending_qc: 'warning',
  qc_failed: 'danger',
  qc_passed: 'positive',
  pending_installation_assignment: 'warning',
  installation_assigned: 'info',
  installation_in_progress: 'accent',
  installation_done: 'positive',
  completed: 'positive',
  cancelled: 'neutral',
};

export function OrderStatusBadge({
  status,
}: {
  readonly status: OrderStatus;
}): ReactElement {
  const { t } = useLocale();
  return <Badge tone={ORDER_STATUS_TONE[status]}>{t(ORDER_STATUS_LABELS, status)}</Badge>;
}

const TONE_DOT: Readonly<Record<Tone, string>> = {
  neutral: 'bg-ink/40',
  positive: 'bg-positive shadow-[0_0_8px] shadow-positive/60',
  warning: 'bg-warning shadow-[0_0_8px] shadow-warning/60',
  danger: 'bg-danger shadow-[0_0_8px] shadow-danger/60',
  info: 'bg-info shadow-[0_0_8px] shadow-info/60',
  accent: 'bg-accent shadow-[0_0_8px] shadow-accent/60',
};

/**
 * Статус для длинного списка: точка цвета тона и обычный текст в одну строку.
 *
 * Двадцать разноцветных таблеток подряд, да ещё переносящихся на три
 * строки, превращали таблицу заказов в мозаику. Точка несёт тон, текст —
 * смысл, строка остаётся одной высоты.
 *
 * `wrap` разрешает длинной подписи лечь во вторую строку вместо обрезки.
 * Нужен списку заказов: после колонки «Создатель» таблица на ноутбуке
 * 1280 px перестала помещаться, а обрезанное «Отклонён, решение за ди…»
 * прячет как раз ту часть, ради которой статус читают. Перенос — не
 * мозаика: ячейка исполнителя (имя и роль) и так делает строку двухэтажной,
 * а в три строки на 1280 px ложится только редкий «Отклонён, решение за
 * директором».
 */
export function OrderStatusDot({
  status,
  wrap = false,
}: {
  readonly status: OrderStatus;
  readonly wrap?: boolean;
}): ReactElement {
  const { t } = useLocale();
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full gap-2 text-primary',
        wrap ? 'items-start' : 'items-center whitespace-nowrap',
      )}
      title={t(ORDER_STATUS_LABELS, status)}
    >
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          // Точка — по центру ПЕРВОЙ строки подписи (18 px строки − 8 px точки) / 2.
          wrap && 'mt-[5px]',
          TONE_DOT[ORDER_STATUS_TONE[status]],
        )}
      />
      <span className={wrap ? undefined : 'truncate'}>{t(ORDER_STATUS_LABELS, status)}</span>
    </span>
  );
}

const PRIORITY_TONE: Readonly<Record<Priority, Tone>> = {
  normal: 'neutral',
  urgent: 'warning',
  critical: 'danger',
};

export function PriorityBadge({ priority }: { readonly priority: Priority }): ReactElement {
  const { t } = useLocale();
  return <Badge tone={PRIORITY_TONE[priority]}>{t(PRIORITY_LABELS, priority)}</Badge>;
}

/**
 * Метка типа заказа — у всего, кроме обычного пошива на заказ.
 *
 * Обычный пошив ничем не помечен: это ожидаемое большинство заказов. Без
 * метки продажа с витрины, миновавшая цех целиком, выглядела бы в списке
 * как пропущенные этапы, а пошив для склада — как заказ без клиента, что
 * читается ошибкой, а не другим типом работы.
 */
export function OrderTypeBadge({
  orderType,
}: {
  readonly orderType: OrderTypeName;
}): ReactElement | null {
  const { t } = useLocale();
  if (orderType === OrderType.CUSTOM) return null;
  return (
    <Badge tone={orderType === OrderType.STOCK ? 'warning' : 'accent'}>
      {t(ORDER_TYPE_LABELS, orderType)}
    </Badge>
  );
}

const PRESENCE_TONE: Readonly<Record<PresenceStatus, Tone>> = {
  at_work: 'positive',
  on_break: 'warning',
  finished: 'info',
  absent: 'danger',
};

export function PresenceBadge({
  status,
}: {
  readonly status: PresenceStatus;
}): ReactElement {
  const { t } = useLocale();
  return <Badge tone={PRESENCE_TONE[status]}>{t(PRESENCE_STATUS_LABELS, status)}</Badge>;
}

const DAY_OFF_STATUS_TONE: Readonly<Record<DayOffStatus, Tone>> = {
  pending: 'warning',
  approved: 'positive',
  rejected: 'danger',
  cancelled: 'neutral',
};

/**
 * Статус запроса сотрудника — на выходной или на опоздание.
 *
 * Словарь статусов у двух видов запросов общий, и метка общая: на одной
 * странице «Одобрен» у выходного и у опоздания обязан выглядеть одинаково,
 * а две копии тонов разошлись бы при первой правке одной из них.
 */
export function DayOffStatusBadge({
  status,
}: {
  readonly status: DayOffStatus;
}): ReactElement {
  const { t } = useLocale();
  return <Badge tone={DAY_OFF_STATUS_TONE[status]}>{t(DAY_OFF_STATUS_LABELS, status)}</Badge>;
}

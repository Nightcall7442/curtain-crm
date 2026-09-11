'use client';

import type { ReactElement, ReactNode } from 'react';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  OrderType,
  PRESENCE_STATUS_LABELS,
  PRIORITY_LABELS,
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
        /*
          Скругление 6 пикселей, а не таблетка. Круглые пилюли — язык
          мессенджера; здесь же метка стоит в таблице рядом с прямыми углами
          строк, и мягкий прямоугольник встаёт в ряд, а не выпадает из него.
        */
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-overline font-semibold leading-4 backdrop-blur-sm',
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
 * Метка «Готовые шторы».
 *
 * Появляется только у продаж с витрины — обычный пошив ничем не помечен,
 * это ожидаемое большинство заказов. Без метки заказ, миновавший цех целиком
 * (замер, раскрой, контроль качества), выглядел бы в списке как пропущенные
 * этапы — а не как другой тип продажи.
 */
export function OrderTypeBadge({
  orderType,
}: {
  readonly orderType: OrderTypeName;
}): ReactElement | null {
  const { t } = useLocale();
  if (orderType !== OrderType.READY_MADE) return null;
  return <Badge tone="accent">{t(ORDER_TYPE_LABELS, orderType)}</Badge>;
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

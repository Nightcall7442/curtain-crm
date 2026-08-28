import type { ReactElement, ReactNode } from 'react';
import {
  ORDER_STATUS_LABELS_RU,
  PRESENCE_STATUS_LABELS_RU,
  PRIORITY_LABELS_RU,
  type OrderStatus,
  type PresenceStatus,
  type Priority,
} from '@curtain-crm/shared';

import { cn } from '@/lib/utils';

/**
 * Статусные метки.
 *
 * Цвет всегда сопровождается текстом: сотрудник с нарушением цветовосприятия
 * должен различать «Выполнен» и «Отменён» без опоры на оттенок.
 */

type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'gold';

const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  neutral: 'border-strong/60 bg-raised text-secondary',
  positive: 'border-positive/30 bg-positive/10 text-positive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
  gold: 'border-gold/30 bg-gold/10 text-gold-soft',
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
        'inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium leading-4',
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
  sewing_in_progress: 'gold',
  sewing_done: 'gold',
  pending_qc: 'warning',
  qc_failed: 'danger',
  qc_passed: 'positive',
  pending_installation_assignment: 'warning',
  installation_assigned: 'info',
  installation_in_progress: 'gold',
  installation_done: 'positive',
  completed: 'positive',
  cancelled: 'neutral',
};

export function OrderStatusBadge({
  status,
}: {
  readonly status: OrderStatus;
}): ReactElement {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS_RU[status]}</Badge>;
}

const PRIORITY_TONE: Readonly<Record<Priority, Tone>> = {
  normal: 'neutral',
  urgent: 'warning',
  critical: 'danger',
};

export function PriorityBadge({ priority }: { readonly priority: Priority }): ReactElement {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS_RU[priority]}</Badge>;
}

const PRESENCE_TONE: Readonly<Record<PresenceStatus, Tone>> = {
  at_work: 'positive',
  finished: 'info',
  absent: 'danger',
};

export function PresenceBadge({
  status,
}: {
  readonly status: PresenceStatus;
}): ReactElement {
  return <Badge tone={PRESENCE_TONE[status]}>{PRESENCE_STATUS_LABELS_RU[status]}</Badge>;
}

import { z } from 'zod';

/**
 * Типы внутренних уведомлений сотрудников.
 *
 * В этой версии уведомления только внутренние (для персонала). Клиентские
 * SMS/пуш-уведомления не реализуются, но модель их не блокирует: достаточно
 * добавить новые значения в этот список и канал доставки в `notifications.service.ts`.
 */
export const NOTIFICATION_TYPES = [
  /** Заказ назначен сотруднику (замер, пошив, контроль, установка). */
  'order_assigned',
  /** Изменился статус заказа, в котором сотрудник участвует. */
  'order_status_changed',
  /** Заказ возвращён на предыдущий этап (откат). */
  'order_rolled_back',
  /** Заказ отклонён админом и передан директору. */
  'order_rejected_to_ceo',
  /** Контроль качества обнаружил брак. */
  'order_qc_failed',
  /** Заказ отменён. */
  'order_cancelled',
  /** Заказ закрыт. */
  'order_completed',
  /** Новый комментарий к заказу. */
  'order_comment_added',
  /** Смена скорректирована вручную руководством. */
  'shift_adjusted',
  /** Расчёт зарплаты утверждён. */
  'payroll_approved',
  /** Зарплата выплачена. */
  'payroll_paid',
  /** Сотруднику выдана или отозвана роль. */
  'role_changed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NotificationType = {
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_ROLLED_BACK: 'order_rolled_back',
  ORDER_REJECTED_TO_CEO: 'order_rejected_to_ceo',
  ORDER_QC_FAILED: 'order_qc_failed',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_COMPLETED: 'order_completed',
  ORDER_COMMENT_ADDED: 'order_comment_added',
  SHIFT_ADJUSTED: 'shift_adjusted',
  PAYROLL_APPROVED: 'payroll_approved',
  PAYROLL_PAID: 'payroll_paid',
  ROLE_CHANGED: 'role_changed',
} as const satisfies Record<string, NotificationType>;

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

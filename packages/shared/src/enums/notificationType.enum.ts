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
  /**
   * Этап заказа ждёт исполнителя — приходит всем, кто может его взять.
   *
   * Отличается от `order_assigned` тем, что заказ ещё ничей. Админ перевёл
   * его на этап, исполнителя не назначил, и заказ лежит в общем пуле цеха.
   * Раньше об этом не узнавал никто: уведомления шли только уже назначенным
   * участникам, и работа ждала, пока кто-нибудь сам не откроет приложение
   * и не заглянет в список.
   */
  'order_stage_awaiting',
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
  /** Руководитель дал сотруднику поручение. */
  'task_assigned',
  /** Сотрудник отметил поручение выполненным (адресат — автор поручения). */
  'task_completed',
  /** Ответ по поручению — от исполнителя автору или наоборот. */
  'task_replied',
  /** Доп. работу отменило руководство. */
  'task_cancelled',
  /** Сотрудник запросил выходные — видит руководство. */
  'day_off_requested',
  /** Запрос на выходные одобрен. */
  'day_off_approved',
  /** Запрос на выходные отклонён. */
  'day_off_rejected',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NotificationType = {
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_STAGE_AWAITING: 'order_stage_awaiting',
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
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
  TASK_REPLIED: 'task_replied',
  TASK_CANCELLED: 'task_cancelled',
  DAY_OFF_REQUESTED: 'day_off_requested',
  DAY_OFF_APPROVED: 'day_off_approved',
  DAY_OFF_REJECTED: 'day_off_rejected',
} as const satisfies Record<string, NotificationType>;

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * Тон плитки уведомления.
 *
 * Тон — это РОЛЬ события, а не его настроение: `danger` означает «работу
 * вернули, нужно переделывать», `warning` — «требуется внимание руководства»,
 * `accent` — «деньги», `info` — обычный ход заказа. Цвет всегда идёт вместе
 * с заголовком: в ленте из двадцати строк оттенок плитки читается как метка,
 * а не как единственный носитель смысла.
 */
export type NotificationTone = 'accent' | 'info' | 'warning' | 'danger' | 'neutral';

export const NOTIFICATION_TONES: Readonly<Record<NotificationType, NotificationTone>> = {
  order_assigned: 'info',
  // Работа стоит и ждёт, пока её кто-то возьмёт: заметнее рядового хода.
  order_stage_awaiting: 'warning',
  order_status_changed: 'info',
  order_rolled_back: 'danger',
  order_rejected_to_ceo: 'warning',
  order_qc_failed: 'danger',
  order_cancelled: 'neutral',
  order_completed: 'accent',
  order_comment_added: 'info',
  shift_adjusted: 'warning',
  payroll_approved: 'accent',
  payroll_paid: 'accent',
  role_changed: 'warning',
  // Доп. работа — прямая просьба руководителя: заметнее рядового хода заказа.
  task_assigned: 'warning',
  task_completed: 'accent',
  // Ответ по поручению — разговор о работе, рядовое событие.
  task_replied: 'info',
  task_cancelled: 'neutral',
  // Запрос ждёт решения руководства — заметнее рядовой сводки, как поручение.
  day_off_requested: 'warning',
  day_off_approved: 'accent',
  day_off_rejected: 'neutral',
};

/**
 * Важные уведомления.
 *
 * Отдельного признака «важное» у уведомления НЕТ и заводить его не стали:
 * важность здесь — свойство типа события, а не отметка, которую кто-то
 * проставляет вручную. Важным считается то, из-за чего работа встала или
 * пошла назад, — по такому событию сотруднику надо что-то сделать, а не
 * просто узнать о нём.
 */
export const IMPORTANT_NOTIFICATION_TYPES: readonly NotificationType[] = [
  NotificationType.ORDER_QC_FAILED,
  NotificationType.ORDER_ROLLED_BACK,
  NotificationType.ORDER_REJECTED_TO_CEO,
  NotificationType.ORDER_CANCELLED,
  // Заказ лежит и ждёт исполнителя: пока никто не возьмёт, работа стоит.
  NotificationType.ORDER_STAGE_AWAITING,
  // Доп. работа — прямая просьба руководителя сделать что-то, а не сводка.
  NotificationType.TASK_ASSIGNED,
  // Запрос на выходные ждёт решения — без действия руководства так и повиснет.
  NotificationType.DAY_OFF_REQUESTED,
];

export function isImportantNotification(type: NotificationType): boolean {
  return IMPORTANT_NOTIFICATION_TYPES.includes(type);
}

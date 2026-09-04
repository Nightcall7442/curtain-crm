import { notifications, type DbExecutor } from '@curtain-crm/db';
import {
  NotificationType,
  ORDER_STATUS_LABELS_RU,
  OrderStatus,
  ROLE_LABELS_RU,
  type NotificationType as NotificationTypeName,
  type Role,
} from '@curtain-crm/shared';

/**
 * Внутренние уведомления сотрудников.
 *
 * Правило адресации: сотрудник получает уведомление ТОЛЬКО о своих задачах —
 * заказ назначен ему, сменился статус этапа, за который он отвечает,
 * скорректирована его смена. Рассылки «всем подряд» здесь нет намеренно:
 * лента, в которой 90 % чужого, перестаёт читаться.
 *
 * Все функции принимают `DbExecutor`, поэтому вызываются внутри той же
 * транзакции, что и само событие: уведомление о переходе статуса не должно
 * существовать, если сам переход откатился.
 */

export interface NotificationDraft {
  readonly userId: number;
  readonly type: NotificationTypeName;
  readonly title: string;
  readonly body: string;
  readonly relatedOrderId?: number | null;
  /** Расчёт зарплаты — по нему уведомление предлагает подтвердить получение. */
  readonly relatedPayrollRecordId?: number | null;
}

/**
 * Создаёт уведомления пакетом.
 *
 * Дубликаты по одному и тому же адресату отсеиваются: при переходе статуса
 * один человек может быть одновременно, например, и швеёй, и мастером заказа,
 * и получить два одинаковых уведомления.
 */
export async function createNotifications(
  executor: DbExecutor,
  drafts: readonly NotificationDraft[],
): Promise<number> {
  const seen = new Set<string>();
  const unique = drafts.filter((draft) => {
    const key = `${draft.userId.toString()}|${draft.type}|${(draft.relatedOrderId ?? 0).toString()}|${draft.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return 0;

  await executor.insert(notifications).values(
    unique.map((draft) => ({
      userId: draft.userId,
      type: draft.type,
      title: draft.title,
      body: draft.body,
      relatedOrderId: draft.relatedOrderId ?? null,
      relatedPayrollRecordId: draft.relatedPayrollRecordId ?? null,
    })),
  );

  return unique.length;
}

/** Уведомление одному сотруднику. */
export async function createNotification(
  executor: DbExecutor,
  draft: NotificationDraft,
): Promise<void> {
  await createNotifications(executor, [draft]);
}

/* -------------------------------------------------------------------------- */
/*                        Готовые сценарии уведомлений                        */
/* -------------------------------------------------------------------------- */

export interface OrderNotificationContext {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly clientName: string;
}

/** Заказ назначен сотруднику на конкретный этап. */
export async function notifyOrderAssigned(
  executor: DbExecutor,
  order: OrderNotificationContext,
  assigneeId: number,
  role: Role,
): Promise<void> {
  await createNotification(executor, {
    userId: assigneeId,
    type: NotificationType.ORDER_ASSIGNED,
    title: `Новый заказ ${order.orderNumber}`,
    body: `Вам назначен заказ клиента «${order.clientName}» как «${ROLE_LABELS_RU[role]}»`,
    relatedOrderId: order.orderId,
  });
}

/**
 * Статус заказа изменился.
 *
 * Тип уведомления подбирается по целевому статусу: брак и отмена должны
 * читаться иначе, чем рядовое продвижение по этапам.
 */
export async function notifyOrderStatusChanged(
  executor: DbExecutor,
  order: OrderNotificationContext,
  recipientIds: readonly number[],
  params: {
    readonly toStatus: OrderStatus;
    readonly isRollback: boolean;
    readonly comment: string | null;
    readonly actorName: string;
  },
): Promise<void> {
  if (recipientIds.length === 0) return;

  const statusLabel = ORDER_STATUS_LABELS_RU[params.toStatus];
  const reason = params.comment === null ? '' : ` Причина: ${params.comment}`;

  const type = resolveStatusNotificationType(params.toStatus, params.isRollback);

  await createNotifications(
    executor,
    recipientIds.map((userId) => ({
      userId,
      type,
      title: `Заказ ${order.orderNumber}: ${statusLabel}`,
      body: `${params.actorName} перевёл заказ в статус «${statusLabel}».${reason}`,
      relatedOrderId: order.orderId,
    })),
  );
}

function resolveStatusNotificationType(
  toStatus: OrderStatus,
  isRollback: boolean,
): NotificationTypeName {
  switch (toStatus) {
    case OrderStatus.QC_FAILED:
      return NotificationType.ORDER_QC_FAILED;
    case OrderStatus.CANCELLED:
      return NotificationType.ORDER_CANCELLED;
    case OrderStatus.COMPLETED:
      return NotificationType.ORDER_COMPLETED;
    case OrderStatus.REJECTED_TO_CEO:
      return NotificationType.ORDER_REJECTED_TO_CEO;
    default:
      return isRollback
        ? NotificationType.ORDER_ROLLED_BACK
        : NotificationType.ORDER_STATUS_CHANGED;
  }
}

/** Новый комментарий к заказу — всем участникам, кроме автора. */
export async function notifyOrderCommentAdded(
  executor: DbExecutor,
  order: OrderNotificationContext,
  recipientIds: readonly number[],
  params: { readonly authorName: string; readonly preview: string },
): Promise<void> {
  await createNotifications(
    executor,
    recipientIds.map((userId) => ({
      userId,
      type: NotificationType.ORDER_COMMENT_ADDED,
      title: `Комментарий к заказу ${order.orderNumber}`,
      body: `${params.authorName}: ${params.preview}`,
      relatedOrderId: order.orderId,
    })),
  );
}

/** Смена скорректирована руководством задним числом. */
export async function notifyShiftAdjusted(
  executor: DbExecutor,
  userId: number,
  params: { readonly actorName: string; readonly reason: string; readonly shiftDate: string },
): Promise<void> {
  await createNotification(executor, {
    userId,
    type: NotificationType.SHIFT_ADJUSTED,
    title: `Смена ${params.shiftDate} скорректирована`,
    body: `${params.actorName} изменил время смены. Причина: ${params.reason}`,
  });
}

/** Расчёт зарплаты утверждён или выплачен. */
export async function notifyPayroll(
  executor: DbExecutor,
  userId: number,
  params: {
    readonly paid: boolean;
    readonly period: string;
    readonly amount: string;
    /**
     * Расчёт, к которому относится уведомление.
     *
     * Нужен для действия, а не для перехода: по уведомлению о выплате
     * сотрудник подтверждает получение прямо из ленты, и кнопке надо знать,
     * какой расчёт подтверждать.
     */
    readonly payrollRecordId: number;
  },
): Promise<void> {
  await createNotification(executor, {
    userId,
    type: params.paid ? NotificationType.PAYROLL_PAID : NotificationType.PAYROLL_APPROVED,
    title: params.paid ? `Зарплата за ${params.period} выплачена` : `Расчёт за ${params.period} утверждён`,
    body: params.paid
      ? `Сумма: ${params.amount}. Подтвердите, что деньги получили.`
      : `Сумма: ${params.amount}`,
    relatedPayrollRecordId: params.payrollRecordId,
  });
}

/** Сотруднику выдана или отозвана роль. */
export async function notifyRoleChanged(
  executor: DbExecutor,
  userId: number,
  params: { readonly role: Role; readonly granted: boolean; readonly actorName: string },
): Promise<void> {
  await createNotification(executor, {
    userId,
    type: NotificationType.ROLE_CHANGED,
    title: params.granted ? 'Вам выдана новая роль' : 'Роль отозвана',
    body: `${params.actorName} ${params.granted ? 'назначил вам роль' : 'отозвал роль'} «${ROLE_LABELS_RU[params.role]}»`,
  });
}

/* -------------------------------------------------------------------------- */
/*                               Доп работы                                  */
/* -------------------------------------------------------------------------- */

/** Руководитель дал сотруднику поручение. */
export async function notifyTaskAssigned(
  executor: DbExecutor,
  assigneeId: number,
  params: { readonly title: string; readonly creatorName: string; readonly dueDate: string | null },
): Promise<void> {
  await createNotification(executor, {
    userId: assigneeId,
    type: NotificationType.TASK_ASSIGNED,
    title: 'Новое поручение',
    body:
      `${params.creatorName}: «${params.title}»` +
      (params.dueDate === null ? '' : ` — срок до ${params.dueDate}`),
  });
}

/** Сотрудник отметил поручение выполненным — узнаёт его автор. */
export async function notifyTaskCompleted(
  executor: DbExecutor,
  creatorId: number,
  params: { readonly title: string; readonly assigneeName: string },
): Promise<void> {
  await createNotification(executor, {
    userId: creatorId,
    type: NotificationType.TASK_COMPLETED,
    title: 'Доп. работа выполнена',
    body: `${params.assigneeName}: «${params.title}»`,
  });
}

/** Доп. работу отменило руководство — узнаёт адресат. */
export async function notifyTaskCancelled(
  executor: DbExecutor,
  assigneeId: number,
  params: { readonly title: string; readonly reason: string },
): Promise<void> {
  await createNotification(executor, {
    userId: assigneeId,
    type: NotificationType.TASK_CANCELLED,
    title: 'Доп. работа отменена',
    body: `«${params.title}» — ${params.reason}`,
  });
}

/* -------------------------------------------------------------------------- */
/*                            Запросы на выходные                             */
/* -------------------------------------------------------------------------- */

/** Форматирует период одной строкой: один день короче, чем диапазон. */
function formatPeriod(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} — ${endDate}`;
}

/** Сотрудник запросил выходные — узнаёт руководство. */
export async function notifyDayOffRequested(
  executor: DbExecutor,
  recipientIds: readonly number[],
  params: { readonly requesterName: string; readonly startDate: string; readonly endDate: string },
): Promise<void> {
  if (recipientIds.length === 0) return;

  await createNotifications(
    executor,
    recipientIds.map((userId) => ({
      userId,
      type: NotificationType.DAY_OFF_REQUESTED,
      title: 'Запрос на выходные',
      body: `${params.requesterName} просит выходные: ${formatPeriod(params.startDate, params.endDate)}`,
    })),
  );
}

/** Запрос на выходные одобрен — узнаёт сотрудник. */
export async function notifyDayOffApproved(
  executor: DbExecutor,
  userId: number,
  params: { readonly startDate: string; readonly endDate: string; readonly reviewerName: string },
): Promise<void> {
  await createNotification(executor, {
    userId,
    type: NotificationType.DAY_OFF_APPROVED,
    title: 'Выходные одобрены',
    body: `${params.reviewerName} одобрил ваш запрос на ${formatPeriod(params.startDate, params.endDate)}`,
  });
}

/** Запрос на выходные отклонён — узнаёт сотрудник. */
export async function notifyDayOffRejected(
  executor: DbExecutor,
  userId: number,
  params: { readonly startDate: string; readonly endDate: string; readonly reason: string },
): Promise<void> {
  await createNotification(executor, {
    userId,
    type: NotificationType.DAY_OFF_REJECTED,
    title: 'Выходные отклонены',
    body: `${formatPeriod(params.startDate, params.endDate)} — ${params.reason}`,
  });
}

import { describe, expect, it } from 'vitest';

import {
  isImportantNotification,
  NOTIFICATION_TYPES,
  notificationDestination,
} from './notificationType.enum';

const none = { orderId: null, taskId: null };

describe('notificationDestination', () => {
  it('заказные уведомления ведут на заказ', () => {
    expect(notificationDestination('order_assigned', { orderId: 7, taskId: null })).toEqual({
      kind: 'order',
      orderId: 7,
    });
  });

  it('заказное уведомление без заказа никуда не ведёт', () => {
    expect(notificationDestination('order_status_changed', none)).toBeNull();
  });

  it('уведомление о поручении ведёт на само поручение', () => {
    expect(notificationDestination('task_assigned', { orderId: null, taskId: 12 })).toEqual({
      kind: 'task',
      taskId: 12,
    });
  });

  it('старое уведомление о поручении без ссылки ведёт в список поручений', () => {
    expect(notificationDestination('task_replied', none)).toEqual({ kind: 'tasks' });
  });

  it('запрос на выходные — к очереди руководства, ответ на него — к своим выходным', () => {
    expect(notificationDestination('day_off_requested', none)).toEqual({ kind: 'dayOffApprovals' });
    expect(notificationDestination('day_off_approved', none)).toEqual({ kind: 'dayOff' });
    expect(notificationDestination('day_off_rejected', none)).toEqual({ kind: 'dayOff' });
  });

  it('запрос на опоздание — туда же, где выходные: экран один', () => {
    expect(notificationDestination('late_requested', none)).toEqual({ kind: 'dayOffApprovals' });
    expect(notificationDestination('late_approved', none)).toEqual({ kind: 'dayOff' });
    expect(notificationDestination('late_rejected', none)).toEqual({ kind: 'dayOff' });
    expect(notificationDestination('late_withdrawn', none)).toEqual({ kind: 'dayOff' });
  });

  it('запрос на опоздание ждёт решения — важное, как запрос на выходной', () => {
    expect(isImportantNotification('late_requested')).toBe(true);
    expect(isImportantNotification('late_approved')).toBe(false);
  });

  it('снятое согласование опоздания — важное: прийти теперь надо по графику', () => {
    expect(isImportantNotification('late_withdrawn')).toBe(true);
  });

  it('каждый тип, кроме заказных без заказа, куда-то ведёт', () => {
    const lost = NOTIFICATION_TYPES.filter(
      (type) => notificationDestination(type, { orderId: 1, taskId: 1 }) === null,
    );

    expect(lost).toEqual([]);
  });
});

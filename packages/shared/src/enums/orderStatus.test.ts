import { describe, expect, it } from 'vitest';

import {
  availableTransitions,
  canTransition,
  isRollback,
  isTerminalStatus,
  ORDER_STATUS_LABELS_RU,
  ORDER_STATUS_PHASE,
  ORDER_STATUS_STAGE_INDEX,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderStatus,
  requiresComment,
  transitionsFrom,
} from './orderStatus.enum';
import { Role, ROLES } from './role.enum';

/**
 * Таблица переходов — это и есть бизнес-правило жизненного цикла заказа,
 * поэтому её инварианты проверяются тестами, а не только глазами на ревью.
 */
describe('таблица переходов заказа', () => {
  it('покрывает все статусы подписями, фазами и индексами', () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABELS_RU[status]).toBeTruthy();
      expect(ORDER_STATUS_PHASE[status]).toBeTruthy();
      expect(typeof ORDER_STATUS_STAGE_INDEX[status]).toBe('number');
    }
  });

  it('не содержит дублирующихся пар from -> to', () => {
    const keys = ORDER_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('не содержит переходов статуса в самого себя', () => {
    expect(ORDER_TRANSITIONS.filter((t) => t.from === t.to)).toHaveLength(0);
  });

  it('в каждом переходе указана хотя бы одна известная роль и подпись', () => {
    for (const transition of ORDER_TRANSITIONS) {
      expect(transition.roles.length).toBeGreaterThan(0);
      expect(transition.label.length).toBeGreaterThan(0);
      for (const role of transition.roles) {
        expect(ROLES).toContain(role);
      }
    }
  });

  it('из конечных статусов переходов нет', () => {
    expect(transitionsFrom(OrderStatus.COMPLETED)).toHaveLength(0);
    expect(transitionsFrom(OrderStatus.CANCELLED)).toHaveLength(0);
    expect(isTerminalStatus(OrderStatus.COMPLETED)).toBe(true);
    expect(isTerminalStatus(OrderStatus.CANCELLED)).toBe(true);
  });

  it('любой неконечный статус можно отменить, и только руководству', () => {
    for (const status of ORDER_STATUSES) {
      if (isTerminalStatus(status)) continue;

      expect(canTransition(status, OrderStatus.CANCELLED)).toBe(true);
      expect(availableTransitions(status, [Role.CEO]).some((t) => t.to === OrderStatus.CANCELLED)).toBe(true);
      expect(availableTransitions(status, [Role.SEWER]).some((t) => t.to === OrderStatus.CANCELLED)).toBe(false);
    }
  });

  it('каждый неконечный статус, кроме new, достижим хотя бы одним переходом', () => {
    const reachable = new Set(ORDER_TRANSITIONS.map((t) => t.to));
    for (const status of ORDER_STATUSES) {
      if (status === OrderStatus.NEW) continue;
      expect(reachable.has(status)).toBe(true);
    }
  });

  it('весь прямой путь заказа проходим от new до completed', () => {
    const happyPath = [
      OrderStatus.NEW,
      OrderStatus.PENDING_ADMIN_REVIEW,
      OrderStatus.MEASUREMENT_ASSIGNED,
      OrderStatus.MEASUREMENT_DONE,
      OrderStatus.PENDING_SEWING_ASSIGNMENT,
      OrderStatus.SEWING_IN_PROGRESS,
      OrderStatus.SEWING_DONE,
      OrderStatus.PENDING_QC,
      OrderStatus.QC_PASSED,
      OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
      OrderStatus.INSTALLATION_ASSIGNED,
      OrderStatus.INSTALLATION_IN_PROGRESS,
      OrderStatus.INSTALLATION_DONE,
      OrderStatus.COMPLETED,
    ] as const;

    for (let index = 0; index < happyPath.length - 1; index += 1) {
      const from = happyPath[index];
      const to = happyPath[index + 1];
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      if (from === undefined || to === undefined) continue;
      expect(canTransition(from, to)).toBe(true);
      expect(requiresComment(from, to)).toBe(false);
    }
  });

  it('замер можно пропустить: pending_admin_review -> pending_sewing_assignment', () => {
    expect(
      canTransition(OrderStatus.PENDING_ADMIN_REVIEW, OrderStatus.PENDING_SEWING_ASSIGNMENT),
    ).toBe(true);
  });
});

describe('откаты и обязательные комментарии', () => {
  it('возврат из брака в пошив — это откат с обязательной причиной', () => {
    expect(isRollback(OrderStatus.QC_FAILED, OrderStatus.SEWING_IN_PROGRESS)).toBe(true);
    expect(requiresComment(OrderStatus.QC_FAILED, OrderStatus.SEWING_IN_PROGRESS)).toBe(true);
  });

  it('возврат на повторный замер из брака тоже требует причины', () => {
    expect(requiresComment(OrderStatus.QC_FAILED, OrderStatus.MEASUREMENT_ASSIGNED)).toBe(true);
  });

  it('отклонение и отмена требуют причины, хотя откатом не являются', () => {
    expect(isRollback(OrderStatus.PENDING_ADMIN_REVIEW, OrderStatus.REJECTED_TO_CEO)).toBe(false);
    expect(requiresComment(OrderStatus.PENDING_ADMIN_REVIEW, OrderStatus.REJECTED_TO_CEO)).toBe(true);
    expect(requiresComment(OrderStatus.SEWING_IN_PROGRESS, OrderStatus.CANCELLED)).toBe(true);
  });

  it('ни один откат не двигает заказ вперёд по шкале этапов', () => {
    for (const transition of ORDER_TRANSITIONS) {
      if (transition.kind !== 'rollback') continue;
      expect(isRollback(transition.from, transition.to)).toBe(true);
      // Побочные статусы делят индекс с якорным шагом, поэтому «не вперёд»,
      // а не строго «назад»: `rejected_to_ceo -> pending_admin_review`.
      expect(ORDER_STATUS_STAGE_INDEX[transition.to]).toBeLessThanOrEqual(
        ORDER_STATUS_STAGE_INDEX[transition.from],
      );
    }
  });

  it('прямые переходы никогда не считаются откатом', () => {
    for (const transition of ORDER_TRANSITIONS) {
      if (transition.kind !== 'forward') continue;
      expect(isRollback(transition.from, transition.to)).toBe(false);
    }
  });

  it('ни один прямой переход не помечен как требующий комментария', () => {
    for (const transition of ORDER_TRANSITIONS) {
      if (transition.kind !== 'forward') continue;
      expect(requiresComment(transition.from, transition.to)).toBe(false);
    }
  });

  it('несуществующий переход запрещён и комментария не требует', () => {
    expect(canTransition(OrderStatus.NEW, OrderStatus.COMPLETED)).toBe(false);
    expect(requiresComment(OrderStatus.NEW, OrderStatus.COMPLETED)).toBe(false);
  });
});

describe('права на переходы', () => {
  it('швея может начать и завершить пошив, но не назначить установщика', () => {
    expect(
      availableTransitions(OrderStatus.PENDING_SEWING_ASSIGNMENT, [Role.SEWER]).map((t) => t.to),
    ).toContain(OrderStatus.SEWING_IN_PROGRESS);
    expect(
      availableTransitions(OrderStatus.PENDING_INSTALLATION_ASSIGNMENT, [Role.SEWER]),
    ).toHaveLength(0);
  });

  it('судьбу отклонённого заказа решает директор; админу остаётся только отмена', () => {
    const adminOptions = availableTransitions(OrderStatus.REJECTED_TO_CEO, [Role.ADMIN]);
    expect(adminOptions.map((t) => t.to)).toEqual([OrderStatus.CANCELLED]);

    const ceoOptions = availableTransitions(OrderStatus.REJECTED_TO_CEO, [Role.CEO]);
    expect(ceoOptions.map((t) => t.to)).toEqual(
      expect.arrayContaining([
        OrderStatus.MEASUREMENT_ASSIGNED,
        OrderStatus.PENDING_SEWING_ASSIGNMENT,
        OrderStatus.PENDING_ADMIN_REVIEW,
      ]),
    );
  });

  it('роли суммируются: мастер-швея видит переходы обеих ролей', () => {
    const combined = availableTransitions(OrderStatus.MEASUREMENT_ASSIGNED, [
      Role.MASTER,
      Role.SEWER,
    ]);
    expect(combined.map((t) => t.to)).toContain(OrderStatus.MEASUREMENT_DONE);
  });

  it('SMM не участвует в жизненном цикле заказа', () => {
    for (const status of ORDER_STATUSES) {
      expect(availableTransitions(status, [Role.SMM])).toHaveLength(0);
    }
  });
});

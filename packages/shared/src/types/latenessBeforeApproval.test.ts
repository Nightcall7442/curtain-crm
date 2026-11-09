import { describe, expect, it } from 'vitest';

import { latenessBeforeApprovalSchema } from './latenessBeforeApproval';

/**
 * Снимок записи опоздания до одобрения: снятие согласования возвращает
 * запись ровно из него, поэтому чужое в нём должно не пройти, а своё —
 * пройти без потерь.
 */
describe('latenessBeforeApprovalSchema', () => {
  const snapshot = {
    change: 'adjusted',
    row: {
      id: 501,
      kind: 'late_over_30',
      isRepeat: false,
      points: '-2.0',
      description: 'Смена с 09:00, отметка в 09:40 — опоздание 40 мин',
      employeeComment: 'Автобус сломался',
      employeeCommentAt: '2026-11-08T05:12:00.000Z',
      occurredOn: '2026-11-08',
    },
  };

  it('снимок, как его пишет одобрение, разбирается без потерь', () => {
    expect(latenessBeforeApprovalSchema.parse(snapshot)).toEqual(snapshot);
    const removed = { change: 'removed', row: { ...snapshot.row, employeeComment: null, employeeCommentAt: null } };
    expect(latenessBeforeApprovalSchema.parse(removed)).toEqual(removed);
  });

  it('не опоздание — не снимок: другие виды дисциплины система не пересчитывает', () => {
    expect(latenessBeforeApprovalSchema.safeParse({ ...snapshot, row: { ...snapshot.row, kind: 'absence' } }).success).toBe(
      false,
    );
  });

  it('балл — строкой numeric(4,1), как он лежит в колонке', () => {
    for (const points of [-2, '-2', '−2.0', '-2.00']) {
      expect(latenessBeforeApprovalSchema.safeParse({ ...snapshot, row: { ...snapshot.row, points } }).success, String(points)).toBe(
        false,
      );
    }
  });

  it('неизвестное действие одобрения и кривые даты не проходят', () => {
    expect(latenessBeforeApprovalSchema.safeParse({ ...snapshot, change: 'created' }).success).toBe(false);
    expect(
      latenessBeforeApprovalSchema.safeParse({ ...snapshot, row: { ...snapshot.row, occurredOn: '08.11.2026' } }).success,
    ).toBe(false);
    expect(
      latenessBeforeApprovalSchema.safeParse({ ...snapshot, row: { ...snapshot.row, employeeCommentAt: 'вчера' } }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { checkInStartFromFirstEdit } from './checkInTime';

/**
 * Время отметки по журналу правок смены. Выбор первой отметки дня из смен
 * (SQL) проверяет смоук; здесь — разбор журнала, на котором он стоит.
 */
describe('checkInStartFromFirstEdit', () => {
  const USER = 243;
  // Так `shifts.adjustManually` пишет правку в журнал: Date в jsonb — строкой ISO.
  const edit = (before: unknown): Record<string, unknown> => ({
    created: false,
    reason: 'пришла позже, чем отметилась',
    before,
    after: { startedAt: '2026-11-08T05:30:00.000Z', endedAt: '2026-11-08T13:00:00.000Z', userId: USER },
  });

  it('начало до первой правки — время отметки, даже если правка перенесла начало', () => {
    const details = edit({ startedAt: '2026-11-08T04:05:00.000Z', endedAt: null, userId: USER });
    expect(checkInStartFromFirstEdit(details, USER)?.toISOString()).toBe('2026-11-08T04:05:00.000Z');
  });

  it('смена, переданная правкой от другого сотрудника, — не его отметка', () => {
    const details = edit({ startedAt: '2026-11-08T04:05:00.000Z', endedAt: null, userId: USER + 1 });
    expect(checkInStartFromFirstEdit(details, USER)).toBeNull();
  });

  it('без `before` (смену завёл руководитель, автозакрытие) или в чужом формате — не восстановить', () => {
    expect(checkInStartFromFirstEdit(edit(null), USER)).toBeNull();
    expect(checkInStartFromFirstEdit({ auto: true, endedAt: '2026-11-08T13:00:00.000Z' }, USER)).toBeNull();
    expect(checkInStartFromFirstEdit(edit({ startedAt: 'вчера утром', userId: USER }), USER)).toBeNull();
    expect(checkInStartFromFirstEdit(null, USER)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { Role } from '../enums/role.enum';

import { assignPlaces, normalizeVolume, ratingScore, unratedReason } from './rating';

describe('ratingScore', () => {
  it('даёт по баллу за каждый закрытый заказ и не упирается в 100', () => {
    expect(ratingScore(0)).toBe(0);
    expect(ratingScore(14)).toBe(14);
    expect(ratingScore(250)).toBe(250);
  });
});

describe('normalizeVolume', () => {
  it('отдаёт лидеру роли 100, остальным — долю от него', () => {
    expect(normalizeVolume(412, 412)).toBe(100);
    expect(normalizeVolume(206, 412)).toBe(50);
  });

  it('не превышает 100, если значение почему-то больше лучшего', () => {
    expect(normalizeVolume(500, 412)).toBe(100);
  });

  it('даёт 0 всем, когда за период не закрыто ни одного заказа роли', () => {
    expect(normalizeVolume(0, 0)).toBe(0);
  });
});

describe('assignPlaces', () => {
  const byScore = (a: { score: number }, b: { score: number }): boolean => a.score === b.score;

  it('делит место у неразличимых строк и перескакивает следующее', () => {
    const rows = [{ score: 94 }, { score: 94 }, { score: 88 }, { score: 70 }];

    expect(assignPlaces(rows, byScore).map((row) => row.place)).toEqual([1, 1, 3, 4]);
  });

  it('нумерует подряд, когда строки различаются', () => {
    const rows = [{ score: 94 }, { score: 91 }, { score: 88 }];

    expect(assignPlaces(rows, byScore).map((row) => row.place)).toEqual([1, 2, 3]);
  });

  it('разводит лидеров разных ролей, когда критерий дележа шире балла', () => {
    // Все набрали по 100 — нормировка объёма внутри роли даёт лидеру ровно
    // столько. Число закрытых заказов их различает.
    const rows = [
      { score: 100, orders: 5 },
      { score: 100, orders: 3 },
      { score: 100, orders: 3 },
      { score: 100, orders: 2 },
    ];

    const places = assignPlaces(
      rows,
      (a, b) => a.score === b.score && a.orders === b.orders,
    ).map((row) => row.place);

    expect(places).toEqual([1, 2, 2, 4]);
  });

  it('не падает на пустой таблице', () => {
    expect(assignPlaces([], () => true)).toEqual([]);
  });
});

describe('unratedReason', () => {
  it('молчит про сотрудника, у которого есть участвующая роль', () => {
    expect(unratedReason([Role.SEWER])).toBeNull();
    // Совмещение: одной участвующей роли достаточно.
    expect(unratedReason([Role.ADMIN, Role.SELLER])).toBeNull();
  });

  it('объясняет, почему директор и SMM вне конкурса', () => {
    expect(unratedReason([Role.CEO])).toContain('Директор');
    expect(unratedReason([Role.SMM])).toContain('SMM');
  });
});

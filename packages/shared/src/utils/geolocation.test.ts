import { describe, expect, it } from 'vitest';

import {
  findBranchInRadius,
  findNearestBranch,
  haversineDistanceMeters,
  isWithinBranchRadius,
  type GeoBranch,
} from './geolocation';

/** Цех №1 из `curtain-bot` — Ташкент. */
const TASHKENT: GeoBranch = {
  id: 1,
  name: 'Цех №1',
  latitude: 41.2995,
  longitude: 69.2401,
  radiusMeters: 100,
};

/** Цех №2 — Ургенч, за сотни километров. */
const URGENCH: GeoBranch = {
  id: 2,
  name: 'Цех №2',
  latitude: 41.5829,
  longitude: 60.6095,
  radiusMeters: 100,
};

describe('haversineDistanceMeters', () => {
  it('даёт ноль для совпадающих точек', () => {
    expect(haversineDistanceMeters(TASHKENT, TASHKENT)).toBe(0);
  });

  it('совпадает с известным расстоянием Ташкент — Ургенч (~720 км)', () => {
    const distance = haversineDistanceMeters(TASHKENT, URGENCH);
    expect(distance).toBeGreaterThan(715_000);
    expect(distance).toBeLessThan(725_000);
  });

  it('корректно считает малые расстояния', () => {
    // ~0.0009° широты ≈ 100 м.
    const distance = haversineDistanceMeters(TASHKENT, {
      latitude: TASHKENT.latitude + 0.0009,
      longitude: TASHKENT.longitude,
    });
    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(105);
  });

  it.each([
    [{ latitude: Number.NaN, longitude: 69 }, 'NaN'],
    [{ latitude: 91, longitude: 69 }, 'широта вне диапазона'],
    [{ latitude: 41, longitude: 181 }, 'долгота вне диапазона'],
    [{ latitude: Number.POSITIVE_INFINITY, longitude: 69 }, 'Infinity'],
  ])('бросает RangeError вместо возврата NaN (%#: %s)', (point) => {
    expect(() => haversineDistanceMeters(TASHKENT, point)).toThrow(RangeError);
  });
});

describe('findNearestBranch', () => {
  it('возвращает null, если активных филиалов нет', () => {
    expect(findNearestBranch(TASHKENT, [])).toBeNull();
  });

  it('выбирает ближайший филиал и отмечает попадание в радиус', () => {
    const result = findNearestBranch(TASHKENT, [URGENCH, TASHKENT]);
    expect(result?.branch.id).toBe(TASHKENT.id);
    expect(result?.distanceMeters).toBe(0);
    expect(result?.isWithinRadius).toBe(true);
  });

  it('отмечает выход за радиус, но всё равно возвращает ближайший', () => {
    const farAway = { latitude: 41.4, longitude: 69.4 };
    const result = findNearestBranch(farAway, [TASHKENT, URGENCH]);
    expect(result?.branch.id).toBe(TASHKENT.id);
    expect(result?.isWithinRadius).toBe(false);
  });
});

describe('findBranchInRadius', () => {
  it('находит филиал, если сотрудник внутри радиуса', () => {
    const result = findBranchInRadius(TASHKENT, [TASHKENT, URGENCH]);
    expect(result?.branch.id).toBe(TASHKENT.id);
  });

  it('возвращает null, если сотрудник не у одного из филиалов', () => {
    expect(findBranchInRadius({ latitude: 41.4, longitude: 69.4 }, [TASHKENT, URGENCH])).toBeNull();
  });

  it('учитывает индивидуальный радиус филиала, а не общую константу', () => {
    const wideBranch: GeoBranch = { ...TASHKENT, id: 3, radiusMeters: 5_000 };
    const position = { latitude: 41.3095, longitude: 69.2401 }; // ~1.1 км

    expect(isWithinBranchRadius(position, TASHKENT)).toBe(false);
    expect(isWithinBranchRadius(position, wideBranch)).toBe(true);
    expect(findBranchInRadius(position, [TASHKENT, wideBranch])?.branch.id).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';

import { sewerCategoryFor, suggestedStageFee } from './sewerCategory';

describe('категории швей', () => {
  it('лидер и близкие к нему — первая, половина — вторая, остальные — третья', () => {
    expect(sewerCategoryFor(10, 10)).toBe(1);
    expect(sewerCategoryFor(8, 10)).toBe(1);
    expect(sewerCategoryFor(7.5, 10)).toBe(2);
    expect(sewerCategoryFor(5, 10)).toBe(2);
    expect(sewerCategoryFor(4.5, 10)).toBe(3);
  });

  it('без истории и с нулём — третья, даже если лидера нет', () => {
    expect(sewerCategoryFor(0, 0)).toBe(3);
    expect(sewerCategoryFor(0, 10)).toBe(3);
    expect(sewerCategoryFor(-2, 10)).toBe(3);
  });

  it('пример владельца: 50 000 → 40 000 второй, 30 000 третьей', () => {
    expect(suggestedStageFee(50_000, 1)).toBe(50_000);
    expect(suggestedStageFee(50_000, 2)).toBe(40_000);
    expect(suggestedStageFee(50_000, 3)).toBe(30_000);
  });
});

import type { Locale } from '../i18n/locale';

/**
 * Категории швей — три ступени, от которых зависит расценка за пошив.
 *
 * Владелец: «рейтинг швеи — категории, по опозданиям тоже; если балл плохой,
 * то и зарплата меньше». Категория выводится из рейтинга за прошлый месяц —
 * того самого балла, где закрытый заказ даёт плюс, а опоздание и другие
 * записи дисциплины — минус. Никакой отдельной «оценки» руководитель не
 * ставит: категория — следствие работы, а не мнение.
 *
 * Ступени — по доле от лидера среди швей, а не по абсолютному баллу: балл
 * растёт с числом заказов, и порог «10 баллов» в тихий месяц не взял бы
 * никто, а в горячий — все. От лидера считается честно в любой месяц.
 */
export const SEWER_CATEGORIES = [1, 2, 3] as const;
export type SewerCategory = (typeof SEWER_CATEGORIES)[number];

/**
 * Доля от лидера, с которой начинается категория. Ниже второй — третья.
 * Новенькая без истории и месяц без единого закрытого пошива — третья:
 * категорию нужно заработать.
 */
export const SEWER_CATEGORY_SHARE_OF_BEST: Readonly<Record<1 | 2, number>> = {
  1: 0.8,
  2: 0.5,
};

/**
 * Процент от расценки первой категории. Пример владельца: за пошив 50 000 —
 * второй категории программа предлагает 40 000, третьей 30 000.
 */
export const SEWER_CATEGORY_FEE_PERCENT: Readonly<Record<SewerCategory, number>> = {
  1: 100,
  2: 80,
  3: 60,
};

/** Подписи по числу, а не по строке: категория везде ходит числом 1–3. */
export const SEWER_CATEGORY_LABELS: Readonly<Record<Locale, Readonly<Record<SewerCategory, string>>>> = {
  ru: { 1: '1-я категория', 2: '2-я категория', 3: '3-я категория' },
  uz: { 1: '1-toifa', 2: '2-toifa', 3: '3-toifa' },
};
export const SEWER_CATEGORY_LABELS_RU = SEWER_CATEGORY_LABELS.ru;

/** Категория по баллу и лучшему баллу среди швей за тот же период. */
export function sewerCategoryFor(score: number, best: number): SewerCategory {
  if (best <= 0 || score <= 0) return 3;
  const share = score / best;
  if (share >= SEWER_CATEGORY_SHARE_OF_BEST[1]) return 1;
  if (share >= SEWER_CATEGORY_SHARE_OF_BEST[2]) return 2;
  return 3;
}

/** Расценка для категории от ставки первой категории — в тех же единицах, что и ставка. */
export function suggestedStageFee(baseFee: number, category: SewerCategory): number {
  return Math.round((baseFee * SEWER_CATEGORY_FEE_PERCENT[category]) / 100);
}

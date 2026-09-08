import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Сторона открывания карниза.
 *
 * Раньше было свободное поле — продавец писал «левый», «правый»,
 * «п-образный» на свой вкус, и в отчётах одна и та же сторона встречалась
 * под тремя разными подписями. Реальных вариантов на практике ровно три,
 * и они стали перечислением по тому же образцу, что вид позиции
 * (`orderItemKind.enum.ts`).
 */
export const CORNICE_ROTATIONS = ['both', 'left', 'right'] as const;

export type CorniceRotation = (typeof CORNICE_ROTATIONS)[number];

export const CorniceRotation = {
  BOTH: 'both',
  LEFT: 'left',
  RIGHT: 'right',
} as const satisfies Record<string, CorniceRotation>;

export const corniceRotationSchema = z.enum(CORNICE_ROTATIONS);

export const CORNICE_ROTATION_LABELS: Translated<CorniceRotation> = {
  ru: { both: 'Оба', left: 'Левый', right: 'Правый' },
  uz: { both: 'Ikkalasi', left: 'Chap', right: "O'ng" },
};

export const CORNICE_ROTATION_LABELS_RU = CORNICE_ROTATION_LABELS.ru;

export function isCorniceRotation(value: unknown): value is CorniceRotation {
  return typeof value === 'string' && (CORNICE_ROTATIONS as readonly string[]).includes(value);
}

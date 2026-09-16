import { DisciplineLevel, type DisciplineKind, type DisciplineLevel as Level } from '../enums/discipline.enum';

/**
 * Баллы по категориям — таблица из презентации владельца.
 *
 * Нарушения со знаком минус, поощрения с плюсом. Одна таблица на панель,
 * приложение и сервер: цифру в форме никто не вводит, её даёт категория.
 * «Грубость клиенту» в презентации — «4–5 баллов»; здесь верх вилки:
 * серьёзное нарушение сразу выводит на высокий уровень, так и задумано.
 */
export const DISCIPLINE_POINTS: Readonly<Record<DisciplineKind, number>> = {
  late_under_15: -0.5,
  late_15_30: -1,
  late_over_30: -2,
  absence: -3,
  no_show_no_notice: -4,
  client_rudeness: -5,
  client_complaint: -2,
  measure_error: -3,
  order_failure: -3,
  plan_done: 3,
  positive_review: 1,
  helped_team: 1,
};

export const DISCIPLINE_VIOLATION_KINDS = (Object.keys(DISCIPLINE_POINTS) as DisciplineKind[]).filter(
  (kind) => DISCIPLINE_POINTS[kind] < 0,
);

export const DISCIPLINE_BONUS_KINDS = (Object.keys(DISCIPLINE_POINTS) as DisciplineKind[]).filter(
  (kind) => DISCIPLINE_POINTS[kind] > 0,
);

export function isDisciplineViolation(kind: DisciplineKind): boolean {
  return DISCIPLINE_POINTS[kind] < 0;
}

/**
 * Повтор того же нарушения в том же месяце — балл выше.
 *
 * Презентация говорит «повышенный балл», не называя числа; взят один
 * дополнительный штрафной балл — заметно, но не удваивает мелкое опоздание
 * до уровня прогула. Поощрения повтором не усиливаются.
 */
export const DISCIPLINE_REPEAT_SURCHARGE = 1;

export function disciplinePoints(kind: DisciplineKind, isRepeat: boolean): number {
  const base = DISCIPLINE_POINTS[kind];
  return isRepeat && base < 0 ? base - DISCIPLINE_REPEAT_SURCHARGE : base;
}

/**
 * Пороги уровней по СУММЕ ШТРАФНЫХ баллов за месяц (по модулю).
 *
 * Поощрения на уровень не влияют: «+3 за план» не гасит прогул, разговор
 * о прогуле всё равно нужен. Плюсы видны рядом — как признание, и как
 * повод обсуждать не только ошибки.
 */
export const DISCIPLINE_LEVEL_THRESHOLDS: readonly { readonly from: number; readonly level: Level }[] = [
  { from: 7, level: DisciplineLevel.MANAGEMENT },
  { from: 5, level: DisciplineLevel.WRITTEN },
  { from: 3, level: DisciplineLevel.VERBAL },
  { from: 0, level: DisciplineLevel.CONTROL },
];

export function disciplineLevel(penaltyPoints: number): Level {
  const penalty = Math.abs(penaltyPoints);
  for (const step of DISCIPLINE_LEVEL_THRESHOLDS) {
    if (penalty >= step.from) return step.level;
  }
  return DisciplineLevel.CONTROL;
}

/** «−1», «+3», «−0,5» — знак всегда, как в презентации. */
export function formatDisciplinePoints(points: number): string {
  const abs = Math.abs(points).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (points === 0) return '0';
  return `${points < 0 ? '−' : '+'}${abs}`;
}

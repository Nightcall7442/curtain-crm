import type { ReactElement } from 'react';

import { RATING_COMPONENT_HINTS_RU, RATING_COMPONENT_LABELS_RU } from '@curtain-crm/shared';

import { cn, formatPercent } from '@/lib/utils';

/**
 * Балл с разбивкой на составляющие.
 *
 * Полоса нужна не ради украшения: место в таблице читается мгновенно, а
 * разрыв между первым и вторым — нет, и без полосы «100 и 96» выглядят
 * одинаково успешными. Число печатается всегда, полоса лишь дублирует его.
 *
 * Компоненты подписаны рядом, потому что веса балла подобраны, а не выведены
 * из данных. Несогласный с формулой должен видеть исходные проценты и спорить
 * с ней предметно, а не с итоговой цифрой.
 */

/**
 * Цвет полосы по величине балла.
 *
 * Три ступени, а не градиент: глазу нужен различимый признак, а не оттенок,
 * который на соседних строках не отличить. Порог 50 — не «плохо», а «объём
 * ниже половины лидера роли»: у балла нет отрицательного смысла.
 */
function toneClass(score: number): string {
  if (score >= 80) return 'bg-positive';
  if (score >= 50) return 'bg-accent';
  return 'bg-warning';
}

export function ScoreMeter({
  score,
  className,
}: {
  readonly score: number;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-8 shrink-0 text-right font-mono text-caption font-semibold text-primary tabular-nums">
        {score}
      </span>

      <span
        className="h-1.5 w-full min-w-[52px] overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`Балл ${score.toString()} из 100`}
      >
        <span
          className={cn('block h-full rounded-full', toneClass(score))}
          // Ширина — значение CSS: разделителем обязана быть точка,
          // локализованное число здесь сломало бы стиль.
          style={{ width: `${score.toFixed(0)}%` }}
        />
      </span>
    </div>
  );
}

/** Один компонент балла: подпись и процент. */
export function ScoreComponent({
  component,
  value,
}: {
  readonly component: keyof typeof RATING_COMPONENT_LABELS_RU;
  readonly value: number | null;
}): ReactElement {
  return (
    <span
      className="inline-flex items-baseline gap-1 whitespace-nowrap"
      title={RATING_COMPONENT_HINTS_RU[component]}
    >
      <span className="text-overline uppercase tracking-[0.06em] text-muted">
        {RATING_COMPONENT_LABELS_RU[component]}
      </span>
      <span className="font-mono text-footnote text-secondary tabular-nums">
        {value === null ? '—' : formatPercent(value, { fractionDigits: 0 })}
      </span>
    </span>
  );
}

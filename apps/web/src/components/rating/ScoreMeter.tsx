import type { ReactElement } from 'react';

import { RATING_COMPONENT_HINTS_RU, RATING_COMPONENT_LABELS_RU } from '@curtain-crm/shared';

import { cn, formatPercent } from '@/lib/utils';

/**
 * Балл с полосой относительно лидера таблицы.
 *
 * Балл — штука за заказ, потолка нет, поэтому полоса не «из 100», а доля
 * от лучшего в этой таблице: лидер — полная, остальные — свою часть. Число
 * печатается всегда, полоса лишь дублирует его: разрыв между первым и
 * вторым по цифрам «14 и 13» не читается, по полосе — читается.
 */

/**
 * Цвет полосы по доле от лидера.
 *
 * Три ступени, а не градиент: глазу нужен различимый признак, а не оттенок,
 * который на соседних строках не отличить. Порог 50 — не «плохо», а «меньше
 * половины лидера»: у балла нет отрицательного смысла.
 */
function toneClass(percent: number): string {
  if (percent >= 80) return 'bg-positive';
  if (percent >= 50) return 'bg-accent';
  return 'bg-warning';
}

export function ScoreMeter({
  score,
  best,
  className,
}: {
  readonly score: number;
  /** Лучший балл в таблице — знаменатель полосы. */
  readonly best: number;
  readonly className?: string;
}): ReactElement {
  const percent = best <= 0 ? 0 : Math.min(score / best, 1) * 100;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-8 shrink-0 text-right font-mono text-caption font-semibold text-primary tabular-nums">
        {score}
      </span>

      <span
        className="h-1.5 w-full min-w-[52px] overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`Балл ${score.toString()}`}
      >
        <span
          className={cn('block h-full rounded-full', toneClass(percent))}
          // Ширина — значение CSS: разделителем обязана быть точка,
          // локализованное число здесь сломало бы стиль.
          style={{ width: `${percent.toFixed(0)}%` }}
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

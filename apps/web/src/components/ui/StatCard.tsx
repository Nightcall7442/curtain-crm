import type { ReactElement } from 'react';
import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Карточка показателя из верхнего ряда дашборда.
 *
 * Дельта окрашивается по знаку, но знак ВСЕГДА напечатан текстом (`+17.8%`)
 * и сопровождается стрелкой: направление изменения не должно зависеть
 * от способности различить зелёный и красный.
 */
export function StatCard({
  label,
  value,
  unit,
  caption,
  deltaPercent,
  /** Для показателей, где рост — это плохо (например, просрочки). */
  invertDelta = false,
  icon: Icon,
  accent,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly caption?: string;
  readonly deltaPercent?: number | null;
  readonly invertDelta?: boolean;
  readonly icon?: LucideIcon;
  readonly accent?: string;
}): ReactElement {
  const hasDelta = deltaPercent !== undefined && deltaPercent !== null;
  const isPositiveChange = hasDelta && (invertDelta ? deltaPercent < 0 : deltaPercent > 0);
  const isNeutralChange = hasDelta && deltaPercent === 0;

  return (
    <section className="rounded-panel border border-subtle bg-panel p-3.5 shadow-panel">
      <header className="flex items-start gap-2">
        <h3 className="section-title min-w-0 flex-1">{label}</h3>
        {Icon !== undefined && (
          <Icon
            className="h-4 w-4 shrink-0 text-gold-dim"
            style={accent === undefined ? undefined : { color: accent }}
            aria-hidden
          />
        )}
      </header>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none text-primary">{value}</span>
        {unit !== undefined && <span className="text-[12px] text-secondary">{unit}</span>}
      </p>

      <footer className="mt-2 flex items-center gap-2">
        {caption !== undefined && (
          <span className="min-w-0 truncate text-[11px] text-muted">{caption}</span>
        )}

        {hasDelta && (
          <span
            className={cn(
              'ml-auto flex shrink-0 items-center gap-0.5 text-[11px] font-medium',
              isNeutralChange
                ? 'text-muted'
                : isPositiveChange
                  ? 'text-positive'
                  : 'text-danger',
            )}
          >
            {!isNeutralChange &&
              (deltaPercent > 0 ? (
                <TrendingUp className="h-3 w-3" aria-hidden />
              ) : (
                <TrendingDown className="h-3 w-3" aria-hidden />
              ))}
            {`${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`}
          </span>
        )}
      </footer>
    </section>
  );
}

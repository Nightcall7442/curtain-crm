import type { ReactElement } from 'react';
import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { CURRENCY_SYMBOL_RU } from '@curtain-crm/shared';

import { cn, formatPercent } from '@/lib/utils';

/** Кегли значения, от желаемого к запасному. Меньше 16 px число перестаёт быть заголовком. */
const VALUE_SIZES_PX = [26, 21, 18, 16] as const;

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

  /**
   * Валюта отделяется от числа.
   *
   * `formatMoney()` склеивает сумму с «сум» неразрывным пробелом, и в карточке
   * шириной 185 px «115 100 000 сум» одним куском не помещалось ни при каком
   * разумном кегле. Разделённые, они помещаются: число остаётся крупным
   * моноширинным, валюта уходит в мелкую подпись рядом — так и правильнее
   * читается, единица измерения не спорит с показателем.
   *
   * Разбор идёт по точному суффиксу из `@curtain-crm/shared`, а не по regexp
   * «последнее слово»: проценты, часы и штуки форматируются иначе и делиться
   * не должны.
   */
  const moneySuffix = `\u00A0${CURRENCY_SYMBOL_RU}`;
  const isMoney = unit === undefined && value.endsWith(moneySuffix);
  const amount = isMoney ? value.slice(0, -moneySuffix.length) : value;
  const amountUnit = isMoney ? CURRENCY_SYMBOL_RU : unit;

  /**
   * Кегль подбирается расчётом ширины, а не порогами по числу символов.
   *
   * Пороги уже дважды промахивались: сперва обрезалось само число, потом —
   * дельта рядом с ним. Причина в том, что «символов» — не та величина:
   * ширину задают моноширинный шаг (0,6 em) и ширина единицы измерения.
   * Здесь берётся самый крупный кегль, при котором расчётная ширина строки
   * укладывается в колонку карточки на самой тесной раскладке дашборда.
   */
  const MONO_ADVANCE_EM = 0.6;
  const NOMINAL_CONTENT_PX = 152;
  const unitPx = amountUnit === undefined ? 0 : amountUnit.length * 6.6 + 6;
  const valuePx =
    VALUE_SIZES_PX.find((px) => amount.length * MONO_ADVANCE_EM * px + unitPx <= NOMINAL_CONTENT_PX) ??
    VALUE_SIZES_PX[VALUE_SIZES_PX.length - 1];

  return (
    <section className="rounded-panel border border-subtle bg-panel p-3.5 shadow-panel">
      {/*
        Заголовку отведены две строки независимо от того, сколько он занимает.
        Без этого «Заказы за неделю» переносилось, а «Новые заказы» — нет,
        и числа в верхнем ряду дашборда стояли на разной высоте: ряд читался
        как набор разных карточек, а не как одна шкала.
      */}
      <header className="flex min-h-[2.6em] items-start gap-2 text-[11px]">
        <h3 className="section-title min-w-0 flex-1 leading-[1.3]">{label}</h3>
        {Icon !== undefined && (
          <Icon
            className="h-4 w-4 shrink-0 text-accent-muted"
            style={accent === undefined ? undefined : { color: accent }}
            aria-hidden
          />
        )}
      </header>

      {/*
        Значение занимает строку целиком, дельта и подпись — подвал с переносом.
        Раньше всё стояло в одну строку, и в колонке шириной 180 px обрезалось
        то одно, то другое: сперва подпись («Прошлая неделя…»), а после того
        как ей дали свою строку — дельта у «115 100 000 сум». Перенос убирает
        обрезание при любой ширине карточки.
      */}
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className="font-mono font-medium leading-none text-primary"
          style={{ fontSize: `${valuePx}px` }}
        >
          {amount}
        </span>
        {amountUnit !== undefined && (
          <span className="text-[12px] text-secondary">{amountUnit}</span>
        )}
      </p>

      <footer className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {hasDelta && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 text-[11.5px] font-medium',
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
            {formatPercent(deltaPercent, { signed: true })}
          </span>
        )}

        {caption !== undefined && (
          <span className="text-[11px] leading-snug text-muted">{caption}</span>
        )}
      </footer>

    </section>
  );
}

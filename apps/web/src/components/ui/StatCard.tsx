import type { ReactElement } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { CURRENCY_SYMBOL_RU } from '@curtain-crm/shared';

import { cn, formatPercent } from '@/lib/utils';

/** Кегли значения, от желаемого к запасному. Меньше 18 px число перестаёт быть заголовком. */
const VALUE_SIZES_PX = [30, 25, 21, 18] as const;

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
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly caption?: string;
  readonly deltaPercent?: number | null;
  readonly invertDelta?: boolean;
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
  /*
    Шаг цифры у пропорциональной антиквы уже моноширинного: 0,52 em против
    0,6 — при табличных цифрах он постоянен, поэтому расчёт остаётся честным.
  */
  const MONO_ADVANCE_EM = 0.52;
  const NOMINAL_CONTENT_PX = 152;
  const unitPx = amountUnit === undefined ? 0 : amountUnit.length * 6.6 + 6;
  const valuePx =
    VALUE_SIZES_PX.find((px) => amount.length * MONO_ADVANCE_EM * px + unitPx <= NOMINAL_CONTENT_PX) ??
    VALUE_SIZES_PX[VALUE_SIZES_PX.length - 1];

  return (
    <section className="surface-card p-5">
      {/*
        Заголовку отведены две строки независимо от того, сколько он занимает.
        Без этого «Заказы за неделю» переносилось, а «Новые заказы» — нет,
        и числа в верхнем ряду дашборда стояли на разной высоте: ряд читался
        как набор разных карточек, а не как одна шкала.
      */}
      {/*
        Иконок в цветных кружках здесь больше нет.

        Шесть карточек с шестью разными кружками — синим, голубым, зелёным,
        оранжевым — выглядели набором из шаблона: цвет ничего не означал,
        а различал карточки хуже, чем их собственные подписи. Ориентир
        теперь даёт типографика: латунная черта, прописная подпись и крупное
        число. Заголовку по-прежнему отведены две строки, иначе числа в ряду
        встают на разной высоте и ряд рассыпается.
      */}
      <header className="flex min-h-[2.6em] items-start">
        <h3 className="min-w-0 flex-1 text-caption font-medium leading-[1.3] text-secondary">{label}</h3>
      </header>

      {/*
        Значение занимает строку целиком, дельта и подпись — подвал с переносом.
        Раньше всё стояло в одну строку, и в колонке шириной 180 px обрезалось
        то одно, то другое: сперва подпись («Прошлая неделя…»), а после того
        как ей дали свою строку — дельта у «115 100 000 сум». Перенос убирает
        обрезание при любой ширине карточки.
      */}
      <p className="mt-2 flex items-baseline gap-1.5">
        {/*
          Число набрано антиквой, а не моноширинным.

          Моноширинный шрифт нужен там, где цифры стоят колонкой и их
          сравнивают построчно, — в таблицах. Здесь число одно, и «терминальные»
          цифры с широкими промежутками читались дёшево: «3,9 млн» выглядело
          набранным через силу. Табличные цифры (`tabular-nums`) удерживают
          разряды на месте и здесь.
        */}
        <span
          className="font-figure font-semibold leading-none tracking-[-0.02em] text-primary [font-variant-numeric:tabular-nums]"
          style={{ fontSize: `${valuePx}px` }}
        >
          {amount}
        </span>
        {amountUnit !== undefined && (
          <span className="text-footnote text-secondary">{amountUnit}</span>
        )}
      </p>

      <footer className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {hasDelta && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 text-footnote font-medium',
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
          <span className="text-footnote leading-snug text-muted">{caption}</span>
        )}
      </footer>

    </section>
  );
}

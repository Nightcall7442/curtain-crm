'use client';

import type { ProductionStageKey } from '@curtain-crm/shared';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Drill,
  Ruler,
  Scissors,
  Search,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactElement } from 'react';

/**
 * Виджет «Этапы производства заказов»: восемь плиток конвейера.
 *
 * Цвет плитки — подкрепление, а не носитель смысла: у каждой есть подпись
 * и число. Набор цветов подобран так, чтобы соседние плитки различались
 * и при нарушениях цветовосприятия (см. комментарий к токенам `--stage-*`).
 *
 * Каждая плитка — ссылка на список заказов, отфильтрованный по этому этапу:
 * дашборд должен вести к работе, а не только показывать цифру.
 */

const STAGE_VISUALS: Readonly<
  Record<ProductionStageKey, { readonly icon: LucideIcon; readonly color: string }>
> = {
  new: { icon: Sparkles, color: 'rgb(var(--stage-new))' },
  measurement: { icon: Ruler, color: 'rgb(var(--stage-measurement))' },
  cutting: { icon: Scissors, color: 'rgb(var(--stage-cutting))' },
  sewing: { icon: Wand2, color: 'rgb(var(--stage-sewing))' },
  qc: { icon: Search, color: 'rgb(var(--stage-qc))' },
  ready_for_install: { icon: ClipboardCheck, color: 'rgb(var(--stage-ready))' },
  installation: { icon: Drill, color: 'rgb(var(--stage-installation))' },
  done: { icon: CheckCircle2, color: 'rgb(var(--stage-done))' },
};

export interface PipelineStage {
  readonly key: ProductionStageKey;
  readonly label: string;
  readonly count: number;
}

export function ProductionPipeline({
  stages,
}: {
  readonly stages: readonly PipelineStage[];
}): ReactElement {
  return (
    /*
      Плитки РАСТЯГИВАЮТСЯ на всю ширину карточки.

      Раньше у них была только минимальная ширина и нечем было расти: на
      широком мониторе восемь плиток оставались по 112 px и жались влево,
      а треть карточки пустовала. Теперь каждая — равная доля строки
      (`flex-1`), и ряд заполняет её целиком.

      Минимальная ширина сохранена: на узком экране плитки упираются в неё,
      строка перестаёт помещаться и включается горизонтальная прокрутка.
      Переносить этапы по строкам нельзя — это последовательность, и разрыв
      посередине ломает её чтение.

      Стрелки — прямые дети строки, а не часть плитки: иначе последняя плитка
      (у которой стрелки нет) оказывалась бы шире остальных на её ширину.
    */
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {stages.map((stage, index) => {
        const visuals = STAGE_VISUALS[stage.key];
        const Icon = visuals.icon;

        return (
          <Fragment key={stage.key}>
            <Link
              href={`/orders?stage=${stage.key}`}
              /*
                min-w 92, а не 112, и паддинги теснее: на мониторе шириной от
                ~1000 px все восемь этапов встают в одну строку без прокрутки —
                конвейер, который надо листать вбок, не читается как конвейер.
              */
              className="card-link group flex min-w-[92px] flex-1 flex-col items-center gap-1 rounded-tile border bg-base/40 px-2 py-2 hover:bg-raised/50"
              style={{ borderColor: `color-mix(in srgb, ${visuals.color} 45%, transparent)` }}
            >
              <span
                className="text-center text-overline font-semibold uppercase leading-tight text-secondary"
                style={{ minHeight: '2.2em' }}
              >
                {stage.label}
              </span>
              <Icon className="h-5 w-5" style={{ color: visuals.color }} aria-hidden />
              <span
                className="text-title font-semibold leading-none tabular-nums"
                style={{ color: visuals.color }}
              >
                {stage.count}
              </span>
            </Link>

            {index < stages.length - 1 && (
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 self-center text-muted/70"
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

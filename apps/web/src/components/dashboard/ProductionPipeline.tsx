'use client';

import type { ProductionStageKey } from '@curtain-crm/shared';
import {
  CheckCircle2,
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
import type { ReactElement } from 'react';

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
    // Горизонтальная прокрутка на узких экранах: восемь плиток со стрелками
    // не поместятся на ноутбуке в цехе, а переносить их по строкам — значит
    // потерять смысл последовательности.
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {stages.map((stage, index) => {
        const visuals = STAGE_VISUALS[stage.key];
        const Icon = visuals.icon;

        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            <Link
              href={`/orders?stage=${stage.key}`}
              className="group flex min-w-[112px] flex-col items-center gap-1.5 rounded-md border bg-base/40 px-3 py-3 transition-colors hover:bg-raised/50"
              style={{ borderColor: `color-mix(in srgb, ${visuals.color} 45%, transparent)` }}
            >
              <span
                className="text-center text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em] text-secondary"
                style={{ minHeight: '2.2em' }}
              >
                {stage.label}
              </span>
              <Icon className="h-5 w-5" style={{ color: visuals.color }} aria-hidden />
              <span
                className="text-[20px] font-semibold leading-none"
                style={{ color: visuals.color }}
              >
                {stage.count}
              </span>
            </Link>

            {index < stages.length - 1 && (
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

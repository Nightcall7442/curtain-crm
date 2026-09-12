'use client';

import type { ProductionStageKey } from '@curtain-crm/shared';
import {
  CircleCheck,
  Hammer,
  Inbox,
  PackageCheck,
  Ruler,
  Scissors,
  ShieldCheck,
  Shirt,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * Конвейер заказов — восемь этапов слева направо.
 *
 * Три слоя, а не одна строка чисел. Сверху — полоса долей: сколько заказов
 * на каком этапе, цветом этапа; по ней видно, где скопилось, ещё до чтения
 * цифр. Ниже — плитки: значок этапа в цветном кружке, число, подпись и доля
 * от всего конвейера. Между плитками — бегущая линия: заказы движутся, и
 * конвейер должен выглядеть движущимся.
 *
 * Самый загруженный этап (кроме «Завершено») помечен как узкое место —
 * это то, зачем директор смотрит на конвейер утром.
 */

const STAGE_COLOR: Readonly<Record<ProductionStageKey, string>> = {
  new: 'rgb(var(--stage-new))',
  measurement: 'rgb(var(--stage-measurement))',
  cutting: 'rgb(var(--stage-cutting))',
  sewing: 'rgb(var(--stage-sewing))',
  qc: 'rgb(var(--stage-qc))',
  ready_for_install: 'rgb(var(--stage-ready))',
  installation: 'rgb(var(--stage-installation))',
  done: 'rgb(var(--stage-done))',
};

const STAGE_ICON: Readonly<Record<ProductionStageKey, LucideIcon>> = {
  new: Inbox,
  measurement: Ruler,
  cutting: Scissors,
  sewing: Shirt,
  qc: ShieldCheck,
  ready_for_install: PackageCheck,
  installation: Hammer,
  done: CircleCheck,
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
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const inFlight = stages.filter((stage) => stage.key !== 'done');
  const inFlightTotal = inFlight.reduce((sum, stage) => sum + stage.count, 0);
  const bottleneck =
    inFlightTotal === 0
      ? null
      : inFlight.reduce((best, stage) => (stage.count > best.count ? stage : best));

  return (
    <div className="space-y-4">
      {/* --- Сводка и полоса долей ------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-footnote text-muted">
        <span>
          В конвейере{' '}
          <span className="font-hero text-caption font-bold text-primary">{inFlightTotal}</span>
        </span>
        <span>
          Завершено{' '}
          <span className="font-hero text-caption font-bold text-primary">
            {stages.find((stage) => stage.key === 'done')?.count ?? 0}
          </span>
        </span>
        {bottleneck !== null && bottleneck.count > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STAGE_COLOR[bottleneck.key], boxShadow: `0 0 8px ${STAGE_COLOR[bottleneck.key]}` }}
            />
            Узкое место: <span className="text-secondary">{bottleneck.label}</span>
          </span>
        )}
      </div>

      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.06]"
        role="img"
        aria-label="Доли этапов"
      >
        {stages.map((stage) =>
          stage.count === 0 || total === 0 ? null : (
            <span
              key={stage.key}
              title={`${stage.label}: ${stage.count.toString()}`}
              className="h-full min-w-[3px] transition-[width] duration-500"
              style={{
                width: `${((stage.count / total) * 100).toString()}%`,
                backgroundColor: STAGE_COLOR[stage.key],
              }}
            />
          ),
        )}
      </div>

      {/* --- Плитки этапов --------------------------------------------------- */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((stage, index) => {
          const color = STAGE_COLOR[stage.key];
          const Icon = STAGE_ICON[stage.key];
          const share = total === 0 ? 0 : Math.round((stage.count / total) * 100);
          const isBottleneck = bottleneck?.key === stage.key && stage.count > 0;

          return (
            <Fragment key={stage.key}>
              <Link
                href={`/orders?stage=${stage.key}`}
                className={cn(
                  'pressable group relative flex min-w-[112px] flex-1 flex-col gap-3 rounded-2xl bg-ink/[0.04] p-3 transition-[background-color,box-shadow,transform] duration-200',
                  'hover:-translate-y-0.5 hover:bg-ink/[0.07]',
                )}
                style={{
                  boxShadow: isBottleneck
                    ? `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent), 0 12px 28px -18px ${color}`
                    : `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
                }}
              >
                <span className="flex items-center justify-between">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-xl"
                    style={{
                      color,
                      backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-footnote text-muted tabular-nums">{share}%</span>
                </span>

                <span
                  className="font-hero text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums"
                  style={{ color, textShadow: `0 0 18px color-mix(in srgb, ${color} 45%, transparent)` }}
                >
                  {stage.count}
                </span>

                <span className="text-footnote font-medium leading-tight text-secondary">
                  {stage.label}
                </span>

                {/* Мини-полоса доли внутри плитки — та же, что сверху, но своя. */}
                <span className="h-1 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${share.toString()}%`, backgroundColor: color }}
                  />
                </span>
              </Link>

              {index < stages.length - 1 && (
                <span aria-hidden className="flex w-4 shrink-0 items-center self-center">
                  <span
                    className="pipeline-flow h-0.5 w-full rounded-full"
                    style={{
                      backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 9px)`,
                    }}
                  />
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

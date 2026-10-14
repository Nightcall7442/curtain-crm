'use client';

import { MONITOR_GROUP_LABELS, MONITOR_GROUPS, MonitorGroup } from '@curtain-crm/shared';
import { Minimize } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactElement } from 'react';

import { TvBoard } from '@/components/monitor/TvBoard';
import { useMonitorBoard } from '@/components/monitor/useMonitorBoard';
import { useTvRotation } from '@/components/monitor/useTvRotation';
import { useTvRuntime } from '@/components/monitor/useTvRuntime';
import { cn } from '@/lib/utils';

export default function ManagerTvPage(): ReactElement {
  return (
    <Suspense fallback={null}>
      <ManagerTv />
    </Suspense>
  );
}

/**
 * ТВ-режим для вошедшего руководителя: то же табло, что по ссылке, но по
 * `monitor.board` и без ссылки. `?group=` — одна группа, без него — обе по
 * очереди. Кнопка «На весь экран» на табло открывает сюда.
 */
function ManagerTv(): ReactElement {
  const params = useSearchParams();
  const only = MONITOR_GROUPS.find((group) => group === params.get('group'));
  const groups = only === undefined ? MONITOR_GROUPS : [only];

  const { idle } = useTvRuntime();
  const [pages, setPages] = useState(1);
  const rotation = useTvRotation(groups, pages);
  const current = rotation.group ?? MonitorGroup.WORKSHOP;

  const boards = {
    [MonitorGroup.WORKSHOP]: useMonitorBoard(MonitorGroup.WORKSHOP, null),
    [MonitorGroup.INSTALLATION]: useMonitorBoard(MonitorGroup.INSTALLATION, null),
  } as const;
  const state = boards[current];

  return (
    <TvBoard
      board={state.board}
      group={current}
      title={MONITOR_GROUP_LABELS.ru[current]}
      branchName={null}
      locale="ru"
      lastSuccessAt={state.lastSuccessAt}
      stale={state.stale}
      rotation={
        rotation.next === null
          ? null
          : { nextLabel: MONITOR_GROUP_LABELS.ru[rotation.next], startedAt: rotation.startedAt, durationMs: rotation.durationMs }
      }
      idle={idle}
      onPagesChange={setPages}
      overlay={
        <Link
          href={`/monitor/${current}`}
          onClick={() => {
            if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
          }}
          className={cn(
            'absolute bottom-[1.2vw] right-[1.2vw] z-20 inline-flex items-center gap-2 rounded-full border border-ink/15 bg-panel/90 px-4 py-2 text-caption font-semibold text-secondary shadow-raised backdrop-blur-md transition-opacity hover:text-primary',
            idle ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        >
          <Minimize aria-hidden className="h-4 w-4" />
          Выйти из режима ТВ
        </Link>
      }
    />
  );
}

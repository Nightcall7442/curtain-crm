'use client';

import { MONITOR_GROUPS, MONITOR_POLL_MS, MonitorGroup } from '@curtain-crm/shared';
import { Minimize } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { TvWall } from '@/components/monitor/TvWall';
import { useMonitorBoard } from '@/components/monitor/useMonitorBoard';
import { useTvRuntime } from '@/components/monitor/useTvRuntime';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

export default function ManagerTvPage(): ReactElement {
  return (
    <Suspense fallback={null}>
      <ManagerTv />
    </Suspense>
  );
}

/**
 * ТВ-режим для вошедшего руководителя: тот же экран «всё сразу», что по
 * ссылке, но по `monitor.*` и без ссылки. `?group=` — одна группа со своей
 * очередью, без него — обе. Кнопка «На весь экран» на табло открывает сюда.
 */
function ManagerTv(): ReactElement {
  const params = useSearchParams();
  const only = MONITOR_GROUPS.find((group) => group === params.get('group'));
  const shown = only === undefined ? MONITOR_GROUPS : [only];

  const { idle } = useTvRuntime();
  const boards = {
    [MonitorGroup.WORKSHOP]: useMonitorBoard(MonitorGroup.WORKSHOP, null),
    [MonitorGroup.INSTALLATION]: useMonitorBoard(MonitorGroup.INSTALLATION, null),
  } as const;
  const queues = trpc.monitor.queues.useQuery({}, { refetchInterval: MONITOR_POLL_MS });

  const states = shown.map((group) => boards[group]);
  const lastSuccess = states
    .map((state) => state.lastSuccessAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <TvWall
      groups={shown.map((group) => ({ group, board: boards[group].board }))}
      queues={
        queues.data === undefined
          ? null
          : {
              qc: shown.includes(MonitorGroup.WORKSHOP) ? queues.data.qc : null,
              cornice: shown.includes(MonitorGroup.INSTALLATION) ? queues.data.cornice : null,
            }
      }
      branchName={null}
      locale="ru"
      lastSuccessAt={lastSuccess ?? null}
      stale={states.some((state) => state.stale)}
      idle={idle}
      overlay={
        <Link
          href={`/monitor/${only ?? MonitorGroup.WORKSHOP}`}
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

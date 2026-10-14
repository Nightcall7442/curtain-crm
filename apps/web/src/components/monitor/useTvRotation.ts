'use client';

import { TV_PAGE_MS, TV_ROTATE_MS, type MonitorGroup } from '@curtain-crm/shared';
import { useEffect, useState } from 'react';

export interface TvRotationState {
  readonly group: MonitorGroup | null;
  /** Следующая группа; `null` — группа одна и ничего не сменяется. */
  readonly next: MonitorGroup | null;
  readonly startedAt: number;
  readonly durationMs: number;
}

/**
 * Смена табло на экране: «Цех» → «Установщики» → «Цех»…
 *
 * Группа держится `TV_ROTATE_MS`, но не меньше, чем нужно, чтобы пролистать
 * все её страницы: иначе в большом цеху до последних карточек очередь не
 * доходила бы никогда.
 */
export function useTvRotation(groups: readonly MonitorGroup[], pages: number): TvRotationState {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const count = groups.length;
  const durationMs = Math.max(TV_ROTATE_MS, pages * TV_PAGE_MS);

  useEffect(() => {
    if (count < 2) return undefined;
    const timer = window.setTimeout(
      () => {
        setIndex((value) => (value + 1) % count);
        setStartedAt(Date.now());
      },
      Math.max(0, startedAt + durationMs - Date.now()),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [count, startedAt, durationMs]);

  return {
    group: count === 0 ? null : (groups[index % count] ?? null),
    next: count < 2 ? null : (groups[(index + 1) % count] ?? null),
    startedAt,
    durationMs,
  };
}
